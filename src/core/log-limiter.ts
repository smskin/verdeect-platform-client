// Ограничение частоты логов (prd.md NFR-3, AC-7, AC-7a): warn о недоступности — 10 с на endpoint, error контракта — 60 с на код.
import type { MetricsEndpoint, PlatformClientLogger } from './types.js';

/** Окно `warn` о недоступности на один `endpoint`, мс. */
export const UNAVAILABLE_WARN_WINDOW_MS = 10_000;
/** Окно `error` о нарушении контракта на один код, мс. */
export const CONTRACT_ERROR_WINDOW_MS = 60_000;

/** Логирование с ограничением частоты. */
export interface LogLimiter {
    /** warn 'PLATFORM_UNAVAILABLE' не чаще раза в 10 с на endpoint; поле suppressed — пропущенные с прошлой записи. */
    unavailable(endpoint: MetricsEndpoint, fields: Readonly<Record<string, unknown>>): void;
    /** error 'PlatformContractError' не чаще раза в 60 с на код. */
    contractError(code: string, fields: Readonly<Record<string, unknown>>): void;
}

interface WindowState {
    lastLoggedAt: number;
    suppressed: number;
}

// Число пропущенных, если писать можно; иначе undefined и счётчик пропусков растёт.
function limited(
    map: Map<string, WindowState>,
    key: string,
    windowMs: number,
    now: number,
): number | undefined {
    const state = map.get(key);
    if (state === undefined || now - state.lastLoggedAt >= windowMs) {
        const suppressed = state?.suppressed ?? 0;
        map.set(key, { lastLoggedAt: now, suppressed: 0 });
        return suppressed;
    }
    state.suppressed += 1;
    return undefined;
}

/** Ограничитель поверх внедрённого логгера; без логгера ничего не пишет. */
export function createLogLimiter(
    logger: PlatformClientLogger | undefined,
    clock: () => number,
): LogLimiter {
    const warns = new Map<string, WindowState>();
    const errors = new Map<string, WindowState>();
    return {
        unavailable(endpoint, fields) {
            if (logger === undefined) {
                return;
            }
            const suppressed = limited(warns, endpoint, UNAVAILABLE_WARN_WINDOW_MS, clock());
            if (suppressed !== undefined) {
                logger.warn({ ...fields, endpoint, suppressed }, 'PLATFORM_UNAVAILABLE');
            }
        },
        contractError(code, fields) {
            if (logger === undefined) {
                return;
            }
            const suppressed = limited(errors, code, CONTRACT_ERROR_WINDOW_MS, clock());
            if (suppressed !== undefined) {
                logger.error({ ...fields, code, suppressed }, 'PlatformContractError');
            }
        },
    };
}
