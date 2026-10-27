// Unit-контур (слой U, prd.md §7): test/unit/**/*.spec.ts без сети и Docker; fetch и часы подделаны; setup — AC-19 (логи без секретов).
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/unit/**/*.spec.ts'],
        environment: 'node',
        restoreMocks: true,
        setupFiles: ['test/unit/support/setup.ts'],
    },
});
