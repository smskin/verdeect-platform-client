// AC-11 (prd.md §3.4, D9): коды и тексты — дословно; копия decision-codes.ts совпадает с источником.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DECISION_MESSAGES, decisionMessage, type DecisionCode } from '../../src/core/codes.js';
import { PLATFORM_UNAVAILABLE_MESSAGE } from '../../src/core/errors.js';

const PLATFORM_DIR = fileURLToPath(new URL('../../../verdeect-platform', import.meta.url));
const PLATFORM_GIT = join(PLATFORM_DIR, '.git');
const COPY = readFileSync(new URL('../../src/core/codes.ts', import.meta.url), 'utf8');

describe('AC-11: коды и тексты §3.4', () => {
    it('AC-11: каждый код §3.4 — дословный текст', () => {
        expect(DECISION_MESSAGES).toStrictEqual({
            NOT_MEMBER: 'Нет доступа к компании.',
            COMPANY_SUSPENDED: 'Компания приостановлена.',
            ACCOUNT_DISABLED: 'Учётная запись заблокирована.',
            SEATS_EXCEEDED: 'Превышено число мест по тарифу. Обратитесь к администратору.',
            CONTEXT_REVOKED: 'Контекст отозван. Нужен новый диалог.',
            FORBIDDEN: 'Недостаточно прав.',
            PLAN_MODULE: 'Возможность не входит в тариф компании.',
            MODULE_DISABLED: 'Раздел отключён. Данные сохранены.',
        });
    });

    it('AC-11: PLATFORM_UNAVAILABLE — «Сервис прав временно недоступен. Повторите позже»', () => {
        expect(PLATFORM_UNAVAILABLE_MESSAGE).toBe(
            'Сервис прав временно недоступен. Повторите позже',
        );
    });

    it('AC-11: decisionMessage возвращает текст по коду', () => {
        for (const [code, message] of Object.entries(DECISION_MESSAGES)) {
            expect(decisionMessage(code as DecisionCode)).toBe(message);
        }
    });

    it('AC-11: шапка копии содержит путь источника и коммит', () => {
        const [header = ''] = COPY.split('\n');
        expect(header).toContain('apps/platform/src/modules/catalog/domain/decision-codes.ts');
        expect(header).toContain('@ 513886e');
    });

    it.runIf(existsSync(PLATFORM_GIT))(
        'AC-11: тело копии совпадает с decision-codes.ts в коммите шапки',
        () => {
            const commit = /@ ([0-9a-f]{7,40})/.exec(COPY)?.[1];
            expect(commit).toBeDefined();
            const source = execFileSync(
                'git',
                [
                    '-C',
                    PLATFORM_DIR,
                    'show',
                    `${commit}:apps/platform/src/modules/catalog/domain/decision-codes.ts`,
                ],
                { encoding: 'utf8' },
            );
            expect(COPY.split('\n').slice(2).join('\n')).toBe(source);
        },
    );
});
