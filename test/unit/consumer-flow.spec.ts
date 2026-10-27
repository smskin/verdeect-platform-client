// UC-4, AC-8a (prd.md §5.5, §5.4): тест потребителя — createFakePlatform, PlatformAuthzModule, VerdeectAuthGuard на контроллере.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFakePlatform, type FakePlatform } from '../../src/testing/index.js';
import {
    createSigners,
    READ,
    startTestApp,
    TENANT_ID,
    tokens,
    type Signers,
    type TestApp,
} from './support/nest-app.js';

const SUB = 'acc_user';

let signers: Signers;
let t: ReturnType<typeof tokens>;
let fake: FakePlatform;
let app: TestApp;

beforeAll(async () => {
    signers = await createSigners();
    t = tokens(signers);
});

afterAll(async () => {
    await signers.close();
});

async function start(): Promise<void> {
    app = await startTestApp({ variant: 'controller', client: fake.client, signers });
}

afterEach(async () => {
    await app.close();
});

function errorBody(code: string, message: string) {
    return { error: { code, message, details: {} } };
}

describe('UC-4: тест потребителя на подделке Platform', () => {
    it('UC-4: grant native.files.read → маршрут @RequirePermission(native.files.read) → 200', async () => {
        fake = createFakePlatform();
        fake.grant(TENANT_ID, SUB, [READ]);
        await start();
        const result = await app.call('/p/one', await t.user(SUB));
        expect(result).toStrictEqual({
            status: 200,
            body: { decision: { memberId: `mem_${SUB}`, epoch: 1 } },
        });
    });

    it('UC-4: deny COMPANY_SUSPENDED → 403 COMPANY_SUSPENDED «Компания приостановлена.»', async () => {
        fake = createFakePlatform();
        fake.deny(TENANT_ID, SUB, 'COMPANY_SUSPENDED');
        await start();
        expect(await app.call('/p/one', await t.user(SUB))).toStrictEqual({
            status: 403,
            body: errorBody('COMPANY_SUSPENDED', 'Компания приостановлена.'),
        });
    });

    it('UC-4: setModule files MODULE_DISABLED + grant native.files.read → 403 MODULE_DISABLED', async () => {
        fake = createFakePlatform();
        fake.grant(TENANT_ID, SUB, [READ]);
        fake.setModule(TENANT_ID, 'files', 'MODULE_DISABLED');
        await start();
        expect(await app.call('/p/one', await t.user(SUB))).toStrictEqual({
            status: 403,
            body: errorBody('MODULE_DISABLED', 'Раздел отключён. Данные сохранены.'),
        });
    });

    it.each(['grant', 'deny'] as const)(
        'UC-4 A1: опечатка в праве декоратора → 500 INTERNAL_ERROR при любом состоянии подделки (%s)',
        async (state) => {
            fake = createFakePlatform();
            if (state === 'grant') {
                fake.grant(TENANT_ID, SUB, [READ]);
            } else {
                fake.deny(TENANT_ID, SUB, 'COMPANY_SUSPENDED');
            }
            await start();
            expect(await app.call('/p/typo', await t.user(SUB))).toStrictEqual({
                status: 500,
                body: errorBody('INTERNAL_ERROR', 'Внутренняя ошибка сервиса'),
            });
            expect(fake.calls()).toHaveLength(0);
        },
    );

    it('UC-4 A2: setEpoch(t, 8), onPolicyChanged(policyChanged(t, [s])), агент pep = 7 → 403 CONTEXT_REVOKED', async () => {
        fake = createFakePlatform();
        fake.grant(TENANT_ID, SUB, [READ]);
        await start();
        expect((await app.call('/p/one', await t.agent({ pep: 1, sub: SUB }))).status).toBe(200);
        fake.setEpoch(TENANT_ID, 8);
        fake.client.onPolicyChanged(fake.policyChanged(TENANT_ID, [SUB]));
        expect(await app.call('/p/one', await t.agent({ pep: 7, sub: SUB }))).toStrictEqual({
            status: 403,
            body: errorBody('CONTEXT_REVOKED', 'Контекст отозван. Нужен новый диалог.'),
        });
    });

    it('UC-4: неизвестный участник → 403 NOT_MEMBER «Нет доступа к компании.»', async () => {
        fake = createFakePlatform();
        await start();
        expect(await app.call('/p/one', await t.user(SUB))).toStrictEqual({
            status: 403,
            body: errorBody('NOT_MEMBER', 'Нет доступа к компании.'),
        });
    });
});
