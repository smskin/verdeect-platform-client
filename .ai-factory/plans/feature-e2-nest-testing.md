# План реализации: E2 «Nest и подделка» `@verdeect/platform-client`

Branch: feature/e2-nest-testing
Created: 2026-10-27

## Original Request
Реализуй этап roadmap «E2 Nest и подделка» по пакету требований requirements/0000-platform-client/ (ревизия r2, PRD v1.8).

Скоуп этапа: UC-1–UC-4; AC-8a, AC-10, AC-12; D2, D11; NFR-4; prd.md §5.4 целиком (PlatformAuthzModule.forRoot/forRootAsync, @RequirePermission = SetMetadata + UseGuards(PermissionGuard), глобально guard не регистрируется; TypeError при объявлении без прав; Principal через principalOf, при отсутствии — вызов VerdeectAuthGuard из DI с @Optional(); сопоставление UserPrincipal/AgentPrincipal/ServicePrincipal; несколько прав — один checkMany; request.platformDecision; таблица ответов guard с дословными текстами, совпадение с @verdeect/auth 1.0.1), §5.5 целиком (createFakePlatform с grant, deny, setModule, setEpoch, policyChanged, calls; подпуть testing только с условием development), §4 (test/consumer — проект-потребитель, ставит упакованный архив). Копия каталога из /home/administrator/projects/verdeect2/verdeect-platform (main 7adb423), apps/platform/src/modules/catalog/domain/ (PERMISSION_KEYS и каталог модулей с правами и порядком) → src/testing/catalog.ts с путём источника и коммитом в шапке. Тесты guard — на настоящем VerdeectAuthGuard @verdeect/auth 1.0.1 и токенах @verdeect/auth/testing (все четыре варианта подключения из AC-10). Новые публичные экспорты подпутей ./nest и ./testing — сразу в CHANGELOG.md, раздел [Unreleased] (правило «Library Package Gates»); README — в E3. Остальное из пакета — другие этапы. Источник истины — requirements/0000-platform-client/prd.md; приоритет при конфликте: prd.md > ROADMAP/DESCRIPTION. Уже реализованный этап E1 — существующий код, не переделывай его без требования. Покрой все требования скоупа; ссылайся на их ID в задачах и в названиях тестов. Открытые вопросы [OPEN] не додумывай — спроси меня.

## Settings
- Testing: yes — обязательно для пакета требований (skill-context «Mandatory Test Phases», «Library Package Scope»)
- Logging: verbose. Уровни задаёт NFR-3. Решения и `asid`/`wid` агента пишет ядро (E1). Guard пишет через Nest `Logger('PlatformAuthz')`: `debug` — вызов `VerdeectAuthGuard`, отказ по виду токена; `error` — 500 без `VerdeectAuthGuard`. `testing` не логирует.
- Docs: no — только `WARN [docs]`. README и `docs/` относятся к E3. В E2 обновляются CHANGELOG `[Unreleased]` (Task 20), TSDoc (проверяет ESLint) и `AGENTS.md` (Task 21).

## Roadmap Linkage
Milestone: "E2 Nest и подделка"
Rationale: план реализует ровно скоуп E2 из `requirements/0000-platform-client/README.md` и `.ai-factory/ROADMAP.md`. E1 — существующий код, E3 (контракт, выпуск, README) — вне плана.

## Requirements Reconciliation
Authority: `requirements/0000-platform-client/prd.md` **v1.9 (r3, коммит `9e856fa`)** > `.ai-factory/ROADMAP.md` / `.ai-factory/DESCRIPTION.md`. Раскладка и правила зависимостей — `.ai-factory/ARCHITECTURE.md`, соглашения — `.ai-factory/rules/base.md`. Запрос ссылается на r2 / v1.8. Пробелы §5.5, найденные при планировании (неизвестный участник, коды `deny`, формы `FakeMember`/`FakeCompany`), пользователь закрыл ревизией r3 / PRD v1.9. План следует v1.9.

**Milestone scope:** UC-1, UC-2, UC-3, UC-4; AC-8a, AC-10, AC-12; D2, D11; NFR-4; §5.4, §5.5, §4 (`test/consumer`). Вне скоупа: AC-1–AC-9, AC-11, AC-15 (U), AC-17–AC-19 — E1, готово; AC-13, AC-14, AC-15 (C), AC-16, NFR-5, NFR-6, README, `docs/`, `scripts/publish.mjs` — E3. Ядро E1 не меняется.

**Открытые вопросы:** `[OPEN]` п. 1 (`@verdeect/kit`) и п. 2 (`reserve/commit/release`) — вне E2. `[ASSUMPTION]` п. 3 относится к E3. Блокирующих вопросов нет.

**Сверка с источниками:**
- `verdeect-platform` `main` = `7adb423866d21d3cde61245f4bb543ce673c895a`. Каталог (`permissions.ts`, `modules.ts`) после `7adb423` не менялся. 24 права: 12 ядра и 12 модульных, 12 модулей. Правила ответа `permissions` (`authz/domain/decision.ts` `evaluatePermission`, `catalog/domain/module-states.ts`) совпадают с §5.5.
- `@verdeect/auth` 1.0.1 (`verdeect-auth` `src/nest/verdeect-auth.guard.ts`): 401 `UNAUTHENTICATED` «Требуется вход»; 403 `FORBIDDEN` «Доступ запрещён» (`@RequireService`); 409 `TENANT_REQUIRED` «Не выбрана компания» (`@RequireTenant`). Тексты не экспортируются, поэтому AC-10 сравнивает их с настоящими ответами guard. `principalOf` возвращает `request.principal` или `null`. `VERDEECT_VERIFIER` — DI-токен проверяющего: через него считаются проверки токена.

