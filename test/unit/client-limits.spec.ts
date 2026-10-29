// AC-20 (prd.md §3.2, UC-5 A1, A2): limits в ответе permissions через клиент — кэш, v1.11, незнакомые ключи, ошибка контракта.
import { describe, expect, it } from 'vitest';
import { PlatformContractError } from '../../src/core/errors.js';
import { HUMAN_A, PERMS, allowedSnapshot } from './support/snapshots.js';
import { createTestClient } from './support/test-client.js';

const B1_LIMITS = {
    fileSizeMb: 50,
    assistants: 3,
    concurrentChats: null,
    modelRequestsPerMonth: 1000,
    modelRequestsPerMemberPerMonth: null,
};

function withLimits(limits: Record<string, unknown>): ReturnType<typeof createTestClient> {
    return createTestClient({
        handler: () => ({ status: 200, json: { ...allowedSnapshot(), limits } }),
    });
}

describe('UC-5: лимиты тарифа в ответе permissions', () => {
    it('AC-20: permissions().limits — пять ключей, в том числе из кэша', async () => {
        const t = withLimits(B1_LIMITS);
        expect((await t.client.permissions(HUMAN_A)).limits).toStrictEqual(B1_LIMITS);
        expect((await t.client.permissions(HUMAN_A)).limits).toStrictEqual(B1_LIMITS);
        expect(t.permissionsRequests()).toHaveLength(1);
    });

    it('AC-20 / UC-5 A1: Platform v1.11 — только fileSizeMb, решения как в 1.0.x', async () => {
        const t = withLimits({ fileSizeMb: 50 });
        expect((await t.client.check(HUMAN_A, PERMS[0])).allow).toBe(true);
        const { limits } = await t.client.permissions(HUMAN_A);
        expect(Object.keys(limits)).toStrictEqual(['fileSizeMb']);
        expect('assistants' in limits).toBe(false);
    });

    it('AC-20 / UC-5 A2: незнакомый числовой ключ как есть; нечисловой — отброшен, debug, решение получено', async () => {
        const t = withLimits({ fileSizeMb: 50, newLimit: 7, flags: 'x' });
        expect((await t.client.check(HUMAN_A, PERMS[0])).allow).toBe(true);
        expect((await t.client.permissions(HUMAN_A)).limits).toStrictEqual({
            fileSizeMb: 50,
            newLimit: 7,
        });
        const entry = t.log.entries.find((e) => e.msg === 'limits keys dropped');
        expect(entry?.level).toBe('debug');
        expect(entry?.obj).toStrictEqual({
            endpoint: 'permissions',
            tenantId: HUMAN_A.tenantId,
            sub: HUMAN_A.sub,
            keys: ['flags'],
        });
        expect(JSON.stringify(entry?.obj)).not.toContain('"x"');
    });

    it("AC-20: assistants: 'x' → PlatformContractError, снимок не закэширован", async () => {
        const t = withLimits({ fileSizeMb: 50, assistants: 'x' });
        for (let i = 0; i < 2; i += 1) {
            const error = await t.client.permissions(HUMAN_A).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(PlatformContractError);
            expect((error as PlatformContractError).code).toBe('INVALID_RESPONSE');
        }
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-20: raw.permissions применяет ту же схему', async () => {
        const t = withLimits({ fileSizeMb: 50, newLimit: 7, flags: 'x' });
        expect((await t.client.raw.permissions({})).limits).toStrictEqual({
            fileSizeMb: 50,
            newLimit: 7,
        });
        expect(t.log.entries.find((e) => e.msg === 'limits keys dropped')?.obj).toStrictEqual({
            endpoint: 'permissions',
            keys: ['flags'],
        });
        const bad = withLimits({ fileSizeMb: 50, assistants: 'x' });
        const error = await bad.client.raw.permissions({}).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PlatformContractError);
    });
});
