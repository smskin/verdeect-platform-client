# `@verdeect/platform-client` — клиент авторизации Platform (Вердикт 2.0)

## Обзор

npm-библиотека для сервисов этапа 1 Вердикта 2.0 (Orchestrator, Files, Media). С ней сервис решает, есть ли у участника право, по правилам Platform. Решение принимается локально из кэша снимка `POST /v1/authz/permissions`. Сервису достаточно поставить на маршрут `@RequirePermission('chat.office')` (G1).

Это библиотека, а не сервис: в ней нет HTTP-сервера, БД, брокера, Docker-образа и GlitchTip. Транспорт событий остаётся у сервиса (D7). Проверку JWT делает `@verdeect/auth`, пакет получает от него готовый `Principal` (N1).

Источник требований — `requirements/0000-platform-client/prd.md` (D1–D11, UC-1–UC-4, AC-1–AC-19, NFR-1–NFR-6). Контракт Platform повторён в PRD §3. Источник истины контракта — `platform-lite/prd.md` v1.11 и код `verdeect-platform` `main` `513886e`+. Этапы: E1 «Ядро клиента», E2 «Nest и подделка», E3 «Контракт и выпуск» (`requirements/0000-platform-client/README.md`).

## Основные возможности

- **Ядро** `@verdeect/platform-client`. `createPlatformAuthzClient(options)` возвращает `PlatformAuthzClient` с методами:
  - `check` и `checkMany` — локальное решение из снимка (§5.2);
  - `permissions({fresh})` — снимок прав;
  - `onPolicyChanged(envelope)` — сброс кэша по событию;
  - `clear()` — очистка кэша;
  - `raw.check/batch/permissions` — прямой вызов Platform без кэша.
- **Кэш снимков.** Ключ — `(tenantId, sub, act)`. Позитивный снимок живёт до 60 с, общий отказ — до 5 с. LRU на `maxEntries`. Есть индекс по `tenantId` и объединение одновременных запросов по `(ключ, minEpoch)` (D3, D4).
- **Свежесть.**
  - `lastSeenEpoch[tenantId]` — наибольшая эпоха из событий и ответов, LRU.
  - Каждый запрос передаёт `minEpoch = max(lastSeenEpoch, pep)`.
  - `pep` агента сверяется локально: `pep < epoch` → `CONTEXT_REVOKED`, `pep > epoch` → одно повторное чтение (D5).
  - «Приём ответа» обрабатывает `STALE_SNAPSHOT`, `PEP_AHEAD` и `epoch = null`.
- **Сброс** по `platform.policy.changed`: по `subs` или по всей компании. Событие с эпохой не выше эпохи снимка снимок не сбрасывает. Схема конверта намеренно мягче JSON Schema Platform (§5.3).
- **Fail-closed** (D6). Если годного снимка нет, клиент бросает `PlatformUnavailableError`. Снимок с истёкшим сроком не используется. `PlatformContractError` означает ошибку конфигурации или нарушение контракта.
- **Сервисный токен** (D8). `TokenProvider.getToken({refresh})`. Реализация `clientCredentials(...)`: `client_secret_basic`, кэш до `exp − 30 с`, объединение запросов. При 401 от Platform токен перезапрашивается один раз.
- **`@verdeect/platform-client/nest`** (§5.4, D11):
  - `PlatformAuthzModule.forRoot/forRootAsync`;
  - `@RequirePermission(...)` = `SetMetadata` + `UseGuards(PermissionGuard)`, guard ставится на маршрут, а не через `APP_GUARD`;
  - если `Principal` нет, `PermissionGuard` сам вызывает `VerdeectAuthGuard`;
  - ответы guard: 403, 409, 503, 500 в формате `{error: {code, message, details}}`.