| Решение / комбинация | Источник | Проверка |
|---|---|---|
| `@RequirePermission(...perms)` = метаданные + `UseGuards(PermissionGuard)`. Пустой список или пустая строка → `TypeError` при объявлении | §5.4, D11 | T15a AC-10 |
| Права с класса и метода складываются: обязательны все объявленные. Guard стоит дважды, второй `checkMany` идёт из кэша. **Решение плана:** PRD об этом молчит, выбран безопасный вариант | §5.4 «несколько — все обязательны» | T15c |
| Маршрут без `@RequirePermission` → guard не стоит, Platform не вызывается. `APP_GUARD` пакет не регистрирует | §5.4, D11 | T15b, T15c |
| `Principal` × уже есть → `VerdeectAuthGuard` не вызывается; × нет и guard в DI → вызвать, его отказ 401/403/409 вернуть как есть; × нет и guard'а в DI нет → 500 `INTERNAL_ERROR` + `error` | §5.4, D11 | T15c (4 варианта + «выше») |
| `UserPrincipal` × `tenant` есть → `act: human`; × `tenant = null` → 409 `TENANT_REQUIRED`, Platform не вызывается | §5.4, UC-1 A3 | T15c |
| `AgentPrincipal` → `act: agent`, `pep`, `asid`, `wid`; в Platform без них; `pep = 0` → 500, без запроса | §5.4, §3.2, UC-2 A3 | T15c |
| `ServicePrincipal` → 403 `FORBIDDEN` «Доступ запрещён», без запроса | §5.4, UC-1 A4 | T15c |
| `checkMany` × все разрешены → `request.platformDecision = {memberId, epoch}`; × есть отказ → 403, код первого запрещённого в порядке декоратора; × `PlatformUnavailableError` → 503; × `PlatformContractError` → 500; прочие ошибки — без изменений (обработчик сервиса) | §5.4 таблица | T15c, T15d |
| `forRoot({client})` × настройки → клиент создаётся, без `logger` — обёртка над `Logger('PlatformAuthz')`; × готовый клиент → как есть; `forRootAsync({imports, inject, useFactory})` → то же | §5.4, §5.1 «logger» | T15b |
| Подделка: неизвестный участник → `NOT_MEMBER` (`epoch` компании или `null`, если компания нигде не упомянута); `grant(t,s,[])` → участник без прав; `deny` только `GeneralDenyCode`, иначе `TypeError`; компания по умолчанию `tenant = tenantId`, `epoch = 1`, модули `enabled`; `memberId` по умолчанию выводится из `sub` | §5.5 v1.9, AC-8a | T8 |
| Ответ подделки: право не выдано → `FORBIDDEN`; право ядра → разрешено; модуль не `enabled` → код модуля; `modules` — весь каталог по порядку | §5.5, Platform `evaluatePermission` | T8 |
| Неизвестное право в `check`/`checkMany` подделки → `UNKNOWN_PERMISSION` при любом состоянии, проверка до ядра | §5.5, §5.2, AC-8a, UC-4 A1 | T8, T15d |
| `policyChanged(t, subs?)` **поднимает эпоху компании на 1** и возвращает конверт с новой эпохой. Конверт должен быть выше эпохи снимка, иначе ядро не сбросит снимок (§5.3). AC-8a v1.9: «эпохой выше 5» при `epoch: 5`. С `subs` — `reason: member_roles`, без `subs` или с `[]` — `reason: modules`, поле `subs` опускается | AC-8a v1.9, §5.3, схема Platform | T8 (zod + ajv) |
| **Решения плана (в PRD не описаны):** `grant` с правом вне каталога, `setModule` с неизвестным модулем, `setEpoch` не целым ≥ 1 → `TypeError`. Это ловит опечатку при подготовке теста. `raw.check`/`raw.batch` подделки → 404 → `PlatformContractError` (`check`/`batch` в подделке не нужны ни одному AC) | ponytail, N6 | T8 |
| `tenant` конверта проходит ajv, только если это slug (`^_?[a-z0-9][a-z0-9-]{0,48}$`). Подделка значение не проверяет, тесты берут slug-совместимые `tenantId`. TSDoc предупреждает | схема Platform | T8 |

**Реальные артефакты:** `src/testing/catalog.ts` — копия `verdeect-platform` `7adb423`. Тест сверяет её с источником, если рядом есть `verdeect-platform`, как AC-11 для `codes.ts`. Конверт `policyChanged` проверяется копией `test/fixtures/platform-events.schema.json`. Guard проверяется на настоящем `@verdeect/auth` 1.0.1. AC-12 ставит настоящий упакованный архив.

## Architecture and Decisions
- **Раскладка** (ARCHITECTURE.md): `src/nest/{responses,platform-authz.module,permission.guard,require-permission.decorator,index}.ts`, `src/testing/{catalog,fake-platform,index}.ts`. Тесты лежат плоско в `test/unit/`, как в E1. Проверки архива — `test/package/`, шаблоны потребителя — `test/consumer/{core,nest-no-auth,full}/`, как в `verdeect-auth`.
- **Без цикла импортов.** Модуль не импортирует guard и не регистрирует его в `providers`: guard из `UseGuards` Nest создаёт сам, в инжекторе модуля контроллера. Зависимости guard'а (клиент из глобального `PlatformAuthzModule`, `VerdeectAuthGuard` из глобального `VerdeectAuthModule`) там видны. Guard импортирует токен клиента из модуля, декоратор — guard. Ключ метаданных прав живёт в файле guard'а. Цепочка: module ← guard ← decorator.
- **Подделка — тот же клиент.** `createFakePlatform` вызывает `createPlatformAuthzClient` из ядра с `fetch` в памяти, заглушкой `TokenProvider` и `baseUrl` `http://fake-platform.invalid`. Ядро не меняется. Кэш, `minEpoch`, «Приём ответа» и `onPolicyChanged` работают как в production. Наружу отдаётся обёртка с той же формой `PlatformAuthzClient`: `check`/`checkMany` сначала сверяют права с каталогом, остальное передаётся ядру.
- **Публичные экспорты.**
  - `./nest`: `PlatformAuthzModule`, `PLATFORM_AUTHZ_CLIENT`, `RequirePermission`, `PermissionGuard`, типы `PlatformAuthzModuleOptions`, `PlatformAuthzModuleAsyncOptions`, `PlatformDecision`.
  - `./testing`: `createFakePlatform`, типы `FakePlatform`, `FakePlatformOptions`, `FakeMember`, `FakeCompany`, `FakeModuleState`, `FakeCall`.
  - Каталог наружу не экспортируется (N6).
- **Vitest и декораторы.** esbuild не пишет метаданные декораторов, поэтому Nest не разрешит DI в тестах. Нужен `unplugin-swc`, как в `verdeect-auth` (`swc.vite({ module: { type: 'es6' } })`). HTTP в тестах — Fastify `app.inject`, как в `verdeect-auth`. supertest и express не ставятся.
- **Счётчик проверок токена (AC-10)** — шпион на `verify` объекта из `VERDEECT_VERIFIER` после `compile()`.
- **Architectural deviation (все `Skill: nestjs-code generic`).** Здесь не подходит дерево решений `nestjs-specialist` §7–8 (`module`, `use-case`, `http-*`, `shared auth`). Причины:
  1. Это публикуемая библиотека без модулей сервиса, БД и `RequestContext`.
  2. Guard и модуль — публичный API пакета, а не `shared/auth` сервиса: `APP_GUARD` запрещён (D11), тексты — константы (D9).
  3. ARCHITECTURE.md «Организация кода» предписывает `nestjs-code generic <path>`, как в E1.

  Общие правила специалиста сохраняются: ESM `.js`, именование §10, `strict`, Vitest, ID в именах тестов. По той же причине нет задач `nestjs-generate-documentation`. Карта репозитория — `AGENTS.md` (Task 21). Решение осознанное.
- **README — E3.** Пример теста потребителя пишется в шаблоне `test/consumer/full` (Task 18). В E3 он станет примером README, а `docs.spec` E3 сверит их. Это и есть «проходит пример из README» в AC-12 на этапе E2.

## Commit Plan
- **Commit 1** (Tasks 1–3): `build: Nest, @verdeect/auth и swc в devDependencies, конфиги Vitest и пакетные проверки`
- **Commit 2** (Tasks 4–8): `feat(testing): createFakePlatform и копия каталога Platform`
- **Commit 3** (Tasks 9–15): `feat(nest): PlatformAuthzModule, @RequirePermission, PermissionGuard`
- **Commit 4** (Tasks 16–19): `test(package): проект-потребитель упакованного архива (AC-12)`
- **Commit 5** (Tasks 20–22): `docs: CHANGELOG и AGENTS.md для E2`

