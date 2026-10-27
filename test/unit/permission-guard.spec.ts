// AC-10, UC-1, UC-2, D11 (prd.md §5.4, §5.2): PermissionGuard на настоящем VerdeectAuthGuard @verdeect/auth 1.0.1 и токенах @verdeect/auth/testing.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { StubHandler } from './support/fetch-stub.js';
import {
    CLASS_PERMISSION,
    createNestLogRecorder,
    createSigners,
    READ,
    startTestApp,
    TENANT,
    TENANT_ID,
    tokens,
    WRITE,
    type AuthVariant,
    type Signers,
    type TestApp,
    type TestAppOptions,
} from './support/nest-app.js';
import { allowedSnapshot } from './support/snapshots.js';
import {
    createTestClient,
    PERMISSIONS_PATH,
    policyEvent,
    type TestClient,
} from './support/test-client.js';

const FORBIDDEN_BODY = {
    error: { code: 'FORBIDDEN', message: 'Недостаточно прав.', details: {} },
};
const SERVICE_BODY = { error: { code: 'FORBIDDEN', message: 'Доступ запрещён', details: {} } };
const TENANT_BODY = {
    error: { code: 'TENANT_REQUIRED', message: 'Не выбрана компания', details: {} },
};
const UNAUTHENTICATED_BODY = {
    error: { code: 'UNAUTHENTICATED', message: 'Требуется вход', details: {} },
};
const INTERNAL_BODY = {
    error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервиса', details: {} },
};

function snapshot(epoch = 7, permissions: string[] = [READ, CLASS_PERMISSION]) {
    const denied = Object.fromEntries(
        [READ, WRITE, CLASS_PERMISSION]
            .filter((p) => !permissions.includes(p))
            .map((p) => [p, 'FORBIDDEN' as const]),
    );
    return allowedSnapshot({ epoch, permissions, denied });
}

const allowRead: StubHandler = (r) =>
    r.path === PERMISSIONS_PATH ? { status: 200, json: snapshot() } : { status: 500 };

let signers: Signers;
let t: ReturnType<typeof tokens>;
const opened: TestApp[] = [];

beforeAll(async () => {
    signers = await createSigners();
    t = tokens(signers);
});

afterAll(async () => {
    await signers.close();
});

afterEach(async () => {
    await Promise.all(opened.splice(0).map((app) => app.close()));
});

async function setup(
    variant: AuthVariant,
    handler: StubHandler = allowRead,
    extra: Partial<TestAppOptions> = {},
): Promise<{ test: TestClient; app: TestApp }> {
    const test = createTestClient({ handler });
    const app = await startTestApp({ variant, client: test.client, signers, ...extra });
    opened.push(app);
    return { test, app };
}

describe.each<AuthVariant>(['app-guard', 'controller', 'method-below', 'none'])(
    'AC-10: вариант подключения VerdeectAuthGuard — %s',
    (variant) => {
        it('AC-10: user без права → 403 FORBIDDEN «Недостаточно прав.», details {}', async () => {
            const { app } = await setup(variant, (r) =>
                r.path === PERMISSIONS_PATH
                    ? { status: 200, json: snapshot(7, []) }
                    : { status: 500 },
            );
            const result = await app.call('/p/one', await t.user());
            expect(result).toStrictEqual({ status: 403, body: FORBIDDEN_BODY });
        });

        it('AC-10: user с правом → обработчик выполнен, platformDecision = {memberId, epoch} снимка', async () => {
            const { app } = await setup(variant);
            const result = await app.call('/p/one', await t.user());
            expect(result).toStrictEqual({
                status: 200,
                body: { decision: { memberId: 'mem_a', epoch: 7 } },
            });
        });

        it('AC-10: service → 403 FORBIDDEN «Доступ запрещён», Platform не вызывался', async () => {
            const { app, test } = await setup(variant);
            const result = await app.call('/p/one', await t.service());
            expect(result).toStrictEqual({ status: 403, body: SERVICE_BODY });
            expect(test.stub.requests).toHaveLength(0);
        });

        it('AC-10: user без tenant → 409 TENANT_REQUIRED «Не выбрана компания», Platform не вызывался', async () => {
            const { app, test } = await setup(variant);
            const result = await app.call('/p/one', await t.userWithoutTenant());
            expect(result).toStrictEqual({ status: 409, body: TENANT_BODY });
            expect(test.stub.requests).toHaveLength(0);
        });

        it('AC-10: без токена → 401 UNAUTHENTICATED от VerdeectAuthGuard', async () => {
            const { app, test } = await setup(variant);
            const result = await app.call('/p/one');
            expect(result).toStrictEqual({ status: 401, body: UNAUTHENTICATED_BODY });
            expect(test.stub.requests).toHaveLength(0);
        });

        it('AC-10: токен проверен ровно один раз', async () => {
            const { app } = await setup(variant);
            const token = await t.user();
            app.resetVerifyCount();
            await app.call('/p/one', token);
            expect(app.verifyCount()).toBe(1);
        });
    },
);

