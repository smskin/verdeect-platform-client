// Клиент: кэш и объединение (prd.md §5.2, §5.3, D3, D4): AC-1, AC-2, AC-3, AC-4, AC-19 (LRU, clear).
import { describe, expect, it } from 'vitest';
import { createPlatformAuthzClient } from '../../src/core/client.js';
import { PlatformUnavailableError } from '../../src/core/errors.js';
import { clientCredentials } from '../../src/core/token-provider.js';
import type { Decision } from '../../src/core/types.js';
import { createClock } from './support/clock.js';
import { createFetchStub, createGate, type StubReply } from './support/fetch-stub.js';
import { CLIENT_SECRET, TOKEN_1 } from './support/secrets.js';
import { HUMAN_A, HUMAN_B, PERMS, allowedSnapshot, generalDeny } from './support/snapshots.js';
import { PERMISSIONS_PATH, createTestClient, flush, policyEvent } from './support/test-client.js';

const ALL_PERMS = allowedSnapshot({ permissions: [...PERMS], denied: {} });

describe('AC-1: один запрос permissions на участника за TTL', () => {
    it('AC-1: 100 вызовов check по 10 разным правам → 1 запрос; через 61 с → второй', async () => {
        const t = createTestClient({ handler: () => ({ status: 200, json: ALL_PERMS }) });
        for (let i = 0; i < 100; i += 1) {
            const decision = await t.client.check(HUMAN_A, PERMS[i % 10] ?? '');
            expect(decision.allow).toBe(true);
        }
        expect(t.permissionsRequests()).toHaveLength(1);
        t.clock.advance(61_000);
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
    });
});

describe('AC-2: объединение одновременных запросов', () => {
    it('AC-2: 50 одновременных check при пустом кэше → 1 запрос', async () => {
        const gate = createGate<StubReply>();
        const t = createTestClient({ handler: () => gate.promise });
        const pending = Array.from({ length: 50 }, () => t.client.check(HUMAN_A, PERMS[0]));
        await flush();
        gate.open({ status: 200, json: allowedSnapshot() });
        const decisions = await Promise.all(pending);
        expect(decisions.every((d) => d.allow)).toBe(true);
        expect(t.permissionsRequests()).toHaveLength(1);
    });

    it('AC-2: ошибка этого запроса → все 50 получают PlatformUnavailableError', async () => {
        const gate = createGate<StubReply>();
        const t = createTestClient({ handler: () => gate.promise });
        const pending = Array.from({ length: 50 }, () => t.client.check(HUMAN_A, PERMS[0]));
        await flush();
        gate.open({ status: 503 });
        const results = await Promise.allSettled(pending);
        expect(t.permissionsRequests()).toHaveLength(1);
        for (const result of results) {
            expect(result.status).toBe('rejected');
            expect(result.status === 'rejected' && result.reason).toBeInstanceOf(
                PlatformUnavailableError,
            );
        }
    });
});

describe('AC-3: общий отказ кэшируется denyTtl', () => {
    it('AC-3: COMPANY_SUSPENDED — на 4-й секунде без запроса, на 6-й — новый запрос', async () => {
        const t = createTestClient({
            handler: () => ({ status: 200, json: generalDeny('COMPANY_SUSPENDED', 7, 'mem_a') }),
        });
        expect(await t.client.check(HUMAN_A, PERMS[0])).toMatchObject({
            allow: false,
            code: 'COMPANY_SUSPENDED',
        });
        t.clock.set(4_000);
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(1);
        t.clock.set(6_000);
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-3: NOT_MEMBER с epoch: null при lastSeenEpoch = 8 → в кэше 5 с, без STALE_SNAPSHOT и PEP_AHEAD; на 4-й секунде без запроса', async () => {
        const t = createTestClient({
            handler: () => ({ status: 200, json: generalDeny('NOT_MEMBER', null) }),
        });
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        expect(await t.client.check(HUMAN_A, PERMS[0])).toMatchObject({
            allow: false,
            epoch: null,
            code: 'NOT_MEMBER',
        });
        t.clock.set(4_000);
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(1);
        expect(t.log.messages('warn')).not.toContain('STALE_SNAPSHOT');
        expect(t.log.messages('warn')).not.toContain('PEP_AHEAD');
    });
});