## Tasks

### Phase 1: Каркас E2

- [x] **Task 1: devDependencies и скрипты `package.json`** (NFR-4, D2, AC-12)
  - Файл: `package.json` (MODIFY).
  - Точные версии в `devDependencies`, как в `verdeect-auth`:
    - `@nestjs/common`, `@nestjs/core`, `@nestjs/testing`, `@nestjs/platform-fastify` — `12.1.3`;
    - `fastify` `5.12.5`, `reflect-metadata` `0.2.2`, `rxjs` `7.8.2`;
    - `@verdeect/auth` `1.0.1` (опубликован 2026-10-22, `minimumReleaseAge` пропускает);
    - `@swc/core` `1.16.18`, `unplugin-swc` `2.0.0`.
  - `dependencies` (только `zod`) и `peerDependencies` не меняются: `test/unit/package-manifest.spec.ts` должен остаться зелёным.
  - Скрипт `test:package` запускает Vitest с конфигом `vitest.package.config.ts`.
  - Затем `pnpm install`, `pnpm-lock.yaml` обновляется. Если pnpm потребует разрешить сборку `@swc/core`, разрешение добавляется в `pnpm-workspace.yaml` с комментарием-обоснованием.
  - Логи не нужны (конфигурация).
  - **Skill:** none — правка манифеста.

- [x] **Task 2a: Vitest с swc, tsconfig и ESLint для E2** (depends on 1)
  - `vitest.config.ts` (MODIFY): плагин `unplugin-swc` в режиме ES-модулей, как в `verdeect-auth`. `include`, `setupFiles` и `restoreMocks` остаются.
  - `tsconfig.json` (MODIFY): в `include` добавить `vitest.package.config.ts`, в `exclude` — `test/consumer` (у шаблонов свои `package.json` и `tsconfig`, импорт архива в корне не разрешится).
  - `eslint.config.js` (MODIFY): для `src/testing/catalog.ts` выключить `jsdoc/require-jsdoc`, как для `codes.ts` (копия не правится). Для `src/testing/**` — блок `no-restricted-imports` по образцу блока ядра: запрещены `../nest/*`, `@nestjs/*`, `rxjs`, `reflect-metadata`, `@verdeect/auth`, `@verdeect/auth/*` и импорт пакета по собственному имени, сообщения ссылаются на ARCHITECTURE.md / D2 (`testing` → только ядро и `node:*`). `src/nest/**` уже запрещает `../testing/*`. Каталоги `test/consumer/**` (шаблоны с собственным `package.json`) исключаются из ESLint и из `tsc` корня.
  - Проверка: `make test` зелёный на коде E1.
  - **Skill:** nestjs-code generic vitest.config.ts (MODIFY) — конфиг инструментов библиотеки.

- [x] **Task 2b: `vitest.package.config.ts`** (AC-12; depends on 1)
  - Файл: `vitest.package.config.ts` (CREATE).
  - Набор `test/package/**/*.spec.ts`, окружение node, `fileParallelism: false`, таймауты тестов и хуков 300 с (установка зависимостей в потребителе), как в `verdeect-auth`.
  - **Skill:** nestjs-code generic vitest.package.config.ts (CREATE).

- [x] **Task 3: Makefile — проверки архива** (AC-12; depends on 1, 2b)
  - Файл: `Makefile` (MODIFY).
  - Цель `pack-check` после `publint` и `attw` запускает `pnpm test:package`. Комментарий «добавляет этап E2» заменить описанием.
  - Отдельная цель `test-package` (зависит от `build`) — для локального прогона.
  - `ci` не меняется: уже включает `pack-check`. Job `build` в `ci.yml` вызывает `make build pack-check` и получает AC-12 без правки CI.
  - **Skill:** none — Makefile.

### Phase 2: Подделка Platform (`./testing`)

- [x] **Task 4: копия каталога `src/testing/catalog.ts`** (AC-8a, §5.5)
  - Файл: `src/testing/catalog.ts` (CREATE).
  - Источники: `verdeect-platform` `apps/platform/src/modules/catalog/domain/permissions.ts` и `modules.ts` на коммите `7adb423`.
  - Шапка: строка-комментарий с обоими путями и коммитом `7adb423`; строка «Не править вручную: только перекопировать из источника и обновить коммит» — как в `src/core/codes.ts`.
  - Тело — полный текст `permissions.ts`, затем полный текст `modules.ts` без его единственной строки импорта `PermissionKey` из `./permissions.js`. Сохраняются все экспорты: `PERMISSION_KEYS`, `PermissionKey`, `isPermissionKey`, `CORE_PERMISSIONS`, `MODULE_IDS`, `ModuleId`, `isModuleId`, `ModuleDefinition`, `MODULE_CATALOG` (с `title` и `dependsOn`), `moduleOfPermission`.
  - `.prettierignore` (MODIFY): `src/testing/catalog.ts` — под комментарием «Копии verdeect-platform — не переформатируются», рядом с `src/core/codes.ts`.
  - Подделка и тесты импортируют каталог только отсюда. Наружу через `index.ts` он не экспортируется (N6).
  - **Skill:** none — копия файлов из `verdeect-platform`.