describe('AC-10: PermissionGuard — порядок, тексты, агент', () => {
    it('AC-10: @UseGuards(VerdeectAuthGuard) выше @RequirePermission → те же ответы, проверок две', async () => {
        const { app } = await setup('method-above');
        const token = await t.user();
        app.resetVerifyCount();
        expect(await app.call('/p/one', token)).toStrictEqual({
            status: 200,
            body: { decision: { memberId: 'mem_a', epoch: 7 } },
        });
        expect(app.verifyCount()).toBe(2);
        expect(await app.call('/p/one', await t.service())).toStrictEqual({
            status: 403,
            body: SERVICE_BODY,
        });
        expect(await app.call('/p/one', await t.userWithoutTenant())).toStrictEqual({
            status: 409,
            body: TENANT_BODY,
        });
        expect(await app.call('/p/one')).toStrictEqual({ status: 401, body: UNAUTHENTICATED_BODY });
    });

    it('AC-10: текст «Доступ запрещён» совпадает с ответом VerdeectAuthGuard при @RequireService на токен пользователя', async () => {
        const { app } = await setup('none');
        const reference = await app.call('/ref/service', await t.user());
        const ours = await app.call('/p/one', await t.service());
        expect(reference.status).toBe(403);
        expect(ours).toStrictEqual(reference);
    });

    it('AC-10: текст «Не выбрана компания» совпадает с ответом VerdeectAuthGuard при @RequireTenant', async () => {
        const { app } = await setup('none');
        const token = await t.userWithoutTenant();
        const reference = await app.call('/ref/tenant', token);
        const ours = await app.call('/p/one', token);
        expect(reference.status).toBe(409);
        expect(ours).toStrictEqual(reference);
    });

    it('AC-10: agent → в теле запроса к Platform нет pep, asid, wid; ушли tenant и tenantId из Principal', async () => {
        const { app, test } = await setup('none');
        const result = await app.call('/p/one', await t.agent({ pep: 7 }));
        expect(result.status).toBe(200);
        expect(test.permissionsRequests().map((r) => r.json())).toStrictEqual([
            { sub: 'acc_user', tenant: TENANT, tenantId: TENANT_ID, act: 'agent', minEpoch: 7 },
        ]);
    });

    it('AC-10 / UC-2: agent с pep < epoch → 403 CONTEXT_REVOKED «Контекст отозван. Нужен новый диалог.»', async () => {
        const { app } = await setup('none');
        const result = await app.call('/p/one', await t.agent({ pep: 5 }));
        expect(result).toStrictEqual({
            status: 403,
            body: {
                error: {
                    code: 'CONTEXT_REVOKED',
                    message: 'Контекст отозван. Нужен новый диалог.',
                    details: {},
                },
            },
        });
    });

    it('AC-10: в логе debug решения агента — asid и wid из токена', async () => {
        const { app, test } = await setup('none');
        await app.call('/p/one', await t.agent({ pep: 7, asid: 'as_x', wid: 'w_x' }));
        const entry = test.log.entries.find((e) => e.msg === 'agent decision');
        expect(entry?.level).toBe('debug');
        expect(entry?.obj).toMatchObject({ asid: 'as_x', wid: 'w_x', pep: 7 });
    });

    it('AC-10 / UC-2 A3: agent с pep = 0 → 500 INTERNAL_ERROR «Внутренняя ошибка сервиса», Platform не вызывался', async () => {
        const { app, test } = await setup('none');
        const result = await app.call('/p/one', await t.agent({ pep: 0 }));
        expect(result).toStrictEqual({ status: 500, body: INTERNAL_BODY });
        expect(test.stub.requests).toHaveLength(0);
    });

    it('AC-10: два права, одно запрещено → 403 с кодом запрещённого, к Platform один запрос', async () => {
        const { app, test } = await setup('none', (r) =>
            r.path === PERMISSIONS_PATH
                ? {
                      status: 200,
                      json: allowedSnapshot({
                          permissions: [READ],
                          denied: { [WRITE]: 'PLAN_MODULE', [CLASS_PERMISSION]: 'FORBIDDEN' },
                      }),
                  }
                : { status: 500 },
        );
        const result = await app.call('/p/two', await t.user());
        expect(result).toStrictEqual({
            status: 403,
            body: {
                error: {
                    code: 'PLAN_MODULE',
                    message: 'Возможность не входит в тариф компании.',
                    details: {},
                },
            },
        });
        expect(test.permissionsRequests()).toHaveLength(1);
    });

    it('AC-10: без VerdeectAuthModule → 500 INTERNAL_ERROR и error-лог', async () => {
        const recorder = createNestLogRecorder();
        const { app, test } = await setup('none', allowRead, {
            withAuth: false,
            logger: recorder.logger,
        });
        const result = await app.call('/p/one', await t.user());
        expect(result).toStrictEqual({ status: 500, body: INTERNAL_BODY });
        expect(test.stub.requests).toHaveLength(0);
        expect(
            recorder.records.some(
                (r) =>
                    r.level === 'error' &&
                    r.params.includes(
                        'VerdeectAuthGuard не найден в DI, подключите VerdeectAuthModule',
                    ),
            ),
        ).toBe(true);
    });

    it('AC-10: логи guard — класс и обработчик маршрута, без URL и query-строки', async () => {
        const noModule = createNestLogRecorder();
        const withoutAuth = await setup('none', allowRead, {
            withAuth: false,
            logger: noModule.logger,
        });
        await withoutAuth.app.call('/p/one?token=secret', await t.user());
        const withModule = createNestLogRecorder();
        const withAuth = await setup('none', allowRead, { logger: withModule.logger });
        await withAuth.app.call('/p/one?token=secret', await t.user());
        const guardLogs = [...noModule.records, ...withModule.records].filter(
            (r) => r.params.at(-1) === 'PlatformAuthz',
        );
        expect(guardLogs.map((r) => r.level)).toEqual(expect.arrayContaining(['error', 'debug']));
        for (const record of guardLogs) {
            expect(record.message).toStrictEqual({ handler: 'PermissionController.one' });
        }
        const all = JSON.stringify([...noModule.records, ...withModule.records]);
        expect(all).not.toContain('secret');
        expect(all).not.toContain('?token');
    });

    it.each<[AuthVariant, number]>([
        ['controller', 200],
        ['method-below', 200],
        ['none', 200],
        ['app-guard', 401],
    ])(
        'AC-10: маршрут без @RequirePermission → PermissionGuard не срабатывает, Platform не вызывается (%s → %i без токена)',
        async (variant, status) => {
            const { app, test } = await setup(variant);
            const result = await app.call('/open');
            expect(result.status).toBe(status);
            expect(test.stub.requests).toHaveLength(0);
        },
    );

    it('AC-10: user в запросе к Platform — tenant и tenantId из Principal, act human', async () => {
        const { app, test } = await setup('none');
        await app.call('/p/one', await t.user());
        expect(test.permissionsRequests().map((r) => r.json())).toStrictEqual([
            { sub: 'acc_user', tenant: TENANT, tenantId: TENANT_ID, act: 'human' },
        ]);
    });

    it('§5.4: @RequireScope + @RequirePermission, токен без области → 403 SCOPE_REQUIRED от VerdeectAuthGuard, Platform не вызывался', async () => {
        const { app, test } = await setup('none');
        const result = await app.call('/p/scope', await t.user());
        expect(result.status).toBe(403);
        expect(result.body.error?.code).toBe('SCOPE_REQUIRED');
        expect(test.stub.requests).toHaveLength(0);
    });

    it('§5.4: @RequireUser + @RequirePermission, сервисный токен → 403 USER_TOKEN_REQUIRED, Platform не вызывался', async () => {
        const { app, test } = await setup('none');
        const result = await app.call('/p/user-only', await t.service());
        expect(result.status).toBe(403);
        expect(result.body.error?.code).toBe('USER_TOKEN_REQUIRED');
        expect(test.stub.requests).toHaveLength(0);
    });

    it('§5.4: права класса и метода — обязательны все; Platform вызван один раз', async () => {
        const allowed = await setup('none');
        expect((await allowed.app.call('/cm', await t.user())).status).toBe(200);
        expect(allowed.test.permissionsRequests()).toHaveLength(1);
        const classDenied = await setup('none', (r) =>
            r.path === PERMISSIONS_PATH
                ? { status: 200, json: snapshot(7, [READ]) }
                : { status: 500 },
        );
        expect(await classDenied.app.call('/cm', await t.user())).toStrictEqual({
            status: 403,
            body: FORBIDDEN_BODY,
        });
        expect(classDenied.test.permissionsRequests()).toHaveLength(1);
    });
});

