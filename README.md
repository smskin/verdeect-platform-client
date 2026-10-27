# @verdeect/platform-client

Клиент авторизации Platform для сервисов Вердикта 2.0. Ядро решает, есть ли у участника право, локально из кэша снимка `POST /v1/authz/permissions` Platform — один запрос на участника за TTL, а не на каждое действие. Подпуть `nest` даёт `@RequirePermission` и guard, подпуть `testing` — подделку Platform для тестов сервиса.

## Совместимость

| Пакет | Контракт Platform | PRD Platform и коммит слоя C | `@verdeect/auth` |
| ----- | ----------------- | ---------------------------- | ---------------- |
| `1.x` | `v1`              | v1.11, `7adb423`             | `^1.0.1`         |

|             |                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Node.js     | ≥ 22.12 (проверяется на 22 и 24)                                                                                         |
| Модули      | только ESM (`import`), CommonJS-сборки нет                                                                               |
| Зависимости | `zod` (точная версия); `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs`, `@verdeect/auth` — peer, `optional` |

Коммит в таблице — коммит `verdeect-platform`, на котором пройдены контрактные тесты (`make test-contract`) перед выпуском.

## Установка

Ставьте точную версию (D1): обновление — осознанный шаг по CHANGELOG.

```bash
pnpm add @verdeect/platform-client@1.0.0 --save-exact
```

Ядру peer-зависимости не нужны. Подпуть `nest` требует `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs` и `@verdeect/auth` — ту же копию, что у сервиса.

## Быстрый старт

```ts
import { clientCredentials, createPlatformAuthzClient } from '@verdeect/platform-client';

const client = createPlatformAuthzClient({
    baseUrl: 'http://platform:3000',
    tokenProvider: clientCredentials({
        tokenUrl: process.env.IDENTITY_TOKEN_URL ?? '',
        clientId: 'verdeect-files',
        clientSecret: process.env.PLATFORM_CLIENT_SECRET ?? '',
        scope: 'platform:authz',
        resource: 'https://api.verdeect.ru',
    }),
});

const decision = await client.check(
    { sub: 'acc_1', tenant: 'acme', tenantId: 'org_acme', act: 'human' },
    'native.files.read',
);
// decision.allow === false → decision.code и decision.message (docs/errors.md)
```

Сервис сам подписан на `platform.policy.changed` и передаёт конверт в `client.onPolicyChanged(envelope)` — пакет к RabbitMQ не подключается. Подробно — [docs/getting-started.md](docs/getting-started.md).

## Подключение

```ts
@Module({
    imports: [
        VerdeectAuthModule.forRoot({ issuers, resource: 'https://api.verdeect.ru' }),
        PlatformAuthzModule.forRoot({ client: { baseUrl: 'http://platform:3000', tokenProvider } }),
    ],
})
export class AppModule {}
```

`@RequirePermission` ставит `PermissionGuard` на маршрут. Если `Principal` ещё нет, `PermissionGuard` сам вызывает `VerdeectAuthGuard` из DI. Порядок подключения модулей не важен. Четыре варианта, во всех токен проверяется один раз:

**1. `VerdeectAuthGuard` глобально через `APP_GUARD`:**

```ts
providers: [{ provide: APP_GUARD, useClass: VerdeectAuthGuard }],
```

**2. `VerdeectAuthGuard` на контроллере:**

```ts
@Controller('files')
@UseGuards(VerdeectAuthGuard)
class FilesController {
    @Get()
    @RequirePermission('native.files.read')
    list() {}
}
```

**3. `VerdeectAuthGuard` на методе ниже `@RequirePermission`:**

```ts
@Get()
@RequirePermission('native.files.read')
@UseGuards(VerdeectAuthGuard)
list() {}
```

**4. Без `VerdeectAuthGuard`** — его вызывает `PermissionGuard`:

```ts
@Get()
@RequirePermission('native.files.read')
list() {}
```

> **Порядок декораторов.** `@UseGuards(VerdeectAuthGuard)` **выше** `@RequirePermission` на том же методе срабатывает после `PermissionGuard`: токен проверяется дважды (~0,45 мс), ответы те же (D11). Ставьте его ниже или на контроллер.

Ответы guard, сопоставление `Principal` → `Subject` и `request.platformDecision` — [docs/nestjs.md](docs/nestjs.md).

## Тесты потребителя

`createFakePlatform` из `@verdeect/platform-client/testing` — подделка Platform: тот же клиент, транспорт в памяти, каталог прав Platform. Подпуть грузится только с условием `development`:

