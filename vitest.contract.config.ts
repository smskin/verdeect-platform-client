// Слой C (prd.md §7, D10): test/contract против настоящего Platform в Testcontainers; запуск — только make test-contract, не в CI.
import { defineConfig } from 'vitest/config';
import { cliTimeoutMs } from './test/contract/support/platform-cli.js';

// Тест или beforeAll может вызвать CLI несколько раз: три предела CLI и минута на события и запросы.
// Неверный PLATFORM_CLI_TIMEOUT_MS — ошибка здесь, до сборки образа.
const testTimeout = 3 * cliTimeoutMs() + 60_000;

export default defineConfig({
    test: {
        include: ['test/contract/**/*.spec.ts'],
        environment: 'node',
        globalSetup: ['test/contract/support/global-setup.ts'],
        // Файлы делят один стенд Platform — по очереди.
        fileParallelism: false,
        testTimeout,
        // beforeAll spec-файлов (участники через события Identity и CLI). globalSetup Vitest таймаутом не ограничивает —
        // его ожидания ограничены сами (сборка образа, разовые команды, готовность; prd.md §7 п. 9).
        hookTimeout: testTimeout,
        // Строки [contract] и отчёт D10 видны и у прошедших тестов.
        silent: false,
    },
});