describe('AC-4: onPolicyChanged', () => {
    async function warmUp() {
        const t = createTestClient();
        await t.client.check(HUMAN_A, PERMS[0]);
        await t.client.check(HUMAN_B, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
        return t;
    }

    it('AC-4: subs: [A] удаляет снимок A и не трогает B той же компании', async () => {
        const t = await warmUp();
        t.client.onPolicyChanged(policyEvent('cmp_1', 8, { subs: ['usr_a'] }));
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(3);
        await t.client.check(HUMAN_B, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(3);
    });

    it.each([
        ['без subs', {}],
        ['subs: []', { subs: [] }],
    ])('AC-4: %s — удаляются оба', async (_name, data) => {
        const t = await warmUp();
        t.stub.reply(() => ({ status: 200, json: allowedSnapshot({ epoch: 8 }) }));
        t.client.onPolicyChanged(policyEvent('cmp_1', 8, data));
        await t.client.check(HUMAN_A, PERMS[0]);
        await t.client.check(HUMAN_B, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(4);
    });

    it('AC-4: эпоха события ≤ эпохи снимка — без удаления', async () => {
        const t = await warmUp();
        t.client.onPolicyChanged(policyEvent('cmp_1', 7));
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-4: незнакомый reason и лишнее поле в data → сброс выполнен', async () => {
        const t = await warmUp();
        t.stub.reply(() => ({ status: 200, json: allowedSnapshot({ epoch: 8 }) }));
        t.client.onPolicyChanged(policyEvent('cmp_1', 8, { reason: 'future', extra: 1 }));
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(3);
    });

    it.each([
        ['нет data.tenantId', { ...policyEvent('cmp_1', 8), data: { epoch: 8 } }],
        ['epoch: 0', policyEvent('cmp_1', 0)],
        ['null', null],
        ['строка', 'platform.policy.changed'],
        ['не тот type', { ...policyEvent('cmp_1', 8), type: 'platform.member.added' }],
    ])('AC-4: %s → warn, без исключения, кэш цел', async (_name, envelope) => {
        const t = await warmUp();
        expect(() => t.client.onPolicyChanged(envelope)).not.toThrow();
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
        expect(t.log.messages('warn')).toContain('invalid platform.policy.changed envelope');
    });

    it('AC-4: maxEntries 100, события по 11 компаниям → в lastSeenEpoch 10, самая старая вытеснена; запрос по ней без minEpoch', async () => {
        const t = createTestClient({ overrides: { maxEntries: 100 } });
        for (let i = 1; i <= 11; i += 1) {
            t.client.onPolicyChanged(policyEvent(`cmp_${i}`, 5));
        }
        t.stub.reply(() => ({ status: 200, json: allowedSnapshot({ epoch: 5 }) }));
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()[0]?.json()).not.toHaveProperty('minEpoch');
        await t.client.check({ ...HUMAN_A, tenantId: 'cmp_11' }, PERMS[0]);
        expect(t.permissionsRequests()[1]?.json()).toMatchObject({ minEpoch: 5 });
    });
});

describe('AC-19: LRU снимков', () => {
    async function fill101() {
        const t = createTestClient({ overrides: { maxEntries: 100 } });
        for (let i = 0; i <= 100; i += 1) {
            await t.client.check({ ...HUMAN_A, sub: `usr_${i}` }, PERMS[0]);
        }
        expect(t.permissionsRequests()).toHaveLength(101);
        return t;
    }

    it('AC-19: maxEntries 100, снимки 101 участника → самый давний вытеснен (check → новый запрос), недавний — без запроса', async () => {
        const t = await fill101();
        await t.client.check({ ...HUMAN_A, sub: 'usr_100' }, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(101);
        await t.client.check({ ...HUMAN_A, sub: 'usr_0' }, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(102);
    });

    it('AC-19: сброс компании после вытеснения — без ошибок, недавние сброшены', async () => {
        const t = await fill101();
        t.stub.reply(() => ({ status: 200, json: allowedSnapshot({ epoch: 8 }) }));
        expect(() => t.client.onPolicyChanged(policyEvent('cmp_1', 8))).not.toThrow();
        await t.client.check({ ...HUMAN_A, sub: 'usr_100' }, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(102);
    });
});

describe('AC-19: clear()', () => {
    it('AC-19: после clear() check → новый запрос без minEpoch', async () => {
        const t = createTestClient({
            handler: () => ({ status: 200, json: allowedSnapshot({ epoch: 8 }) }),
        });
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()[0]?.json()).toMatchObject({ minEpoch: 8 });
        t.client.clear();
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
        expect(t.permissionsRequests()[1]?.json()).not.toHaveProperty('minEpoch');
    });

    it('AC-19: запрос до clear() и завершённый после → возвращён вызывающему, следующий check — снова запрос', async () => {
        const gate = createGate<StubReply>();
        const t = createTestClient({ handler: () => gate.promise });
        const pending = t.client.check(HUMAN_A, PERMS[0]);
        await flush();
        t.client.clear();
        gate.open({ status: 200, json: allowedSnapshot() });
        expect((await pending).allow).toBe(true);
        t.stub.reply(() => ({ status: 200, json: allowedSnapshot() }));
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-19: токен после clear() повторно не запрашивается', async () => {
        const stub = createFetchStub((request) =>
            request.path === '/oidc/token'
                ? { status: 200, json: { access_token: TOKEN_1, expires_in: 300 } }
                : { status: 200, json: allowedSnapshot() },
        );
        const clock = createClock(0);
        const client = createPlatformAuthzClient({
            baseUrl: 'http://platform:3000',
            fetch: stub.fetch,
            clock: clock.now,
            tokenProvider: clientCredentials({
                tokenUrl: 'http://identity:3000/oidc/token',
                clientId: 'verdeect-files',
                clientSecret: CLIENT_SECRET,
                scope: 'platform:authz',
                resource: 'https://api.verdeect.ru',
                fetch: stub.fetch,
                clock: clock.now,
            }),
        });
        await client.check(HUMAN_A, PERMS[0]);
        client.clear();
        await client.check(HUMAN_A, PERMS[0]);
        expect(stub.countTo('/oidc/token')).toBe(1);
        const platform = stub.requests.filter((r) => r.path === PERMISSIONS_PATH);
        expect(platform).toHaveLength(2);
        expect(platform.map((r) => r.headers.get('authorization'))).toEqual([
            `Bearer ${TOKEN_1}`,
            `Bearer ${TOKEN_1}`,
        ]);
    });

    it('AC-19: запрос по A идёт, clear(), новый check(A) → отдельный второй запрос; ответ первого — только первому вызывающему', async () => {
        const gate1 = createGate<StubReply>();
        const gate2 = createGate<StubReply>();
        let n = 0;
        const t = createTestClient({
            handler: () => {
                n += 1;
                return n === 1 ? gate1.promise : gate2.promise;
            },
        });
        const first = t.client.check(HUMAN_A, PERMS[0]);
        await flush();
        t.client.clear();
        const second = t.client.check(HUMAN_A, PERMS[0]);
        await flush();
        expect(t.permissionsRequests()).toHaveLength(2);
        gate1.open({ status: 200, json: allowedSnapshot({ memberId: 'mem_old' }) });
        gate2.open({ status: 200, json: allowedSnapshot({ memberId: 'mem_new' }) });
        const memberOf = (d: Decision): string | undefined => d.memberId;
        expect(memberOf(await first)).toBe('mem_old');
        expect(memberOf(await second)).toBe('mem_new');
    });
});
