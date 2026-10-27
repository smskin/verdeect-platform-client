// AC-8a (prd.md §5.5): копия каталога прав и модулей verdeect-platform — состав и совпадение с источником.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CORE_PERMISSIONS, MODULE_CATALOG, PERMISSION_KEYS } from '../../src/testing/catalog.js';

const PLATFORM_DIR = fileURLToPath(new URL('../../../verdeect-platform', import.meta.url));
const PLATFORM_GIT = join(PLATFORM_DIR, '.git');
const SOURCE_DIR = 'apps/platform/src/modules/catalog/domain';
const MODULES_IMPORT = "import type { PermissionKey } from './permissions.js';\n";
const COPY = readFileSync(new URL('../../src/testing/catalog.ts', import.meta.url), 'utf8');

function gitShow(commit: string, file: string): string {
    return execFileSync('git', ['-C', PLATFORM_DIR, 'show', `${commit}:${SOURCE_DIR}/${file}`], {
        encoding: 'utf8',
    });
}

describe('AC-8a: копия каталога Platform', () => {
    it('AC-8a: каждое право каталога — право ядра или право ровно одного модуля', () => {
        const owned = [...CORE_PERMISSIONS, ...MODULE_CATALOG.flatMap((m) => m.permissions)];
        expect(new Set(owned).size).toBe(owned.length);
        expect([...owned].sort()).toStrictEqual([...PERMISSION_KEYS].sort());
        expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    });

    it('AC-8a: шапка копии содержит пути источников и коммит', () => {
        const [header = ''] = COPY.split('\n');
        expect(header).toContain(`${SOURCE_DIR}/permissions.ts`);
        expect(header).toContain(`${SOURCE_DIR}/modules.ts`);
        expect(header).toContain('@ 7adb423');
    });

    it.runIf(existsSync(PLATFORM_GIT))(
        'AC-8a: копия совпадает с источником verdeect-platform в коммите шапки',
        () => {
            const commit = /@ ([0-9a-f]{7,40})/.exec(COPY)?.[1];
            expect(commit).toBeDefined();
            const source =
                gitShow(String(commit), 'permissions.ts') +
                gitShow(String(commit), 'modules.ts').replace(MODULES_IMPORT, '');
            expect(COPY.split('\n').slice(2).join('\n')).toBe(source);
        },
    );
});
