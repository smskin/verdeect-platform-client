// Транспорт к Platform (prd.md §5.1 «Ответы Platform»): AC-7 (401, 503, таймаут, обрыв), AC-7a, AC-18 (request), AC-19 «Транспорт».
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformContractError, PlatformUnavailableError } from '../../src/core/errors.js';
import { createLogLimiter } from '../../src/core/log-limiter.js';
import { parsePermissionsResponse } from '../../src/core/schemas.js';
import { createTransport, type TransportDeps } from '../../src/core/transport.js';
import { createClock } from './support/clock.js';
import { createFetchStub, type StubReply } from './support/fetch-stub.js';
import { createRecordingLogger, createRecordingMetrics } from './support/recording.js';
import { TOKEN_1, TOKEN_2 } from './support/secrets.js';
import { createTokenStub } from './support/token-stub.js';

const BODY = { sub: 'usr_a', tenant: 'acme', tenantId: 'cmp_1', act: 'human' };
const SNAPSHOT = {
    allow: true,
    epoch: 7,
    memberId: 'mem_1',
    roles: [],
    permissions: ['files.read'],
    denied: {},
    modules: [],
    limits: { fileSizeMb: null },
};
const OK: StubReply = { status: 200, json: SNAPSHOT };
const TRACEPARENT = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

function makeTransport(overrides: Partial<TransportDeps> = {}) {
    const stub = createFetchStub(() => OK);
    const clock = createClock(0);
    const tokens = createTokenStub();
    const rec = createRecordingLogger();
    const m = createRecordingMetrics();
    const transport = createTransport({
        baseUrl: 'http://platform:3000',
        tokenProvider: tokens.provider,
        fetch: stub.fetch,
        clock: clock.now,
        requestTimeoutMs: 2000,
        traceparent: undefined,
        logger: rec.logger,
        metrics: m.metrics,
        limiter: createLogLimiter(rec.logger, clock.now),
        ...overrides,
    });
    const post = () => transport.post('permissions', BODY, parsePermissionsResponse);
    return { stub, clock, tokens, rec, m, transport, post };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('AC-19: транспорт', () => {
    it('AC-19: Authorization: Bearer <токен>, Content-Type: application/json, URL /v1/authz/permissions, тело как есть', async () => {
        const { stub, post } = makeTransport();
        expect(await post()).toEqual(SNAPSHOT);
        const request = stub.requests[0];
        expect(request?.url).toBe('http://platform:3000/v1/authz/permissions');
        expect(request?.method).toBe('POST');
        expect(request?.headers.get('authorization')).toBe(`Bearer ${TOKEN_1}`);
        expect(request?.headers.get('content-type')).toBe('application/json');
        expect(request?.json()).toEqual(BODY);
    });

    it("AC-19: traceparent: () => '00-…-01' → заголовок traceparent", async () => {
        const { stub, post } = makeTransport({ traceparent: () => TRACEPARENT });
        await post();
        expect(stub.requests[0]?.headers.get('traceparent')).toBe(TRACEPARENT);
    });

    it('AC-19: traceparent → undefined — заголовка нет', async () => {
        const { stub, post } = makeTransport({ traceparent: () => undefined });
        await post();
        expect(stub.requests[0]?.headers.has('traceparent')).toBe(false);
    });
});

describe('AC-7: недоступность и 401', () => {
    it.each([[503], [500]])(
        'AC-7: Platform %s → PlatformUnavailableError, один запрос',
        async (status) => {
            const { stub, post } = makeTransport();
            stub.reply(() => ({ status }));
            const error = await post().catch((e: unknown) => e);
            expect(error).toBeInstanceOf(PlatformUnavailableError);
            expect((error as PlatformUnavailableError).reason).toBe('http_5xx');
            expect(stub.requests).toHaveLength(1);
        },
    );

    it('AC-7: таймаут 2 с → PlatformUnavailableError (timeout)', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { stub, post } = makeTransport();
        stub.reply(() => 'hang');
        const pending = post().catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(2000);
        const error = await pending;
        expect(error).toBeInstanceOf(PlatformUnavailableError);
        expect((error as PlatformUnavailableError).reason).toBe('timeout');
    });

    it('AC-7: обрыв соединения → PlatformUnavailableError (network)', async () => {
        const { stub, post } = makeTransport();
        stub.reply(() => 'network-error');
        const error = await post().catch((e: unknown) => e);
        expect((error as PlatformUnavailableError).reason).toBe('network');
    });

    it('AC-7: 401 → getToken({refresh: true}) ровно один раз, повтор ушёл с новым токеном', async () => {
        const { stub, tokens, post } = makeTransport();
        let n = 0;
        stub.reply(() => {
            n += 1;
            return n === 1 ? { status: 401 } : OK;
        });
        expect(await post()).toEqual(SNAPSHOT);
        expect(tokens.calls).toEqual([{ refresh: false }, { refresh: true }]);
        expect(stub.requests.map((r) => r.headers.get('authorization'))).toEqual([
            `Bearer ${TOKEN_1}`,
            `Bearer ${TOKEN_2}`,
        ]);
    });

    it('AC-7: повтор 401 → PlatformUnavailableError (unauthorized), третьего запроса нет', async () => {
        const { stub, post } = makeTransport();
        stub.reply(() => ({ status: 401 }));
        const error = await post().catch((e: unknown) => e);
        expect((error as PlatformUnavailableError).reason).toBe('unauthorized');
        expect(stub.requests).toHaveLength(2);
    });

    it('AC-7: getToken недоступен → ошибка как есть, warn PLATFORM_UNAVAILABLE с endpoint token, запроса к Platform нет', async () => {
        const { stub, tokens, rec, post } = makeTransport();
        const failure = new PlatformUnavailableError('token', 'http_5xx');
        tokens.fail(failure);
        expect(await post().catch((e: unknown) => e)).toBe(failure);
        expect(stub.requests).toHaveLength(0);
        expect(rec.entries).toContainEqual({
            level: 'warn',
            msg: 'PLATFORM_UNAVAILABLE',
            obj: { reason: 'http_5xx', endpoint: 'token', suppressed: 0 },
        });
    });
});

