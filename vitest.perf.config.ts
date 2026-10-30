// Набор производительности (prd.md AC-17, NFR-1): test/perf, отдельный процесс Node с --expose-gc, без параллелизма файлов.
import { defineConfig } from 'vitest/config';
import { timeoutScale } from './test/support/timeout-scale.js';

const scale = timeoutScale();

export default defineConfig({
    test: {
        include: ['test/perf/**/*.perf.spec.ts'],
        environment: 'node',
        pool: 'forks',
        execArgv: ['--expose-gc'],
        fileParallelism: false,
        testTimeout: 300_000 * scale,
        hookTimeout: 10_000 * scale,
        // Отчёт AC-17 (p50, p99, байт на снимок) печатается и у прошедших тестов.
        silent: false,
    },
});