describe('UC-1: сервис проверяет право человека', () => {
    it('UC-1: снимка нет → один запрос permissions; права нет → 403 FORBIDDEN', async () => {
        const { app, test } = await setup('controller', (r) =>
            r.path === PERMISSIONS_PATH ? { status: 200, json: snapshot(7, []) } : { status: 500 },
        );
        expect(await app.call('/p/one', await t.user())).toStrictEqual({
            status: 403,
            body: FORBIDDEN_BODY,
        });
        expect(test.permissionsRequests()).toHaveLength(1);
    });

    it('UC-1 A1: 50 одновременных запросов участника → один запрос к Platform', async () => {
        const { app, test } = await setup('none');
        const token = await t.user();
        const results = await Promise.all(
            Array.from({ length: 50 }, () => app.call('/p/one', token)),
        );
        expect(results.every((r) => r.status === 200)).toBe(true);
        expect(test.permissionsRequests()).toHaveLength(1);
    });

    it('UC-1 A2: Platform 503, снимка нет → 503 PLATFORM_UNAVAILABLE «Сервис прав временно недоступен. Повторите позже»', async () => {
        const { app } = await setup('none', () => ({ status: 503 }));
        expect(await app.call('/p/one', await t.user())).toStrictEqual({
            status: 503,
            body: {
                error: {
                    code: 'PLATFORM_UNAVAILABLE',
                    message: 'Сервис прав временно недоступен. Повторите позже',
                    details: {},
                },
            },
        });
    });

    it('UC-1 / §5.4: PlatformContractError (422 TENANT_MISMATCH) → 500 INTERNAL_ERROR', async () => {
        const { app } = await setup('none', () => ({
            status: 422,
            json: { error: { code: 'TENANT_MISMATCH', message: 'mismatch', details: {} } },
        }));
        expect(await app.call('/p/one', await t.user())).toStrictEqual({
            status: 500,
            body: INTERNAL_BODY,
        });
    });
});

