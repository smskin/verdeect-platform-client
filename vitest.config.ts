// Unit-контур (слой U, prd.md §7): test/unit/**/*.spec.ts без сети и Docker; fetch и часы подделаны; setup — AC-19 (логи без секретов).
// unplugin-swc пишет метаданные декораторов: без них Nest не разрешит DI в тестах ./nest (esbuild их не выдаёт).
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [swc.vite({ module: { type: 'es6' } })],
    test: {
        include: ['test/unit/**/*.spec.ts'],
        environment: 'node',
        restoreMocks: true,
        setupFiles: ['test/unit/support/setup.ts'],
    },
});