- [x] **Task 5: `createFakePlatform` — `src/testing/fake-platform.ts`** (§5.5, AC-8a, UC-4, UC-3; depends on 4)
  - Файл: `src/testing/fake-platform.ts` (CREATE). Импорты — только ядро (`../core/index.js`, `../core/codes.js` для `DECISION_MESSAGES`) и `catalog.ts`. `node:*` — при необходимости.
  - **Публичные типы** (TSDoc у каждого поля):
    - `FakeModuleState` — `'enabled' | 'PLAN_MODULE' | 'MODULE_DISABLED'`;
    - `FakeMember {tenantId, sub, permissions?, memberId?}`;
    - `FakeCompany {tenantId, tenant?, epoch?, modules?}`;
    - `FakePlatformOptions {members?, companies?}`;
    - `FakeCall {path, body}`;
    - `FakePlatform {client, grant, deny, setModule, setEpoch, policyChanged, calls}` — сигнатуры §5.5 v1.9, `deny` с `GeneralDenyCode`.
  - **Состояние** (внутренние `Map`):
    - компания по `tenantId`: `tenant`, `epoch`, состояния модулей;
    - участник по `(tenantId, sub)`: `memberId`, выданные права, код общего отказа или нет.
    - Компания заводится по первому упоминанию в `members`, `grant`, `deny`, `setModule`, `setEpoch` со значениями по умолчанию: `tenant = tenantId`, `epoch = 1`, модули `enabled`. Значения из `companies` переопределяют умолчания.
    - `memberId` по умолчанию — `mem_` плюс `sub`.
    - Запись `members` заводит участника с правами из `permissions` (по умолчанию пустой список — участник без прав, как `grant(t, s, [])`) и его компанию по умолчанию.
    - Неизвестный участник известной компании → `NOT_MEMBER` с эпохой компании; компания нигде не упомянута → `NOT_MEMBER` с `epoch: null` (§5.5 v1.9, как Platform).
  - **Методы:**
    - `grant(t, s, perms)` заменяет набор прав участника (заводит его, если нет) и снимает общий отказ. Право вне `PERMISSION_KEYS` → `TypeError` с именем права.
    - `deny(t, s, code)` заводит участника, если нет, и ставит общий отказ. Код вне `GeneralDenyCode` (`NOT_MEMBER`, `COMPANY_SUSPENDED`, `ACCOUNT_DISABLED`, `SEATS_EXCEEDED`, `CONTEXT_REVOKED`) → `TypeError`. В тексте подсказка: `FORBIDDEN` — это `grant` без права, `PLAN_MODULE`/`MODULE_DISABLED` — это `setModule`.
    - `setModule(t, moduleId, state)` — неизвестный модуль или состояние → `TypeError`.
    - `setEpoch(t, epoch)` — не целое ≥ 1 → `TypeError`.
    - `policyChanged(t, subs?)` поднимает эпоху компании на 1 и возвращает конверт `platform.policy.changed` по схеме Platform:
      - `id` — `evt_` и 26 символов Crockford base32 из счётчика (детерминированно, проходит шаблон схемы);
      - `type`; `version: 1`; `occurredAt` — ISO-время;
      - `tenant` — slug компании;
      - `actor {clientId: verdeect-platform, accountId: null, channel: system}`;
      - `subject {kind: company, id: tenantId}`; `traceId: null`;
      - `data {tenantId, epoch, reason, subs?}`: с непустым `subs` — `reason: member_roles` и `subs` без повторов, иначе `reason: modules` без `subs`.
      - TSDoc: эпоха поднимается, `tenant` должен быть slug.
    - `calls()` — копия журнала `{path, body}` всех запросов к подделке по порядку (тело — разобранный JSON).
  - **Транспорт в памяти:**
    - `fetch` разбирает URL и тело и пишет вызов в журнал.
    - На `POST /v1/authz/permissions` отвечает 200, ответ строится по правилам Platform (§5.5):
      - участника нет → общий отказ `NOT_MEMBER`, `epoch` компании или `null`, без `memberId`;
      - общий отказ участника → `allow: false`, `epoch` компании, `memberId`, `code`, `message` из `DECISION_MESSAGES`, пустые `roles`, `permissions`, `denied`, `modules`, `limits.fileSizeMb = null`;
      - иначе для каждого права по порядку `PERMISSION_KEYS`: не выдано → `FORBIDDEN`; право ядра → разрешено; модуль не `enabled` → его код; иначе разрешено. `modules` — весь `MODULE_CATALOG` по порядку (`{id, enabled}` или `{id, enabled: false, code}`), `roles: []`, `limits.fileSizeMb: null`.
    - Любой другой путь → 404 `{error: {code: NOT_FOUND, message, details: {}}}`, ядро превращает это в `PlatformContractError`.
    - `minEpoch` в ответе не используется: подделка отвечает текущей эпохой, как Platform после перечитывания.
  - **Клиент.** `createPlatformAuthzClient` с этим `fetch`, `TokenProvider`-заглушкой (постоянная строка, `refresh` игнорируется) и `baseUrl` `http://fake-platform.invalid`. Наружу — объект формы `PlatformAuthzClient`:
    - `check` и `checkMany` сначала ищут первое право вне `PERMISSION_KEYS` и бросают `PlatformContractError` `UNKNOWN_PERMISSION` с `details.permission`, без запроса;
    - остальные члены (`permissions`, `onPolicyChanged`, `clear`, `raw`) — от клиента ядра.
  - **Конкурентность:** состояние меняется синхронно, ответ строится в момент запроса. Изменение после закэшированного снимка видно только после `onPolicyChanged(policyChanged(...))` или `clear()` (TSDoc).
  - **Логи:** нет — `testing` не логирует (rules/base.md).
  - **Skill:** nestjs-code generic src/testing/fake-platform.ts (CREATE) — компонент библиотеки. Ближайший тип сервиса (`test` support) не публикуется в пакете.

- [x] **Task 6: точка входа `src/testing/index.ts`** (§5.5, D2; depends on 5)
  - Файл: `src/testing/index.ts` (MODIFY, заглушка E1 заменяется). Явный реэкспорт `createFakePlatform` и типов из Task 5. Первая строка — назначение и ссылки (§5.5, условие `development`).
  - **Skill:** nestjs-code generic src/testing/index.ts (MODIFY).

- [x] **Task 7: тест каталога `test/unit/catalog.spec.ts`** (AC-8a; depends on 4)
  - `AC-8a: каждое право каталога — право ядра или право ровно одного модуля` — объединение `CORE_PERMISSIONS` и прав модулей равно `PERMISSION_KEYS`, пересечений нет, повторов нет.
  - `AC-8a: шапка копии содержит пути источников и коммит` — оба пути и `7adb423`.
  - `AC-8a: копия совпадает с источником verdeect-platform` — по образцу `codes.spec.ts`: если рядом есть `../verdeect-platform/.git`, копия без двух строк шапки равна `git show <коммит из шапки>:…/permissions.ts`, за которым идёт `git show <коммит>:…/modules.ts` без строки импорта; иначе тест пропускается с пояснением.
  - **Skill:** nestjs-code test unit catalog (CREATE)

- [x] **Task 8: тест подделки `test/unit/fake-platform.spec.ts`** (AC-8a, UC-3, UC-4; depends on 5, 6)
  - Импорт `createFakePlatform` — из `src/testing/index.ts`.
  - `AC-8a: неизвестное право → UNKNOWN_PERMISSION при любом состоянии` — участник с правами, без участника, после `deny(t, s, 'COMPANY_SUSPENDED')`; `check` и `checkMany`; запроса нет.
  - `AC-8a: setModule knowledge MODULE_DISABLED + grant knowledge.read → MODULE_DISABLED с текстом §3.4`.
  - `AC-8a: setModule office PLAN_MODULE → chat.office → PLAN_MODULE`.
  - `AC-8a: modules ответа — весь каталог копии по порядку` — через `client.permissions`.
  - `AC-8a: setEpoch(t, 8) + onPolicyChanged(policyChanged(t, [s])) → снимок сброшен, агент с pep = 7 → CONTEXT_REVOKED`.
  - `AC-8a: конверт policyChanged проходит zod пакета и ajv по копии схемы Platform` — с `subs` и без них. Ajv 2020 + formats, как в `schemas.spec.ts`. Zod — `parsePolicyChanged(конверт)` из `src/core/schemas.ts` возвращает `ok: true` и `event` с `tenantId`/`epoch` (и `subs`, если переданы). Тот же конверт, переданный в `onPolicyChanged` отдельного клиента `createTestClient` (`test/unit/support/test-client.ts`, записывающие `metrics` и `logger`), даёт `policyEvent('applied')` без `warn`. Опции `metrics`/`logger` в `FakePlatformOptions` не добавляются.
  - `AC-8a: участник без members и без grant/deny → NOT_MEMBER`.
  - `AC-8a: grant(t, s, []) → check → FORBIDDEN`.
  - `AC-8a: deny(t, s, 'FORBIDDEN') и deny(t, s, 'MODULE_DISABLED') → TypeError`.
  - `AC-8a: members без memberId → memberId выведен из sub`.
  - `AC-8a: members без permissions → FORBIDDEN`.
  - `AC-8a: deny принимает каждый GeneralDenyCode` — все пять кодов дают общий отказ с текстом §3.4.
  - `AC-8a: снимок компании без companies — epoch 1`.
  - `AC-8a: компания без companies → epoch 1, tenant конверта = tenantId` — `policyChanged` возвращает эпоху 2.
  - `AC-8a: companies tenant acme, epoch 5 → конверт с tenant acme и эпохой выше 5`.
  - `AC-8a: deny COMPANY_SUSPENDED → общий отказ с текстом §3.4; grant снимает отказ`.
  - `AC-8a: grant с правом вне каталога, setModule с неизвестным модулем, setEpoch(0) → TypeError`.
  - `AC-8a: calls() — путь и тело каждого запроса permissions` — без `pep`, `asid`, `wid`.
  - `UC-3: событие → permissions({fresh: true}) для агента → запрос с minEpoch новой эпохи, следующий check без запроса`.
  - `UC-3 A3: одновременные fresh одного участника → один запрос`.
  - **Skill:** nestjs-code test unit fake-platform (CREATE)

