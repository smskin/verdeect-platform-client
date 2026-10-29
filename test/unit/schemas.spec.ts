// AC-15 (U, §3.5, §5.3): образцовые platform.policy.changed по схеме Platform проходят zod пакета; схема ответа permissions (§3.2).
import { readFileSync } from 'node:fs';
// ajv и ajv-formats — CJS: в NodeNext default-импорт = module.exports; функции/классы берём из .default (выставлен в рантайме).
import Ajv2020Module from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import {
    parseOAuthErrorCode,
    parsePermissionsResponse,
    parsePlatformError,
    parsePolicyChanged,
    parseTokenResponse,
} from '../../src/core/schemas.js';

const schemaJson: unknown = JSON.parse(
    readFileSync(new URL('../fixtures/platform-events.schema.json', import.meta.url), 'utf8'),
);
const ajv = new Ajv2020Module.default({ strict: false });
addFormatsModule.default(ajv);
const validate = ajv.compile(schemaJson as object);

const REASONS = [
    'member_roles',
    'member_removed',
    'account_disabled',
    'company_suspended',
    'modules',
    'role_catalog',
];

function policyChanged(data: Record<string, unknown>): Record<string, unknown> {
    return {
        id: 'evt_01JABCDEFGHJKMNPQRSTVWXYZ0',
        type: 'platform.policy.changed',
        version: 1,
        occurredAt: '2026-10-27T10:00:00.000Z',
        tenant: 'acme',
        actor: { clientId: 'verdeect-platform', accountId: null, channel: 'system' },
        subject: { kind: 'company', id: 'cmp_1' },
        data,
        traceId: null,
    };
}

function expectAjv(envelope: Record<string, unknown>): void {
    const valid = validate(envelope);
    expect(valid, JSON.stringify(validate.errors)).toBe(true);
}

describe('AC-15: platform.policy.changed — ajv по копии схемы Platform и zod пакета', () => {
    it.each(REASONS)('AC-15: reason %s без subs проходит ajv и zod', (reason) => {
        const envelope = policyChanged({ tenantId: 'cmp_1', epoch: 8, reason });
        expectAjv(envelope);
        const parsed = parsePolicyChanged(envelope);
        expect(parsed).toEqual({
            ok: true,
            event: {
                id: 'evt_01JABCDEFGHJKMNPQRSTVWXYZ0',
                tenantId: 'cmp_1',
                epoch: 8,
                subs: undefined,
            },
        });
    });

    it.each(REASONS)('AC-15: reason %s с subs проходит ajv и zod', (reason) => {
        const envelope = policyChanged({
            tenantId: 'cmp_1',
            epoch: 8,
            reason,
            subs: ['usr_1', 'usr_2'],
        });
        expectAjv(envelope);
        const parsed = parsePolicyChanged(envelope);
        expect(parsed.ok && parsed.event.subs).toEqual(['usr_1', 'usr_2']);
    });

    it('AC-15: zod мягче — незнакомый reason и лишнее поле data принимаются', () => {
        const envelope = policyChanged({
            tenantId: 'cmp_1',
            epoch: 8,
            reason: 'future_reason',
            extra: true,
        });
        expect(validate(envelope)).toBe(false);
        expect(parsePolicyChanged(envelope).ok).toBe(true);
    });

    it('AC-15: subs: [] — сброс всей компании (subs = undefined)', () => {
        const parsed = parsePolicyChanged(
            policyChanged({ tenantId: 'cmp_1', epoch: 8, reason: 'modules', subs: [] }),
        );
        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.event.subs).toBeUndefined();
    });

    it('AC-15: нет data.tenantId, epoch: 0, не тот type — zod отклоняет без исключения', () => {
        const samples = [
            policyChanged({ epoch: 8, reason: 'modules' }),
            policyChanged({ tenantId: 'acme', epoch: 0, reason: 'modules' }),
            { ...policyChanged({ tenantId: 'acme', epoch: 8 }), type: 'platform.member.added' },
        ];
        for (const sample of samples) {
            const parsed = parsePolicyChanged(sample);
            expect(parsed.ok).toBe(false);
            if (!parsed.ok) {
                expect(parsed.issues.length).toBeGreaterThan(0);
                expect(JSON.stringify(parsed.issues)).not.toContain('acme');
            }
        }
    });
});

const ALLOWED = {
    allow: true,
    epoch: 7,
    memberId: 'mem_1',
    roles: ['admin'],
    permissions: ['files.read', 'files.write', 'chats.read'],
    denied: { 'members.manage': 'FORBIDDEN', 'kanban.read': 'MODULE_DISABLED' },
    modules: [
        { id: 'files', enabled: true },
        { id: 'kanban', enabled: false, code: 'MODULE_DISABLED' },
    ],
    limits: { fileSizeMb: 50 },
};

const DENIED_BASE = {
    allow: false,
    roles: [],
    permissions: [],
    denied: {},
    modules: [],
    limits: { fileSizeMb: null },
};

