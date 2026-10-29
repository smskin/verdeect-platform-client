// AC-22 (C), UC-5, UC-5 A1 (prd.md §3.2, §7): limits ответа permissions настоящего Platform — тариф default
// из seed/plans.json коммита прогона. По умолчанию — Platform с дополнением B.1; PLATFORM_LIMITS=legacy —
// необязательный прогон против Platform без дополнения (в limits только fileSizeMb).
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { PermissionsResponse } from '../../src/core/index.js';
import { ContractBroker } from './support/broker.js';
import {
    createContractClient,
    humanSubject,
    prepareMember,
    uniqueTenant,
} from './support/contract-client.js';
import { memberGrant } from './support/platform-cli.js';
import { PLATFORM_REPO } from './support/platform-image.js';

const LEGACY = process.env.PLATFORM_LIMITS === 'legacy';
const B1_KEYS = [
    'assistants',
    'concurrentChats',
    'modelRequestsPerMonth',
    'modelRequestsPerMemberPerMonth',
] as const;

/** Лимиты тарифа default из seed/plans.json Platform в коммите прогона. */
function defaultPlanLimits(commit: string): Record<string, unknown> {
    const plans = JSON.parse(
        execFileSync('git', ['-C', PLATFORM_REPO, 'show', `${commit}:seed/plans.json`], {
            encoding: 'utf8',
        }),
    ) as { key: string; limits: Record<string, unknown> }[];
    const plan = plans.find((p) => p.key === 'default');
    if (plan === undefined) {
        throw new Error('[contract] seed/plans.json: нет тарифа default');
    }

    return plan.limits;
}

describe('UC-5: лимиты тарифа против настоящего Platform', () => {
    const { tenant, tenantId } = uniqueTenant('c22');
    const admin = humanSubject(tenant, tenantId, randomUUID());
    const contract = createContractClient();
    let broker: ContractBroker;
    let snapshot: PermissionsResponse;

    beforeAll(async () => {
        broker = await ContractBroker.connect();
        await broker.captureQueue();
        await prepareMember(contract, broker, tenant, tenantId, admin.sub, {
            createCompany: true,
        });
        await memberGrant(inject('serviceContainerId'), tenant, admin.sub, 'admin');
        snapshot = await contract.client.permissions(admin, { fresh: true });
        console.info(
            `[contract] AC-22 limits mode: ${LEGACY ? 'legacy' : 'b1'}, keys: ${Object.keys(snapshot.limits).join(', ')}`,
        );
    });

    afterAll(async () => {
        await broker.close();
    });

    it.runIf(!LEGACY)(
        'AC-22: permissions() admin — fileSizeMb и четыре ключа B.1 по тарифу default; ответ проходит схему пакета',
        () => {
            const plan = defaultPlanLimits(inject('platformCommit'));
            expect(plan.fileSizeMb, 'тариф default изменился — спросить пользователя').toBe(50);
            expect(snapshot.allow).toBe(true);
            expect(snapshot.limits.fileSizeMb).toBe(50);
            for (const key of B1_KEYS) {
                expect(key in snapshot.limits, key).toBe(true);
                expect(snapshot.limits[key], key).toBe(plan[key]);
                expect(plan[key], `тариф default: ${key}`).toBeNull();
            }
        },
    );

    it.runIf(LEGACY)('AC-22 (без B.1): в limits только fileSizeMb', () => {
        expect(snapshot.allow).toBe(true);
        expect(Object.keys(snapshot.limits)).toStrictEqual(['fileSizeMb']);
    });
});
