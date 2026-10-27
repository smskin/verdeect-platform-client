// Документация пакета (prd.md §4, NFR-5, D1, D10, D11, §5.4, AGENTS.md): файлы §4, относительные ссылки,
// таблица совместимости, CHANGELOG и version, раздел «API» README по экспортам трёх подпутей, «Подключение», docs/releasing.md.
// Проверяемые файлы — README.md, CHANGELOG.md, AGENTS.md и docs/**/*.md; requirements/ и .ai-factory/ — входные артефакты.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from './support/pack.js';

const ROOT_DOCS = ['README.md', 'CHANGELOG.md', 'AGENTS.md'];
const GUIDES = ['getting-started.md', 'nestjs.md', 'testing.md', 'errors.md', 'releasing.md'];
const ENTRY_POINTS = ['src/core/index.ts', 'src/nest/index.ts', 'src/testing/index.ts'];

interface MarkdownFile {
    readonly path: string;
    readonly text: string;
}

/** Текст без fenced-блоков и inline-кода: код в примерах — не ссылка. */
function withoutCode(text: string): string {
    return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

function links(text: string): string[] {
    return [...withoutCode(text).matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? '');
}

function isRelative(link: string): boolean {
    return !/^[a-z][a-z0-9+.-]*:/i.test(link) && !link.startsWith('#');
}

/** Раздел Markdown от `## <title>` до следующего `## `. */
function section(text: string, title: string): string {
    const start = text.indexOf(`\n## ${title}\n`);
    if (start === -1) {
        return '';
    }
    const end = text.indexOf('\n## ', start + 1);

    return text.slice(start, end === -1 ? undefined : end);
}

/** Имена из `export { … }` и `export type { … }` точки входа; иной вид экспорта — ошибка разбора. */
function exportedNames(source: string, file: string): string[] {
    if (/^export\s+(\*|const|function|class|default|let|interface|type\s+\w+\s*=)/m.test(source)) {
        throw new Error(`${file}: экспорт не через export { … } — обновите разбор`);
    }

    return [...source.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)].flatMap((match) =>
        (match[1] ?? '')
            .split(',')
            .map((item) => item.trim().replace(/^type\s+/, ''))
            .filter((item) => item !== '')
            .map((item) => item.split(/\s+as\s+/).at(-1) ?? item),
    );
}

describe('§4: документация пакета', () => {
    let files: MarkdownFile[];
    let readme: string;
    let releasing: string;

    beforeAll(async () => {
        const docs = (await readdir(join(REPO_ROOT, 'docs'), { recursive: true }))
            .filter((path) => path.endsWith('.md'))
            .map((path) => join('docs', path));
        files = await Promise.all(
            [...ROOT_DOCS, ...docs].map(async (path) => ({
                path,
                text: await readFile(join(REPO_ROOT, path), 'utf8'),
            })),
        );
        readme = files.find((file) => file.path === 'README.md')?.text ?? '';
        releasing = files.find((file) => file.path === join('docs', 'releasing.md'))?.text ?? '';
    });

    it('§4: есть README.md, CHANGELOG.md, AGENTS.md и docs/getting-started.md, nestjs.md, testing.md, errors.md, releasing.md', () => {
        const required = [...ROOT_DOCS, ...GUIDES.map((guide) => join('docs', guide))];

        expect(required.filter((path) => !existsSync(join(REPO_ROOT, path)))).toEqual([]);
    });

    it('§4: относительные ссылки в Markdown ведут на существующие файлы', () => {
        const broken = files.flatMap((file) =>
            links(file.text)
                .filter(isRelative)
                .filter((link) => {
                    const target = join(
                        REPO_ROOT,
                        dirname(file.path),
                        decodeURI(link.split('#')[0] ?? ''),
                    );

                    return !existsSync(target) || relative(REPO_ROOT, target).startsWith('..');
                })
                .map((link) => `${file.path} → ${link}`),
        );

        expect(broken).toEqual([]);
    });

    it('NFR-5: README — таблица совместимости: 1.x, контракт v1, PRD Platform v1.11, коммит Platform (7+ hex), @verdeect/auth ^1.0.1', () => {
        const compatibility = section(readme, 'Совместимость');
        const row = compatibility.split('\n').find((line) => line.startsWith('| `1.x`'));

        expect(row, 'строка 1.x').toBeDefined();
        expect(row).toContain('`v1`');
        expect(row).toContain('v1.11');
        expect(row).toMatch(/`[0-9a-f]{7,40}`/);
        expect(row).toContain('`^1.0.1`');
    });

    it('§4 / AGENTS.md: каждое имя, экспортированное src/core/index.ts, src/nest/index.ts и src/testing/index.ts, есть в разделе README «API»', async () => {
        const api = section(readme, 'API');
        const missing: string[] = [];
        for (const file of ENTRY_POINTS) {
            const names = exportedNames(await readFile(join(REPO_ROOT, file), 'utf8'), file);
            expect(names.length, file).toBeGreaterThan(0);
            missing.push(
                ...names
                    .filter((name) => !api.includes(`\`${name}\``))
                    .map((name) => `${file}: ${name}`),
            );
        }

        expect(missing).toEqual([]);
    });

    it('D11 / §5.4: README «Подключение» — четыре варианта (APP_GUARD, контроллер, метод ниже, без VerdeectAuthGuard) и предупреждение о порядке декораторов', () => {
        const connection = section(readme, 'Подключение');

        for (const fragment of [
            'APP_GUARD',
            'на контроллере',
            'на методе ниже `@RequirePermission`',
            'Без `VerdeectAuthGuard`',
            'Порядок декораторов',
            '**выше** `@RequirePermission`',
            'Порядок подключения модулей не важен',
        ]) {
            expect(connection, fragment).toContain(fragment);
        }
    });

    it('D1 / D10: docs/releasing.md — make ci, make test-contract против текущего main Platform, git tag vX.Y.Z, npm publish --access public (1.0.0 вручную), npm trust github, disallow tokens, без NPM_TOKEN', () => {
        for (const fragment of [
            'make ci',
            'make test-contract',
            'текущего `main` Platform',
            'git tag vX.Y.Z',
            'npm login',
            'npm publish --access public',
            'npm trust github',
            'disallow tokens',
        ]) {
            expect(releasing, fragment).toContain(fragment);
        }
        expect(releasing).not.toContain('NPM_TOKEN');
    });

    it('D1: CHANGELOG — Keep a Changelog, [Unreleased] и [1.0.0] - ГГГГ-ММ-ДД; version в package.json совпадает с последним выпуском CHANGELOG', async () => {
        const changelog = files.find((file) => file.path === 'CHANGELOG.md')?.text ?? '';
        const manifest = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as {
            version: string;
        };
        const released = [
            ...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/gm),
        ].map((match) => match[1]);

        expect(changelog).toContain('keepachangelog.com');
        expect(changelog).toContain('## [Unreleased]');
        expect(released).toContain('1.0.0');
        expect(released[0]).toBe(manifest.version);
    });

    it('NFR-5: docs/releasing.md — контракт v1 ↔ 1.x, ломающее изменение контракта — мажор, «Как обновиться»', () => {
        expect(releasing).toMatch(/Контракт Platform `v1` соответствует пакету `1\.x`/);
        expect(releasing).toContain('ломающее изменение контракта Platform');
        expect(releasing).toContain('мажорная');
        expect(releasing).toContain('Как обновиться');
    });
});
