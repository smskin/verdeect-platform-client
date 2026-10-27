// Клиент: ошибки контракта, fresh, raw, checkMany, метрики, логи (prd.md §5.1, §5.2): AC-7a, AC-7b, AC-8, AC-8b, AC-18, AC-19.
import { describe, expect, it } from 'vitest';
import { DECISION_MESSAGES } from '../../src/core/codes.js';
import { createPlatformAuthzClient } from '../../src/core/client.js';
import { PlatformContractError, PlatformUnavailableError } from '../../src/core/errors.js';
import { clientCredentials } from '../../src/core/token-provider.js';
import { createGate, type StubReply } from './support/fetch-stub.js';
import { CLIENT_SECRET, SECRET_VALUES, TOKEN_1, TOKEN_2 } from './support/secrets.js';
import {
    HUMAN_A,
    HUMAN_B,
    PERMS,
    agent,
    allowedSnapshot,
    generalDeny,
} from './support/snapshots.js';
import { createTokenStub } from './support/token-stub.js';
import {
    PERMISSIONS_PATH,
    createTestClient,
    flush,
    policyEvent,
    type TestClient,
} from './support/test-client.js';

function snapshotReply(epoch = 7): StubReply {
    return { status: 200, json: allowedSnapshot({ epoch }) };
}

async function contractError(promise: Promise<unknown>): Promise<PlatformContractError> {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlatformContractError);
    return error as PlatformContractError;
}

async function prepareAgent(): Promise<TestClient> {
    const t = createTestClient({ handler: () => snapshotReply(7) });
    await t.client.check(agent(7), PERMS[0]);
    expect(t.permissionsRequests()).toHaveLength(1);
    return t;
}

describe('AC-7a: ошибки контракта Platform', () => {
    it.each<[number, string]>([
        [403, 'SCOPE_REQUIRED'],
        [404, 'HTTP_404'],
        [422, 'TENANT_MISMATCH'],
    ])(
        'AC-7a: %s → PlatformContractError %s; кэш пуст; токен не перезапрашивался; второго запроса нет',
        async (status, code) => {
            const reply: StubReply =
                status === 404
                    ? { status, text: 'Not Found' }
                    : { status, json: { error: { code, message: '…', details: {} } } };
            const t = createTestClient({ handler: () => reply });
            expect((await contractError(t.client.check(HUMAN_A, PERMS[0]))).code).toBe(code);
            expect(t.permissionsRequests()).toHaveLength(1);
            expect(t.tokens.calls.some((c) => c.refresh)).toBe(false);
            await t.client.check(HUMAN_A, PERMS[0]).catch(() => undefined);
            expect(t.permissionsRequests()).toHaveLength(2);
        },
    );

    it('AC-7a: 10 повторов одного кода → один error-лог за 60 с', async () => {
        const t = createTestClient({
            handler: () => ({ status: 422, json: { error: { code: 'TENANT_MISMATCH' } } }),
        });
        for (let i = 0; i < 10; i += 1) {
            await t.client.check(HUMAN_A, PERMS[0]).catch(() => undefined);
        }
        expect(t.log.messages('error')).toEqual(['PlatformContractError']);
    });
});