### Phase 3: Адаптер NestJS (`./nest`)

- [x] **Task 9: тексты и тела ответов `src/nest/responses.ts`** (§5.4, D9, AC-10; depends on 1)
  - Файл: `src/nest/responses.ts` (CREATE).
  - Константы текстов: «Доступ запрещён» (`FORBIDDEN` `@verdeect/auth`), «Не выбрана компания» (`TENANT_REQUIRED`), «Внутренняя ошибка сервиса» (`INTERNAL_ERROR`, как Platform). Текст 503 берётся из ядра (`PLATFORM_UNAVAILABLE_MESSAGE`), не дублируется.
  - Функции-фабрики `HttpException` с телом `{error: {code, message, details: {}}}`:
    - отказ по решению (403, код и текст `Decision`);
    - сервисный токен (403 `FORBIDDEN`);
    - без компании (409 `TENANT_REQUIRED`);
    - недоступность (503 `PLATFORM_UNAVAILABLE`);
    - внутренняя ошибка (500 `INTERNAL_ERROR`).
  - Наружу через `index.ts` не экспортируется.
  - **Skill:** nestjs-code generic src/nest/responses.ts (CREATE). Тип `domain-error` описывает ошибки модуля сервиса с i18n, здесь — константы D9.

- [x] **Task 10: `PlatformAuthzModule` — `src/nest/platform-authz.module.ts`** (§5.4, §5.1 «logger»; depends on 1)
  - Файл: `src/nest/platform-authz.module.ts` (CREATE).
  - `PLATFORM_AUTHZ_CLIENT` — DI-токен `Symbol('PLATFORM_AUTHZ_CLIENT')`.
  - `PlatformAuthzModuleOptions {client: PlatformAuthzClientOptions | PlatformAuthzClient}`.
  - `PlatformAuthzModuleAsyncOptions {imports?, inject?, useFactory}` — фабрика возвращает `PlatformAuthzModuleOptions` или промис.
  - `forRoot` и `forRootAsync` возвращают глобальный динамический модуль с одним провайдером `PLATFORM_AUTHZ_CLIENT` в `exports`.
  - Фабрика провайдера различает готовый клиент (есть функция `check`) и настройки. Для настроек без `logger` подставляется обёртка над Nest `Logger('PlatformAuthz')`: `debug`/`warn`/`error` с сигнатурой pino передают объект полей и сообщение. Неверные настройки дают `TypeError` из ядра при старте приложения.
  - Guard модуль не регистрирует: ни в `providers`, ни через `APP_GUARD` (D11). Модуль guard не импортирует (без цикла).
  - **Логи:** нет собственных; логгер по умолчанию передаётся ядру.
  - **Skill:** nestjs-code generic src/nest/platform-authz.module.ts (CREATE). Тип `module` описывает модуль сервиса с use-cases, здесь — динамический модуль библиотеки.

- [x] **Task 11: `PermissionGuard` — `src/nest/permission.guard.ts`** (§5.4, D11, UC-1, UC-2; depends on 9, 10)
  - Файл: `src/nest/permission.guard.ts` (CREATE).
  - Ключ метаданных `REQUIRED_PERMISSIONS` (строка с префиксом `verdeect-platform-client:`) экспортируется для декоратора, наружу через `index.ts` не идёт.
  - Конструктор: клиент через `PLATFORM_AUTHZ_CLIENT`, `Reflector`, `VerdeectAuthGuard` из `@verdeect/auth/nest` с `@Optional()`.
  - `canActivate` по шагам (номера — в комментариях):
    1. Права — объединение метаданных метода и класса (Reflector, слияние), без повторов, в порядке «класс, затем метод». Пусто → пропустить.
    2. `Principal` — `principalOf(request)`. Если `null`:
       - `VerdeectAuthGuard` нет → `error`-лог «VerdeectAuthGuard не найден в DI, подключите VerdeectAuthModule» с путём маршрута → 500 `INTERNAL_ERROR`;
       - иначе `debug` и вызов его `canActivate(context)`: исключения 401/403/409 уходят без изменений, затем `principalOf` повторно.
    3. Сопоставление:
       - `service` → `debug` + 403 `FORBIDDEN`;
       - `user` с `tenant = null` → `debug` + 409 `TENANT_REQUIRED`;
       - `user` → `Subject {sub, tenant, tenantId, act: human}`;
       - `agent` → `Subject {sub, tenant, tenantId, act: agent, pep, asid, wid}`; `prof` не передаётся.
    4. Один `checkMany(subject, perms)`:
       - `PlatformUnavailableError` → 503;
       - `PlatformContractError` → 500 без собственного лога (ядро уже пишет `error` с ограничением);
       - прочие ошибки пробрасываются как есть, их обрабатывает обработчик исключений сервиса.
    5. Первый отказ в порядке прав → 403 с кодом и текстом `Decision`.
    6. Иначе `request.platformDecision = {memberId, epoch}` из решения первого права и `true`.
  - Экспортируемый тип `PlatformDecision {memberId, epoch}` с TSDoc — для обработчиков сервиса.
  - **Skill:** nestjs-code generic src/nest/permission.guard.ts (CREATE). `shared/auth` `AuthGuard` сервиса глобальный и пишет `RequestContext`, здесь guard маршрута (D11).

