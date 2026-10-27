// Клиент: свежесть и fail-closed (prd.md §5.2, §5.3, D5, D6): AC-5, AC-6, AC-7.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformContractError, PlatformUnavailableError } from '../../src/core/errors.js';
import { createGate, type StubReply } from './support/fetch-stub.js';
import { TOKEN_1, TOKEN_2 } from './support/secrets.js';
import { HUMAN_A, PERMS, agent, allowedSnapshot } from './support/snapshots.js';
import { createTestClient, flush, policyEvent, type TestClient } from './support/test-client.js';

function snapshotReply(epoch: number, memberId = 'mem_a'): StubReply {
    return { status: 200, json: allowedSnapshot({ epoch, memberId }) };
}

// Подготовка снимка агента (ключ кэша содержит act): agent(7) при ответе epoch 7.
async function prepareAgent(): Promise<TestClient> {
    const t = createTestClient({ handler: () => snapshotReply(7) });
    await t.client.check(agent(7), PERMS[0]);
    expect(t.permissionsRequests()).toHaveLength(1);
    expect(t.permissionsRequests()[0]?.json()).toMatchObject({ minEpoch: 7 });
    return t;
}

afterEach(() => {
    vi.useRealTimers();
});

describe('AC-5: minEpoch и STALE_SNAPSHOT', () => {
    it('AC-5: после события с эпохой 8 запрос permissions содержит minEpoch: 8', async () => {
        const t = createTestClient({ handler: () => snapshotReply(8) });
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()[0]?.json()).toEqual({
            sub: 'usr_a',
            tenant: 'acme',
            tenantId: 'cmp_1',
            act: 'human',
            minEpoch: 8,
        });
    });

    it('AC-5: ответ эпохи 7 на запрос, начатый до события 8 → возвращён вызывающему, в кэш не записан, warn STALE_SNAPSHOT, метрика stale', async () => {
        const gate = createGate<StubReply>();
        const t = createTestClient({ handler: () => gate.promise });
        const pending = t.client.check(HUMAN_A, PERMS[0]);
        await flush();
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        gate.open(snapshotReply(7));
        expect(await pending).toMatchObject({ allow: true, epoch: 7 });
        expect(t.log.messages('warn')).toContain('STALE_SNAPSHOT');
        expect(t.metrics.calls).toContainEqual({ method: 'cacheResult', args: ['stale'] });
        t.stub.reply(() => snapshotReply(8));
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
        expect(t.permissionsRequests()[1]?.json()).toMatchObject({ minEpoch: 8 });
    });
});

