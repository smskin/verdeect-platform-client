// Клиент пакета для слоя C (prd.md §7 п. 7–8, AC-13–AC-15): публичный createPlatformAuthzClient против
// настоящего Platform с записью токенов, тел permissions, логов и метрик; ожидание до 5 с и подготовка участника.
import { randomBytes, randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import {
    createPlatformAuthzClient,
    type MetricsEndpoint,
    type MetricsRequestResult,
    type PlatformAuthzClient,
    type Subject,
} from '../../../src/core/index.js';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../../../src/core/options.js';
import { timeoutScale } from '../../support/timeout-scale.js';
import type { ContractBroker } from './broker.js';
import { accountCreated, membershipAdded, organizationCreated } from './identity-events.js';
import { serviceLogsTail } from './platform-cli.js';

/** Предел ожидания результата (§7 п. 7). */
const WAIT_TIMEOUT_MS = 5_000;
const WAIT_STEP_MS = 100;
/**
 * Предел HTTP-запроса клиента: значение пакета по умолчанию (2 с) × TEST_TIMEOUT_SCALE — на загруженной
 * машине поднимается только локально (слой C в CI не запускается); при 1 — как у потребителя.
 */
const REQUEST_TIMEOUT_MS = Math.round(DEFAULT_REQUEST_TIMEOUT_MS * timeoutScale());
/** Суффикс прогона в slug компаний: файлы и прогоны не мешают друг другу. */
const RUN_SUFFIX = randomBytes(4).toString('hex');

/** Клиент и записанные им вызовы. */
export interface ContractClient {
    readonly client: PlatformAuthzClient;
    /** Параметры каждого getToken. */
    readonly tokenCalls: Array<{ readonly refresh?: boolean } | undefined>;
    /** Тела запросов POST /v1/authz/permissions по порядку. */
    readonly permissionsBodies: Array<Record<string, unknown>>;
    /** Вызовы metrics.request. */
    readonly requests: Array<{
        readonly endpoint: MetricsEndpoint;
        readonly result: MetricsRequestResult;
    }>;
    /** Вызовы metrics.policyEvent. */
    readonly policyEvents: Array<'applied' | 'ignored' | 'invalid'>;
    /** Записи logger. */
    readonly logs: Array<{ readonly level: string; readonly obj: object; readonly msg?: string }>;
}

/** Клиент с токеном stand: authzToken (platform:authz) или noScopeToken. */
export function createContractClient(
    token: 'authzToken' | 'noScopeToken' = 'authzToken',
): ContractClient {
    const value = inject(token);
    const tokenCalls: ContractClient['tokenCalls'] = [];
    const permissionsBodies: ContractClient['permissionsBodies'] = [];
    const requests: ContractClient['requests'] = [];
    const policyEvents: ContractClient['policyEvents'] = [];
    const logs: ContractClient['logs'] = [];
    const log =
        (level: string) =>
        (obj: object, msg?: string): void => {
            logs.push({ level, obj, msg });
            console.info(`[contract] client ${level} ${msg ?? ''} ${JSON.stringify(obj)}`);
        };

    const client = createPlatformAuthzClient({
        baseUrl: inject('platformUrl'),
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        // Токен издателя из globalSetup на 1 ч; refresh отдаёт тот же (решение плана, 401 — слой U).
        tokenProvider: {
            getToken: (options) => {
                tokenCalls.push(options);

                return Promise.resolve(value);
            },
        },
        fetch: (input, init) => {
            if (String(input).endsWith('/v1/authz/permissions') && typeof init?.body === 'string') {
                permissionsBodies.push(JSON.parse(init.body) as Record<string, unknown>);
            }

            return fetch(input, init);
        },
        logger: { debug: log('debug'), warn: log('warn'), error: log('error') },
        metrics: {
            cacheResult: () => undefined,
            request: (endpoint, result) => {
                requests.push({ endpoint, result });
            },
            policyEvent: (result) => {
                policyEvents.push(result);
            },
        },
    });

    return { client, tokenCalls, permissionsBodies, requests, policyEvents, logs };
}

/** Опрос probe раз в 100 мс до значения не undefined, не дольше 5 с (п. 7); иначе ошибка с docker logs. */
export async function waitFor<T>(
    probe: () => Promise<T | undefined>,
    description: string,
): Promise<T> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    let last: unknown = 'не опрошен';
    while (Date.now() < deadline) {
        try {
            const value = await probe();
            if (value !== undefined) {
                return value;
            }
            last = 'undefined';
        } catch (error) {
            last = error instanceof Error ? `${error.name}: ${error.message}` : error;
        }
        await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    }
    throw new Error(
        `[contract] не дождались «${description}» за ${WAIT_TIMEOUT_MS / 1000} с; последнее: ${JSON.stringify(last)}\n` +
            `--- docker logs сервиса ---\n${await serviceLogsTail(inject('serviceContainerId'))}`,
    );
}

/** Компания теста: UUID tenantId и slug `<prefix>-<суффикс прогона>` (шаблон Platform, без `_`). */
export function uniqueTenant(prefix: string): {
    readonly tenant: string;
    readonly tenantId: string;
} {
    return { tenant: `${prefix}-${RUN_SUFFIX}`, tenantId: randomUUID() };
}

/** Участник-человек компании. */
export function humanSubject(tenant: string, tenantId: string, sub: string): Subject {
    return { sub, tenant, tenantId, act: 'human' };
}

/**
 * Участник по событиям Identity, по порядку с ожиданием: Platform обрабатывает очередь параллельно, а
 * membership.added до фиксации компании уходит в повтор через 30 с.
 * 1. organization.created → NOT_MEMBER с epoch ≠ null (пропускается, если компания уже есть);
 * 2. account.created и membership.added → permissions({fresh}) allow: true (роль viewer).
 */
export async function prepareMember(
    contract: ContractClient,
    broker: ContractBroker,
    tenant: string,
    tenantId: string,
    sub: string,
    options: { readonly createCompany: boolean },
): Promise<void> {
    const subject = humanSubject(tenant, tenantId, sub);
    if (options.createCompany) {
        broker.publishIdentity(organizationCreated(tenantId, tenant, `Компания ${tenant}`));
        await waitFor(async () => {
            const response = await contract.client.raw.permissions({
                sub,
                tenant,
                tenantId,
                act: 'human',
            });

            return !response.allow && response.code === 'NOT_MEMBER' && response.epoch !== null
                ? response
                : undefined;
        }, `компания ${tenant} создана`);
    }
    broker.publishIdentity(accountCreated(sub, `${sub}@test.invalid`));
    broker.publishIdentity(membershipAdded(tenantId, tenant, sub, randomUUID()));
    await waitFor(async () => {
        const response = await contract.client.permissions(subject, { fresh: true });

        return response.allow ? response : undefined;
    }, `участник ${sub} в ${tenant}`);
}
