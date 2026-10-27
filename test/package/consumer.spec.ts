// AC-12, UC-4 A3, D2, NFR-4 (prd.md §4): граф импортов dist/ и проекты-потребители упакованного архива (core, nest-no-auth, full).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createConsumerProject,
    removeConsumerProject,
    runInConsumer,
} from './support/consumer-project.js';
import { packTarball, removeTarball, REPO_ROOT, type CommandResult } from './support/pack.js';

const DIST = join(REPO_ROOT, 'dist');
const SPECIFIER =
    /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[\s;])import\s*['"]([^'"]+)['"]/g;

function describeResult(result: CommandResult): string {
    return `code ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
}

function specifiers(file: string): string[] {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(SPECIFIER)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

function filesUnder(dir: string, suffix: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith(suffix))
        .map((name) => join(dir, name));
}

// Обход относительных импортов от точки входа; возвращает внешние спецификаторы и файлы графа.
function importGraph(entry: string): { files: Set<string>; external: Set<string> } {
    const files = new Set<string>();
    const external = new Set<string>();
    const queue = [entry];
    for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
        if (files.has(file)) {
            continue;
        }
        files.add(file);
        for (const spec of specifiers(file)) {
            if (spec.startsWith('.')) {
                queue.push(resolve(dirname(file), spec));
            } else {
                external.add(spec);
            }
        }
    }
    return { files, external };
}

let tarball: string | undefined;
let core: string | undefined;
let nestNoAuth: string | undefined;
let full: string | undefined;

function project(dir: string | undefined): string {
    if (dir === undefined) {
        throw new Error('consumer project was not created');
    }
    return dir;
}

beforeAll(async () => {
    tarball = await packTarball();
    core = await createConsumerProject('core', tarball);
    nestNoAuth = await createConsumerProject('nest-no-auth', tarball);
    full = await createConsumerProject('full', tarball);
});

afterAll(async () => {
    await removeConsumerProject(core);
    await removeConsumerProject(nestNoAuth);
    await removeConsumerProject(full);
    await removeTarball(tarball);
});

describe('AC-12: состав dist/', () => {
    it('AC-12: ядро не импортирует @nestjs/* и @verdeect/auth — внешние импорты только zod и node:*', () => {
        const { files, external } = importGraph(join(DIST, 'core', 'index.js'));
        expect(files.size).toBeGreaterThan(1);
        for (const file of files) {
            expect(relative(DIST, file).startsWith('core')).toBe(true);
        }
        for (const spec of external) {
            expect(spec === 'zod' || spec.startsWith('node:'), spec).toBe(true);
        }
    });

    it('AC-12: в .d.ts пакета нет импортов из zod', () => {
        for (const file of filesUnder(DIST, '.d.ts')) {
            expect(
                specifiers(file).filter((s) => s === 'zod' || s.startsWith('zod/')),
            ).toStrictEqual([]);
        }
    });

    it('AC-12 / D2: dist/core и dist/nest не импортируют testing', () => {
        for (const dir of ['core', 'nest']) {
            for (const file of filesUnder(join(DIST, dir), '.js')) {
                for (const spec of specifiers(file)) {
                    const target = spec.startsWith('.') ? resolve(dirname(file), spec) : spec;
                    expect(target.includes('testing'), `${file}: ${spec}`).toBe(false);
                }
            }
        }
    });
});

describe('AC-12: проекты-потребители упакованного архива', () => {
    it('AC-12: Vitest без настройки условий импортирует testing и проходит пример потребителя', async () => {
        const result = await runInConsumer(project(full), 'pnpm', ['exec', 'vitest', 'run']);
        expect(result.code, describeResult(result)).toBe(0);
    });

    it('AC-12 / UC-4 A3: node без условия → ERR_PACKAGE_PATH_NOT_EXPORTED для testing', async () => {
        const result = await runInConsumer(project(core), 'node', ['testing-import.mjs']);
        expect(result.code, describeResult(result)).toBe(0);
        expect(result.stdout.trim()).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
    });

    it('AC-12: node --conditions=development → импорт testing работает', async () => {
        const result = await runInConsumer(project(core), 'node', [
            '--conditions=development',
            'testing-import.mjs',
        ]);
        expect(result.code, describeResult(result)).toBe(0);
        expect(result.stdout.trim()).toBe('ok');
    });

    it('AC-12: tsc --noEmit видит типы testing без условия', async () => {
        const result = await runInConsumer(project(full), 'pnpm', [
            'exec',
            'tsc',
            '-p',
            'tsconfig.json',
        ]);
        expect(result.code, describeResult(result)).toBe(0);
    });

    it('AC-12 / NFR-4: проект без @nestjs/* и @verdeect/auth импортирует ядро и вызывает check с подделанным fetch', async () => {
        const result = await runInConsumer(project(core), 'node', ['smoke.mjs']);
        expect(result.code, describeResult(result)).toBe(0);
        expect(result.stdout.trim()).toBe('allow=true');
    });

    it('AC-12 / NFR-4: импорт ./nest без @verdeect/auth → ошибка разрешения модуля', async () => {
        const result = await runInConsumer(project(nestNoAuth), 'node', ['nest-import.mjs']);
        expect(result.code, describeResult(result)).toBe(0);
        expect(result.stdout).toMatch(/^ERR_MODULE_NOT_FOUND /);
        expect(result.stdout).toContain('@verdeect/auth');
    });
});