describe('AC-6: pep агента (D5)', () => {
    it('AC-6: pep < epoch → CONTEXT_REVOKED без запроса', async () => {
        const t = await prepareAgent();
        expect(await t.client.check(agent(6), PERMS[0])).toMatchObject({
            allow: false,
            code: 'CONTEXT_REVOKED',
        });
        expect(t.permissionsRequests()).toHaveLength(1);
    });

    it('AC-6: пустой кэш, pep 9, lastSeenEpoch 8 → ровно один запрос с minEpoch: 9 и без pep, asid, wid', async () => {
        const t = createTestClient({ handler: () => snapshotReply(9) });
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        await t.client.check(agent(9), PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(1);
        expect(t.permissionsRequests()[0]?.json()).toEqual({
            sub: 'usr_a',
            tenant: 'acme',
            tenantId: 'cmp_1',
            act: 'agent',
            minEpoch: 9,
        });
    });

    it('AC-6: снимок epoch 7 в кэше, pep 8 → один запрос с minEpoch 8; ответ epoch 8 → по праву; следующий вызов без запроса', async () => {
        const t = await prepareAgent();
        t.stub.reply(() => snapshotReply(8));
        expect(await t.client.check(agent(8), PERMS[0])).toMatchObject({ allow: true, epoch: 8 });
        expect(t.permissionsRequests()).toHaveLength(2);
        expect(t.permissionsRequests()[1]?.json()).toMatchObject({ minEpoch: 8 });
        await t.client.check(agent(8), PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-6: ответ epoch < pep → warn PEP_AHEAD, решение по снимку, 4 с без запросов, на 6-й секунде ровно один запрос с minEpoch = pep', async () => {
        const t = createTestClient({ handler: () => snapshotReply(8) });
        expect(await t.client.check(agent(9), PERMS[0])).toMatchObject({ allow: true, epoch: 8 });
        expect(t.log.messages('warn')).toContain('PEP_AHEAD');
        t.clock.set(4_000);
        await t.client.check(agent(9), PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(1);
        t.clock.set(6_000);
        await t.client.check(agent(9), PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
        expect(t.permissionsRequests()[1]?.json()).toMatchObject({ minEpoch: 9 });
    });

    it('AC-6: 10 одновременных вызовов с pep 8 → один запрос', async () => {
        const t = await prepareAgent();
        const gate = createGate<StubReply>();
        t.stub.reply(() => gate.promise);
        const pending = Array.from({ length: 10 }, () => t.client.check(agent(8), PERMS[0]));
        await flush();
        gate.open(snapshotReply(8));
        await Promise.all(pending);
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-6: идёт запрос с minEpoch 8, вызов с pep 9 → второй запрос с minEpoch 9; ответ первого (8) не затирает ответ второго (9)', async () => {
        const gate8 = createGate<StubReply>();
        const gate9 = createGate<StubReply>();
        let n = 0;
        const t = createTestClient({
            handler: () => {
                n += 1;
                return n === 1 ? gate8.promise : gate9.promise;
            },
        });
        const first = t.client.check(agent(8), PERMS[0]);
        await flush();
        const second = t.client.check(agent(9), PERMS[0]);
        await flush();
        expect(t.permissionsRequests().map((r) => r.json())).toMatchObject([
            { minEpoch: 8 },
            { minEpoch: 9 },
        ]);
        gate9.open(snapshotReply(9));
        expect(await second).toMatchObject({ epoch: 9 });
        gate8.open(snapshotReply(8));
        await first;
        expect(await t.client.check(agent(9), PERMS[0])).toMatchObject({ allow: true, epoch: 9 });
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-6: pep = 0 → PlatformContractError VALIDATION_FAILED, запроса нет', async () => {
        const t = createTestClient();
        const error = await t.client.check(agent(0), PERMS[0]).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PlatformContractError);
        expect((error as PlatformContractError).code).toBe('VALIDATION_FAILED');
        expect(t.stub.requests).toHaveLength(0);
    });

    it('AC-6: агент без pep → PlatformContractError PEP_REQUIRED, запроса нет', async () => {
        const t = createTestClient();
        const error = await t.client.check(agent(undefined), PERMS[0]).catch((e: unknown) => e);
        expect((error as PlatformContractError).code).toBe('PEP_REQUIRED');
        expect(t.stub.requests).toHaveLength(0);
    });

    it('AC-6: пустой кэш, pep 9, lastSeenEpoch 8, ответ epoch 8 → по снимку, warn PEP_AHEAD, второго запроса нет; через 6 с — ровно один запрос', async () => {
        const t = createTestClient({ handler: () => snapshotReply(8) });
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        expect(await t.client.check(agent(9), PERMS[0])).toMatchObject({ allow: true, epoch: 8 });
        expect(t.log.messages('warn')).toContain('PEP_AHEAD');
        expect(t.permissionsRequests()).toHaveLength(1);
        t.clock.set(6_000);
        await t.client.check(agent(9), PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-6: lastSeenEpoch 8, ответ epoch 7 при pep 9 → STALE_SNAPSHOT, не PEP_AHEAD, в кэше пусто', async () => {
        const t = createTestClient({ handler: () => snapshotReply(7) });
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        await t.client.check(agent(9), PERMS[0]);
        expect(t.log.messages('warn')).toContain('STALE_SNAPSHOT');
        expect(t.log.messages('warn')).not.toContain('PEP_AHEAD');
        await t.client.check(agent(9), PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
    });
});

describe('AC-7: Platform недоступен (D6)', () => {
    it.each<[string, StubReply]>([
        ['503', { status: 503 }],
        ['обрыв', 'network-error'],
    ])(
        'AC-7: %s — снимок в пределах TTL → решение из него; снимок истёк → PlatformUnavailableError',
        async (_name, failure) => {
            const t = createTestClient();
            await t.client.check(HUMAN_A, PERMS[0]);
            t.stub.reply(() => failure);
            t.clock.set(30_000);
            expect((await t.client.check(HUMAN_A, PERMS[0])).allow).toBe(true);
            expect(t.permissionsRequests()).toHaveLength(1);
            t.clock.set(61_000);
            await expect(t.client.check(HUMAN_A, PERMS[0])).rejects.toBeInstanceOf(
                PlatformUnavailableError,
            );
        },
    );

    it('AC-7: таймаут 2 с, снимка нет → PlatformUnavailableError', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const t = createTestClient({ handler: () => 'hang' });
        const pending = t.client.check(HUMAN_A, PERMS[0]).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(2000);
        const error = await pending;
        expect(error).toBeInstanceOf(PlatformUnavailableError);
        expect((error as PlatformUnavailableError).reason).toBe('timeout');
    });

    it('AC-7: 401 → getToken({refresh: true}) ровно один раз, повтор с новым токеном; повтор 401 → PlatformUnavailableError, третьего запроса нет', async () => {
        let n = 0;
        const t = createTestClient({
            handler: () => {
                n += 1;
                return n === 1 ? { status: 401 } : snapshotReply(7);
            },
        });
        expect((await t.client.check(HUMAN_A, PERMS[0])).allow).toBe(true);
        expect(t.tokens.calls).toEqual([{ refresh: false }, { refresh: true }]);
        expect(t.permissionsRequests().map((r) => r.headers.get('authorization'))).toEqual([
            `Bearer ${TOKEN_1}`,
            `Bearer ${TOKEN_2}`,
        ]);

        const u = createTestClient({ handler: () => ({ status: 401 }) });
        const error = await u.client.check(HUMAN_A, PERMS[0]).catch((e: unknown) => e);
        expect((error as PlatformUnavailableError).reason).toBe('unauthorized');
        expect(u.permissionsRequests()).toHaveLength(2);
    });

    it('AC-7: снимок epoch 7 со сроком ещё 55 с, агент pep 8, Platform 503 → решение по снимку, warn PLATFORM_UNAVAILABLE; 4 с без запросов; на 6-й секунде новая попытка, снова 503 → по снимку; на 54-й секунде — по снимку; на 56-й → PlatformUnavailableError', async () => {
        const t = await prepareAgent();
        t.stub.reply(() => ({ status: 503 }));
        const T0 = 5_000;
        t.clock.set(T0);
        expect(await t.client.check(agent(8), PERMS[0])).toMatchObject({ allow: true, epoch: 7 });
        expect(t.permissionsRequests()).toHaveLength(2);
        expect(t.log.messages('warn')).toContain('PLATFORM_UNAVAILABLE');
        t.clock.set(T0 + 4_000);
        await t.client.check(agent(8), PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
        t.clock.set(T0 + 6_000);
        expect(await t.client.check(agent(8), PERMS[0])).toMatchObject({ allow: true, epoch: 7 });
        expect(t.permissionsRequests()).toHaveLength(3);
        t.clock.set(T0 + 54_000);
        expect(await t.client.check(agent(8), PERMS[0])).toMatchObject({ allow: true, epoch: 7 });
        t.clock.set(T0 + 56_000);
        await expect(t.client.check(agent(8), PERMS[0])).rejects.toBeInstanceOf(
            PlatformUnavailableError,
        );
    });

    it('AC-7: снимок агента с epoch = 7 в пределах TTL, pep = 8, запрос к Platform не ответил за requestTimeoutMs (2000 мс) → решение по снимку, warn PLATFORM_UNAVAILABLE, следующие 4 с запросов нет', async () => {
        const t = await prepareAgent();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        t.stub.reply(() => 'hang');
        const T0 = 5_000;
        t.clock.set(T0);
        const pending = t.client.check(agent(8), PERMS[0]);
        await vi.advanceTimersByTimeAsync(2000);
        expect(await pending).toMatchObject({ allow: true, epoch: 7 });
        expect(t.permissionsRequests()).toHaveLength(2);
        expect(t.log.entries).toContainEqual({
            level: 'warn',
            msg: 'PLATFORM_UNAVAILABLE',
            obj: { reason: 'timeout', endpoint: 'permissions', suppressed: 0 },
        });
        t.clock.set(T0 + 4_000);
        expect(await t.client.check(agent(8), PERMS[0])).toMatchObject({ allow: true, epoch: 7 });
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-7: тот же сценарий, Platform поднялся на 6-й секунде → свежий снимок, решение по нему', async () => {
        const t = await prepareAgent();
        t.stub.reply(() => ({ status: 503 }));
        t.clock.set(5_000);
        await t.client.check(agent(8), PERMS[0]);
        t.stub.reply(() => snapshotReply(8));
        t.clock.set(11_000);
        expect(await t.client.check(agent(8), PERMS[0])).toMatchObject({ allow: true, epoch: 8 });
    });

    it('AC-7: permissions({fresh: true}) при 503 → PlatformUnavailableError даже при годном снимке', async () => {
        const t = createTestClient();
        await t.client.check(HUMAN_A, PERMS[0]);
        t.stub.reply(() => ({ status: 503 }));
        await expect(t.client.permissions(HUMAN_A, { fresh: true })).rejects.toBeInstanceOf(
            PlatformUnavailableError,
        );
    });

    it('AC-7: 100 вызовов за 5 с при 503 и пустом кэше → один warn; следующий — не раньше 10-й секунды с suppressed: 99; request(permissions, unavailable) на каждый запрос', async () => {
        const t = createTestClient({ handler: () => ({ status: 503 }) });
        for (let i = 0; i < 100; i += 1) {
            t.clock.set(i * 50);
            await t.client.check(HUMAN_A, PERMS[0]).catch(() => undefined);
        }
        expect(t.permissionsRequests()).toHaveLength(100);
        const warns = () => t.log.entries.filter((e) => e.msg === 'PLATFORM_UNAVAILABLE');
        expect(warns()).toHaveLength(1);
        expect(warns()[0]?.obj).toMatchObject({ suppressed: 0 });
        t.clock.set(10_000);
        await t.client.check(HUMAN_A, PERMS[0]).catch(() => undefined);
        expect(warns()).toHaveLength(2);
        expect(warns()[1]?.obj).toMatchObject({ endpoint: 'permissions', suppressed: 99 });
        const unavailable = t.metrics
            .requests()
            .filter(([endpoint, result]) => endpoint === 'permissions' && result === 'unavailable');
        expect(unavailable).toHaveLength(101);
    });
});