- [x] **Task 12: `@RequirePermission` — `src/nest/require-permission.decorator.ts`** (§5.4, D11, AC-10; depends on 11)
  - Файл: `src/nest/require-permission.decorator.ts` (CREATE).
  - Фабрика `RequirePermission(...permissions)` для класса и метода.
  - Без аргументов или с пустой строкой → `TypeError` при вызове фабрики, то есть при объявлении класса. В сообщении имя декоратора, без значений.
  - Иначе — композиция `SetMetadata(REQUIRED_PERMISSIONS, permissions)` и `UseGuards(PermissionGuard)` через `applyDecorators`.
  - TSDoc: правильный порядок с `@UseGuards(VerdeectAuthGuard)` на одном методе (ниже `@RequirePermission`, D11).
  - **Skill:** nestjs-code generic src/nest/require-permission.decorator.ts (CREATE). Тип `shared auth` `@Permission()` описывает декоратор сервиса с глобальным guard'ом.

- [x] **Task 13: точка входа `src/nest/index.ts`** (§5.4, D2; depends on 10, 11, 12)
  - Файл: `src/nest/index.ts` (MODIFY, заглушка E1 заменяется).
  - Явный реэкспорт: `PlatformAuthzModule`, `PLATFORM_AUTHZ_CLIENT`, `RequirePermission`, `PermissionGuard`, типы `PlatformAuthzModuleOptions`, `PlatformAuthzModuleAsyncOptions`, `PlatformDecision`.
  - Статический импорт `@verdeect/auth/nest` в guard'е даёт ошибку разрешения модуля без `@verdeect/auth` (AC-12).
  - **Skill:** nestjs-code generic src/nest/index.ts (MODIFY).

- [x] **Task 14: поддержка Nest-тестов `test/unit/support/nest-app.ts`** (AC-10, UC-4; depends on 5, 6, 10, 12, 13)
  - Файл: `test/unit/support/nest-app.ts` (CREATE). Импортирует `reflect-metadata`.
  - Подписчики `@verdeect/auth/testing`:
    - Identity — `createTestSigner()`, виды user и service;
    - Orchestrator — `createTestSigner({iss: TEST_ORCHESTRATOR_ISS, kinds: ['agent']})`.
    - Создаются один раз на файл, закрываются в `afterAll`.
  - Фабрики токенов: пользователь с компанией (`tenant: acme`, `tenant_id: org_acme` по умолчанию), пользователь без компании, сервис, агент с заданными `pep`, `asid`, `wid`.
  - Сборка приложения через `Test.createTestingModule` на Fastify (`init` и `ready`), с параметрами:
    - вариант подключения `VerdeectAuthGuard`: `app-guard`, `controller`, `method-below`, `method-above`, `none`;
    - с `VerdeectAuthModule` или без — «без» допустим только с вариантом `none`: в остальных вариантах Nest не создаст `VerdeectAuthGuard` без `VERDEECT_VERIFIER` и приложение не стартует;
    - клиент — готовый объект (из `createTestClient` E1 или подделки).
  - Набор тестовых контроллеров:
    - маршрут с одним правом;
    - маршрут с двумя правами;
    - маршрут без `@RequirePermission` — в отдельном контроллере без `@UseGuards(VerdeectAuthGuard)`, общем для всех вариантов (иначе в варианте `controller` его закроет guard класса);
    - класс с правом и метод с правом;
    - обработчик возвращает `request.platformDecision`;
    - маршрут с `@RequirePermission` и `@RequireScope('x')`, маршрут с `@RequirePermission` и `@RequireUser()` — для проверки, что отказы `VerdeectAuthGuard` проходят без изменений.
  - Счётчик проверок токена — простая обёртка над `verify` объекта из `VERDEECT_VERIFIER` (счётчик и вызов исходного метода), а не `vi.spyOn`: `vitest.config.ts` держит `restoreMocks: true`, и шпион, поставленный в `beforeAll`, снимается до первого теста. Счётчик обнуляется в `beforeEach`.
  - Эталонные маршруты только с `VerdeectAuthGuard` и `@RequireService`/`@RequireTenant` — для сравнения текстов.
  - **Skill:** nestjs-code generic test/unit/support/nest-app.ts (CREATE) — поддержка набора, а не spec.

- [x] **Task 15a: тест декоратора `test/unit/require-permission.spec.ts`** (AC-10; depends on 11, 12)
  - `AC-10: @RequirePermission() → TypeError при объявлении класса`.
  - `AC-10: @RequirePermission('') и ('a', '') → TypeError при объявлении`.
  - `AC-10: при TypeError объявления Platform не вызывается` — счётчик подделанного `fetch` равен 0.
  - `D11: метаданные — права и PermissionGuard в guards метода и класса`.
  - **Skill:** nestjs-code test unit require-permission (CREATE)

- [x] **Task 15b: тест модуля `test/unit/platform-authz-module.spec.ts`** (§5.4, D11; depends on 10, 14)
  - `§5.4: forRoot с настройками → клиент в PLATFORM_AUTHZ_CLIENT, логгер по умолчанию — Logger PlatformAuthz` — шпион на Nest Logger получает `debug` ядра.
  - `§5.4: forRoot с готовым клиентом → тот же объект`.
  - `§5.4: forRootAsync с imports и inject → клиент из фабрики`.
  - `§5.4: неверные настройки → TypeError при старте с именем параметра`.
  - `D11: модуль не регистрирует APP_GUARD` — маршрут без декоратора без токена → 200, Platform не вызывается.
  - `§5.4: модуль глобальный` — клиент виден контроллеру другого модуля.
  - **Skill:** nestjs-code test unit platform-authz-module (CREATE)

