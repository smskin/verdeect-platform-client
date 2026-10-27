// Конверты identity.* для слоя C (prd.md §7 п. 7, AC-13, AC-14): построители по копии
// test/fixtures/identity-events.schema.json и проверка ajv. Без testcontainers и amqplib — модуль импортирует слой U.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
// ajv и ajv-formats — CJS: в NodeNext default-импорт = module.exports; классы и функции — из .default.
import Ajv2020Module from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

/** Алфавит Crockford base32 (ULID): без I, L, O, U. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Конверт события Identity (01 §7.1) в том виде, как его публикует Identity. */
export interface IdentityEnvelope {
    readonly id: string;
    readonly type: string;
    readonly version: 1;
    readonly occurredAt: string;
    readonly tenant: string | null;
    readonly actor: { readonly clientId: string; readonly channel: 'system' };
    readonly subject: { readonly kind: 'organization' | 'member' | 'account'; readonly id: string };
    readonly data: Record<string, unknown>;
    readonly traceId: string | null;
}

/** ULID: 10 знаков времени (мс) и 16 случайных, Crockford base32. */
function ulid(now: number): string {
    let time = '';
    let rest = now;
    for (let i = 0; i < 10; i += 1) {
        time = (CROCKFORD[rest % 32] ?? '0') + time;
        rest = Math.floor(rest / 32);
    }
    let random = '';
    for (const byte of randomBytes(16)) {
        random += CROCKFORD[byte % 32] ?? '0';
    }

    return time + random;
}

/** id конверта: `evt_` и ULID. */
export function newEventId(): string {
    return `evt_${ulid(Date.now())}`;
}

function envelope(
    type: string,
    tenant: string | null,
    subject: IdentityEnvelope['subject'],
    data: Record<string, unknown>,
): IdentityEnvelope {
    return {
        id: newEventId(),
        type,
        version: 1,
        occurredAt: new Date().toISOString(),
        tenant,
        actor: { clientId: 'verdeect-identity-cli', channel: 'system' },
        subject,
        data,
        traceId: null,
    };
}

/** identity.organization.created: компания создана. */
export function organizationCreated(
    tenantId: string,
    tenant: string,
    name: string,
): IdentityEnvelope {
    return envelope(
        'identity.organization.created',
        tenant,
        { kind: 'organization', id: tenantId },
        { tenantId, tenant, name },
    );
}

/** identity.organization.disabled: компания приостановлена. */
export function organizationDisabled(tenantId: string, tenant: string): IdentityEnvelope {
    return envelope(
        'identity.organization.disabled',
        tenant,
        { kind: 'organization', id: tenantId },
        { tenantId, tenant },
    );
}

/** identity.account.created: учётная запись; tenant конверта — null. */
export function accountCreated(sub: string, email: string): IdentityEnvelope {
    return envelope(
        'identity.account.created',
        null,
        { kind: 'account', id: sub },
        {
            sub,
            email,
            givenName: 'Иван',
            familyName: 'Петров',
            middleName: null,
            emailVerified: true,
        },
    );
}

/** identity.membership.added: участник в компании (без приглашения). */
export function membershipAdded(
    tenantId: string,
    tenant: string,
    sub: string,
    memberId: string,
): IdentityEnvelope {
    return envelope(
        'identity.membership.added',
        tenant,
        { kind: 'member', id: memberId },
        { sub, tenant, tenantId, memberId, invitationId: null },
    );
}

/** Проверка значения по JSON Schema; пустой список — значение проходит. */
export type SchemaValidator = (value: unknown) => string[];

/** Проверка ajv (draft 2020-12, форматы) по копии схемы из test/fixtures. */
export function fixtureSchemaValidator(fileName: string): SchemaValidator {
    const schema: unknown = JSON.parse(
        readFileSync(new URL(`../../fixtures/${fileName}`, import.meta.url), 'utf8'),
    );
    const ajv = new Ajv2020Module.default({ strict: false, allErrors: true });
    addFormatsModule.default(ajv);
    const validate = ajv.compile(schema as object);

    return (value) => {
        if (validate(value)) {
            return [];
        }

        return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`);
    };
}

/** Конверт identity.* по копии identity-events.schema.json; исключений не бросает. */
export const validateIdentityEnvelope: SchemaValidator = fixtureSchemaValidator(
    'identity-events.schema.json',
);
