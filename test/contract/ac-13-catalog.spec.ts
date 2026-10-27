// AC-13 (C), AC-15 (C), UC-1, D10 (prd.md §3.2–§3.4, §7): решения пакета совпадают с настоящим Platform,
// каталог прав и модулей — с копией src/testing/catalog.ts; organization.disabled → COMPANY_SUSPENDED.
// Порядок тестов фиксирован (общая компания): viewer → raw.check → admin → organization.disabled → AC-15.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { DECISION_MESSAGES } from '../../src/core/codes.js';
import type { PermissionsResponse } from '../../src/core/index.js';
import { MODULE_CATALOG, PERMISSION_KEYS } from '../../src/testing/catalog.js';
import { ContractBroker } from './support/broker.js';
import {
    createContractClient,
    humanSubject,
    prepareMember,
    uniqueTenant,
} from './support/contract-client.js';
import { organizationDisabled } from './support/identity-events.js';
import { memberGrant } from './support/platform-cli.js';

/** MODULES_READY стенда (§7 п. 5). */
const MODULES_READY = ['files', 'web', 'office', 'images'];
const CATALOG_DRIFT =
    'Platform изменил каталог — копию src/testing/catalog.ts нужно обновить (спросить пользователя)';

describe('AC-13: каталог и решения против настоящего Platform', () => {
    const { tenant, tenantId } = uniqueTenant('c13');
    const viewer = humanSubject(tenant, tenantId, randomUUID());
    const admin = humanSubject(tenant, tenantId, randomUUID());
    const contract = createContractClient();
    let broker: ContractBroker;
    let adminSnapshot: Promise<PermissionsResponse> | undefined;

    beforeAll(async () => {
        broker = await ContractBroker.connect();
        await broker.captureQueue();
        await prepareMember(contract, broker, tenant, tenantId, viewer.sub, {
            createCompany: true,
        });
    });

    afterAll(async () => {
        await broker.close();
    });

    /**
     * admin — второй участник, создаётся первым шагом тестов admin (member:grant поднимает эпоху и сбил бы
     * сравнение эпох viewer). Событие передаётся в onPolicyChanged: иначе в кэше остаётся снимок viewer.
     */
    function adminPermissions(): Promise<PermissionsResponse> {
        adminSnapshot ??= (async () => {
            await prepareMember(contract, broker, tenant, tenantId, admin.sub, {
                createCompany: false,
            });
            const mark = broker.mark();
            await memberGrant(inject('serviceContainerId'), tenant, admin.sub, 'admin');
            const event = await broker.nextPolicyChanged(
                (data) => data.tenantId === tenantId && (data.subs ?? []).includes(admin.sub),
                mark,
            );
            contract.client.onPolicyChanged(event.envelope);

            return contract.client.permissions(admin);
        })();

        return adminSnapshot;
    }

    it("AC-13: viewer — check('native.files.read') allow, check('native.files.write') FORBIDDEN, check('knowledge.read') MODULE_DISABLED", async () => {
        expect(await contract.client.check(viewer, 'native.files.read')).toMatchObject({
            allow: true,
        });
        expect(await contract.client.check(viewer, 'native.files.write')).toMatchObject({
            allow: false,
            code: 'FORBIDDEN',
            message: 'Недостаточно прав.',
        });
        expect(await contract.client.check(viewer, 'knowledge.read')).toMatchObject({
            allow: false,
            code: 'MODULE_DISABLED',
            message: 'Раздел отключён. Данные сохранены.',
        });
    });

    it('AC-13: решение пакета для каждого права каталога совпадает с POST /v1/authz/check Platform (raw.check)', async () => {
        for (const permission of PERMISSION_KEYS) {
            const decision = await contract.client.check(viewer, permission);
            const platform = (await contract.client.raw.check({
                sub: viewer.sub,
                tenant,
                tenantId,
                act: 'human',
                permission,
            })) as Record<string, unknown>;

            expect(
                {
                    allow: decision.allow,
                    code: decision.allow ? undefined : decision.code,
                    message: decision.allow ? undefined : decision.message,
                    epoch: decision.epoch,
                },
                permission,
            ).toEqual({
                allow: platform.allow,
                code: platform.code ?? undefined,
                message: platform.message ?? undefined,
                epoch: platform.epoch,
            });
        }
    });

    it('AC-13: admin — permissions ∪ keys(denied) настоящего Platform = права каталога копии', async () => {
        const snapshot = await adminPermissions();

        expect(snapshot.allow).toBe(true);
        expect(
            [...snapshot.permissions, ...Object.keys(snapshot.denied)].sort(),
            CATALOG_DRIFT,
        ).toEqual([...PERMISSION_KEYS].sort());
    });

    it('AC-13: admin — modules[].id = модули копии в том же порядке', async () => {
        const snapshot = await adminPermissions();

        expect(
            snapshot.modules.map((module) => module.id),
            CATALOG_DRIFT,
        ).toEqual(MODULE_CATALOG.map((module) => module.id));
    });

    it('AC-13: admin — права с MODULE_DISABLED = права модулей копии вне MODULES_READY (files, web, office, images)', async () => {
        const snapshot = await adminPermissions();
        const disabled = Object.entries(snapshot.denied)
            .filter(([, code]) => code === 'MODULE_DISABLED')
            .map(([permission]) => permission)
            .sort();
        const expected = MODULE_CATALOG.filter((module) => !MODULES_READY.includes(module.id))
            .flatMap((module) => module.permissions)
            .sort();

        expect(disabled, CATALOG_DRIFT).toEqual(expected);
    });

    it('AC-13 / UC-1: после identity.organization.disabled и onPolicyChanged с настоящим событием из очереди теста → COMPANY_SUSPENDED', async () => {
        // Снимок viewer в кэше прямо перед событием: снимок beforeAll мог истечь (TTL 60 с).
        expect(await contract.client.check(viewer, 'native.files.read')).toMatchObject({
            allow: true,
        });

        const mark = broker.mark();
        broker.publishIdentity(organizationDisabled(tenantId, tenant));
        const event = await broker.nextPolicyChanged(
            (data) => data.tenantId === tenantId && data.reason === 'company_suspended',
            mark,
        );
        expect(event.envelope.data.subs).toBeUndefined();
        contract.client.onPolicyChanged(event.envelope);

        expect(contract.policyEvents.at(-1)).toBe('applied');
        expect(await contract.client.check(viewer, 'native.files.read')).toMatchObject({
            allow: false,
            code: 'COMPANY_SUSPENDED',
            message: DECISION_MESSAGES.COMPANY_SUSPENDED,
        });
    });

    it('AC-15 (C): каждый ответ permissions настоящего Platform в этом файле проходит zod-схему ответа', async () => {
        await expect(
            contract.client.raw.permissions({ sub: viewer.sub, tenant, tenantId, act: 'human' }),
        ).resolves.toMatchObject({ allow: false, code: 'COMPANY_SUSPENDED' });
        await expect(
            contract.client.raw.permissions({ sub: admin.sub, tenant, tenantId, act: 'human' }),
        ).resolves.toMatchObject({ allow: false });

        const permissions = contract.requests.filter((r) => r.endpoint === 'permissions');
        expect(permissions.length).toBeGreaterThan(0);
        expect(permissions.filter((r) => r.result !== 'ok')).toEqual([]);
    });

    it('AC-15 (C): каждое platform.policy.changed из очереди теста проходит ajv по копии схемы и zod пакета', () => {
        const own = broker.received.filter((m) => m.envelope.data?.tenantId === tenantId);

        expect(own.length).toBeGreaterThanOrEqual(2);
        for (const message of broker.received) {
            expect(
                message.ajvErrors,
                `${message.envelope.id}: Platform изменил схему — обновить копию (спросить пользователя)`,
            ).toEqual([]);
            expect(message.zodValid, message.envelope.id).toBe(true);
        }
    });
});