describe('AC-7b: fresh и raw', () => {
    it('AC-7b: permissions({fresh: true}) при снимке в кэше → запрос с minEpoch, ответ в кэше; следующий check — без запроса', async () => {
        const t = createTestClient({ handler: () => snapshotReply(7) });
        await t.client.check(HUMAN_A, PERMS[0]);
        t.stub.reply(() => snapshotReply(8));
        expect(await t.client.permissions(HUMAN_A, { fresh: true })).toMatchObject({ epoch: 8 });
        expect(t.permissionsRequests()[1]?.json()).toMatchObject({ minEpoch: 7 });
        expect(await t.client.check(HUMAN_A, PERMS[0])).toMatchObject({ epoch: 8 });
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('AC-7b: 5 одновременных permissions({fresh: true}) одного участника → 1 запрос', async () => {
        const gate = createGate<StubReply>();
        const t = createTestClient({ handler: () => gate.promise });
        const pending = Array.from({ length: 5 }, () =>
            t.client.permissions(HUMAN_A, { fresh: true }),
        );
        await flush();
        gate.open(snapshotReply());
        await Promise.all(pending);
        expect(t.permissionsRequests()).toHaveLength(1);
    });

    it('AC-7b: raw.check — тот же токен; при 401 getToken({refresh: true}) и повтор', async () => {
        let n = 0;
        const t = createTestClient({
            handler: () => {
                n += 1;
                return n === 1 ? { status: 401 } : { status: 200, json: { allow: true } };
            },
        });
        expect(await t.client.raw.check({ any: 'body' })).toEqual({ allow: true });
        expect(t.tokens.calls).toEqual([{ refresh: false }, { refresh: true }]);
        expect(t.stub.requests.map((r) => r.path)).toEqual(['/v1/authz/check', '/v1/authz/check']);
        expect(t.stub.requests.map((r) => r.headers.get('authorization'))).toEqual([
            `Bearer ${TOKEN_1}`,
            `Bearer ${TOKEN_2}`,
        ]);
    });

    it('AC-7b: raw.check 422 → PlatformContractError', async () => {
        const t = createTestClient({
            handler: () => ({ status: 422, json: { error: { code: 'VALIDATION_FAILED' } } }),
        });
        expect((await contractError(t.client.raw.check({}))).code).toBe('VALIDATION_FAILED');
    });

    it('AC-7b: кэш после raw.* не изменился', async () => {
        const t = createTestClient({ handler: () => snapshotReply(7) });
        await t.client.check(HUMAN_A, PERMS[0]);
        t.client.onPolicyChanged(policyEvent('cmp_2', 8));
        t.stub.reply((r) =>
            r.path === PERMISSIONS_PATH
                ? { status: 200, json: generalDeny('COMPANY_SUSPENDED', 7) }
                : { status: 200, json: { results: [] } },
        );
        await t.client.raw.permissions({
            sub: 'usr_a',
            tenant: 'acme',
            tenantId: 'cmp_1',
            act: 'human',
        });
        expect((await t.client.check(HUMAN_A, PERMS[0])).allow).toBe(true);
        expect(t.permissionsRequests()).toHaveLength(2);
        const body = { sub: 'usr_a', tenant: 'acme', tenantId: 'cmp_2', act: 'human', items: [] };
        await t.client.raw.batch(body);
        const batch = t.stub.requests.find((r) => r.path === '/v1/authz/batch');
        expect(batch?.json()).toEqual(body);
    });

    it('AC-7b: raw.permissions с ответом не по схеме → PlatformContractError INVALID_RESPONSE', async () => {
        const t = createTestClient({ handler: () => ({ status: 200, json: { allow: 'yes' } }) });
        expect((await contractError(t.client.raw.permissions({}))).code).toBe('INVALID_RESPONSE');
    });

    it('AC-7b: raw.check возвращает ответ без проверки (unknown)', async () => {
        const t = createTestClient({ handler: () => ({ status: 200, json: { whatever: [1] } }) });
        expect(await t.client.raw.check({})).toEqual({ whatever: [1] });
    });
});

describe('AC-8: решение и схема', () => {
    it('AC-8: право, которого нет в снимке → PlatformContractError UNKNOWN_PERMISSION', async () => {
        const t = createTestClient();
        const error = await contractError(t.client.check(HUMAN_A, 'nope.perm'));
        expect(error.code).toBe('UNKNOWN_PERMISSION');
        expect(error.details).toEqual({ permission: 'nope.perm' });
    });

    it('AC-8: снимок COMPANY_SUSPENDED + неизвестное право → COMPANY_SUSPENDED', async () => {
        const t = createTestClient({
            handler: () => ({ status: 200, json: generalDeny('COMPANY_SUSPENDED', 7, 'mem_a') }),
        });
        expect(await t.client.check(HUMAN_A, 'nope.perm')).toEqual({
            allow: false,
            epoch: 7,
            memberId: 'mem_a',
            code: 'COMPANY_SUSPENDED',
            message: DECISION_MESSAGES.COMPANY_SUSPENDED,
        });
    });

    it('AC-8: ответ Platform не по схеме → PlatformContractError, в кэш не попал', async () => {
        const t = createTestClient({
            handler: () => ({ status: 200, json: { ...allowedSnapshot(), epoch: 0 } }),
        });
        expect((await contractError(t.client.check(HUMAN_A, PERMS[0]))).code).toBe(
            'INVALID_RESPONSE',
        );
        await t.client.check(HUMAN_A, PERMS[0]).catch(() => undefined);
        expect(t.permissionsRequests()).toHaveLength(2);
    });

    it('UC-1: право в denied FORBIDDEN → «Недостаточно прав.»', async () => {
        const t = createTestClient();
        expect(await t.client.check(HUMAN_A, 'members.manage')).toMatchObject({
            allow: false,
            code: 'FORBIDDEN',
            message: 'Недостаточно прав.',
        });
    });
});

describe('AC-8b: checkMany', () => {
    it('AC-8b: 3 права при пустом кэше → 1 запрос; ключи в порядке запроса', async () => {
        const t = createTestClient();
        const list = ['members.manage', 'native.files.read', 'chat.office'];
        const result = await t.client.checkMany(HUMAN_A, list);
        expect(Object.keys(result)).toEqual(list);
        expect(t.permissionsRequests()).toHaveLength(1);
    });

    it('AC-8b: одно неизвестное из трёх → UNKNOWN_PERMISSION, details.permission — это право', async () => {
        const t = createTestClient();
        const error = await contractError(
            t.client.checkMany(HUMAN_A, ['native.files.read', 'x.unknown', 'chat.office']),
        );
        expect(error.code).toBe('UNKNOWN_PERMISSION');
        expect(error.details).toEqual({ permission: 'x.unknown' });
    });

    it('AC-8b: снимок COMPANY_SUSPENDED → у всех трёх COMPANY_SUSPENDED', async () => {
        const t = createTestClient({
            handler: () => ({ status: 200, json: generalDeny('COMPANY_SUSPENDED') }),
        });
        const result = await t.client.checkMany(HUMAN_A, ['a', 'b', 'c']);
        expect(Object.values(result).map((d) => !d.allow && d.code)).toEqual(
            Array(3).fill('COMPANY_SUSPENDED'),
        );
    });

    it('AC-8b: агент с pep < epoch → у всех CONTEXT_REVOKED', async () => {
        const t = await prepareAgent();
        const result = await t.client.checkMany(agent(6), [PERMS[0], 'members.manage']);
        expect(Object.values(result).map((d) => !d.allow && d.code)).toEqual([
            'CONTEXT_REVOKED',
            'CONTEXT_REVOKED',
        ]);
        expect(t.permissionsRequests()).toHaveLength(1);
    });

    it("AC-8b: [] → VALIDATION_FAILED без запроса; ['a', 'a'] → один ключ", async () => {
        const t = createTestClient();
        const error = await contractError(t.client.checkMany(HUMAN_A, []));
        expect(error.code).toBe('VALIDATION_FAILED');
        expect(t.stub.requests).toHaveLength(0);
        const result = await t.client.checkMany(HUMAN_A, ['chat.office', 'chat.office']);
        expect(Object.keys(result)).toEqual(['chat.office']);
    });
});

describe('AC-18: метрики клиента', () => {
    it('AC-18: попадание в кэш → cacheResult(hit)', async () => {
        const t = createTestClient();
        await t.client.check(HUMAN_A, PERMS[0]);
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.metrics.calls.filter((c) => c.method === 'cacheResult')).toEqual([
            { method: 'cacheResult', args: ['miss'] },
            { method: 'cacheResult', args: ['hit'] },
        ]);
    });

    it('AC-18: промах → miss и request(permissions, ok, s) с s > 0', async () => {
        const t = createTestClient();
        t.stub.reply(() => {
            t.clock.advance(5);
            return snapshotReply();
        });
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.metrics.calls).toContainEqual({ method: 'cacheResult', args: ['miss'] });
        expect(t.metrics.requests()).toEqual([['permissions', 'ok', 0.005]]);
    });

    it('AC-18: повторное чтение по pep → miss', async () => {
        const t = await prepareAgent();
        const before = t.metrics.calls.length;
        t.stub.reply(() => snapshotReply(8));
        await t.client.check(agent(8), PERMS[0]);
        const added = t.metrics.calls.slice(before).filter((c) => c.method === 'cacheResult');
        expect(added).toEqual([{ method: 'cacheResult', args: ['miss'] }]);
    });

    it('AC-18: ответ старше lastSeenEpoch → stale', async () => {
        const t = createTestClient({ handler: () => snapshotReply(7) });
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.metrics.calls).toContainEqual({ method: 'cacheResult', args: ['stale'] });
    });

    it('AC-18: 503 → request(permissions, unavailable, …); 422 → contract_error; 401 + повтор → два вызова request', async () => {
        const t = createTestClient({ handler: () => ({ status: 503 }) });
        await t.client.check(HUMAN_A, PERMS[0]).catch(() => undefined);
        t.stub.reply(() => ({ status: 422, json: { error: { code: 'TENANT_MISMATCH' } } }));
        await t.client.check(HUMAN_A, PERMS[0]).catch(() => undefined);
        let n = 0;
        t.stub.reply(() => {
            n += 1;
            return n === 1 ? { status: 401 } : snapshotReply();
        });
        await t.client.check(HUMAN_A, PERMS[0]);
        expect(t.metrics.requests().map(([e, r]) => [e, r])).toEqual([
            ['permissions', 'unavailable'],
            ['permissions', 'contract_error'],
            ['permissions', 'unavailable'],
            ['permissions', 'ok'],
        ]);
    });

    it('AC-18: событие с новой эпохой → policyEvent(applied), повтор того же события → ignored, неверный конверт → invalid', () => {
        const t = createTestClient();
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        t.client.onPolicyChanged({ type: 'nope' });
        expect(t.metrics.calls).toEqual([
            { method: 'policyEvent', args: ['applied'] },
            { method: 'policyEvent', args: ['ignored'] },
            { method: 'policyEvent', args: ['invalid'] },
        ]);
    });

    it('AC-18: ни в одном вызове нет sub и tenantId', async () => {
        const t = createTestClient();
        await t.client.check(HUMAN_A, PERMS[0]);
        await t.client.check(HUMAN_B, PERMS[0]);
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        t.stub.reply(() => ({ status: 503 }));
        await t.client.check(HUMAN_A, PERMS[0]).catch(() => undefined);
        const text = JSON.stringify(t.metrics.calls);
        for (const value of ['usr_a', 'usr_b', 'cmp_1']) {
            expect(text).not.toContain(value);
        }
    });

    it('AC-18: без metrics — ошибок нет', async () => {
        const t = createTestClient({ overrides: { metrics: undefined } });
        await t.client.check(HUMAN_A, PERMS[0]);
        await t.client.check(HUMAN_A, PERMS[0]);
        t.client.onPolicyChanged(policyEvent('cmp_1', 8));
        t.stub.reply(() => ({ status: 503 }));
        await expect(t.client.check(HUMAN_A, PERMS[0])).rejects.toBeInstanceOf(
            PlatformUnavailableError,
        );
        expect(t.metrics.calls).toHaveLength(0);
    });

    it('AC-18: клиент Platform не пишет request(token, …) — свой TokenProvider без метрик (prd.md v1.8)', async () => {
        let n = 0;
        const t = createTestClient({
            handler: () => {
                n += 1;
                return n === 1 ? { status: 401 } : snapshotReply();
            },
        });
        await t.client.check(HUMAN_A, PERMS[0]);
        t.stub.reply(() => ({ status: 503 }));
        await t.client.check(HUMAN_B, PERMS[0]).catch(() => undefined);
        expect(t.metrics.requests().some(([endpoint]) => endpoint === 'token')).toBe(false);
    });
});

