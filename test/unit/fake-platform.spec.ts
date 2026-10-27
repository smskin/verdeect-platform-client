// AC-8a, UC-3, UC-4 (prd.md §5.5, §5.3): createFakePlatform — ответы по правилам Platform, конверт policyChanged, свежесть.
import { readFileSync } from 'node:fs';
// ajv и ajv-formats — CJS: в NodeNext default-импорт = module.exports; функции/классы берём из .default (выставлен в рантайме).
import Ajv2020Module from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { DECISION_MESSAGES } from '../../src/core/codes.js';
import { PlatformContractError } from '../../src/core/errors.js';
import { parsePolicyChanged } from '../../src/core/schemas.js';
import type { GeneralDenyCode, Subject } from '../../src/core/types.js';
import { MODULE_CATALOG } from '../../src/testing/catalog.js';
import { createFakePlatform } from '../../src/testing/index.js';
import { createTestClient } from './support/test-client.js';

const schemaJson: unknown = JSON.parse(
    readFileSync(new URL('../fixtures/platform-events.schema.json', import.meta.url), 'utf8'),
);
const ajv = new Ajv2020Module.default({ strict: false });
addFormatsModule.default(ajv);
const validate = ajv.compile(schemaJson as object);

const T = 'org-acme';
const S = 'acc_1';
const human: Subject = { sub: S, tenant: 'acme', tenantId: T, act: 'human' };

function agent(pep: number): Subject {
    return { sub: S, tenant: 'acme', tenantId: T, act: 'agent', pep, asid: 'as_1', wid: 'w_1' };
}

async function expectUnknownPermission(promise: Promise<unknown>): Promise<void> {
    const error: unknown = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlatformContractError);
    expect(error).toMatchObject({ code: 'UNKNOWN_PERMISSION', details: { permission: 'no.such' } });
}

const GENERAL_DENY_CODES: GeneralDenyCode[] = [
    'NOT_MEMBER',
    'COMPANY_SUSPENDED',
    'ACCOUNT_DISABLED',
    'SEATS_EXCEEDED',
    'CONTEXT_REVOKED',
];

