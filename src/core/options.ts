// Проверка и значения по умолчанию PlatformAuthzClientOptions (prd.md §5.1 «Настройки», AC-19); TypeError — только имена параметров.
import type {
    PlatformAuthzClientOptions,
    PlatformClientLogger,
    PlatformClientMetrics,
    TokenProvider,
} from './types.js';

/** TTL снимка-разрешения по умолчанию, секунды. */
export const DEFAULT_CACHE_TTL_SEC = 60;
/** TTL общего отказа по умолчанию, секунды. */
export const DEFAULT_DENY_TTL_SEC = 5;
/** Предел числа снимков по умолчанию. */
export const DEFAULT_MAX_ENTRIES = 50_000;
/** Таймаут HTTP-запроса по умолчанию, мс. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 2000;

/** Проверенные настройки клиента с подставленными значениями по умолчанию. */
export interface ResolvedClientOptions {
    /** Базовый URL Platform без завершающего `/`. */
    readonly baseUrl: string;
    /** Источник токена. */
    readonly tokenProvider: TokenProvider;
    /** TTL снимка-разрешения, мс. */
    readonly cacheTtlMs: number;
    /** TTL общего отказа и окно повторного чтения, мс. */
    readonly denyTtlMs: number;
    /** Предел числа снимков. */
    readonly maxEntries: number;
    /** Предел записей `lastSeenEpoch`: `maxEntries / 10` (§5.3). */
    readonly lastSeenMaxEntries: number;
    /** Таймаут HTTP-запроса, мс. */
    readonly requestTimeoutMs: number;
    /** Реализация `fetch`. */
    readonly fetch: typeof fetch;
    /** Часы, мс. */
    readonly clock: () => number;
    /** Источник `traceparent`. */
    readonly traceparent: (() => string | undefined) | undefined;
    /** Логгер. */
    readonly logger: PlatformClientLogger | undefined;
    /** Метрики. */
    readonly metrics: PlatformClientMetrics | undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function hasMethods(value: unknown, methods: readonly string[]): boolean {
    return isObject(value) && methods.every((name) => typeof value[name] === 'function');
}

function isIntInRange(value: unknown, min: number, max: number): boolean {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function optional(value: unknown, check: (v: unknown) => boolean): boolean {
    return value === undefined || check(value);
}

function isFunction(value: unknown): boolean {
    return typeof value === 'function';
}

/** Абсолютный http(s)-URL; `noTrailingSlash` — без завершающего `/`. */
export function isHttpUrl(value: unknown, noTrailingSlash: boolean): boolean {
    if (typeof value !== 'string' || !URL.canParse(value)) {
        return false;
    }
    const { protocol } = new URL(value);
    if (protocol !== 'http:' && protocol !== 'https:') {
        return false;
    }
    return !noTrailingSlash || !value.endsWith('/');
}

/** Проверяет настройки и подставляет значения по умолчанию; нарушения — `TypeError` с именами параметров. */
export function resolveOptions(options: PlatformAuthzClientOptions): ResolvedClientOptions {
    const raw: unknown = options;
    if (!isObject(raw)) {
        throw new TypeError('platform-client: options must be an object');
    }
    const checks: ReadonlyArray<readonly [string, boolean]> = [
        ['baseUrl', isHttpUrl(raw.baseUrl, true)],
        ['tokenProvider', hasMethods(raw.tokenProvider, ['getToken'])],
        ['cacheTtlSec', optional(raw.cacheTtlSec, (v) => isIntInRange(v, 1, 60))],
        ['denyTtlSec', optional(raw.denyTtlSec, (v) => isIntInRange(v, 1, 5))],
        ['maxEntries', optional(raw.maxEntries, (v) => isIntInRange(v, 100, Infinity))],
        ['requestTimeoutMs', optional(raw.requestTimeoutMs, (v) => isIntInRange(v, 100, Infinity))],
        ['fetch', optional(raw.fetch, isFunction)],
        ['clock', optional(raw.clock, isFunction)],
        ['traceparent', optional(raw.traceparent, isFunction)],
        ['logger', optional(raw.logger, (v) => hasMethods(v, ['debug', 'warn', 'error']))],
        [
            'metrics',
            optional(raw.metrics, (v) => hasMethods(v, ['cacheResult', 'request', 'policyEvent'])),
        ],
    ];
    const invalid = checks.filter(([, valid]) => !valid).map(([name]) => name);
    if (invalid.length > 0) {
        throw new TypeError(`platform-client: invalid options: ${invalid.join(', ')}`);
    }
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    return {
        baseUrl: options.baseUrl,
        tokenProvider: options.tokenProvider,
        cacheTtlMs: (options.cacheTtlSec ?? DEFAULT_CACHE_TTL_SEC) * 1000,
        denyTtlMs: (options.denyTtlSec ?? DEFAULT_DENY_TTL_SEC) * 1000,
        maxEntries,
        lastSeenMaxEntries: Math.floor(maxEntries / 10),
        requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
        clock: options.clock ?? Date.now,
        traceparent: options.traceparent,
        logger: options.logger,
        metrics: options.metrics,
    };
}
