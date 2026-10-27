// Ошибки ядра (prd.md §5.1, D6): недоступность Platform/Identity и нарушение контракта; тексты без секретов (AC-19).
import type { MetricsEndpoint } from './types.js';

/** Текст ответа guard при недоступности (prd.md §3.4, пакетный код PLATFORM_UNAVAILABLE). */
export const PLATFORM_UNAVAILABLE_MESSAGE = 'Сервис прав временно недоступен. Повторите позже';

/** Причина недоступности: сеть, таймаут, 5xx, 429 Identity, повторный 401 Platform. */
export type UnavailableReason = 'network' | 'timeout' | 'http_5xx' | 'http_429' | 'unauthorized';

/**
 * Platform или Identity недоступны: сеть, таймаут, 5xx, 429 Identity, повторный 401 Platform.
 * Годного снимка нет — решение не принимается (fail-closed, D6); guard отвечает 503.
 */
export class PlatformUnavailableError extends Error {
    /** Код ошибки пакета. */
    readonly code = 'PLATFORM_UNAVAILABLE' as const;

    /**
     * @param endpoint Конечная точка, которая недоступна.
     * @param reason Причина недоступности.
     * @param options Исходная ошибка.
     */
    constructor(
        /** Конечная точка, которая недоступна. */
        readonly endpoint: MetricsEndpoint,
        /** Причина недоступности. */
        readonly reason: UnavailableReason,
        options?: { readonly cause?: unknown },
    ) {
        super(`platform-client: ${endpoint} unavailable (${reason})`, options);
        this.name = 'PlatformUnavailableError';
    }
}

/**
 * Нарушение контракта или конфигурации; guard отвечает 500. Коды:
 * - код Platform из тела `{error: {code}}` (`SCOPE_REQUIRED`, `FORBIDDEN`, `VALIDATION_FAILED`,
 *   `TENANT_MISMATCH` и т. д.);
 * - поле `error` ответа OAuth Identity (`invalid_client`, …);
 * - локальные: `UNKNOWN_PERMISSION` (`details.permission`), `PEP_REQUIRED`,
 *   `VALIDATION_FAILED` (`details.field`);
 * - `INVALID_RESPONSE` (`details.endpoint`) — ответ не по схеме или не JSON;
 * - `HTTP_<status>` — статус без тела ошибки в формате Platform или OAuth.
 */
export class PlatformContractError extends Error {
    /**
     * @param code Код ошибки.
     * @param details Подробности без секретов.
     */
    constructor(
        /** Код ошибки. */
        readonly code: string,
        /** Подробности без секретов. */
        readonly details: Readonly<Record<string, unknown>> = {},
    ) {
        super(`platform-client: contract error ${code}`);
        this.name = 'PlatformContractError';
    }
}
