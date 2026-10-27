// §5.4, §5.1 «logger», D11 (prd.md): PlatformAuthzModule.forRoot/forRootAsync — клиент в DI, логгер по умолчанию, без APP_GUARD.
import 'reflect-metadata';
import { Controller, Get, Inject, Module } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformAuthzClient } from '../../src/core/index.js';
import { PLATFORM_AUTHZ_CLIENT, PlatformAuthzModule } from '../../src/nest/index.js';
import { createFetchStub } from './support/fetch-stub.js';
import { createNestLogRecorder, startTestApp } from './support/nest-app.js';
import { allowedSnapshot } from './support/snapshots.js';
import { createTestClient, PERMISSIONS_PATH } from './support/test-client.js';
import { createTokenStub } from './support/token-stub.js';

const subject = { sub: 'acc_1', tenant: 'acme', tenantId: 'org_acme', act: 'human' } as const;

let apps: NestFastifyApplication[] = [];

afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps = [];
});

async function start(
    module: Parameters<typeof Test.createTestingModule>[0],
    logger = createNestLogRecorder().logger,
): Promise<NestFastifyApplication> {
    const moduleRef = await Test.createTestingModule(module).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
        logger,
    });
    await app.init();
    apps.push(app);
    return app;
}

describe('§5.4: PlatformAuthzModule', () => {
    it('§5.4: forRoot с настройками → клиент в PLATFORM_AUTHZ_CLIENT, логгер по умолчанию — Logger PlatformAuthz', async () => {
        const stub = createFetchStub((r) =>
            r.path === PERMISSIONS_PATH
                ? { status: 200, json: allowedSnapshot() }
                : { status: 500 },
        );
        const recorder = createNestLogRecorder();
        const app = await start(
            {
                imports: [
                    PlatformAuthzModule.forRoot({
                        client: {
                            baseUrl: 'http://platform:3000',
                            tokenProvider: createTokenStub().provider,
                            fetch: stub.fetch,
                        },
                    }),
                ],
            },
            recorder.logger,
        );
        const client = app.get<PlatformAuthzClient>(PLATFORM_AUTHZ_CLIENT);
        await client.check(subject, 'native.files.read');
        expect(stub.requests).toHaveLength(1);
        const debug = recorder.records.filter(
            (r) => r.level === 'debug' && r.params.at(-1) === 'PlatformAuthz',
        );
        expect(debug.map((r) => r.params[0])).toContain('snapshot cache miss');
    });

    it('§5.4: forRoot с готовым клиентом → тот же объект', async () => {
        const { client } = createTestClient();
        const app = await start({ imports: [PlatformAuthzModule.forRoot({ client })] });
        expect(app.get(PLATFORM_AUTHZ_CLIENT)).toBe(client);
    });

    it('§5.4: forRootAsync с imports и inject → клиент из фабрики', async () => {
        const { client } = createTestClient();
        const CLIENT_SOURCE = Symbol('CLIENT_SOURCE');

        @Module({
            providers: [{ provide: CLIENT_SOURCE, useValue: client }],
            exports: [CLIENT_SOURCE],
        })
        class SourceModule {}

        const app = await start({
            imports: [
                PlatformAuthzModule.forRootAsync({
                    imports: [SourceModule],
                    inject: [CLIENT_SOURCE],
                    useFactory: async (source: PlatformAuthzClient) => ({ client: source }),
                }),
            ],
        });
        expect(app.get(PLATFORM_AUTHZ_CLIENT)).toBe(client);
    });

    it('§5.4: неверные настройки → TypeError при старте с именем параметра', async () => {
        const error: unknown = await Test.createTestingModule({
            imports: [
                PlatformAuthzModule.forRoot({
                    client: { baseUrl: '', tokenProvider: createTokenStub().provider },
                }),
            ],
        })
            .compile()
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(TypeError);
        expect((error as TypeError).message).toContain('baseUrl');
    });

    it('§5.4: модуль глобальный — клиент виден контроллеру другого модуля', async () => {
        const { client } = createTestClient();

        @Controller('feature')
        class FeatureController {
            constructor(
                @Inject(PLATFORM_AUTHZ_CLIENT) private readonly injected: PlatformAuthzClient,
            ) {}

            @Get()
            handle(): { same: boolean } {
                return { same: this.injected === client };
            }
        }

        @Module({ controllers: [FeatureController] })
        class FeatureModule {}

        const app = await start({
            imports: [PlatformAuthzModule.forRoot({ client }), FeatureModule],
        });
        await app.getHttpAdapter().getInstance().ready();
        const response = await app.inject({ method: 'GET', url: '/feature' });
        expect(response.json()).toStrictEqual({ same: true });
    });
});

describe('D11: PermissionGuard не глобальный', () => {
    it('D11: модуль не регистрирует APP_GUARD — маршрут без декоратора без токена → 200, Platform не вызывается', async () => {
        const test = createTestClient();
        const app = await startTestApp({ variant: 'none', withAuth: false, client: test.client });
        try {
            const result = await app.call('/open');
            expect(result.status).toBe(200);
            expect(test.stub.requests).toHaveLength(0);
        } finally {
            await app.close();
        }
    });
});
