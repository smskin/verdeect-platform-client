// Unit-контур (слой U, prd.md §7): test/unit/**/*.spec.ts без сети и Docker; fetch и часы подделаны; setup — AC-19 (логи без секретов).
// unplugin-swc пишет метаданные декораторов: без них Nest не разрешит DI в тестах ./nest (esbuild их не выдаёт).
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { timeoutScale } from './test/support/timeout-scale.js';

const scale = timeoutScale();

export default defineConfig({
    plugins: [swc.vite({ module: { type: 'es6' } })],
    test: {
        include: ['test/unit/**/*.spec.ts'],
        environment: 'node',
        // Значения Vitest по умолчанию × TEST_TIMEOUT_SCALE.
        testTimeout: 5_000 * scale,
        hookTimeout: 10_000 * scale,
        restoreMocks: true,
        setupFiles: ['test/unit/support/setup.ts'],
    },
});