- **`@verdeect/platform-client/testing`** (§5.5). `createFakePlatform` — тот же клиент с транспортом в памяти. Методы: `grant`, `deny`, `setModule`, `setEpoch`, `policyChanged`, `calls`. Подделка знает каталог прав и модулей Platform. Подпуть доступен только с условием `development`.
- **Логи и метрики.** Логгер с сигнатурой pino (`debug/warn/error`), частота записей ограничена. `PlatformClientMetrics` не зависит от `prom-client`.

## Технологический стек

- **Язык:** TypeScript, `strict`, ESM (`"type": "module"`, `NodeNext`)
- **Рантайм:** Node.js ≥ 22.12 (CI — Node 22 и 24)
- **Runtime-зависимости:** только `zod` 4.6.7, точная версия, как в Platform. Схемы внутренние, не экспортируются. Публичные типы — интерфейсы TS, соответствие схемам проверяется через `satisfies`.
- **Фреймворк:** NestJS 12 — необязательная peer-зависимость подпути `nest`. Пакеты: `@nestjs/common ^12.1.3`, `@nestjs/core ^12.1.3`, `reflect-metadata ^0.2.2`, `rxjs ^7.8.2`.
- **Интеграция с токенами:** `@verdeect/auth ^1.0.1` — необязательная peer-зависимость. Её нельзя переносить в `dependencies`: guard должен брать `VerdeectAuthGuard` и `principalOf` из той же копии, что и сервис.
- **Тесты:**
  - Vitest — unit (`test/unit`) и perf (`test/perf`, запуск с `--expose-gc`, AC-17);
  - Nest-тесты guard и модуля: `@nestjs/testing` и Fastify (`@nestjs/platform-fastify`, `app.inject`). Метаданные декораторов для DI в Vitest пишет `unplugin-swc` с `@swc/core`: esbuild их не выдаёт;
  - проверки пакета — `vitest.package.config.ts` и проект-потребитель `test/consumer`;
  - Testcontainers 12.2.1 (`testcontainers`, `@testcontainers/postgresql`) и `amqplib` 2.2.0 — только контрактный слой C (`test/contract`), локально против образа `verdeect-platform` (D10); `yaml` 2.9.1 — разбор `ci.yml` в проверках выпуска.
- **Пакетный менеджер:** pnpm. Версии в `devDependencies` точные, `minimumReleaseAge` задан.
- **Проверки пакета:** `publint --strict`, `@arethetypeswrong/cli --profile esm-only`, состав `npm pack`.
- **Линт и формат:** ESLint (flat config, typescript-eslint, TSDoc публичного API) и Prettier — по образцу `verdeect-auth`.
- **CI и выпуск:** Makefile и GitHub Actions: lint → test (Node 22, 24) → build + `pack:check` → publish. Publish идёт по тегу `v<semver>` через npm Trusted Publishing (OIDC, provenance) и `scripts/publish.mjs`.
- **БД, ORM, брокер, HTTP-сервер, Docker-образ, GlitchTip:** нет. Docker на хосте нужен только `make test-contract`.

## Интеграции

| Система | Что используется | Как |
|---|---|---|
| `verdeect-platform` | `POST /v1/authz/permissions` (основной путь), `/check`, `/batch` (только `raw.*`) | `Authorization: Bearer` — сервисный токен с областью `platform:authz`, заголовок `traceparent`, ошибки в формате `{error: {code, message, details}}` |
| `verdeect-platform` | событие `platform.policy.changed` | сервис сам доставляет конверт в `onPolicyChanged` |
| `verdeect-identity` | token endpoint, `grant_type=client_credentials` | только `client_secret_basic`; ошибки OAuth (`error`) → `PlatformContractError` |
| `@verdeect/auth` | `VerdeectAuthGuard`, `principalOf`, тексты ответов | peer-зависимость подпути `nest` |

