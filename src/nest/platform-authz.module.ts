// PlatformAuthzModule (prd.md §5.4, §5.1 «logger», D11): глобальный модуль с клиентом под PLATFORM_AUTHZ_CLIENT; guard не регистрирует.
import {
    Logger,
    Module,
    type DynamicModule,
    type FactoryProvider,
    type ModuleMetadata,
    type Provider,
} from '@nestjs/common';
import {
    createPlatformAuthzClient,
    type PlatformAuthzClient,
    type PlatformAuthzClientOptions,
    type PlatformClientLogger,
} from '../core/index.js';

/** Токен DI клиента авторизации Platform. */
export const PLATFORM_AUTHZ_CLIENT = Symbol('PLATFORM_AUTHZ_CLIENT');

/** Параметры {@link PlatformAuthzModule.forRoot}. */
export interface PlatformAuthzModuleOptions {
    /**
     * Настройки `createPlatformAuthzClient` или готовый клиент (например, `createFakePlatform().client`).
     * Без `logger` модуль передаёт ядру обёртку над `Logger('PlatformAuthz')` Nest.
     */
    readonly client: PlatformAuthzClientOptions | PlatformAuthzClient;
}

/** Параметры {@link PlatformAuthzModule.forRootAsync}: настройки из провайдеров приложения. */
export interface PlatformAuthzModuleAsyncOptions {
    /** Модули с провайдерами для `inject` (например, `ConfigModule`). */
    readonly imports?: ModuleMetadata['imports'];
    /** Провайдеры, передаваемые в `useFactory` по порядку. */
    readonly inject?: FactoryProvider['inject'];
    /** Фабрика параметров модуля; аргументы — провайдеры из `inject`. */
    readonly useFactory: (
        ...args: never[]
    ) => PlatformAuthzModuleOptions | Promise<PlatformAuthzModuleOptions>;
}

// Логгер ядра с сигнатурой pino поверх Logger Nest (§5.1 «logger»).
function nestLogger(): PlatformClientLogger {
    const logger = new Logger('PlatformAuthz');
    // Без msg второй аргумент не передаётся: иначе Nest напечатает «undefined».
    const write =
        (level: 'debug' | 'warn' | 'error') =>
        (obj: object, msg?: string): void => {
            if (msg === undefined) {
                logger[level](obj);
            } else {
                logger[level](obj, msg);
            }
        };
    return { debug: write('debug'), warn: write('warn'), error: write('error') };
}

function isClient(
    value: PlatformAuthzClientOptions | PlatformAuthzClient,
): value is PlatformAuthzClient {
    return typeof (value as Partial<PlatformAuthzClient>).check === 'function';
}

// Неверные настройки → TypeError ядра при старте приложения.
function toClient({ client }: PlatformAuthzModuleOptions): PlatformAuthzClient {
    if (isClient(client)) {
        return client;
    }
    return createPlatformAuthzClient(
        client.logger === undefined ? { ...client, logger: nestLogger() } : client,
    );
}

/**
 * Модуль клиента авторизации Platform: кладёт клиента в DI под {@link PLATFORM_AUTHZ_CLIENT}.
 * Глобальный; подключается один раз в корневом модуле. `PermissionGuard` модуль не регистрирует —
 * его ставит `@RequirePermission` на маршруте (D11).
 */
@Module({})
export class PlatformAuthzModule {
    /**
     * Регистрация со статическими настройками.
     * @param options Настройки клиента или готовый клиент.
     * @returns Глобальный динамический модуль.
     */
    static forRoot(options: PlatformAuthzModuleOptions): DynamicModule {
        return PlatformAuthzModule.build([], {
            provide: PLATFORM_AUTHZ_CLIENT,
            useFactory: () => toClient(options),
        });
    }

    /**
     * Регистрация с настройками из провайдеров приложения (`ConfigService` и т. п.).
     * @param options `imports`, `inject`, `useFactory`.
     * @returns Глобальный динамический модуль.
     */
    static forRootAsync(options: PlatformAuthzModuleAsyncOptions): DynamicModule {
        return PlatformAuthzModule.build(options.imports ?? [], {
            provide: PLATFORM_AUTHZ_CLIENT,
            inject: options.inject ?? [],
            useFactory: async (...args: never[]) => toClient(await options.useFactory(...args)),
        });
    }

    private static build(
        imports: NonNullable<ModuleMetadata['imports']>,
        provider: Provider,
    ): DynamicModule {
        return {
            module: PlatformAuthzModule,
            global: true,
            imports,
            providers: [provider],
            exports: [PLATFORM_AUTHZ_CLIENT],
        };
    }
}
