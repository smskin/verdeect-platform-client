// AC-9, AC-18 (prd.md §5.1 v1.8, D8): clientCredentials — client_secret_basic, кэш, объединение, refresh, ошибки Identity, метрика token.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformContractError, PlatformUnavailableError } from '../../src/core/errors.js';
import { clientCredentials } from '../../src/core/token-provider.js';
import type { ClientCredentialsOptions } from '../../src/core/types.js';
import { createClock } from './support/clock.js';
import { createFetchStub, createGate, type StubReply } from './support/fetch-stub.js';
import { createRecordingMetrics } from './support/recording.js';
import { CLIENT_SECRET, TOKEN_1, TOKEN_2 } from './support/secrets.js';

const OK_1: StubReply = {
    status: 200,
    json: { access_token: TOKEN_1, expires_in: 40, token_type: 'Bearer' },
};
const OK_2: StubReply = {
    status: 200,
    json: { access_token: TOKEN_2, expires_in: 40, token_type: 'Bearer' },
};

function setup(overrides: Partial<ClientCredentialsOptions> = {}) {
    const stub = createFetchStub(() => OK_1);
    const clock = createClock(0);
    const m = createRecordingMetrics();
    const options: ClientCredentialsOptions = {
        tokenUrl: 'http://identity:3000/oidc/token',
        clientId: 'verdeect:files',
        clientSecret: CLIENT_SECRET,
        scope: 'platform:authz',
        resource: 'https://api.verdeect.ru',
        fetch: stub.fetch,
        clock: clock.now,
        metrics: m.metrics,
        ...overrides,
    };
    return { stub, clock, m, provider: clientCredentials(options) };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('AC-9: clientCredentials', () => {
    it('AC-9: 20 одновременных getToken → 1 запрос к Identity', async () => {
        const { stub, provider } = setup();
        const gate = createGate<StubReply>();
        stub.reply(() => gate.promise);
        const pending = Array.from({ length: 20 }, () => provider.getToken());
        gate.open(OK_1);
        expect(await Promise.all(pending)).toEqual(Array(20).fill(TOKEN_1));
        expect(stub.requests).toHaveLength(1);
    });

    it('AC-9: запрос — client_credentials, scope, resource в теле, Authorization: Basic, client_secret нет в теле', async () => {
        const { stub, provider } = setup();
        await provider.getToken();
        const request = stub.requests[0];
        expect(request?.method).toBe('POST');
        expect(request?.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
        const form = request?.form();
        expect(form?.get('grant_type')).toBe('client_credentials');
        expect(form?.get('scope')).toBe('platform:authz');
        expect(form?.get('resource')).toBe('https://api.verdeect.ru');
        expect(form?.has('client_secret')).toBe(false);
        expect(form?.has('client_id')).toBe(false);
        expect(request?.headers.get('authorization')).toBe(
            'Basic ' +
                Buffer.from('verdeect%3Afiles:s3cr%3Aet%25%2BSECRET%2F%3D').toString('base64'),
        );
    });

    it('AC-9: expires_in: 40 → на 9-й секунде из кэша, на 11-й — новый запрос', async () => {
        const { stub, clock, provider } = setup();
        await provider.getToken();
        clock.set(9_000);
        await provider.getToken();
        expect(stub.requests).toHaveLength(1);
        clock.set(11_000);
        await provider.getToken();
        expect(stub.requests).toHaveLength(2);
    });

    it('AC-9: getToken({refresh: true}) при живом токене → новый запрос', async () => {
        const { stub, provider } = setup();
        await provider.getToken();
        stub.reply(() => OK_2);
        expect(await provider.getToken({ refresh: true })).toBe(TOKEN_2);
        expect(stub.requests).toHaveLength(2);
        expect(await provider.getToken()).toBe(TOKEN_2);
    });

    it('AC-9: 5 одновременных refresh → 1 запрос', async () => {
        const { stub, provider } = setup();
        const gate = createGate<StubReply>();
        stub.reply(() => gate.promise);
        const pending = Array.from({ length: 5 }, () => provider.getToken({ refresh: true }));
        gate.open(OK_2);
        expect(await Promise.all(pending)).toEqual(Array(5).fill(TOKEN_2));
        expect(stub.requests).toHaveLength(1);
    });

    it('AC-9: getToken() во время refresh получает новый токен', async () => {
        const { stub, provider } = setup();
        await provider.getToken();
        const gate = createGate<StubReply>();
        stub.reply(() => gate.promise);
        const refresh = provider.getToken({ refresh: true });
        const plain = provider.getToken();
        gate.open(OK_2);
        expect(await refresh).toBe(TOKEN_2);
        expect(await plain).toBe(TOKEN_2);
    });

    it('AC-9: ответ запроса, начатого до refresh, не попадает в кэш', async () => {
        const { stub, provider } = setup();
        const gate1 = createGate<StubReply>();
        const gate2 = createGate<StubReply>();
        let n = 0;
        stub.reply(() => {
            n += 1;
            return n === 1 ? gate1.promise : gate2.promise;
        });
        const first = provider.getToken();
        const refresh = provider.getToken({ refresh: true });
        gate1.open(OK_1);
        expect(await first).toBe(TOKEN_1);
        const after = provider.getToken();
        gate2.open(OK_2);
        expect(await refresh).toBe(TOKEN_2);
        expect(await after).toBe(TOKEN_2);
        expect(stub.requests).toHaveLength(2);
    });

    it.each([[503], [429]])('AC-9: Identity %s → PlatformUnavailableError', async (status) => {
        const { stub, provider } = setup();
        stub.reply(() => ({ status }));
        const error = await provider.getToken().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PlatformUnavailableError);
        expect((error as PlatformUnavailableError).endpoint).toBe('token');
    });

    it('AC-9: таймаут → PlatformUnavailableError (timeout)', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { stub, provider } = setup({ requestTimeoutMs: 2000 });
        stub.reply(() => 'hang');
        const pending = provider.getToken().catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(2000);
        const error = await pending;
        expect(error).toBeInstanceOf(PlatformUnavailableError);
        expect((error as PlatformUnavailableError).reason).toBe('timeout');
    });

    it('AC-9: обрыв соединения → PlatformUnavailableError (network)', async () => {
        const { stub, provider } = setup();
        stub.reply(() => 'network-error');
        const error = await provider.getToken().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PlatformUnavailableError);
        expect((error as PlatformUnavailableError).reason).toBe('network');
    });

    it('AC-9: 401 invalid_client → PlatformContractError с code invalid_client', async () => {
        const { stub, provider } = setup();
        stub.reply(() => ({ status: 401, json: { error: 'invalid_client' } }));
        const error = await provider.getToken().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PlatformContractError);
        expect((error as PlatformContractError).code).toBe('invalid_client');
    });

    it('AC-9: 400 без поля error → PlatformContractError HTTP_400', async () => {
        const { stub, provider } = setup();
        stub.reply(() => ({ status: 400, text: 'Bad Request' }));
        const error = await provider.getToken().catch((e: unknown) => e);
        expect((error as PlatformContractError).code).toBe('HTTP_400');
    });

    it('AC-9: ответ не по схеме (нет expires_in) → PlatformContractError INVALID_RESPONSE', async () => {
        const { stub, provider } = setup();
        stub.reply(() => ({ status: 200, json: { access_token: TOKEN_1 } }));
        const error = await provider.getToken().catch((e: unknown) => e);
        expect((error as PlatformContractError).code).toBe('INVALID_RESPONSE');
    });

    it('AC-9: после ошибки следующий getToken делает новый запрос', async () => {
        const { stub, provider } = setup();
        stub.reply(() => ({ status: 503 }));
        await expect(provider.getToken()).rejects.toBeInstanceOf(PlatformUnavailableError);
        stub.reply(() => OK_1);
        expect(await provider.getToken()).toBe(TOKEN_1);
        expect(stub.requests).toHaveLength(2);
    });

    it('AC-9: неверные опции → TypeError с именами, без значения секрета', () => {
        let message = '';
        try {
            setup({ clientSecret: '', tokenUrl: 'identity' });
        } catch (error) {
            expect(error).toBeInstanceOf(TypeError);
            message = (error as TypeError).message;
        }
        expect(message).toContain('clientSecret');
        expect(message).toContain('tokenUrl');
        expect(message).not.toContain(CLIENT_SECRET);
    });
});

