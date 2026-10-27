# Тесты сервиса: `@verdeect/platform-client/testing`

[← README](../README.md)

Подпуть даёт подделку Platform `createFakePlatform`: тот же `PlatformAuthzClient`, что в production, но транспорт — в памяти. Кэш, `minEpoch` и `onPolicyChanged` работают как с настоящим Platform. Platform для тестов не нужен.

## Условие `development`

| Где запускается              | Условие                         | `import('@verdeect/platform-client/testing')` |
| ---------------------------- | ------------------------------- | --------------------------------------------- |
| Vitest (Vite)                | ставится по умолчанию           | работает без настройки                        |
| Node                         | `node --conditions=development` | работает                                      |
| Node без условия, production | —                               | `ERR_PACKAGE_PATH_NOT_EXPORTED`               |

В `exports` у `./testing` нет `default`: импорт подделки из рабочего кода падает при старте сервиса. Типы (`types`) видны всегда, поэтому `tsc --noEmit` для тестов проходит без настройки.

## `createFakePlatform`

```ts
import { createFakePlatform } from '@verdeect/platform-client/testing';

const fake = createFakePlatform({
  members: [{ tenantId: 'org_acme', sub: 'acc_1', permissions: ['native.files.read'] }],
  companies: [{ tenantId: 'org_acme', tenant: 'acme', epoch: 1 }],
});
```

| Метод                                  | Что делает                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `client`                               | клиент ядра; передаётся в `PlatformAuthzModule.forRoot({client})`                                                                  |
| `grant(tenantId, sub, permissions)`    | заменяет права участника и снимает общий отказ; `[]` — участник без прав (`FORBIDDEN`)                                             |
| `deny(tenantId, sub, code)`            | общий отказ; только `GeneralDenyCode` (`NOT_MEMBER`, `COMPANY_SUSPENDED`, `ACCOUNT_DISABLED`, `SEATS_EXCEEDED`, `CONTEXT_REVOKED`) |
| `setModule(tenantId, moduleId, state)` | `'enabled'`, `'PLAN_MODULE'` или `'MODULE_DISABLED'`                                                                               |
| `setEpoch(tenantId, epoch)`            | эпоха политики компании, целое ≥ 1                                                                                                 |
| `policyChanged(tenantId, subs?)`       | поднимает эпоху на 1 и возвращает конверт для `client.onPolicyChanged`                                                             |
| `calls()`                              | журнал запросов к подделке `{path, body}`                                                                                          |

`FORBIDDEN` — это `grant` без права, `PLAN_MODULE` и `MODULE_DISABLED` — `setModule`; в `deny` они → `TypeError`.

### Значения по умолчанию

- `FakeMember {tenantId, sub, permissions?, memberId?}` — `memberId` выводится из `sub`.
- `FakeCompany {tenantId, tenant?, epoch?, modules?}` — `epoch` = 1, все модули `enabled`. Компания, упомянутая в `members`, `grant`, `deny`, `setModule` или `setEpoch`, заводится сама.
- `tenant` по умолчанию — slug из `tenantId`: строчные буквы, символ вне `[a-z0-9-]` → `-`, не длиннее 49 символов (`org_acme` → `org-acme`). Так конверт `policyChanged` проходит схему Platform.
- Участник без `members`, `grant` и `deny` → общий отказ `NOT_MEMBER`.

### `TypeError`

- явный `tenant` не по шаблону `^_?[a-z0-9][a-z0-9-]{0,48}$` (например, `Bad_Slug`);
- slug из `tenantId` не по шаблону (`''`, `_acme`) — задайте `tenant` явно;
- повтор `(tenantId, sub)` в `members`;
- `deny` с кодом, который не является общим отказом.

### Неизвестное право

Каталог прав и модулей подделки — копия Platform (`src/testing/catalog.ts`). Право вне каталога → `PlatformContractError` `UNKNOWN_PERMISSION` при любом состоянии участника. Так тест ловит опечатку в `@RequirePermission`, которую пакет при снимке-отказе не замечает.

## Пример теста

Пример теста контроллера с `createFakePlatform` и токенами `@verdeect/auth/testing` — README, раздел [«Тесты потребителя»](../README.md#тесты-потребителя). Это единственный источник примера: его код совпадает с проверяемым проектом-потребителем пакета.
