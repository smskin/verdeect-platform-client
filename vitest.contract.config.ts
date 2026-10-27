// Слой C (prd.md §7, D10): test/contract против настоящего Platform в Testcontainers; запуск — только make test-contract, не в CI.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/contract/**/*.spec.ts'],
        environment: 'node',
        globalSetup: ['test/contract/support/global-setup.ts'],
        // Файлы делят один стенд Platform — по очереди.
        fileParallelism: false,
        testTimeout: 60_000,
        // beforeAll spec-файлов (участники через события Identity). globalSetup Vitest таймаутом не ограничивает —
        // его ожидания ограничены сами (сборка образа, разовые команды, готовность; prd.md §7 п. 9).
        hookTimeout: 120_000,
        // Строки [contract] и отчёт D10 видны и у прошедших тестов.
        silent: false,
    },
});
