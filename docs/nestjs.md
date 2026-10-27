# NestJS: модуль, `@RequirePermission`, guard

[← README](../README.md)

Подпуть `@verdeect/platform-client/nest` требует `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs` и `@verdeect/auth` — той же копии, что у сервиса (NFR-4).

## Модуль

```ts
import { Module } from '@nestjs/common';
import { clientCredentials } from '@verdeect/platform-client';
import { PlatformAuthzModule } from '@verdeect/platform-client/nest';

@Module({
  imports: [
    PlatformAuthzModule.forRoot({
      client: {
        baseUrl: 'http://platform:3000',
        tokenProvider: clientCredentials({/* getting-started.md */}),
      },
    }),
  ],
})
export class AppModule {}
```

- `forRoot({client})` — `client`: настройки `createPlatformAuthzClient` или готовый клиент (например, `createFakePlatform().client` в тестах).
- `forRootAsync({imports, inject, useFactory})` — настройки из провайдеров приложения (`ConfigService` и т. п.).
- Модуль глобальный: клиент доступен в DI под токеном `PLATFORM_AUTHZ_CLIENT`.
- Без явного `logger` модуль передаёт ядру обёртку над `Logger('PlatformAuthz')` Nest.

## `@RequirePermission`

```ts
@Get()
@RequirePermission('native.files.read')
list() {}

@Post()
@RequirePermission('chat.office', 'chat.images') // несколько — все обязательны
convert() {}
```

- На методе или на классе. Несколько прав — один вызов `checkMany`; ответ — код первого запрещённого в порядке декоратора.
- `@RequirePermission` = `SetMetadata` + `UseGuards(PermissionGuard)` (D11). Глобально `PermissionGuard` не регистрируется; маршрут без `@RequirePermission` пакет не трогает.
- `@RequirePermission()` без прав или с пустой строкой → `TypeError` при загрузке модуля, а не при запросе.

## Подключение `VerdeectAuthGuard` (D11)

`PermissionGuard` берёт `Principal` через `principalOf(request)` из `@verdeect/auth/nest`. Если его нет, guard сам вызывает `VerdeectAuthGuard` из DI `VerdeectAuthModule`. Ответы во всех вариантах одинаковые, порядок подключения модулей не важен:

| Вариант                                                                 | Проверок токена |
| ----------------------------------------------------------------------- | --------------- |
| `VerdeectAuthGuard` через `APP_GUARD`                                   | одна            |
| `@UseGuards(VerdeectAuthGuard)` на контроллере                          | одна            |
| `@UseGuards(VerdeectAuthGuard)` на методе **ниже** `@RequirePermission` | одна            |
| без `VerdeectAuthGuard` — его вызывает `PermissionGuard`                | одна            |
| `@UseGuards(VerdeectAuthGuard)` на методе **выше** `@RequirePermission` | две (~0,45 мс)  |

Декораторы применяются снизу вверх, поэтому `VerdeectAuthGuard` выше `@RequirePermission` на том же методе срабатывает после `PermissionGuard` и проверяет токен второй раз. Примеры — README, раздел «Подключение».

Отказ `VerdeectAuthGuard` (401, 403, 409) возвращается без изменений; правила `@RequireUser`, `@RequireTenant`, `@RequireScope` маршрута действуют. `VerdeectAuthGuard` в DI нет → 500 `INTERNAL_ERROR`, лог `error`.

## `Principal` → `Subject`

| `Principal` (`@verdeect/auth` 1.x)                       | `Subject` / ответ                                |
| -------------------------------------------------------- | ------------------------------------------------ |
| `UserPrincipal {sub, tenant, tenantId}`                  | `{sub, tenant, tenantId, act: 'human'}`          |
| `UserPrincipal` с `tenant = null`                        | 409 `TENANT_REQUIRED`                            |
| `AgentPrincipal {sub, tenant, tenantId, asid, wid, pep}` | `{…, act: 'agent', pep, asid, wid}`              |
| `ServicePrincipal`                                       | 403 `FORBIDDEN` — сервис прав участника не имеет |

## `request.platformDecision`

После разрешения guard кладёт в запрос `platformDecision: {memberId, epoch}` (тип `PlatformDecision`) — снимок, по которому принято решение.

## Ответы guard

Тело — `{error: {code, message, details: {}}}`:

| Случай                                                         | HTTP | `code`                 | `message`                                          |
| -------------------------------------------------------------- | ---- | ---------------------- | -------------------------------------------------- |
| отказ по решению                                               | 403  | код Platform           | текст [errors.md](errors.md)                       |
| сервисный токен                                                | 403  | `FORBIDDEN`            | «Доступ запрещён»                                  |
| токен пользователя без `tenant`                                | 409  | `TENANT_REQUIRED`      | «Не выбрана компания»                              |
| `PlatformUnavailableError`                                     | 503  | `PLATFORM_UNAVAILABLE` | «Сервис прав временно недоступен. Повторите позже» |
| `PlatformContractError`; нет `Principal` и `VerdeectAuthGuard` | 500  | `INTERNAL_ERROR`       | «Внутренняя ошибка сервиса»                        |

Тексты «Доступ запрещён» и «Не выбрана компания» совпадают с `@verdeect/auth` (AC-10).
