// Поддержка Nest-тестов слоя U (prd.md §5.4, AC-10, UC-4): приложение на Fastify, варианты подключения VerdeectAuthGuard, токены @verdeect/auth/testing.
import 'reflect-metadata';
import {
    applyDecorators,
    Controller,
    Get,
    Req,
    UseGuards,
    type LoggerService,
    type Provider,
    type Type,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Verifier } from '@verdeect/auth';
import {
    RequireScope,
    RequireService,
    RequireTenant,
    RequireUser,
    VERDEECT_VERIFIER,
    VerdeectAuthGuard,
    VerdeectAuthModule,
} from '@verdeect/auth/nest';
import {
    createTestSigner,
    TEST_ORCHESTRATOR_ISS,
    TEST_RESOURCE,
    type TestSigner,
} from '@verdeect/auth/testing';
import type { PlatformAuthzClient } from '../../../src/core/index.js';
import {
    PlatformAuthzModule,
    RequirePermission,
    type PlatformDecision,
} from '../../../src/nest/index.js';

/** Как подключён VerdeectAuthGuard (AC-10, D11). */
export type AuthVariant = 'app-guard' | 'controller' | 'method-below' | 'method-above' | 'none';

/** Права тестовых маршрутов. */
export const READ = 'native.files.read';
export const WRITE = 'native.files.write';
export const CLASS_PERMISSION = 'chat.use';

export const TENANT = 'acme';
export const TENANT_ID = 'org_acme';

interface DecisionRequest {
    platformDecision?: PlatformDecision;
}

const noop: ClassDecorator & MethodDecorator = () => undefined;

// Маршрут с правами по варианту; порядок applyDecorators = порядок применения (ниже в коде = раньше).
function route(variant: AuthVariant, ...permissions: string[]): MethodDecorator {
    if (variant === 'method-below') {
        return applyDecorators(UseGuards(VerdeectAuthGuard), RequirePermission(...permissions));
    }
    if (variant === 'method-above') {
        return applyDecorators(RequirePermission(...permissions), UseGuards(VerdeectAuthGuard));
    }
    return RequirePermission(...permissions);
}

function controllersFor(variant: AuthVariant, withAuth: boolean): Type[] {
    const classGuard = variant === 'controller' ? UseGuards(VerdeectAuthGuard) : noop;

    @Controller('p')
    @classGuard
    class PermissionController {
        @Get('one')
        @route(variant, READ)
        one(@Req() request: DecisionRequest): { decision: PlatformDecision | null } {
            return { decision: request.platformDecision ?? null };
        }

        @Get('two')
        @route(variant, READ, WRITE)
        two(): { ok: true } {
            return { ok: true };
        }

        // Опечатка в праве (UC-4 A1): вне каталога.
        @Get('typo')
        @route(variant, 'native.files.raed')
        typo(): { ok: true } {
            return { ok: true };
        }

        @Get('scope')
        @route(variant, READ)
        @RequireScope('x')
        scope(): { ok: true } {
            return { ok: true };
        }

        @Get('user-only')
        @route(variant, READ)
        @RequireUser()
        userOnly(): { ok: true } {
            return { ok: true };
        }
    }

    @Controller('cm')
    @classGuard
    @RequirePermission(CLASS_PERMISSION)
    class ClassAndMethodController {
        @Get()
        @route(variant, READ)
        handle(): { ok: true } {
            return { ok: true };
        }
    }

    // Без @RequirePermission и без guard'а класса — общий для всех вариантов.
    @Controller('open')
    class OpenController {
        @Get()
        handle(): { ok: true } {
            return { ok: true };
        }
    }

    // Эталонные ответы VerdeectAuthGuard для сравнения текстов (AC-10).
    @Controller('ref')
    @UseGuards(VerdeectAuthGuard)
    class ReferenceController {
        @Get('service')
        @RequireService()
        service(): { ok: true } {
            return { ok: true };
        }

        @Get('tenant')
        @RequireTenant()
        tenant(): { ok: true } {
            return { ok: true };
        }
    }

    const controllers: Type[] = [PermissionController, ClassAndMethodController, OpenController];
    return withAuth ? [...controllers, ReferenceController] : controllers;
}

/** Издатели токенов: Identity (user, service) и Orchestrator (agent). */
export interface Signers {
    readonly identity: TestSigner;
    readonly orchestrator: TestSigner;
    close(): Promise<void>;
}