describe('AC-19: логи без секретов', () => {
    it('AC-19: клиент с clientCredentials — сценарии 401+refresh, 503 Identity, 422 Platform, invalid_client → ни одна запись логгера не содержит токен и clientSecret', async () => {
        const issued = (token: string): StubReply => ({
            status: 200,
            json: { access_token: token, expires_in: 300 },
        });
        // Первый токен TOKEN_1, после refresh по 401 — TOKEN_2.
        let tokenReplies: StubReply[] = [issued(TOKEN_1), issued(TOKEN_2)];
        let platformReplies: StubReply[] = [{ status: 401 }, snapshotReply()];
        const t = createTestClient({
            handler: (request) => {
                if (request.path === '/oidc/token') {
                    return tokenReplies.shift() ?? issued(TOKEN_1);
                }
                return platformReplies.shift() ?? snapshotReply();
            },
        });
        const tokenProvider = clientCredentials({
            tokenUrl: 'http://identity:3000/oidc/token',
            clientId: 'verdeect-files',
            clientSecret: CLIENT_SECRET,
            scope: 'platform:authz',
            resource: 'https://api.verdeect.ru',
            fetch: t.stub.fetch,
            clock: t.clock.now,
        });
        const client = createPlatformAuthzClient({
            baseUrl: 'http://platform:3000',
            tokenProvider,
            fetch: t.stub.fetch,
            clock: t.clock.now,
            logger: t.log.logger,
        });
        // 401 + refresh.
        expect((await client.check(HUMAN_A, PERMS[0])).allow).toBe(true);
        expect(t.permissionsRequests().map((r) => r.headers.get('authorization'))).toEqual([
            `Bearer ${TOKEN_1}`,
            `Bearer ${TOKEN_2}`,
        ]);
        // 503 Identity.
        tokenReplies = [{ status: 503 }];
        const unavailable = await tokenProvider
            .getToken({ refresh: true })
            .catch((e: unknown) => e);
        expect(unavailable).toBeInstanceOf(PlatformUnavailableError);
        tokenReplies = [{ status: 503 }];
        await client.check(HUMAN_B, PERMS[0]).catch(() => undefined);
        // invalid_client.
        tokenReplies = [{ status: 401, json: { error: 'invalid_client' } }];
        await client.check({ ...HUMAN_B, sub: 'usr_c' }, PERMS[0]).catch(() => undefined);
        // 422 Platform.
        tokenReplies = [issued(TOKEN_1)];
        platformReplies = [{ status: 422, json: { error: { code: 'TENANT_MISMATCH' } } }];
        await client.check({ ...HUMAN_B, sub: 'usr_d' }, PERMS[0]).catch(() => undefined);

        expect(t.log.messages('warn')).toContain('PLATFORM_UNAVAILABLE');
        expect(t.log.messages('error')).toContain('PlatformContractError');
        for (const entry of t.log.entries) {
            const text = `${entry.msg ?? ''} ${JSON.stringify(entry.obj)}`;
            for (const secret of SECRET_VALUES) {
                expect(text).not.toContain(secret);
            }
        }
    });

    it('AC-19: traceparent бросает → запрос ушёл без заголовка traceparent, решение получено', async () => {
        const t = createTestClient({
            overrides: {
                traceparent: () => {
                    throw new Error('tracer broken');
                },
            },
        });
        expect((await t.client.check(HUMAN_A, PERMS[0])).allow).toBe(true);
        expect(t.permissionsRequests()).toHaveLength(1);
        expect(t.permissionsRequests()[0]?.headers.has('traceparent')).toBe(false);
        expect(t.log.entries).toContainEqual({
            level: 'debug',
            msg: 'traceparent failed, header omitted',
            obj: { endpoint: 'permissions', reason: 'tracer broken' },
        });
    });

    it('AC-19: debug решения агента содержит asid и wid, запрос к Platform — нет', async () => {
        const t = await prepareAgent();
        const decision = t.log.entries.find((e) => e.msg === 'agent decision');
        expect(decision?.obj).toMatchObject({ asid: 'as_1', wid: 'w_1', pep: 7 });
        const body = t.permissionsRequests()[0]?.bodyText ?? '';
        expect(body).not.toContain('as_1');
        expect(body).not.toContain('w_1');
        expect(body).not.toContain('pep');
    });
});

describe('§5.1: публичный API', () => {
    it('§5.1: публичные экспорты ядра', async () => {
        const core = await import('../../src/core/index.js');
        expect(Object.keys(core).sort()).toEqual([
            'PlatformContractError',
            'PlatformUnavailableError',
            'clientCredentials',
            'createPlatformAuthzClient',
        ]);
    });

    it('§5.1: createPlatformAuthzClient с неверными настройками → TypeError', () => {
        expect(() =>
            createPlatformAuthzClient({
                baseUrl: 'platform:3000',
                tokenProvider: createTokenStub().provider,
            }),
        ).toThrow(TypeError);
    });
});
