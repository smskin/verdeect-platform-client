// AC-15 (C) (prd.md §3.1, §5.1, §7): токен того же издателя без platform:authz → PlatformContractError
// SCOPE_REQUIRED от настоящего Platform, без кэша и без refresh; с областью — ответ проходит zod пакета.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlatformContractError } from '../../src/core/index.js';
import { ContractBroker } from './support/broker.js';
import {
    createContractClient,
    humanSubject,
    prepareMember,
    uniqueTenant,
} from './support/contract-client.js';

describe('AC-15 (C): область platform:authz', () => {
    const { tenant, tenantId } = uniqueTenant('c15');
    const sub = randomUUID();
    const subject = humanSubject(tenant, tenantId, sub);
    const authz = createContractClient('authzToken');
    let broker: ContractBroker;

    beforeAll(async () => {
        broker = await ContractBroker.connect();
        await broker.captureQueue();
        await prepareMember(authz, broker, tenant, tenantId, sub, { createCompany: true });
    });

    afterAll(async () => {
        await broker.close();
    });

    it('AC-15 (C): вызов с токеном того же издателя без platform:authz → PlatformContractError с кодом SCOPE_REQUIRED', async () => {
        const noScope = createContractClient('noScopeToken');

        const first = await noScope.client
            .check(subject, 'native.files.read')
            .catch((e: unknown) => e);
        expect(first).toBeInstanceOf(PlatformContractError);
        expect((first as PlatformContractError).code).toBe('SCOPE_REQUIRED');

        // Неудача не кэшируется: второй вызов снова идёт в Platform.
        const second = await noScope.client
            .check(subject, 'native.files.read')
            .catch((e: unknown) => e);
        expect((second as PlatformContractError).code).toBe('SCOPE_REQUIRED');
        expect(noScope.permissionsBodies).toHaveLength(2);
        expect(noScope.tokenCalls.some((options) => options?.refresh === true)).toBe(false);
    });

    it('AC-15 (C): тот же участник с токеном platform:authz → ответ permissions проходит zod-схему', async () => {
        const fresh = createContractClient('authzToken');

        const response = await fresh.client.permissions(subject, { fresh: true });

        expect(response.allow).toBe(true);
        expect(fresh.requests.filter((r) => r.endpoint === 'permissions')).toEqual([
            { endpoint: 'permissions', result: 'ok' },
        ]);
        expect(authz.requests.every((r) => r.result === 'ok')).toBe(true);
    });
});
