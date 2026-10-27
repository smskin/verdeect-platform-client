// Пример теста сервиса-потребителя (prd.md §5.5, UC-4, AC-12): подделка Platform, токены @verdeect/auth/testing, Vitest без настройки условий.
import 'reflect-metadata';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VerdeectAuthGuard, VerdeectAuthModule } from '@verdeect/auth/nest';
import { createTestSigner, TEST_RESOURCE, type TestSigner } from '@verdeect/auth/testing';
import { PlatformAuthzModule, RequirePermission } from '@verdeect/platform-client/nest';
import { createFakePlatform, type FakePlatform } from '@verdeect/platform-client/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

@Controller('files')
@UseGuards(VerdeectAuthGuard)
class FilesController {
    @Get()
    @RequirePermission('native.files.read')
    list(): { ok: true } {
        return { ok: true };
    }
}

describe('UC-4: контроллер сервиса с createFakePlatform', () => {
    let identity: TestSigner;
    let fake: FakePlatform;
    let app: NestFastifyApplication;

    beforeAll(async () => {
        identity = await createTestSigner();
        fake = createFakePlatform();
        const moduleRef = await Test.createTestingModule({
            imports: [
                VerdeectAuthModule.forRoot({ issuers: [identity.issuer], resource: TEST_RESOURCE }),
                PlatformAuthzModule.forRoot({ client: fake.client }),
            ],
            controllers: [FilesController],
        }).compile();
        app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
        await app.close();
        await identity.close();
    });

    async function listFiles(): Promise<number> {
        const token = await identity.userToken({
            sub: 'acc_1',
            tenant: 'acme',
            tenant_id: 'org_acme',
        });
        const response = await app.inject({
            method: 'GET',
            url: '/files',
            headers: { authorization: `Bearer ${token}` },
        });
        return response.statusCode;
    }

    it('UC-4: grant → 200', async () => {
        fake.grant('org_acme', 'acc_1', ['native.files.read']);
        expect(await listFiles()).toBe(200);
    });

    it('UC-4: deny → 403', async () => {
        fake.deny('org_acme', 'acc_1', 'COMPANY_SUSPENDED');
        // Снимок уже в кэше клиента: событие сбрасывает его, как в production.
        fake.client.onPolicyChanged(fake.policyChanged('org_acme', ['acc_1']));
        expect(await listFiles()).toBe(403);
    });
});