describe('UC-2: сервис проверяет право агента', () => {
    function epochHandler(state: { epoch: number; unavailable?: boolean }): StubHandler {
        return (r) => {
            if (r.path !== PERMISSIONS_PATH) {
                return { status: 500 };
            }
            return state.unavailable === true
                ? { status: 503 }
                : { status: 200, json: snapshot(state.epoch) };
        };
    }

    it('UC-2: агент pep = 7, снимок 7 → по праву; событие epoch 8 subs [sub] → следующий вызов с minEpoch 8 → 403 CONTEXT_REVOKED', async () => {
        const state = { epoch: 7 };
        const { app, test } = await setup('none', epochHandler(state));
        const token = await t.agent({ pep: 7 });
        expect((await app.call('/p/one', token)).status).toBe(200);
        state.epoch = 8;
        test.client.onPolicyChanged(policyEvent(TENANT_ID, 8, { subs: ['acc_user'] }));
        const result = await app.call('/p/one', token);
        expect(result.body.error?.code).toBe('CONTEXT_REVOKED');
        expect(test.permissionsRequests().at(-1)?.json()).toMatchObject({ minEpoch: 8 });
    });

    it('UC-2 A1: pep = 8, снимок 7, события нет → запрос с minEpoch 8 → по праву', async () => {
        const state = { epoch: 7 };
        const { app, test } = await setup('none', epochHandler(state));
        expect((await app.call('/p/one', await t.agent({ pep: 7 }))).status).toBe(200);
        state.epoch = 8;
        const result = await app.call('/p/one', await t.agent({ pep: 8 }));
        expect(result).toStrictEqual({
            status: 200,
            body: { decision: { memberId: 'mem_a', epoch: 8 } },
        });
        expect(test.permissionsRequests().at(-1)?.json()).toMatchObject({ minEpoch: 8 });
    });

    it('UC-2 A2: то же при 503 → решение по снимку 7, warn PLATFORM_UNAVAILABLE', async () => {
        const state = { epoch: 7, unavailable: false };
        const { app, test } = await setup('none', epochHandler(state));
        expect((await app.call('/p/one', await t.agent({ pep: 7 }))).status).toBe(200);
        state.unavailable = true;
        const result = await app.call('/p/one', await t.agent({ pep: 8 }));
        expect(result).toStrictEqual({
            status: 200,
            body: { decision: { memberId: 'mem_a', epoch: 7 } },
        });
        expect(test.log.messages('warn')).toContain('PLATFORM_UNAVAILABLE');
    });
});