describe('AC-8a: createFakePlatform', () => {
    it('AC-8a: неизвестное право → UNKNOWN_PERMISSION при любом состоянии', async () => {
        const withMember = createFakePlatform({
            members: [{ tenantId: T, sub: S, permissions: ['chat.use'] }],
        });
        const noMember = createFakePlatform();
        const denied = createFakePlatform();
        denied.deny(T, S, 'COMPANY_SUSPENDED');
        for (const fake of [withMember, noMember, denied]) {
            await expectUnknownPermission(fake.client.check(human, 'no.such'));
            await expectUnknownPermission(fake.client.checkMany(human, ['chat.use', 'no.such']));
            expect(fake.calls()).toHaveLength(0);
        }
    });

    it('AC-8a: setModule knowledge MODULE_DISABLED + grant knowledge.read → MODULE_DISABLED с текстом §3.4', async () => {
        const fake = createFakePlatform();
        fake.grant(T, S, ['knowledge.read']);
        fake.setModule(T, 'knowledge', 'MODULE_DISABLED');
        expect(await fake.client.check(human, 'knowledge.read')).toStrictEqual({
            allow: false,
            epoch: 1,
            memberId: `mem_${S}`,
            code: 'MODULE_DISABLED',
            message: DECISION_MESSAGES.MODULE_DISABLED,
        });
    });

    it('AC-8a: setModule office PLAN_MODULE → chat.office → PLAN_MODULE', async () => {
        const fake = createFakePlatform();
        fake.grant(T, S, ['chat.office']);
        fake.setModule(T, 'office', 'PLAN_MODULE');
        expect(await fake.client.check(human, 'chat.office')).toMatchObject({
            allow: false,
            code: 'PLAN_MODULE',
            message: DECISION_MESSAGES.PLAN_MODULE,
        });
    });

    it('AC-8a: право ядра разрешено при любых модулях', async () => {
        const fake = createFakePlatform({
            companies: [{ tenantId: T, modules: { files: 'MODULE_DISABLED' } }],
        });
        fake.grant(T, S, ['chat.use', 'native.files.read']);
        expect(await fake.client.checkMany(human, ['chat.use', 'native.files.read'])).toMatchObject(
            {
                'chat.use': { allow: true },
                'native.files.read': { allow: false, code: 'MODULE_DISABLED' },
            },
        );
    });

    it('AC-8a: modules ответа — весь каталог копии по порядку', async () => {
        const fake = createFakePlatform();
        fake.grant(T, S, []);
        fake.setModule(T, 'office', 'PLAN_MODULE');
        const snapshot = await fake.client.permissions(human);
        expect(snapshot.modules).toStrictEqual(
            MODULE_CATALOG.map(({ id }) =>
                id === 'office'
                    ? { id, enabled: false, code: 'PLAN_MODULE' }
                    : { id, enabled: true },
            ),
        );
    });

    it('AC-8a: setEpoch(t, 8) + onPolicyChanged(policyChanged(t, [s])) → снимок сброшен, агент с pep = 7 → CONTEXT_REVOKED', async () => {
        const fake = createFakePlatform({
            members: [{ tenantId: T, sub: S, permissions: ['chat.use'] }],
        });
        expect(await fake.client.check(agent(1), 'chat.use')).toMatchObject({ allow: true });
        fake.setEpoch(T, 8);
        fake.client.onPolicyChanged(fake.policyChanged(T, [S]));
        expect(await fake.client.check(agent(7), 'chat.use')).toMatchObject({
            allow: false,
            code: 'CONTEXT_REVOKED',
            message: DECISION_MESSAGES.CONTEXT_REVOKED,
        });
        expect(fake.calls()).toHaveLength(2);
    });

    it.each([
        ['с subs', [S, S, 'acc_2'], { reason: 'member_roles', subs: [S, 'acc_2'] }],
        ['без subs', undefined, { reason: 'modules' }],
        ['с пустым subs', [], { reason: 'modules' }],
    ] as const)(
        'AC-8a: конверт policyChanged %s проходит zod пакета и ajv по копии схемы Platform',
        (_name, subs, expectedData) => {
            const fake = createFakePlatform({ companies: [{ tenantId: T, tenant: 'acme' }] });
            const envelope = fake.policyChanged(T, subs);
            const valid = validate(envelope);
            expect(valid, JSON.stringify(validate.errors)).toBe(true);
            expect(envelope).toMatchObject({ tenant: 'acme', data: { tenantId: T, epoch: 2 } });
            expect((envelope as { data: object }).data).toStrictEqual({
                tenantId: T,
                epoch: 2,
                ...expectedData,
            });
            const parsed = parsePolicyChanged(envelope);
            expect(parsed).toMatchObject({ ok: true, event: { tenantId: T, epoch: 2 } });
            if (parsed.ok && expectedData.reason === 'member_roles') {
                expect(parsed.event.subs).toStrictEqual([S, 'acc_2']);
            }
            const other = createTestClient();
            other.client.onPolicyChanged(envelope);
            expect(other.metrics.calls).toContainEqual({
                method: 'policyEvent',
                args: ['applied'],
            });
            expect(other.log.messages('warn')).toHaveLength(0);
        },
    );

    it('AC-8a: участник без members и без grant/deny → NOT_MEMBER', async () => {
        const unknownCompany = createFakePlatform();
        expect(await unknownCompany.client.check(human, 'chat.use')).toStrictEqual({
            allow: false,
            epoch: null,
            code: 'NOT_MEMBER',
            message: DECISION_MESSAGES.NOT_MEMBER,
        });
        const knownCompany = createFakePlatform({ companies: [{ tenantId: T, epoch: 4 }] });
        expect(await knownCompany.client.check(human, 'chat.use')).toMatchObject({
            allow: false,
            epoch: 4,
            code: 'NOT_MEMBER',
        });
    });

    it('AC-8a: grant(t, s, []) → check → FORBIDDEN', async () => {
        const fake = createFakePlatform();
        fake.grant(T, S, []);
        expect(await fake.client.check(human, 'chat.use')).toMatchObject({
            allow: false,
            code: 'FORBIDDEN',
            message: DECISION_MESSAGES.FORBIDDEN,
        });
    });

    it('AC-8a: deny(t, s, FORBIDDEN) и deny(t, s, MODULE_DISABLED) → TypeError', () => {
        const fake = createFakePlatform();
        for (const code of ['FORBIDDEN', 'MODULE_DISABLED', 'PLAN_MODULE']) {
            expect(() => fake.deny(T, S, code as GeneralDenyCode)).toThrow(TypeError);
        }
    });

    it('AC-8a: members без memberId → memberId выведен из sub', async () => {
        const fake = createFakePlatform({
            members: [
                { tenantId: T, sub: S, permissions: ['chat.use'] },
                { tenantId: T, sub: 'acc_2', permissions: ['chat.use'], memberId: 'mem_x' },
            ],
        });
        expect(await fake.client.check(human, 'chat.use')).toStrictEqual({
            allow: true,
            epoch: 1,
            memberId: `mem_${S}`,
        });
        expect(await fake.client.check({ ...human, sub: 'acc_2' }, 'chat.use')).toMatchObject({
            memberId: 'mem_x',
        });
    });

    it('AC-8a: members без permissions → FORBIDDEN', async () => {
        const fake = createFakePlatform({ members: [{ tenantId: T, sub: S }] });
        expect(await fake.client.check(human, 'chat.use')).toMatchObject({ code: 'FORBIDDEN' });
    });

    it.each(GENERAL_DENY_CODES)(
        'AC-8a: deny принимает GeneralDenyCode %s — общий отказ с текстом §3.4',
        async (code) => {
            const fake = createFakePlatform({
                members: [{ tenantId: T, sub: S, permissions: ['chat.use'] }],
            });
            fake.deny(T, S, code);
            expect(await fake.client.check(human, 'chat.use')).toStrictEqual({
                allow: false,
                epoch: 1,
                memberId: `mem_${S}`,
                code,
                message: DECISION_MESSAGES[code],
            });
        },
    );

    it('AC-8a: снимок компании без companies — epoch 1', async () => {
        const fake = createFakePlatform({ members: [{ tenantId: T, sub: S }] });
        expect((await fake.client.permissions(human)).epoch).toBe(1);
    });

    it("AC-8a: компания без companies с tenantId 'org_acme' → epoch 1, tenant конверта org-acme, конверт проходит ajv по схеме Platform", async () => {
        const fake = createFakePlatform();
        fake.grant('org_acme', S, []);
        expect((await fake.client.permissions({ ...human, tenantId: 'org_acme' })).epoch).toBe(1);
        const envelope = fake.policyChanged('org_acme', [S]);
        expect(envelope).toMatchObject({
            tenant: 'org-acme',
            data: { tenantId: 'org_acme', epoch: 2 },
        });
        const valid = validate(envelope);
        expect(valid, JSON.stringify(validate.errors)).toBe(true);
    });

    it('AC-8a: tenant по умолчанию — slug из tenantId: строчные, вне [a-z0-9-] → -, не длиннее 49', () => {
        const long = `Org.${'x'.repeat(60)}`;
        const fake = createFakePlatform({ members: [{ tenantId: long, sub: S }] });
        const envelope = fake.policyChanged(long) as { tenant: string };
        expect(envelope.tenant).toBe(`org-${'x'.repeat(45)}`);
        expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    });

    it("AC-8a: companies: [{tenantId: t, tenant: 'Bad_Slug'}] → TypeError с именем поля", () => {
        expect(() =>
            createFakePlatform({ companies: [{ tenantId: T, tenant: 'Bad_Slug' }] }),
        ).toThrow(/companies\.tenant/);
        expect(() =>
            createFakePlatform({ companies: [{ tenantId: T, tenant: 'Bad_Slug' }] }),
        ).toThrow(TypeError);
    });

    it.each(['_acme', ''])(
        "AC-8a: компания с tenantId '%s' без явного tenant → TypeError с этим tenantId и подсказкой задать tenant",
        (tenantId) => {
            const expected = `slug from tenantId ${JSON.stringify(tenantId)} does not match`;
            expect(() => createFakePlatform({ members: [{ tenantId, sub: S }] })).toThrow(expected);
            expect(() => createFakePlatform({ members: [{ tenantId, sub: S }] })).toThrow(
                /companies\[\]\.tenant/,
            );
            expect(() => createFakePlatform().grant(tenantId, S, [])).toThrow(expected);
        },
    );

    it("AC-8a: companies tenant '_acme' → конверт с tenant '_acme', проходит ajv", () => {
        const fake = createFakePlatform({ companies: [{ tenantId: '_acme', tenant: '_acme' }] });
        fake.grant('_acme', S, []);
        const envelope = fake.policyChanged('_acme', [S]);
        expect(envelope).toMatchObject({ tenant: '_acme' });
        expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    });

    it('AC-8a: два элемента members с одним (tenantId, sub) → TypeError', () => {
        expect(() =>
            createFakePlatform({
                members: [
                    { tenantId: T, sub: S, memberId: 'mem_a' },
                    { tenantId: T, sub: S, memberId: 'mem_b', permissions: ['chat.use'] },
                ],
            }),
        ).toThrow(/members/);
    });

    it('AC-8a: companies tenant acme, epoch 5 → конверт с tenant acme и эпохой выше 5', () => {
        const fake = createFakePlatform({ companies: [{ tenantId: T, tenant: 'acme', epoch: 5 }] });
        const envelope = fake.policyChanged(T, [S]) as { tenant: string; data: { epoch: number } };
        expect(envelope.tenant).toBe('acme');
        expect(envelope.data.epoch).toBeGreaterThan(5);
    });

    it('AC-8a: deny COMPANY_SUSPENDED → общий отказ с текстом §3.4; grant снимает отказ', async () => {
        const fake = createFakePlatform();
        fake.deny(T, S, 'COMPANY_SUSPENDED');
        expect(await fake.client.check(human, 'chat.use')).toMatchObject({
            allow: false,
            code: 'COMPANY_SUSPENDED',
            message: DECISION_MESSAGES.COMPANY_SUSPENDED,
        });
        fake.grant(T, S, ['chat.use']);
        fake.client.clear();
        expect(await fake.client.check(human, 'chat.use')).toMatchObject({ allow: true });
    });

    it('AC-8a: grant с правом вне каталога, setModule с неизвестным модулем, setEpoch(0) → TypeError', () => {
        const fake = createFakePlatform();
        expect(() => fake.grant(T, S, ['no.such'])).toThrow(TypeError);
        expect(() => fake.setModule(T, 'no-such', 'enabled')).toThrow(TypeError);
        expect(() => fake.setModule(T, 'office', 'off' as 'enabled')).toThrow(TypeError);
        expect(() => fake.setEpoch(T, 0)).toThrow(TypeError);
        expect(() => fake.setEpoch(T, 1.5)).toThrow(TypeError);
        expect(() =>
            createFakePlatform({ members: [{ tenantId: T, sub: S, permissions: ['x'] }] }),
        ).toThrow(TypeError);
    });

    it('AC-8a: calls() — путь и тело каждого запроса permissions, без pep, asid, wid', async () => {
        const fake = createFakePlatform({
            members: [{ tenantId: T, sub: S, permissions: ['chat.use'] }],
        });
        await fake.client.check(agent(1), 'chat.use');
        expect(fake.calls()).toStrictEqual([
            {
                path: '/v1/authz/permissions',
                body: { sub: S, tenant: 'acme', tenantId: T, act: 'agent', minEpoch: 1 },
            },
        ]);
    });

    it('AC-8a: raw.check подделки → PlatformContractError', async () => {
        const fake = createFakePlatform();
        await expect(fake.client.raw.check({})).rejects.toBeInstanceOf(PlatformContractError);
    });
});

