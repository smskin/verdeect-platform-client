// AC-20 (prd.md §3.2, UC-5): копия схемы Limits verdeect-platform — состав ключей и совпадение с источником.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LimitsSchema } from '../../src/core/limits.js';

const PLATFORM_DIR = fileURLToPath(new URL('../../../verdeect-platform', import.meta.url));
const PLATFORM_GIT = join(PLATFORM_DIR, '.git');
const SOURCE = 'apps/platform/src/modules/catalog/domain/limits.ts';
const COPY = readFileSync(new URL('../../src/core/limits.ts', import.meta.url), 'utf8');

describe('AC-20: копия Limits Platform', () => {
    it('AC-20: шапка копии limits.ts содержит путь источника и коммит', () => {
        const [header = ''] = COPY.split('\n');
        expect(header).toContain(SOURCE);
        expect(header).toContain('@ 7adb423');
    });

    it('AC-20: ключи копии — семь ключей схемы Limits Platform', () => {
        expect(Object.keys(LimitsSchema.shape).sort()).toStrictEqual(
            [
                'members',
                'storageMb',
                'fileSizeMb',
                'modelRequestsPerMonth',
                'modelRequestsPerMemberPerMonth',
                'concurrentChats',
                'assistants',
            ].sort(),
        );
    });

    it.runIf(existsSync(PLATFORM_GIT))(
        'AC-20: копия совпадает с источником verdeect-platform в коммите шапки',
        () => {
            const commit = /@ ([0-9a-f]{7,40})/.exec(COPY)?.[1];
            expect(commit).toBeDefined();
            const source = execFileSync(
                'git',
                ['-C', PLATFORM_DIR, 'show', `${String(commit)}:${SOURCE}`],
                { encoding: 'utf8' },
            );
            expect(COPY.split('\n').slice(2).join('\n')).toBe(source);
        },
    );
});