- [x] **Task 15c: тест guard'а `test/unit/permission-guard.spec.ts`** (AC-10, UC-1, UC-2, D11; depends on 9, 10, 11, 12, 13, 14)
  - Клиент — `createTestClient` E1 (подделанный `fetch`, часы, logger, metrics): управляемые ответы 200/503/422 и записи запросов.
  - `describe.each` по четырём вариантам (`app-guard`, `controller`, `method-below`, `none`):
    - `AC-10: user без права → 403 FORBIDDEN «Недостаточно прав.», details {}`;
    - `AC-10: user с правом → обработчик выполнен, platformDecision = {memberId, epoch} снимка`;
    - `AC-10: service → 403 FORBIDDEN «Доступ запрещён», Platform не вызывался`;
    - `AC-10: user без tenant → 409 TENANT_REQUIRED «Не выбрана компания», Platform не вызывался`;
    - `AC-10: без токена → 401 UNAUTHENTICATED от VerdeectAuthGuard`;
    - `AC-10: токен проверен ровно один раз` — счётчик `verify`.
    - Ответы всех вариантов совпадают.
  - `AC-10: @UseGuards(VerdeectAuthGuard) выше @RequirePermission → те же ответы, проверок две`.
  - `AC-10: текст «Доступ запрещён» совпадает с ответом VerdeectAuthGuard при @RequireService на токен пользователя`.
  - `AC-10: текст «Не выбрана компания» совпадает с ответом VerdeectAuthGuard при @RequireTenant` — оба сравнения с настоящими ответами эталонных маршрутов.
  - `AC-10: agent → в теле запроса к Platform нет pep, asid, wid; ушли tenant и tenantId из Principal`.
  - `AC-10 / UC-2: agent с pep < epoch → 403 CONTEXT_REVOKED «Контекст отозван. Нужен новый диалог.»`.
  - `AC-10: в логе debug решения агента — asid и wid из токена` — записывающий logger ядра.
  - `AC-10 / UC-2 A3: agent с pep = 0 → 500 INTERNAL_ERROR «Внутренняя ошибка сервиса», Platform не вызывался`.
  - `AC-10: два права, одно запрещено → 403 с кодом запрещённого, к Platform один запрос`.
  - `AC-10: без VerdeectAuthModule → 500 INTERNAL_ERROR и error-лог` — вариант `none`, токен пользователя в заголовке, проверки токена нет.
  - `AC-10: маршрут без @RequirePermission → PermissionGuard не срабатывает, Platform не вызывается; без глобального VerdeectAuthGuard доступен без токена; с APP_GUARD — 401 от VerdeectAuthGuard` — варианты `controller`, `method-below`, `none` → 200 без токена, `app-guard` → 401.
  - `AC-10: user в запросе к Platform — tenant и tenantId из Principal, act human`.
  - `§5.4: @RequireScope + @RequirePermission, токен без области → 403 SCOPE_REQUIRED от VerdeectAuthGuard, Platform не вызывался` — вариант `none`.
  - `§5.4: @RequireUser + @RequirePermission, сервисный токен → 403 USER_TOKEN_REQUIRED, Platform не вызывался` — вариант `none`.
  - `UC-1: снимка нет → один запрос permissions; права нет → 403 FORBIDDEN`.
  - `UC-1 A1: 50 одновременных запросов участника → один запрос к Platform`.
  - `UC-1 A2: Platform 503, снимка нет → 503 PLATFORM_UNAVAILABLE «Сервис прав временно недоступен. Повторите позже»`.
  - `UC-1 / §5.4: PlatformContractError (422 TENANT_MISMATCH) → 500 INTERNAL_ERROR`.
  - `UC-2: агент pep = 7, снимок 7 → по праву; событие epoch 8 subs [sub] → следующий вызов с minEpoch 8 → 403 CONTEXT_REVOKED`.
  - `UC-2 A1: pep = 8, снимок 7, события нет → запрос с minEpoch 8 → по праву`.
  - `UC-2 A2: то же при 503 → решение по снимку 7, warn PLATFORM_UNAVAILABLE`.
  - `§5.4: права класса и метода — обязательны все; Platform вызван один раз`.
  - **Skill:** nestjs-code test unit permission-guard (CREATE)

- [x] **Task 15d: тест потребителя `test/unit/consumer-flow.spec.ts`** (UC-4, AC-8a; depends on 5, 6, 10, 12, 14)
  - Клиент — `createFakePlatform`, `PlatformAuthzModule.forRoot({client: fake.client})`, токены `@verdeect/auth/testing`, `VerdeectAuthGuard` на контроллере.
  - `UC-4: grant native.files.read → маршрут @RequirePermission('native.files.read') → 200`.
  - `UC-4: deny COMPANY_SUSPENDED → 403 COMPANY_SUSPENDED «Компания приостановлена.»`.
  - `UC-4: setModule knowledge MODULE_DISABLED + grant knowledge.read → 403 MODULE_DISABLED`.
  - `UC-4 A1: опечатка в праве декоратора → 500 INTERNAL_ERROR при любом состоянии подделки` — участник с правами и после `deny`.
  - `UC-4 A2: setEpoch(t, 8), onPolicyChanged(policyChanged(t, [s])), агент pep = 7 → 403 CONTEXT_REVOKED`.
  - `UC-4: неизвестный участник → 403 NOT_MEMBER «Нет доступа к компании.»`.
  - `UC-4 A3` проверяется в слое пакета (Task 19).
  - **Skill:** nestjs-code test unit consumer-flow (CREATE)
  <!-- Commit checkpoint: tasks 9–15 -->

### Phase 4: Проект-потребитель упакованного архива (AC-12)

- [x] **Task 16a: `test/package/support/pack.ts`** (AC-12; depends on 3)
  - Файл: `test/package/support/pack.ts` (CREATE).
  - Упаковка через `pnpm pack` в каталог `mkdtemp` вне репозитория, путь к `.tgz`. Перед этим `dist/` должен существовать, иначе понятная ошибка «сначала make build».
  - Образец — `verdeect-auth` `tests/package/support/pack.ts`.
  - **Skill:** nestjs-code generic test/package/support/pack.ts (CREATE)

- [x] **Task 16b: `test/package/support/consumer-project.ts`** (AC-12; depends on 16a)
  - Файл: `test/package/support/consumer-project.ts` (CREATE).
  - Копирует шаблон `test/consumer/<core|nest-no-auth|full>` во временный каталог и заменяет зависимость `file:__TARBALL__` на путь архива.
  - `pnpm install --strict-peer-dependencies`.
  - Помощник запуска команд в проекте возвращает код возврата, stdout и stderr. При падении stdout и stderr попадают в сообщение теста.
  - Образец — `verdeect-auth`.
  - **Skill:** nestjs-code generic test/package/support/consumer-project.ts (CREATE)

- [x] **Task 17a: шаблон `test/consumer/core/`** (AC-12, D2, NFR-4)
  - Файлы (CREATE):
    - `package.json` — только архив пакета, без `@nestjs/*` и `@verdeect/auth`, `type: module`;
    - `smoke.mjs` — импорт ядра, `createPlatformAuthzClient` с подделанным `fetch` и `TokenProvider`, `check` → `allow` в stdout;
    - `testing-import.mjs` — динамический импорт `@verdeect/platform-client/testing`, печать кода ошибки или `ok`.
  - **Skill:** none — шаблон проекта-потребителя (данные теста, не код пакета).

- [x] **Task 17b: шаблон `test/consumer/nest-no-auth/`** (AC-12, NFR-4)
  - Файлы (CREATE):
    - `package.json` — архив пакета и `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs` в точных версиях корня, без `@verdeect/auth`, `type: module`;
    - `nest-import.mjs` — динамический импорт `@verdeect/platform-client/nest`, печать кода и текста ошибки.
  - Шаблон изолирует условие AC-12 «`./nest` без `@verdeect/auth` → ошибка разрешения модуля»: в `core` импорт упал бы раньше, на `@nestjs/*`.
  - **Skill:** none — шаблон проекта-потребителя.

- [x] **Task 18: шаблон `test/consumer/full/`** (AC-12, UC-4; depends on 5, 6, 10, 12, 13, 15d)
  - Файлы (CREATE):
    - `package.json` — архив, `@nestjs/common`, `@nestjs/core`, `@nestjs/testing`, `@nestjs/platform-fastify` 12.1.3, `fastify`, `reflect-metadata`, `rxjs`, `@verdeect/auth` 1.0.1, `vitest` 5.0.4, `unplugin-swc`, `@swc/core`, `typescript` 5.9.3 — точные версии корня;
    - `pnpm-workspace.yaml` — разрешение сборки `esbuild`/`@swc/core`, как в `verdeect-auth`;
    - `tsconfig.json` — NodeNext, `strict`, декораторы;
    - `vitest.config.ts` — только `unplugin-swc`, без настройки условий;
    - `src/consumer.spec.ts` — пример теста потребителя. Это будущий пример README (E3): `createFakePlatform`, `PlatformAuthzModule.forRoot({client: fake.client})`, `VerdeectAuthModule` с `createTestSigner`, контроллер с `@RequirePermission('native.files.read')`, `grant` → 200, `deny` → 403;
    - `types-check.ts` — импорт типов `FakePlatform` и `PlatformAuthzModuleOptions` для `tsc --noEmit`.
  - **Skill:** none — шаблон проекта-потребителя.