**Источники копий** (в шапке каждой копии — источник и коммит) — `/home/administrator/projects/verdeect2/verdeect-platform`:
- `catalog/domain/decision-codes.ts` → `src/core/codes.ts`;
- `apps/platform/src/modules/catalog/domain/limits.ts` @ `513886e` → `src/core/limits.ts` (схема `Limits`, prd.md §3.2). При сборке `dist/core/limits.d.ts` удаляется: копия экспортирует zod-схему, а AC-12 запрещает импорт `zod` в `.d.ts` пакета;
- каталог прав и модулей → `src/testing/catalog.ts`;
- `contracts/events/*.schema.json` → `test/fixtures/`.

**Образец** пакета, CI, выпуска и подпути `testing` — `/home/administrator/projects/verdeect2/verdeect-auth`.

## Архитектурные заметки

- Три точки входа (`exports`):
  - `.` — ядро `src/core`, зависит только от `zod`;
  - `./nest` — `src/nest`, зависит от ядра, `@nestjs/*` и `@verdeect/auth`;
  - `./testing` — `src/testing`, условия `{types, development}` без `default`.
- Зависимости однонаправленные. Ядро не импортирует `@nestjs/*`, `rxjs`, `reflect-metadata`, `@verdeect/auth`, `src/nest` и `src/testing`. `src/nest` не импортирует `src/testing`.
- Слоёв сервиса из `nestjs-specialist` (modules, use-cases, repositories, outbox, RLS) здесь нет. Действуют его общие правила: язык, ESM с суффиксом `.js`, именование, стиль кода, Vitest, ID критериев в именах тестов. Так же сделано в `verdeect-auth`.
- Для тестов в ядре внедряются `fetch`, `clock` и `traceparent`, внешней сети в unit-тестах нет.

## Архитектура

Подробные правила — `.ai-factory/ARCHITECTURE.md`.
Паттерн: Layered Architecture (библиотека «ядро + адаптеры»)

## Нефункциональные требования

- **Производительность (NFR-1):** `check` из кэша — p99 < 0,2 мс; память — не больше 2 КБ на снимок (AC-17).
- **Нагрузка на Platform (G2):** не больше одного запроса `permissions` на `(участник, act)` за TTL на реплику. Сверх этого — повторные чтения: по событию, по `pep > epoch` и по `fresh`, не больше одного на каждый повод.
- **Граница отзыва (G3):**
  - при доставленном событии — доли секунды;
  - событие потеряно у сервиса — не больше 60 с;
  - событие потеряно и у Platform — не больше 90 с;
  - снятие общего отказа — не больше 10 с.
- **Метрики (NFR-2):** метки — только значения из типа. `sub` и `tenantId` в метки не попадают (AC-18).
- **Логи (NFR-3):**
  - токены и секреты не пишутся. Допустимы `sub`, `tenantId`, `permission`, `code`;
  - `error` — не чаще раза в 60 с на код;
  - `warn` о недоступности — не чаще раза в 10 с на `endpoint`, с полем `suppressed`;
  - `debug` — промахи кэша, запросы и решения для агента с `asid` и `wid` (AC-7a, AC-19).
- **Ошибки:**
  - неверные настройки → `TypeError` из `createPlatformAuthzClient` с именами параметров, без их значений;
  - неверный конверт события → `warn`, исключения нет;
  - guard отвечает `PLATFORM_UNAVAILABLE` (503) и `INTERNAL_ERROR` (500) и не раскрывает внутренние причины.
- **Безопасность:** в пакете нет секретов и URL окружений. `testing` недоступен в production (`ERR_PACKAGE_PATH_NOT_EXPORTED`). Публикация — только из CI через Trusted Publishing, без токенов. 1.0.0 мейнтейнер выпускает вручную, затем включает `npm trust` (D1).
- **Совместимость и версии (NFR-4, NFR-5):** semver. Контракт Platform `v1` соответствует пакету `1.x`. Ломающее изменение контракта — только в мажорной версии. Потребители указывают версию точно. В README — таблица совместимости.
- **Документация:** на русском. Идентификаторы и код — на английском.
