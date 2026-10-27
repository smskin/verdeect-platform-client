// Локальное решение (prd.md §5.2): шаги 1, 3–6, checkMany — AC-6 (A3, A4), AC-8, AC-8b на чистых функциях.
import { describe, expect, it } from 'vitest';
import { DECISION_MESSAGES } from '../../src/core/codes.js';
import {
    assertDecidableSubject,
    decideMany,
    needsPepReread,
    normalizePermissions,
} from '../../src/core/decide.js';
import { PlatformContractError } from '../../src/core/errors.js';
import type { PermissionDenyCode } from '../../src/core/types.js';
import { HUMAN_A, agent, allowedSnapshot, generalDeny } from './support/snapshots.js';

function contractError(fn: () => unknown): PlatformContractError {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(PlatformContractError);
        return error as PlatformContractError;
    }
    throw new Error('PlatformContractError не брошен');
}

describe('§5.2 шаг 1', () => {
    it('AC-6: агент без pep → PlatformContractError PEP_REQUIRED', () => {
        expect(contractError(() => assertDecidableSubject(agent(undefined))).code).toBe(
            'PEP_REQUIRED',
        );
    });

    it.each([0, -1, 1.5, Number.NaN])(
        'AC-6: pep = %s → PlatformContractError VALIDATION_FAILED',
        (pep) => {
            const error = contractError(() => assertDecidableSubject(agent(pep)));
            expect(error.code).toBe('VALIDATION_FAILED');
            expect(error.details).toEqual({ field: 'pep' });
        },
    );

    it('§5.2: человеку pep не нужен', () => {
        expect(() => assertDecidableSubject(HUMAN_A)).not.toThrow();
    });
});

describe('§5.2 шаги 3–6', () => {
    it('AC-8: право есть в permissions → allow с epoch и memberId', () => {
        expect(decideMany(allowedSnapshot(), HUMAN_A, ['native.files.read'])).toEqual({
            'native.files.read': { allow: true, epoch: 7, memberId: 'mem_a' },
        });
    });

    it.each<PermissionDenyCode>(['FORBIDDEN', 'PLAN_MODULE', 'MODULE_DISABLED'])(
        'AC-8: право в denied → код снимка и текст §3.4 (%s)',
        (code) => {
            const snapshot = allowedSnapshot({ denied: { 'members.manage': code } });
            expect(decideMany(snapshot, HUMAN_A, ['members.manage'])['members.manage']).toEqual({
                allow: false,
                epoch: 7,
                memberId: 'mem_a',
                code,
                message: DECISION_MESSAGES[code],
            });
        },
    );

    it('AC-8: право вне permissions ∪ denied → UNKNOWN_PERMISSION, details.permission', () => {
        const error = contractError(() => decideMany(allowedSnapshot(), HUMAN_A, ['nope.perm']));
        expect(error.code).toBe('UNKNOWN_PERMISSION');
        expect(error.details).toEqual({ permission: 'nope.perm' });
    });

    it("AC-8: ключ прототипа ('toString') — неизвестное право", () => {
        expect(contractError(() => decideMany(allowedSnapshot(), HUMAN_A, ['toString'])).code).toBe(
            'UNKNOWN_PERMISSION',
        );
    });

    it('AC-8: снимок COMPANY_SUSPENDED + неизвестное право → COMPANY_SUSPENDED', () => {
        const result = decideMany(generalDeny('COMPANY_SUSPENDED', 7, 'mem_a'), HUMAN_A, [
            'unknown.perm',
        ]);
        expect(result['unknown.perm']).toEqual({
            allow: false,
            epoch: 7,
            memberId: 'mem_a',
            code: 'COMPANY_SUSPENDED',
            message: DECISION_MESSAGES.COMPANY_SUSPENDED,
        });
    });

    it('AC-6: pep < epoch → CONTEXT_REVOKED с текстом §3.4', () => {
        const result = decideMany(allowedSnapshot({ epoch: 7 }), agent(6), ['native.files.read']);
        expect(result['native.files.read']).toEqual({
            allow: false,
            epoch: 7,
            memberId: 'mem_a',
            code: 'CONTEXT_REVOKED',
            message: DECISION_MESSAGES.CONTEXT_REVOKED,
        });
    });

    it('AC-6: pep = epoch → по праву; pep > epoch → по праву (решение по снимку)', () => {
        const snapshot = allowedSnapshot({ epoch: 7 });
        for (const pep of [7, 9]) {
            const result = decideMany(snapshot, agent(pep), [
                'native.files.read',
                'members.manage',
            ]);
            expect(result['native.files.read']?.allow).toBe(true);
            expect(result['members.manage']).toMatchObject({ allow: false, code: 'FORBIDDEN' });
        }
    });

    it('§5.2: needsPepReread — только агент, только разрешение, только pep > epoch', () => {
        const snapshot = allowedSnapshot({ epoch: 7 });
        expect(needsPepReread(snapshot, agent(8))).toBe(true);
        expect(needsPepReread(snapshot, agent(7))).toBe(false);
        expect(needsPepReread(snapshot, agent(6))).toBe(false);
        expect(needsPepReread(snapshot, HUMAN_A)).toBe(false);
        expect(needsPepReread(generalDeny('COMPANY_SUSPENDED', 7), agent(8))).toBe(false);
    });
});

describe('AC-8b: checkMany', () => {
    it('AC-8b: ключи результата в порядке запроса', () => {
        const list = ['members.manage', 'native.files.read', 'chat.office'];
        expect(Object.keys(decideMany(allowedSnapshot(), HUMAN_A, list))).toEqual(list);
    });

    it('AC-8b: одно неизвестное из трёх → UNKNOWN_PERMISSION, details.permission — это право', () => {
        const error = contractError(() =>
            decideMany(allowedSnapshot(), HUMAN_A, [
                'native.files.read',
                'x.unknown',
                'chat.office',
            ]),
        );
        expect(error.details).toEqual({ permission: 'x.unknown' });
    });

    it('AC-8b: снимок COMPANY_SUSPENDED → у всех трёх COMPANY_SUSPENDED', () => {
        const result = decideMany(generalDeny('COMPANY_SUSPENDED'), HUMAN_A, ['a', 'b', 'c']);
        expect(Object.values(result).map((d) => !d.allow && d.code)).toEqual([
            'COMPANY_SUSPENDED',
            'COMPANY_SUSPENDED',
            'COMPANY_SUSPENDED',
        ]);
    });

    it('AC-8b: агент pep < epoch → у всех CONTEXT_REVOKED', () => {
        const result = decideMany(allowedSnapshot({ epoch: 7 }), agent(3), [
            'native.files.read',
            'members.manage',
        ]);
        expect(Object.values(result).map((d) => !d.allow && d.code)).toEqual([
            'CONTEXT_REVOKED',
            'CONTEXT_REVOKED',
        ]);
    });

    it("AC-8b: [] → VALIDATION_FAILED; ['a', 'a'] → один ключ", () => {
        const error = contractError(() => normalizePermissions([]));
        expect(error.code).toBe('VALIDATION_FAILED');
        expect(error.details).toEqual({ field: 'permissions' });
        expect(normalizePermissions(['a', 'a'])).toEqual(['a']);
    });
});
