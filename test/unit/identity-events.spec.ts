// prd.md §7 п. 7: образцы конвертов identity.* слоя C проходят копию identity-events.schema.json Platform.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    accountCreated,
    membershipAdded,
    newEventId,
    organizationCreated,
    organizationDisabled,
    validateIdentityEnvelope,
} from '../contract/support/identity-events.js';

describe('§7 п. 7: конверты identity.* слоя C', () => {
    const tenantId = randomUUID();
    const tenant = 'c13-unit';
    const sub = randomUUID();

    it.each([
        ['identity.organization.created', organizationCreated(tenantId, tenant, 'Компания')],
        ['identity.account.created', accountCreated(sub, `${sub}@test.invalid`)],
        ['identity.membership.added', membershipAdded(tenantId, tenant, sub, randomUUID())],
        ['identity.organization.disabled', organizationDisabled(tenantId, tenant)],
    ])(
        '§7 п. 7: образец %s проходит ajv по копии identity-events.schema.json',
        (type, envelope) => {
            expect(envelope.type).toBe(type);
            expect(validateIdentityEnvelope(envelope)).toEqual([]);
        },
    );

    it('§7 п. 7: id конверта — evt_ и 26 символов Crockford base32, два вызова дают разные id', () => {
        const first = newEventId();
        const second = newEventId();

        expect(first).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(second).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(first).not.toBe(second);
    });

    it('§7 п. 7: конверт с лишним полем в data не проходит схему', () => {
        const envelope = organizationDisabled(tenantId, tenant);

        expect(
            validateIdentityEnvelope({ ...envelope, data: { ...envelope.data, extra: 1 } }),
        ).not.toEqual([]);
    });
});
