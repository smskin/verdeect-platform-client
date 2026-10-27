// Типы подпутей видны tsc без условия development (AC-12, prd.md §4).
import type { PlatformAuthzClient } from '@verdeect/platform-client';
import type { PlatformAuthzModuleOptions, PlatformDecision } from '@verdeect/platform-client/nest';
import type { FakeMember, FakePlatform } from '@verdeect/platform-client/testing';

export function options(fake: FakePlatform): PlatformAuthzModuleOptions {
    const client: PlatformAuthzClient = fake.client;
    return { client };
}

export const member: FakeMember = { tenantId: 'org_acme', sub: 'acc_1' };
export type Decision = PlatformDecision;
