// Контур проверок пакета (AC-12, prd.md §4): архив и проекты-потребители test/consumer; запуск — pnpm test:package после сборки.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/package/**/*.spec.ts'],
        environment: 'node',
        // Тесты пакуют архив и ставят зависимости — параллельный запуск конфликтует на диске.
        fileParallelism: false,
        testTimeout: 300_000,
        hookTimeout: 300_000,
    },
});