- [x] **Task 19: тест пакета `test/package/consumer.spec.ts`** (AC-12, UC-4 A3, D2, NFR-4; depends on 2b, 16a, 16b, 17a, 17b, 18)
  - Файл: `test/package/consumer.spec.ts` (CREATE). В `beforeAll` — упаковка и три проекта-потребителя (`core`, `nest-no-auth`, `full`).
  - `AC-12: ядро не импортирует @nestjs/* и @verdeect/auth` — обход графа относительных импортов от `dist/core/index.js` (цель `exports["."]`; формулировка AC «`dist/index.js`» трактуется так же, как в E1). Внешние импорты — только `zod` и `node:*`.
  - `AC-12: в .d.ts пакета нет импортов из zod` — все `dist/**/*.d.ts`.
  - `AC-12 / D2: dist/core и dist/nest не импортируют testing`.
  - `AC-12: Vitest без настройки условий импортирует testing и проходит пример потребителя` — `vitest run` в `full`.
  - `AC-12 / UC-4 A3: node без условия → ERR_PACKAGE_PATH_NOT_EXPORTED для testing`.
  - `AC-12: node --conditions=development → импорт testing работает`.
  - `AC-12: tsc --noEmit видит типы testing без условия` — в `full`.
  - `AC-12 / NFR-4: проект без @nestjs/* и @verdeect/auth импортирует ядро и вызывает check с подделанным fetch`.
  - `AC-12 / NFR-4: импорт ./nest без @verdeect/auth → ошибка разрешения модуля` — в `nest-no-auth`: `ERR_MODULE_NOT_FOUND`, в тексте `@verdeect/auth`.
  - **Skill:** nestjs-code test unit consumer (CREATE) — набор `test/package`, конфиг из Task 2b.
  <!-- Commit checkpoint: tasks 16–19 -->

### Phase 5: Завершение этапа

- [x] **Task 20: `CHANGELOG.md` `[Unreleased]`** (Library Package Gates; depends on 5, 6, 10, 11, 12, 13)
  - Файл: `CHANGELOG.md` (MODIFY).
  - Вводную строку раздела дополнить этапом E2.
  - В `### Added` — по строке на каждый новый публичный экспорт:
    - `./nest`: `PlatformAuthzModule`, `PLATFORM_AUTHZ_CLIENT`, `RequirePermission`, `PermissionGuard`, типы `PlatformAuthzModuleOptions`, `PlatformAuthzModuleAsyncOptions`, `PlatformDecision`;
    - `./testing`: `createFakePlatform`, типы `FakePlatform`, `FakePlatformOptions`, `FakeMember`, `FakeCompany`, `FakeModuleState`, `FakeCall`.
  - Плюс строка о подпути `testing` только с условием `development`.
  - Имена — дословно из Tasks 5, 10–13.
  - **Skill:** none — markdown.

- [x] **Task 21: `AGENTS.md`** (depends on 19)
  - Файл: `AGENTS.md` (MODIFY).
  - Пометки «(E2)» снять, описать фактические файлы `src/nest`, `src/testing`, `test/package`, `test/consumer/{core,nest-no-auth,full}`, `vitest.package.config.ts`.
  - В «Команды» — `make test-package`, `pack-check` с проверкой архива.
  - Точки входа `./nest` и `./testing` — без «(E2)».
  - **Skill:** none — markdown.

- [x] **Task 22: итоговая проверка `make ci`** (все AC скоупа; depends on 1–21)
  - `make ci`: lint, analyse, test (unit + perf), build, pack-check с `test:package`.
  - Всё зелёное, без пропусков, кроме сверки с источником при отсутствии `../verdeect-platform`.
  - Проверить `grep` по `dist`: в `dist/core/**` нет `@nestjs`, `@verdeect/auth`, `testing`.
  - Формат по NESTJS_RULES: Prettier и ESLint на изменённых файлах.
  - **Skill:** none — запуск проверок.
  <!-- Commit checkpoint: tasks 20–22 -->

## Traceability

| Требование | Задачи | Тест |
|---|---|---|
| UC-1 (и A1–A5) | 9, 10, 11, 12, 13 | `test/unit/permission-guard.spec.ts`: «UC-1: …», «UC-1 A1/A2», «AC-10: service / user без tenant / user с правом» (A3–A5) |
| UC-2 (и A1–A3; A4 — ядро E1) | 11 | `permission-guard.spec.ts`: «UC-2: …», «UC-2 A1», «UC-2 A2», «AC-10 / UC-2 A3» |
| UC-3 (и A3; A1, A2 — ядро E1) | 5 | `test/unit/fake-platform.spec.ts`: «UC-3: …», «UC-3 A3: …» |
| UC-4 (и A1–A3) | 5, 6, 10–13, 18 | `test/unit/consumer-flow.spec.ts`: «UC-4: …», «UC-4 A1», «UC-4 A2»; `test/package/consumer.spec.ts`: «AC-12 / UC-4 A3» |
| AC-8a | 4, 5, 6 | `test/unit/catalog.spec.ts` «AC-8a: …» (3); `test/unit/fake-platform.spec.ts` «AC-8a: …» (19) |
| AC-10 | 9, 11, 12, 13, 14 | `test/unit/require-permission.spec.ts` «AC-10: …»; `test/unit/permission-guard.spec.ts` «AC-10: …» (4 варианта, «выше», тексты, агент, `pep = 0`, два права, без токена, без модуля, без декоратора, `tenant`) |
| AC-12 | 1, 2b, 3, 16a, 16b, 17a, 17b, 18, 19 | `test/package/consumer.spec.ts` «AC-12: …» (9) |
| D2 | 2a, 13, 19 | `consumer.spec.ts` «AC-12 / D2», ESLint границ, `package-manifest.spec.ts` |
| D11 | 10, 11, 12 | `platform-authz-module.spec.ts` «D11: …»; `permission-guard.spec.ts` (4 варианта, «выше», без декоратора); `require-permission.spec.ts` «D11: …» |
| NFR-4 | 1, 13, 17a, 17b, 19 | `package-manifest.spec.ts` (E1); `consumer.spec.ts` «AC-12 / NFR-4» |
| §5.4 forRoot/forRootAsync, logger | 10 | `platform-authz-module.spec.ts` «§5.4: …» |

## Definition of Done
- Все задачи отмечены, `make ci` зелёный (Task 22).
- Каждое требование скоупа из Traceability покрыто тестом с ID в названии.
- `src/testing/catalog.ts` совпадает с `verdeect-platform` `7adb423` (тест сверки проходит при наличии соседнего репозитория).
- CHANGELOG `[Unreleased]` содержит все новые экспорты. README и `docs/` — E3.
