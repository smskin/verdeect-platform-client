// HTTP к Platform (prd.md §3.1, §5.1 «Ответы Platform»): заголовки, таймаут, повтор при 401, классификация, метрики (AC-7, AC-7a, AC-19).
import {
    PlatformContractError,
    PlatformUnavailableError,
    type UnavailableReason,
} from './errors.js';
import type { LogLimiter } from './log-limiter.js';
import { parsePlatformError } from './schemas.js';
import type { PlatformClientLogger, PlatformClientMetrics, TokenProvider } from './types.js';

/** Итог отправки: ответ с телом или сбой сети/таймаут. */
export type SendResult =
    | { readonly ok: true; readonly status: number; readonly bodyText: string }
    | { readonly ok: false; readonly reason: 'timeout' | 'network'; readonly cause: unknown };

/** fetch с таймаутом: AbortController + setTimeout, таймер снимается в finally; тело читается под тем же таймаутом. */
export async function sendRequest(
    fetchFn: typeof fetch,
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<SendResult> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    try {
        const response = await fetchFn(url, { ...init, signal: controller.signal });
        const bodyText = await response.text();
        return { ok: true, status: response.status, bodyText };
    } catch (cause) {
        return { ok: false, reason: timedOut ? 'timeout' : 'network', cause };
    } finally {
        clearTimeout(timer);
    }
}

/** JSON.parse без исключения: undefined для пустого или невалидного текста. */
export function parseJsonText(text: string): unknown {
    if (text === '') {
        return undefined;
    }
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return undefined;
    }
}

/** Конечная точка Platform. */
export type PlatformEndpoint = 'permissions' | 'check' | 'batch';

/** Транспорт к Platform. */
export interface Transport {
    /** POST {baseUrl}/v1/authz/{endpoint}; parse === undefined → INVALID_RESPONSE. */
    post<T>(
        endpoint: PlatformEndpoint,
        body: object,
        parse: (json: unknown) => T | undefined,
    ): Promise<T>;
}

/** Зависимости транспорта. */
export interface TransportDeps {
    /** Базовый URL Platform. */
    readonly baseUrl: string;
    /** Источник токена. */
    readonly tokenProvider: TokenProvider;
    /** Реализация `fetch`. */
    readonly fetch: typeof fetch;
    /** Часы, мс. */
    readonly clock: () => number;
    /** Таймаут запроса, мс. */
    readonly requestTimeoutMs: number;
    /** Источник `traceparent`. */
    readonly traceparent: (() => string | undefined) | undefined;
    /** Логгер. */
    readonly logger: PlatformClientLogger | undefined;
    /** Метрики. */
    readonly metrics: PlatformClientMetrics | undefined;
    /** Ограничитель логов. */
    readonly limiter: LogLimiter;
}

/** Создаёт транспорт к Platform. */
export function createTransport(deps: TransportDeps): Transport {
    const { baseUrl, tokenProvider, clock, logger, metrics, limiter } = deps;

    function unavailable(
        endpoint: PlatformEndpoint,
        reason: UnavailableReason,
        status?: number,
        cause?: unknown,
    ): PlatformUnavailableError {
        limiter.unavailable(endpoint, status === undefined ? { reason } : { reason, status });
        return new PlatformUnavailableError(
            endpoint,
            reason,
            cause === undefined ? undefined : { cause },
        );
    }

    async function obtainToken(refresh: boolean): Promise<string> {
        try {
            return await tokenProvider.getToken(refresh ? { refresh: true } : undefined);
        } catch (error) {
            if (error instanceof PlatformUnavailableError) {
                limiter.unavailable('token', { reason: error.reason });
            }
            throw error;
        }
    }

    // Сбой внедрённого traceparent не ломает решение: запрос уходит без заголовка (§5.1 — наружу только ошибки пакета).
    function traceparentFor(endpoint: PlatformEndpoint): string | undefined {
        try {
            return deps.traceparent?.();
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            logger?.debug({ endpoint, reason }, 'traceparent failed, header omitted');
            return undefined;
        }
    }

    function headersFor(endpoint: PlatformEndpoint, token: string): Record<string, string> {
        const headers: Record<string, string> = {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        };
        const traceparent = traceparentFor(endpoint);
        if (typeof traceparent === 'string' && traceparent !== '') {
            headers.traceparent = traceparent;
        }
        return headers;
    }

    return {
        async post(endpoint, body, parse) {
            let token = await obtainToken(false);
            for (let attempt = 1; ; attempt += 1) {
                const started = clock();
                const result = await sendRequest(
                    deps.fetch,
                    `${baseUrl}/v1/authz/${endpoint}`,
                    {
                        method: 'POST',
                        headers: headersFor(endpoint, token),
                        body: JSON.stringify(body),
                    },
                    deps.requestTimeoutMs,
                );
                const durationMs = clock() - started;
                const seconds = durationMs / 1000;
                if (!result.ok) {
                    metrics?.request(endpoint, 'unavailable', seconds);
                    throw unavailable(endpoint, result.reason, undefined, result.cause);
                }
                const { status } = result;
                logger?.debug({ endpoint, status, attempt, durationMs }, 'platform request');
                if (status === 401) {
                    metrics?.request(endpoint, 'unavailable', seconds);
                    if (attempt >= 2) {
                        throw unavailable(endpoint, 'unauthorized', status);
                    }
                    token = await obtainToken(true);
                    continue;
                }
                if (status >= 500) {
                    metrics?.request(endpoint, 'unavailable', seconds);
                    throw unavailable(endpoint, 'http_5xx', status);
                }
                const json = parseJsonText(result.bodyText);
                if (status === 200) {
                    const parsed = parse(json);
                    if (parsed === undefined) {
                        metrics?.request(endpoint, 'contract_error', seconds);
                        throw new PlatformContractError('INVALID_RESPONSE', { endpoint });
                    }
                    metrics?.request(endpoint, 'ok', seconds);
                    return parsed;
                }
                // 403/404/422/429/прочие 4xx и не-200 2xx/3xx — без повтора и без перезапроса токена (AC-7a).
                const platformError = parsePlatformError(json);
                metrics?.request(endpoint, 'contract_error', seconds);
                throw new PlatformContractError(
                    platformError?.code ?? `HTTP_${status}`,
                    platformError?.details ?? {},
                );
            }
        },
    };
}