export async function createSigners(): Promise<Signers> {
    const identity = await createTestSigner();
    const orchestrator = await createTestSigner({ iss: TEST_ORCHESTRATOR_ISS, kinds: ['agent'] });
    return {
        identity,
        orchestrator,
        close: async () => {
            await identity.close();
            await orchestrator.close();
        },
    };
}

/** Фабрики токенов тестов. */
export function tokens(signers: Signers) {
    const { identity, orchestrator } = signers;
    return {
        user: (sub = 'acc_user') =>
            identity.userToken({ sub, tenant: TENANT, tenant_id: TENANT_ID }),
        userWithoutTenant: () => identity.userToken({ sub: 'acc_user' }),
        service: () => identity.serviceToken(),
        agent: (claims: { pep: number; asid?: string; wid?: string | null; sub?: string }) =>
            orchestrator.agentToken({
                sub: claims.sub ?? 'acc_user',
                tenant: TENANT,
                tenant_id: TENANT_ID,
                pep: claims.pep,
                asid: claims.asid ?? 'as_test',
                wid: claims.wid ?? 'w_test',
            }),
    };
}

/** Записи Nest Logger: уровень, сообщение и параметры. */
export interface NestLogRecord {
    readonly level: 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';
    readonly message: unknown;
    readonly params: readonly unknown[];
}

export function createNestLogRecorder(): {
    readonly logger: LoggerService;
    readonly records: NestLogRecord[];
} {
    const records: NestLogRecord[] = [];
    const write =
        (level: NestLogRecord['level']) =>
        (message: unknown, ...params: unknown[]): void => {
            records.push({ level, message, params });
        };
    return {
        logger: {
            log: write('log'),
            error: write('error'),
            warn: write('warn'),
            debug: write('debug'),
            verbose: write('verbose'),
            fatal: write('fatal'),
        },
        records,
    };
}

export interface TestAppOptions {
    readonly variant: AuthVariant;
    readonly client: PlatformAuthzClient;
    readonly signers?: Signers;
    /** По умолчанию true; false допустим только с вариантом none. */
    readonly withAuth?: boolean;
    readonly logger?: LoggerService | false;
}

export interface CallResult {
    readonly status: number;
    readonly body: {
        readonly error?: {
            readonly code: string;
            readonly message: string;
            readonly details: Record<string, unknown>;
        };
        readonly decision?: PlatformDecision | null;
        readonly ok?: true;
    };
}

export interface TestApp {
    readonly app: NestFastifyApplication;
    /** Сколько раз проверен токен (verify объекта из VERDEECT_VERIFIER). */
    verifyCount(): number;
    resetVerifyCount(): void;
    call(url: string, token?: string): Promise<CallResult>;
    close(): Promise<void>;
}

export async function startTestApp(options: TestAppOptions): Promise<TestApp> {
    const withAuth = options.withAuth ?? true;
    if (!withAuth && options.variant !== 'none') {
        throw new Error('nest-app: без VerdeectAuthModule допустим только вариант none');
    }
    const { signers } = options;
    if (withAuth && signers === undefined) {
        throw new Error('nest-app: VerdeectAuthModule требует signers');
    }
    const imports = [PlatformAuthzModule.forRoot({ client: options.client })];
    const authImports =
        withAuth && signers !== undefined
            ? [
                  VerdeectAuthModule.forRoot({
                      issuers: [signers.identity.issuer, signers.orchestrator.issuer],
                      resource: TEST_RESOURCE,
                  }),
              ]
            : [];
    const providers: Provider[] =
        options.variant === 'app-guard'
            ? [{ provide: APP_GUARD, useClass: VerdeectAuthGuard }]
            : [];
    const moduleRef = await Test.createTestingModule({
        imports: [...authImports, ...imports],
        controllers: controllersFor(options.variant, withAuth),
        providers,
    }).compile();

    // Обёртка, а не vi.spyOn: restoreMocks снимает шпионов beforeAll до первого теста.
    let verifyCalls = 0;
    if (withAuth) {
        const verifier = moduleRef.get<Verifier>(VERDEECT_VERIFIER);
        const original = verifier.verify.bind(verifier);
        verifier.verify = async (jwt) => {
            verifyCalls += 1;
            return original(jwt);
        };
    }

    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
        logger: options.logger ?? false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    return {
        app,
        verifyCount: () => verifyCalls,
        resetVerifyCount: () => {
            verifyCalls = 0;
        },
        async call(url, token) {
            const response = await app.inject({
                method: 'GET',
                url,
                headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
            });
            return { status: response.statusCode, body: response.json<CallResult['body']>() };
        },
        close: () => app.close(),
    };
}
