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

| Метод                                  | Что делает                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`                               | клиент ядра; передаётся в `PlatformAuthzModule.forRoot({client})`                                                                                    |
| `grant(tenantId, sub, permissions)`    | заменяет права участника и снимает общий отказ; `[]` — участник без прав (`FORBIDDEN`)                                                               |
| `deny(tenantId, sub, code)`            | общий отказ; только `GeneralDenyCode` (`NOT_MEMBER`, `COMPANY_SUSPENDED`, `ACCOUNT_DISABLED`, `SEATS_EXCEEDED`, `CONTEXT_REVOKED`)                   |
| `setModule(tenantId, moduleId, state)` | `'enabled'`, `'PLAN_MODULE'` или `'MODULE_DISABLED'`                                                                                                 |
| `setEpoch(tenantId, epoch)`            | эпоха политики компании, целое ≥ 1                                                                                                                   |
| `setLimits(tenantId, limits)`          | сливается с текущими лимитами; `null` — без лимита; ключ вне копии или не целое ≥ 1 → `TypeError`; эпоха не меняется — видно после `clear()` или TTL |
| `policyChanged(tenantId, subs?)`       | поднимает эпоху на 1 и возвращает конверт для `client.onPolicyChanged`                                                                               |
| `calls()`                              | журнал запросов к подделке `{path, body}`                                                                                                            |

`FORBIDDEN` — это `grant` без права, `PLAN_MODULE` и `MODULE_DISABLED` — `setModule`; в `deny` они → `TypeError`.

### Значения по умолчанию

- `FakeMember {tenantId, sub, permissions?, memberId?}` — `memberId` выводится из `sub`.
- `FakeCompany {tenantId, tenant?, epoch?, modules?, limits?}` — `epoch` = 1, все модули `enabled`, лимиты — семь ключей копии `Limits` со значением `null`; `limits` меняет только переданные ключи. Компания, упомянутая в `members`, `grant`, `deny`, `setModule`, `setEpoch` или `setLimits`, заводится сама.
- Ответ разрешения и общего отказа несёт лимиты компании; у неизвестной компании — семь `null`.
- `tenant` по умолчанию — slug из `tenantId`: строчные буквы, символ вне `[a-z0-9-]` → `-`, не длиннее 49 символов (`org_acme` → `org-acme`). Так конверт `policyChanged` проходит схему Platform.
- Участник без `members`, `grant` и `deny` → общий отказ `NOT_MEMBER`.

### `TypeError`

- явный `tenant` не по шаблону `^_?[a-z0-9][a-z0-9-]{0,48}$` (например, `Bad_Slug`);
- slug из `tenantId` не по шаблону (`''`, `_acme`) — задайте `tenant` явно;
- повтор `(tenantId, sub)` в `members`;
- `deny` с кодом, который не является общим отказом;
- `setLimits` или `companies[].limits` с ключом вне копии `Limits` или со значением не `null` и не целым ≥ 1 (`{foo: 1}`, `{assistants: 0}`, `{assistants: 1.5}`).

### Неизвестное право

Каталог прав и модулей подделки — копия Platform (`src/testing/catalog.ts`). Право вне каталога → `PlatformContractError` `UNKNOWN_PERMISSION` при любом состоянии участника. Так тест ловит опечатку в `@RequirePermission`, которую пакет при снимке-отказе не замечает.

## Пример теста

Пример теста контроллера с `createFakePlatform` и токенами `@verdeect/auth/testing` — README, раздел [«Тесты потребителя»](../README.md#тесты-потребителя). Это единственный источник примера: его код совпадает с проверяемым проектом-потребителем пакета.

## Уровни тестов пакета

Раздел для разработчиков самого пакета. Все уровни — цели `Makefile`, на хосте.

| Уровень                                                  | Что запускает                                                                                                                                                                   | Когда                                    | Время (замер 30.10.2026, load average выше числа ядер) |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| `make test`                                              | слой U: `test/unit` (`vitest.config.ts`), без perf; `FILTER='AC-6'` — по имени теста                                                                                            | во время работы                          | ~1 мин                                                 |
| `make test-module M='cache decide'`                      | слой U по файлам: подстроки пути `test/unit/<m>`; без `M` — весь слой U                                                                                                         | во время работы, по затронутым файлам    | секунды на файл                                        |
| `make test-timing`                                       | perf AC-17 (`vitest.perf.config.ts`, `--expose-gc`)                                                                                                                             | перед слиянием; только на тихой машине   | ~20 с                                                  |
| `make test-integration` (псевдоним `make test-contract`) | слой C: `test/contract` против настоящего Platform в Testcontainers (Docker); `PLATFORM_DIR`, `PLATFORM_IMAGE`, `PLATFORM_COMMIT`, `PLATFORM_LIMITS`, `PLATFORM_CLI_TIMEOUT_MS` | перед слиянием и выпуском; не в CI (D10) | 5–20 мин; сборка образа Platform без кэша — ещё ~5 мин |
| `make test-load`                                         | нагрузочного набора нет — сообщение и код 0                                                                                                                                     | —                                        | —                                                      |
| `make test-full`                                         | `lint`, `analyse`, `test`, `pack-check`, `test-integration`, `test-timing`                                                                                                      | перед `/aif-commit`, слиянием и тегом    | сумма уровней                                          |
| `make ci`                                                | `lint`, `analyse`, `test`, `test-timing`, `build`, `pack-check` — то же, что CI                                                                                                 | перед push                               | ~9 мин                                                 |

- `make test-timing` печатает load average и число ядер. Если load выше числа ядер, выводится `[test-timing] WARN`: p99 AC-17 под нагрузкой недостоверен, прогон повторяют на тихой машине.
- `TEST_TIMEOUT_SCALE=2..3` умножает `testTimeout` и `hookTimeout` конфигов Vitest на загруженной машине. Только локально и только вручную; в CI — 1. Тайм-ауты внутри spec-файлов не поднимаются: тест, упавший по тайм-ауту, сначала перезапускают отдельно.
- Слой C поднимает стенд один раз на прогон (`globalSetup`), файлы идут по очереди (`fileParallelism: false`).
