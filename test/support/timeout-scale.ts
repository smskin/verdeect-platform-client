// TEST_TIMEOUT_SCALE — множитель testTimeout и hookTimeout конфигов Vitest (уровни тестов, AGENTS.md).
// По умолчанию 1, в CI — 1. Задаётся вручную на загруженной машине (load average > числа ядер — 2–3),
// не вычисляется по нагрузке. Тайм-ауты внутри spec-файлов и пределы кода стенда не масштабируются.

/** Множитель тайм-аутов конфигов: TEST_TIMEOUT_SCALE (число > 0) или 1; иначе ошибка конфигурации. */
export function timeoutScale(): number {
    const raw = process.env.TEST_TIMEOUT_SCALE?.trim() ?? '';
    if (raw === '') {
        return 1;
    }
    const scale = Number(raw);
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new Error(`[test] TEST_TIMEOUT_SCALE=${raw}: нужно число > 0`);
    }

    return scale;
}