describe('AC-18: метрика token (prd.md v1.8)', () => {
    it('AC-18: запрос к Identity → request(token, ok, s), s > 0', async () => {
        const { stub, clock, m, provider } = setup();
        stub.reply(() => {
            clock.advance(7);
            return OK_1;
        });
        await provider.getToken();
        expect(m.requests()).toEqual([['token', 'ok', 0.007]]);
    });

    it('AC-18: повторный getToken() из кэша провайдера — без вызова request', async () => {
        const { m, provider } = setup();
        await provider.getToken();
        await provider.getToken();
        expect(m.requests()).toHaveLength(1);
    });

    it('AC-18: Identity 503 → request(token, unavailable, …)', async () => {
        const { stub, m, provider } = setup();
        stub.reply(() => ({ status: 503 }));
        await provider.getToken().catch(() => undefined);
        expect(m.requests()).toEqual([['token', 'unavailable', 0]]);
    });

    it('AC-18: 401 invalid_client → request(token, contract_error, …)', async () => {
        const { stub, m, provider } = setup();
        stub.reply(() => ({ status: 401, json: { error: 'invalid_client' } }));
        await provider.getToken().catch(() => undefined);
        expect(m.requests()).toEqual([['token', 'contract_error', 0]]);
    });

    it('AC-18: без metrics у clientCredentials — ошибок нет', async () => {
        const { provider } = setup({ metrics: undefined });
        expect(await provider.getToken()).toBe(TOKEN_1);
    });
});