describe('UC-3: событие и свежесть через подделку', () => {
    it('UC-3: событие → permissions({fresh: true}) для агента → запрос с minEpoch новой эпохи, следующий check без запроса', async () => {
        const fake = createFakePlatform({
            members: [{ tenantId: T, sub: S, permissions: ['chat.use'] }],
        });
        const agentSubject = { sub: S, tenant: 'acme', tenantId: T, act: 'agent' } as const;
        await fake.client.check(agent(1), 'chat.use');
        fake.client.onPolicyChanged(fake.policyChanged(T, [S]));
        const snapshot = await fake.client.permissions(agentSubject, { fresh: true });
        expect(snapshot.epoch).toBe(2);
        expect(fake.calls().at(-1)?.body).toMatchObject({ act: 'agent', minEpoch: 2 });
        const before = fake.calls().length;
        expect(await fake.client.check(agent(2), 'chat.use')).toMatchObject({ allow: true });
        expect(fake.calls()).toHaveLength(before);
    });

    it('UC-3 A3: одновременные fresh одного участника → один запрос', async () => {
        const fake = createFakePlatform({ members: [{ tenantId: T, sub: S }] });
        await Promise.all(
            Array.from({ length: 10 }, () => fake.client.permissions(human, { fresh: true })),
        );
        expect(fake.calls()).toHaveLength(1);
    });
});