describe('AC-7a: ошибки контракта', () => {
    it.each([
        [403, 'SCOPE_REQUIRED'],
        [422, 'TENANT_MISMATCH'],
        [422, 'VALIDATION_FAILED'],
    ])(
        'AC-7a: %s %s → PlatformContractError с этим кодом, без повтора и без перезапроса токена',
        async (status, code) => {
            const { stub, tokens, post } = makeTransport();
            stub.reply(() => ({ status, json: { error: { code, message: '…', details: {} } } }));
            const error = await post().catch((e: unknown) => e);
            expect(error).toBeInstanceOf(PlatformContractError);
            expect((error as PlatformContractError).code).toBe(code);
            expect(stub.requests).toHaveLength(1);
            expect(tokens.calls).toHaveLength(1);
        },
    );

    it('AC-7a: 404 без тела Platform → PlatformContractError HTTP_404', async () => {
        const { stub, post } = makeTransport();
        stub.reply(() => ({ status: 404, text: 'Not Found' }));
        expect(((await post().catch((e: unknown) => e)) as PlatformContractError).code).toBe(
            'HTTP_404',
        );
    });

    it('AC-7a: 200 не по схеме → PlatformContractError INVALID_RESPONSE', async () => {
        const { stub, post } = makeTransport();
        stub.reply(() => ({ status: 200, json: { ...SNAPSHOT, epoch: 0 } }));
        const error = (await post().catch((e: unknown) => e)) as PlatformContractError;
        expect(error.code).toBe('INVALID_RESPONSE');
        expect(error.details).toEqual({ endpoint: 'permissions' });
    });

    it('AC-7a: 200 с невалидным JSON → PlatformContractError INVALID_RESPONSE', async () => {
        const { stub, post } = makeTransport();
        stub.reply(() => ({ status: 200, text: '{oops' }));
        expect(((await post().catch((e: unknown) => e)) as PlatformContractError).code).toBe(
            'INVALID_RESPONSE',
        );
    });
});

describe('AC-18: метрика request', () => {
    it('AC-18: 200 → request(permissions, ok, s), s > 0', async () => {
        const { stub, clock, m, post } = makeTransport();
        stub.reply(() => {
            clock.advance(5);
            return OK;
        });
        await post();
        expect(m.requests()).toEqual([['permissions', 'ok', 0.005]]);
    });

    it('AC-18: 503 → request(permissions, unavailable, …)', async () => {
        const { stub, m, post } = makeTransport();
        stub.reply(() => ({ status: 503 }));
        await post().catch(() => undefined);
        expect(m.requests()).toEqual([['permissions', 'unavailable', 0]]);
    });

    it('AC-18: 422 → request(permissions, contract_error, …)', async () => {
        const { stub, m, post } = makeTransport();
        stub.reply(() => ({ status: 422, json: { error: { code: 'TENANT_MISMATCH' } } }));
        await post().catch(() => undefined);
        expect(m.requests()).toEqual([['permissions', 'contract_error', 0]]);
    });

    it('AC-18: 401 + повтор → два вызова request', async () => {
        const { stub, m, post } = makeTransport();
        let n = 0;
        stub.reply(() => {
            n += 1;
            return n === 1 ? { status: 401 } : OK;
        });
        await post();
        expect(m.requests()).toEqual([
            ['permissions', 'unavailable', 0],
            ['permissions', 'ok', 0],
        ]);
    });

    it('AC-18: в вызовах нет sub и tenantId', async () => {
        const { m, post } = makeTransport();
        await post();
        const text = JSON.stringify(m.calls);
        expect(text).not.toContain('usr_a');
        expect(text).not.toContain('cmp_1');
    });
});

describe('NFR-3: логи транспорта', () => {
    it('NFR-3: debug platform request без токена и тела', async () => {
        const { rec, post } = makeTransport();
        await post();
        expect(rec.entries).toEqual([
            {
                level: 'debug',
                msg: 'platform request',
                obj: { endpoint: 'permissions', status: 200, attempt: 1, durationMs: 0 },
            },
        ]);
    });
});