describe('AC-8: схема ответа permissions (§3.2)', () => {
    it('AC-8: разрешение по §3.2 разбирается', () => {
        expect(parsePermissionsResponse(ALLOWED)).toEqual(ALLOWED);
    });

    it('AC-8: общий отказ и NOT_MEMBER с epoch: null разбираются', () => {
        const suspended = {
            ...DENIED_BASE,
            epoch: 7,
            memberId: 'mem_1',
            code: 'COMPANY_SUSPENDED',
            message: 'Компания приостановлена.',
        };
        const notMember = {
            ...DENIED_BASE,
            epoch: null,
            code: 'NOT_MEMBER',
            message: 'Нет доступа к компании.',
        };
        expect(parsePermissionsResponse(suspended)).toEqual(suspended);
        expect(parsePermissionsResponse(notMember)).toEqual(notMember);
    });

    it.each([
        ['epoch: 0', { ...ALLOWED, epoch: 0 }],
        ["epoch: '7'", { ...ALLOWED, epoch: '7' }],
        ['неизвестный код denied', { ...ALLOWED, denied: { 'files.read': 'NOPE' } }],
        [
            'allow: false с непустым permissions',
            {
                ...DENIED_BASE,
                epoch: 7,
                code: 'NOT_MEMBER',
                message: 'x',
                permissions: ['files.read'],
            },
        ],
        ['нет memberId при allow: true', { ...ALLOWED, memberId: undefined }],
        ['null', null],
        ['строка', 'ok'],
    ])('AC-8: ответ не по схеме → undefined (%s)', (_name, value) => {
        expect(parsePermissionsResponse(value)).toBeUndefined();
    });
});

describe('AC-20: limits в ответе permissions (§3.2)', () => {
    const withLimits = (limits: unknown): Record<string, unknown> => ({ ...ALLOWED, limits });

    it('AC-20: пять ключей B.1 и fileSizeMb разбираются как есть', () => {
        const limits = {
            fileSizeMb: 50,
            assistants: 3,
            concurrentChats: null,
            modelRequestsPerMonth: 1000,
            modelRequestsPerMemberPerMonth: null,
        };
        expect(parsePermissionsResponse(withLimits(limits))?.limits).toStrictEqual(limits);
    });

    it('AC-20 / UC-5 A1: только fileSizeMb (Platform v1.11) — других ключей нет', () => {
        const parsed = parsePermissionsResponse(withLimits({ fileSizeMb: 50 }));
        expect(parsed?.limits).toStrictEqual({ fileSizeMb: 50 });
        expect(parsed !== undefined && 'assistants' in parsed.limits).toBe(false);
    });

    it('AC-20 / UC-5 A2: незнакомый ключ number | null — как есть', () => {
        const parsed = parsePermissionsResponse(
            withLimits({ fileSizeMb: 50, newLimit: 7, other: null }),
        );
        expect(parsed?.limits).toStrictEqual({ fileSizeMb: 50, newLimit: 7, other: null });
    });

    it('AC-20 / UC-5 A2: незнакомый ключ иного типа отброшен, имя передано в колбэк', () => {
        const dropped: (readonly string[])[] = [];
        const parsed = parsePermissionsResponse(
            withLimits({ fileSizeMb: 50, flags: 'x', nested: { a: 1 } }),
            (keys) => dropped.push(keys),
        );
        expect(parsed?.limits).toStrictEqual({ fileSizeMb: 50 });
        expect(dropped).toStrictEqual([['flags', 'nested']]);
    });

    it.each([
        ["assistants: 'x'", { fileSizeMb: 50, assistants: 'x' }],
        ['нет fileSizeMb', { assistants: 3 }],
        ["fileSizeMb: '50'", { fileSizeMb: '50' }],
    ])('AC-20: известный ключ не number | null → undefined (%s)', (_name, limits) => {
        expect(parsePermissionsResponse(withLimits(limits))).toBeUndefined();
    });

    it('AC-20: общий отказ — семь null и {fileSizeMb: null} (v1.11) разбираются', () => {
        const seven = {
            members: null,
            storageMb: null,
            fileSizeMb: null,
            modelRequestsPerMonth: null,
            modelRequestsPerMemberPerMonth: null,
            concurrentChats: null,
            assistants: null,
        };
        const base = { ...DENIED_BASE, epoch: 7, code: 'COMPANY_SUSPENDED', message: 'x' };
        expect(parsePermissionsResponse({ ...base, limits: seven })?.limits).toStrictEqual(seven);
        expect(parsePermissionsResponse(base)?.limits).toStrictEqual({ fileSizeMb: null });
    });
});

describe('§5.1: ответы Identity', () => {
    it('§5.1: ответ token endpoint разбирается', () => {
        expect(
            parseTokenResponse({ access_token: 't', expires_in: 40, token_type: 'Bearer' }),
        ).toEqual({ accessToken: 't', expiresInSec: 40 });
        expect(parseTokenResponse({ access_token: 't' })).toBeUndefined();
    });

    it('§5.1: код ошибки OAuth и тело ошибки Platform', () => {
        expect(parseOAuthErrorCode({ error: 'invalid_client' })).toBe('invalid_client');
        expect(
            parsePlatformError({ error: { code: 'TENANT_MISMATCH', message: '…', details: {} } }),
        ).toEqual({ code: 'TENANT_MISMATCH', details: {} });
    });
});
