// PlatformAuthzClient (prd.md §5.1–5.3, D3–D7): решение из кэша снимка, свежесть через minEpoch, сброс по событию, raw.
import { SnapshotCache, snapshotKey, type SnapshotKey } from './cache.js';
import {
    assertDecidableSubject,
    decideMany,
    needsPepReread,
    normalizePermissions,
} from './decide.js';
import { PlatformContractError, PlatformUnavailableError } from './errors.js';
import { createLogLimiter } from './log-limiter.js';
import { resolveOptions } from './options.js';
import { parsePermissionsResponse, parsePolicyChanged } from './schemas.js';
import { createTransport } from './transport.js';
import type {
    Decision,
    PermissionsResponse,
    PlatformAuthzClient,
    PlatformAuthzClientOptions,
    Subject,
} from './types.js';

function maxDefined(a: number | undefined, b: number | undefined): number | undefined {
    if (a === undefined) {
        return b;
    }
    return b === undefined ? a : Math.max(a, b);
}

/** Создаёт клиента; неверные настройки — TypeError с именами параметров (§5.1). */
export function createPlatformAuthzClient(
    options: PlatformAuthzClientOptions,
): PlatformAuthzClient {
    const o = resolveOptions(options);
    const { clock, logger, metrics } = o;
    const limiter = createLogLimiter(logger, clock);
    const transport = createTransport({
        baseUrl: o.baseUrl,
        tokenProvider: o.tokenProvider,
        fetch: o.fetch,
        clock,
        requestTimeoutMs: o.requestTimeoutMs,
        traceparent: o.traceparent,
        logger,
        metrics,
        limiter,
    });
    const cache = new SnapshotCache({
        maxEntries: o.maxEntries,
        lastSeenMaxEntries: o.lastSeenMaxEntries,
        cacheTtlMs: o.cacheTtlMs,
        denyTtlMs: o.denyTtlMs,
    });

    // error о контракте — один раз на вызывающего, с ограничением частоты; недоступность пишет транспорт.
    function withContractLog<A extends unknown[], R>(
        fn: (...args: A) => Promise<R>,
    ): (...args: A) => Promise<R> {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                if (error instanceof PlatformContractError) {
                    const { permission } = error.details;
                    limiter.contractError(
                        error.code,
                        typeof permission === 'string' ? { permission } : {},
                    );
                }
                throw error;
            }
        };
    }

    // Запрос permissions с объединением по (ключ, minEpoch) и «Приёмом ответа» (§5.2).
    function requestSnapshot(
        subject: Omit<Subject, 'pep'>,
        key: SnapshotKey,
        minEpoch: number | undefined,
    ): Promise<PermissionsResponse> {
        const { sub, tenant, tenantId, act } = subject;
        const joined = cache.joinInflight(key, minEpoch);
        if (joined !== undefined) {
            logger?.debug({ tenantId, sub, act, minEpoch }, 'snapshot request joined');
            return joined;
        }
        const generation = cache.generation;
        // Без pep, asid, wid (§3.2, D5).
        const body =
            minEpoch === undefined
                ? { sub, tenant, tenantId, act }
                : { sub, tenant, tenantId, act, minEpoch };
        logger?.debug({ tenantId, sub, act, minEpoch }, 'snapshot request');
        const promise = transport
            .post('permissions', body, (json) =>
                parsePermissionsResponse(json, (keys) =>
                    logger?.debug(
                        { endpoint: 'permissions', tenantId, sub, keys },
                        'limits keys dropped',
                    ),
                ),
            )
            .then((snapshot) => {
                const result = cache.accept({
                    key,
                    tenantId,
                    snapshot,
                    requestedMinEpoch: minEpoch,
                    generation,
                    now: clock(),
                });
                // Один раз на HTTP-запрос, а не у каждого присоединившегося.
                if (result.kind === 'stale') {
                    metrics?.cacheResult('stale');
                    logger?.warn(
                        {
                            tenantId,
                            sub,
                            epoch: snapshot.epoch,
                            lastSeenEpoch: result.lastSeenEpoch,
                        },
                        'STALE_SNAPSHOT',
                    );
                }
                if (result.kind === 'pep_ahead') {
                    logger?.warn({ tenantId, sub, epoch: snapshot.epoch, minEpoch }, 'PEP_AHEAD');
                }
                return snapshot;
            });
        cache.trackInflight(key, minEpoch, promise);
        return promise;
    }

    // Шаги 1–6 §5.2.
    async function decideFor(
        subject: Subject,
        permissions: readonly string[],
    ): Promise<Record<string, Decision>> {
        // Шаг 1: без запроса.
        assertDecidableSubject(subject);
        const { sub, tenantId, act } = subject;
        const key = snapshotKey(tenantId, sub, act);
        const pep = act === 'agent' ? subject.pep : undefined;
        const now = clock();
        const cached = cache.get(key, now);
        let snapshot: PermissionsResponse;
        let requestedMinEpoch: number | undefined;
        let requested = false;
        if (cached !== undefined) {
            snapshot = cached.snapshot;
            requestedMinEpoch = cached.requestedMinEpoch;
        } else {
            // Шаг 2.
            requestedMinEpoch = maxDefined(cache.lastSeen(tenantId), pep);
            metrics?.cacheResult('miss');
            logger?.debug(
                { tenantId, sub, act, minEpoch: requestedMinEpoch },
                'snapshot cache miss',
            );
            snapshot = await requestSnapshot(subject, key, requestedMinEpoch);
            requested = true;
        }
        // Шаг 5, pep > epoch: повторное чтение, если снимок запрошен с minEpoch < pep и refreshAfter не задан или прошёл.
        if (
            pep !== undefined &&
            needsPepReread(snapshot, subject) &&
            (requestedMinEpoch ?? 0) < pep &&
            (cached?.refreshAfter === undefined || now >= cached.refreshAfter)
        ) {
            const minEpoch = maxDefined(cache.lastSeen(tenantId), pep);
            metrics?.cacheResult('miss');
            requested = true;
            try {
                snapshot = await requestSnapshot(subject, key, minEpoch);
            } catch (error) {
                // PlatformContractError — вызывающему.
                if (!(error instanceof PlatformUnavailableError)) {
                    throw error;
                }
                // D6: срок жизни и minEpoch снимка не меняются; warn уже записал транспорт.
                cache.deferRefresh(key, clock() + o.denyTtlMs);
                logger?.debug(
                    { tenantId, sub, pep, epoch: snapshot.epoch },
                    'pep re-read failed, deciding by cached snapshot',
                );
            }
        }
        if (!requested) {
            metrics?.cacheResult('hit');
        }
        // Шаги 3–6; pep > epoch → по снимку.
        const decisions = decideMany(snapshot, subject, permissions);
        // Объект для лога строится только при заданном logger: горячий путь NFR-1 без лишних аллокаций.
        if (act === 'agent' && logger !== undefined) {
            // §3.2: asid и wid — только в лог debug.
            const results = Object.fromEntries(
                Object.entries(decisions).map(([p, d]) => [p, d.allow ? true : d.code]),
            );
            logger.debug(
                {
                    tenantId,
                    sub,
                    permissions,
                    pep,
                    epoch: snapshot.epoch,
                    asid: subject.asid,
                    wid: subject.wid,
                    results,
                },
                'agent decision',
            );
        }
        return decisions;
    }

    return {
        check: withContractLog(async (subject: Subject, permission: string) => {
            const decisions = await decideFor(subject, [permission]);
            const decision = decisions[permission];
            if (decision === undefined) {
                // Недостижимо; нужно для noUncheckedIndexedAccess.
                throw new Error('platform-client: invariant: decision missing');
            }
            return decision;
        }),
        // [] → VALIDATION_FAILED до шага 1 и без запроса.
        checkMany: withContractLog(async (subject: Subject, permissions: readonly string[]) =>
            decideFor(subject, normalizePermissions(permissions)),
        ),
        permissions: withContractLog(
            async (subject: Omit<Subject, 'pep'>, permissionsOptions?: { fresh?: boolean }) => {
                const key = snapshotKey(subject.tenantId, subject.sub, subject.act);
                if (permissionsOptions?.fresh !== true) {
                    const cached = cache.get(key, clock());
                    if (cached !== undefined) {
                        metrics?.cacheResult('hit');
                        return cached.snapshot;
                    }
                }
                metrics?.cacheResult('miss');
                // fresh: мимо кэша, minEpoch по §3.2; ошибка не подменяется кэшем (D6).
                return requestSnapshot(subject, key, cache.lastSeen(subject.tenantId));
            },
        ),
        // Без исключений (§5.1, UC-3 A2).
        onPolicyChanged(envelope: unknown): void {
            const parsed = parsePolicyChanged(envelope);
            if (!parsed.ok) {
                metrics?.policyEvent('invalid');
                logger?.warn({ issues: parsed.issues }, 'invalid platform.policy.changed envelope');
                return;
            }
            const { event } = parsed;
            const { raised, deleted } = cache.applyPolicyChange(
                event.tenantId,
                event.epoch,
                event.subs,
            );
            metrics?.policyEvent(raised ? 'applied' : 'ignored');
            logger?.debug(
                {
                    tenantId: event.tenantId,
                    epoch: event.epoch,
                    subs: event.subs?.length ?? 'all',
                    deleted,
                    applied: raised,
                },
                'platform.policy.changed',
            );
        },
        // Ожидания clientCredentials не трогает (§5.1).
        clear(): void {
            cache.clear();
            logger?.debug({}, 'cache cleared');
        },
        // Тело как есть, кэш не читается и не пишется, minEpoch не подставляется (§5.1 «raw.*»).
        raw: {
            check: withContractLog((body: object) =>
                transport.post('check', body, (json): unknown => json),
            ),
            batch: withContractLog((body: object) =>
                transport.post('batch', body, (json): unknown => json),
            ),
            permissions: withContractLog((body: object) =>
                transport.post('permissions', body, (json) =>
                    parsePermissionsResponse(json, (keys) =>
                        logger?.debug({ endpoint: 'permissions', keys }, 'limits keys dropped'),
                    ),
                ),
            ),
        },
    };
}
