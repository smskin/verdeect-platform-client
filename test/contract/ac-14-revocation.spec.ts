// AC-14 (C), AC-15 (C), UC-2, D5, D10 (prd.md §3.3, §5.2, §7): отзыв роли через настоящий CLI Platform →
// событие {epoch: E+1, subs} → CONTEXT_REVOKED с minEpoch; потерянное событие закрывает pep = E+1.
// Порядок тестов важен: общий участник, эпоха компании растёт от теста к тесту.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { DECISION_MESSAGES } from '../../src/core/codes.js';
import type { Subject } from '../../src/core/index.js';
import { ContractBroker } from './support/broker.js';
import { createContractClient, prepareMember, uniqueTenant } from './support/contract-client.js';
import { memberGrant, memberRevoke } from './support/platform-cli.js';

describe('UC-2: отзыв контекста агента', () => {
    const { tenant, tenantId } = uniqueTenant('c14');
    const sub = randomUUID();
    const agent: Subject = { sub, tenant, tenantId, act: 'agent' };
    const contract = createContractClient();
    const lost = createContractClient();
    let broker: ContractBroker;
    /** Эпоха снимка после member:grant первого теста. */
    let epochE = 0;

    beforeAll(async () => {
        broker = await ContractBroker.connect();
        await broker.captureQueue();
        await prepareMember(contract, broker, tenant, tenantId, sub, { createCompany: true });
    });

    afterAll(async () => {
        await broker.close();
    });

    function ownEvent(mark: number) {
        return broker.nextPolicyChanged(
            (data) => data.tenantId === tenantId && (data.subs ?? []).includes(sub),
            mark,
        );
    }

    it('AC-14 / UC-2: member:grant --role operator → снимок пакета с эпохой E', async () => {
        const mark = broker.mark();
        await memberGrant(inject('serviceContainerId'), tenant, sub, 'operator');
        const event = await ownEvent(mark);
        expect(event.envelope.data.subs).toEqual([sub]);
        contract.client.onPolicyChanged(event.envelope);

        const snapshot = await contract.client.permissions(agent);

        expect(snapshot.allow).toBe(true);
        expect(snapshot.roles).toContain('operator');
        expect(snapshot.epoch).toBe(event.envelope.data.epoch);
        epochE = snapshot.epoch ?? 0;
    });

    it('AC-14 / UC-2: member:revoke --role operator → событие {epoch: E+1, subs: [sub]} → onPolicyChanged → check с pep = E → CONTEXT_REVOKED, в запросе permissions minEpoch: E+1', async () => {
        const mark = broker.mark();
        await memberRevoke(inject('serviceContainerId'), tenant, sub, 'operator');
        const event = await ownEvent(mark);
        expect(event.envelope.data).toMatchObject({
            tenantId,
            epoch: epochE + 1,
            subs: [sub],
            reason: 'member_roles',
        });
        contract.client.onPolicyChanged(event.envelope);

        const decision = await contract.client.check(
            { ...agent, pep: epochE },
            'native.files.read',
        );

        expect(decision).toMatchObject({
            allow: false,
            epoch: epochE + 1,
            code: 'CONTEXT_REVOKED',
            message: DECISION_MESSAGES.CONTEXT_REVOKED,
        });
        const body = contract.permissionsBodies.at(-1);
        expect(body).toMatchObject({ minEpoch: epochE + 1 });
        expect(body).not.toHaveProperty('pep');
    });

    it('AC-14 / D5: событие «потеряно» для пакета, токен pep = E+1 → перечитывание с minEpoch = E+1, снимок эпохи E+1 без ожидания TTL Platform', async () => {
        // E := F — текущая эпоха компании после отзыва; клиент lost событий не получает.
        const epochF = epochE + 1;
        expect(
            await lost.client.check({ ...agent, pep: epochF }, 'native.files.read'),
        ).toMatchObject({
            allow: true,
            epoch: epochF,
        });

        const mark = broker.mark();
        await memberGrant(inject('serviceContainerId'), tenant, sub, 'operator');
        expect((await ownEvent(mark)).envelope.data.epoch).toBe(epochF + 1);

        const before = lost.permissionsBodies.length;
        const decision = await lost.client.check(
            { ...agent, pep: epochF + 1 },
            'native.files.read',
        );

        expect(decision).toMatchObject({ allow: true, epoch: epochF + 1 });
        const requests = lost.permissionsBodies.slice(before);
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ minEpoch: epochF + 1 });
    });

    it('AC-15 (C): события policy.changed этого файла проходят ajv по копии и zod пакета; ответы permissions — zod', () => {
        const own = broker.received.filter((m) => m.envelope.data?.tenantId === tenantId);

        expect(own.length).toBeGreaterThanOrEqual(3);
        for (const message of broker.received) {
            expect(
                message.ajvErrors,
                `${message.envelope.id}: Platform изменил схему — обновить копию (спросить пользователя)`,
            ).toEqual([]);
            expect(message.zodValid, message.envelope.id).toBe(true);
        }
        const permissions = [...contract.requests, ...lost.requests].filter(
            (r) => r.endpoint === 'permissions',
        );
        expect(permissions.length).toBeGreaterThan(0);
        expect(permissions.filter((r) => r.result !== 'ok')).toEqual([]);
    });
});
