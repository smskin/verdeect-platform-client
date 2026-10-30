// Предел готовности сервиса Platform слоя C (prd.md §7 п. 5, п. 9): без зависимостей — читается и в
// vitest.contract.config.ts, где неверное значение видно до сборки образа.

const DEFAULT_READY_TIMEOUT_MS = 120_000;

/**
 * Предел готовности сервиса Platform (старт контейнера и опрос /health): PLATFORM_READY_TIMEOUT_MS
 * (целое > 0) или 120 с; иначе ошибка конфигурации.
 */
export function readyTimeoutMs(): number {
    const raw = process.env.PLATFORM_READY_TIMEOUT_MS?.trim() ?? '';
    if (raw === '') {
        return DEFAULT_READY_TIMEOUT_MS;
    }
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
        throw new Error(
            `[contract] PLATFORM_READY_TIMEOUT_MS=${raw}: нужно целое число миллисекунд > 0`,
        );
    }

    return Number(raw);
}
