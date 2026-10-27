// Манифест пакета (prd.md §4, D2, NFR-4): exports трёх подпутей, закрытый testing, зависимости.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Manifest {
    readonly type: string;
    readonly engines: Record<string, string>;
    readonly exports: Record<string, unknown>;
    readonly dependencies: Record<string, string>;
    readonly peerDependencies: Record<string, string>;
    readonly peerDependenciesMeta: Record<string, { readonly optional?: boolean }>;
    readonly devDependencies: Record<string, string>;
}

const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as Manifest;

describe('D2: точки входа пакета', () => {
    it('D2: exports содержит ".", "./nest", "./testing", "./package.json"', () => {
        expect(Object.keys(manifest.exports).sort()).toEqual(
            ['.', './nest', './package.json', './testing'].sort(),
        );
    });

    it('D2: "." и "./nest" ведут на dist с types и default', () => {
        expect(manifest.exports['.']).toEqual({
            types: './dist/core/index.d.ts',
            default: './dist/core/index.js',
        });
        expect(manifest.exports['./nest']).toEqual({
            types: './dist/nest/index.d.ts',
            default: './dist/nest/index.js',
        });
    });

    it('D2: "./testing" — только types и development, без default', () => {
        const testing = manifest.exports['./testing'] as Record<string, string>;
        expect(Object.keys(testing)).toEqual(['types', 'development']);
        expect(testing).toEqual({
            types: './dist/testing/index.d.ts',
            development: './dist/testing/index.js',
        });
    });
});

describe('NFR-4: зависимости и совместимость', () => {
    it('NFR-4: dependencies — только zod 4.6.7', () => {
        expect(manifest.dependencies).toEqual({ zod: '4.6.7' });
    });

    it('NFR-4: peerDependencies по NFR-4, все optional', () => {
        expect(manifest.peerDependencies).toEqual({
            '@nestjs/common': '^12.1.3',
            '@nestjs/core': '^12.1.3',
            '@verdeect/auth': '^1.0.1',
            'reflect-metadata': '^0.2.2',
            rxjs: '^7.8.2',
        });
        for (const name of Object.keys(manifest.peerDependencies)) {
            expect(manifest.peerDependenciesMeta[name]?.optional, name).toBe(true);
        }
    });

    it('NFR-4: ESM и Node >= 22.12', () => {
        expect(manifest.type).toBe('module');
        expect(manifest.engines.node).toBe('>=22.12');
    });

    it('NFR-4: версии devDependencies точные', () => {
        for (const [name, version] of Object.entries(manifest.devDependencies)) {
            expect(version, name).toMatch(/^\d/);
        }
    });
});
