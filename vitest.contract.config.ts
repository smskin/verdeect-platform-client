// Слой C (prd.md §7, D10): test/contract против настоящего Platform в Testcontainers; запуск — make test-integration (псевдоним make test-contract) или make test-full, не в CI.
import { defineConfig } from 'vitest/config';
import { cliTimeoutMs } from './test/contract/support/platform-cli.js';
import { timeoutScale } from './test/support/timeout-scale.js';

// Тест или beforeAll может вызвать CLI несколько раз: три предела CLI и минута на события и запросы,
// × TEST_TIMEOUT_SCALE (сам предел CLI не масштабируется). Неверный PLATFORM_CLI_TIMEOUT_MS или
// TEST_TIMEOUT_SCALE — ошибка здесь, до сборки образа.
const testTimeout = (3 * cliTimeoutMs() + 60_000) * timeoutScale();

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