| Где запускается              | Условие                         | `import('@verdeect/platform-client/testing')` |
| ---------------------------- | ------------------------------- | --------------------------------------------- |
| Vitest (Vite)                | ставится по умолчанию           | работает без настройки                        |
| Node                         | `node --conditions=development` | работает                                      |
| Node без условия, production | —                               | `ERR_PACKAGE_PATH_NOT_EXPORTED`               |

Тест контроллера с токенами `@verdeect/auth/testing`:

<!-- consumer-example:start -->

```ts
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
```

<!-- consumer-example:end -->

Этот код — шаблон `test/consumer/full/src/consumer.spec.ts`, который пакет прогоняет на упакованном архиве. Методы подделки — [docs/testing.md](docs/testing.md).

## Ошибки

Отказ по праву — значение `Decision` (`allow: false`, `code`, `message`), не исключение. Исключения:

- `PlatformUnavailableError` (`PLATFORM_UNAVAILABLE`) — сеть, таймаут, 5xx; guard → 503;
- `PlatformContractError` (`code` — код Platform, OAuth или локальный) — конфигурация или контракт; guard → 500.

Fail-closed: истёкший снимок не используется. Коды и тексты — [docs/errors.md](docs/errors.md).

## Метрики

`metrics: PlatformClientMetrics` — `cacheResult`, `request`, `policyEvent`; метки — только значения из типа. Пакет не зависит от `prom-client`; адаптер с метриками `platform_client_cache_total{result}`, `platform_client_requests_total{endpoint, result}`, `platform_client_request_duration_seconds{endpoint}`, `platform_client_policy_events_total{result}` — [docs/getting-started.md](docs/getting-started.md#7-логи-и-метрики).

## API

| Подпуть                             | Значения                                                                                              | Типы                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@verdeect/platform-client`         | `createPlatformAuthzClient`, `clientCredentials`, `PlatformUnavailableError`, `PlatformContractError` | `Act`, `AllowedPermissions`, `ClientCredentialsOptions`, `Decision`, `DecisionCode`, `DeniedPermissions`, `GeneralDenyCode`, `MetricsEndpoint`, `MetricsRequestResult`, `ModuleState`, `PermissionDenyCode`, `PermissionsOptions`, `PermissionsResponse`, `PlatformAuthzClient`, `PlatformAuthzClientOptions`, `PlatformAuthzRaw`, `PlatformClientLogger`, `PlatformClientMetrics`, `Subject`, `TokenProvider`, `UnavailableReason` |
| `@verdeect/platform-client/nest`    | `PlatformAuthzModule`, `PLATFORM_AUTHZ_CLIENT`, `RequirePermission`, `PermissionGuard`                | `PlatformAuthzModuleOptions`, `PlatformAuthzModuleAsyncOptions`, `PlatformDecision`                                                                                                                                                                                                                                                                                                                                                 |
| `@verdeect/platform-client/testing` | `createFakePlatform`                                                                                  | `FakePlatform`, `FakePlatformOptions`, `FakeMember`, `FakeCompany`, `FakeModuleState`, `FakeCall`                                                                                                                                                                                                                                                                                                                                   |

У каждого экспорта есть TSDoc — описание видно в подсказках редактора.

## Документация

- [docs/getting-started.md](docs/getting-started.md) — ядро: клиент, токен, решение, события, кэш, логи и метрики
- [docs/nestjs.md](docs/nestjs.md) — модуль, `@RequirePermission`, подключение `VerdeectAuthGuard`, ответы guard
- [docs/testing.md](docs/testing.md) — `createFakePlatform`, условие `development`
- [docs/errors.md](docs/errors.md) — коды решений, ошибки, fail-closed
- [docs/releasing.md](docs/releasing.md) — выпуск версии (для мейнтейнеров)
- [CHANGELOG.md](CHANGELOG.md) — изменения по версиям

## Выпуск

Только CI по тегу `vX.Y.Z` через npm Trusted Publishing, после зелёного `make test-contract` против текущего `main` Platform. Порядок — [docs/releasing.md](docs/releasing.md).

## Разработка

```bash
make help            # список целей
make ci              # lint analyse test build pack-check — то же, что в CI
make test-contract   # слой C против настоящего Platform (Docker, локально)
```

## Лицензия

`UNLICENSED` — все права защищены: код открыт для чтения, но не передаётся по лицензии.
