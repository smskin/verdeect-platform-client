// Ядро @verdeect/platform-client без NestJS и @verdeect/auth (AC-12, NFR-4, D2): импорт и check с подделанным fetch.
import { createRequire } from 'node:module';
import { createPlatformAuthzClient } from '@verdeect/platform-client';

for (const peer of ['@nestjs/common', '@verdeect/auth']) {
    try {
        createRequire(import.meta.url).resolve(peer);
        console.error(`core smoke failed: ${peer} is resolvable`);
        process.exit(1);
    } catch (error) {
        if (error?.code !== 'MODULE_NOT_FOUND') {
            throw error;
        }
    }
}

const snapshot = {
    allow: true,
    epoch: 1,
    memberId: 'mem_1',
    roles: [],
    permissions: ['chat.use'],
    denied: {},
    modules: [],
    limits: { fileSizeMb: null },
};
const client = createPlatformAuthzClient({
    baseUrl: 'http://platform.invalid',
    tokenProvider: { getToken: async () => 'token' },
    fetch: async () => new Response(JSON.stringify(snapshot), { status: 200 }),
});
const decision = await client.check(
    { sub: 'acc_1', tenant: 'acme', tenantId: 'org_acme', act: 'human' },
    'chat.use',
);
console.log(`allow=${decision.allow}`);
