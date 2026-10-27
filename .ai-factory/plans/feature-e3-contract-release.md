# План реализации: E3 «Контракт и выпуск» `@verdeect/platform-client`

Branch: feature/e3-contract-release
Created: 2026-10-28

## Original Request
Реализуй этап roadmap «E3 Контракт и выпуск» по пакету требований requirements/0000-platform-client/ (ревизия r5, PRD v1.11).

Скоуп этапа: AC-13, AC-14, AC-15 (часть C), AC-16; D1, D10; NFR-5, NFR-6; prd.md §7 «Стенд слоя C» по шагам 1–9 (Testcontainers: PostgreSQL 17.11, RabbitMQ 4.3.6, объявление exchange verdeect.events тестом; тестовый издатель @verdeect/auth/testing с exposeHostPorts; образ verdeect-platform — по умолчанию сборка из ../verdeect-platform (docker build --target production), иначе PLATFORM_IMAGE; разовые db:prepare → migrate → plan:apply; события identity.* по копии apps/platform/contracts/events/identity-events.schema.json в test/fixtures/ с источником и коммитом; CLI member:grant/revoke через exec; вывод логов контейнера при сбое), цель make test-contract (локально, не в ci) и коммит Platform в отчёте прогона. Первая задача — проверка допущения prd.md §10 п. 3 (exposeHostPorts с Docker в WSL); если не работает — запасной путь из §10 п. 3. Выпуск: доработать .github/workflows/ci.yml из 5.1a до job publish по тегу v<major>.<minor>.<patch> (environment npm, Trusted Publishing, id-token: write только в publish), scripts/publish.mjs (тег = version, версии нет в npm), pack:check по AC-16; docs/ по образцу /home/administrator/projects/verdeect2/verdeect-auth/docs (getting-started, nestjs, testing, errors, releasing — в releasing чек-лист: make ci, make test-contract против текущего main Platform, тег, ручной 1.0.0, npm trust); README (подключение — варианты из §5.4, тесты потребителя — §5.5, таблица совместимости — NFR-5; пример «Тесты потребителя» — из шаблона test/consumer/full, и test/package/consumer.spec.ts проверяет, что код примера в README совпадает с шаблоном — AC-12 «пример из README»); CHANGELOG с 1.0.0. Остальное из пакета — другие этапы. Источник истины — requirements/0000-platform-client/prd.md; приоритет при конфликте: prd.md > ROADMAP/DESCRIPTION; расхождение настоящего Platform с prd.md — не подгоняй тест, остановись и спроси меня. Уже реализованные этапы E1–E2 — существующий код, не переделывай его без требования. Покрой все требования скоупа; ссылайся на их ID в задачах и в названиях тестов. Открытые вопросы [OPEN] не додумывай — спроси меня.

## Settings
- Testing: yes — обязательно для пакета требований (skill-context «Mandatory Test Phases», «Library Package Scope»).
- Logging: verbose. Код пакета (`src/`) в E3 не меняется. Тестовая инфраструктура пишет в stdout с префиксами:
  - `[contract]` — каждый шаг стенда: сборка или выбор образа, коммит Platform, старт контейнера, разовая команда CLI с кодом возврата, готовность, публикация события, получение события, `member:grant/revoke`;
  - `[publish]` — каждое решение `scripts/publish.mjs`, как в `verdeect-auth`;
  - `[package-check]` — существующий префикс проверок пакета.
  - Токены, пароли БД и `Authorization` в лог не попадают (NFR-3). URL БД логируются без пароля.
- Docs: yes — обязательная точка `/aif-docs` в конце. `docs/`, README, CHANGELOG входят в скоуп (Phase 6).

## Roadmap Linkage
Milestone: "E3 Контракт и выпуск"
Rationale: план реализует ровно скоуп E3 из `requirements/0000-platform-client/README.md` и `.ai-factory/ROADMAP.md`. E1–E2 — существующий код. Сам выпуск 1.0.0, `npm trust` и запрет токенов мейнтейнер делает вручную после E3 по `docs/releasing.md` (D1).

## Requirements Reconciliation
Authority: `requirements/0000-platform-client/prd.md` **v1.11 (r5)** > `.ai-factory/ROADMAP.md` / `.ai-factory/DESCRIPTION.md`. Раскладка — `.ai-factory/ARCHITECTURE.md`, соглашения — `.ai-factory/rules/base.md`. Контракт Platform — prd.md §3 и код `verdeect-platform` `main`.

**Milestone scope:** AC-13, AC-14, AC-15 (C), AC-16; D1, D10; NFR-5, NFR-6; §7 «Стенд слоя C» шаги 1–9; §4 (`test/contract`, `test/fixtures/identity-events.schema.json`, `docs/`, `scripts/publish.mjs`, README, CHANGELOG); AC-12 — только дополнение «пример из README» (запрос пользователя). Сквозная проверка UC-1 и UC-2 — через AC-13 и AC-14. Вне скоупа: AC-1–AC-12, AC-15 (U), AC-17–AC-19 — E1/E2, готово. Код `src/` не меняется.

**Открытые вопросы:** `[OPEN]` §10 п. 1 (`@verdeect/kit`) и п. 2 (`reserve/commit/release`) — вне E3, не планируются. `[ASSUMPTION]` §10 п. 3 (`exposeHostPorts` в WSL) проверяет Task 1. Если допущение не подтвердится, используется запасной путь из §10 п. 3, описанный в PRD. Блокирующих вопросов нет.

**Правило остановки (запрос пользователя).** Если настоящий Platform отвечает не так, как требует prd.md (коды, тексты, эпохи, каталог, схемы событий, шаги стенда), тест не подгоняется под Platform. Реализатор останавливается и спрашивает пользователя. Исключение — AC-13 и AC-15: они сами предписывают обновить копию каталога или схемы. Даже тогда копия не обновляется молча: сначала вопрос пользователю.

**Сверка с `verdeect-platform` (`main` = `7adb423866d21d3cde61245f4bb543ce673c895a`, HEAD при планировании). Расхождений с prd.md нет:**

| Факт | Источник Platform | Пункт PRD |
|---|---|---|
| Образы CI Platform — `postgres:17.11-alpine3.24`, `rabbitmq:4.3.6-management-alpine` | `.gitlab-ci.yml:57-58` | §7 п. 1 |
| `verdeect.events` Platform только проверяет (`checkExchange`) и не объявляет. Без exchange Platform повторяет попытку каждые `RABBITMQ_RETRY_SECONDS` | `shared/messaging/rabbit-connection.ts:318` | §7 п. 2 |
| CLI пишет одну строку JSON в stdout: `{"ok":true,…}` и код 0, либо `{"ok":false,"error":{code,message}}` и код 1. Логи pino идут в stderr | `src/cli/run-cli.ts:281-335` | §7 п. 4, п. 9 |
| `db:prepare`: `DATABASE_ADMIN_URL`, `PLATFORM_OWNER_PASSWORD`, `PLATFORM_APP_PASSWORD`. Пароли — **не короче 16 символов**. Создаёт роли `platform_owner`, `platform_app`. `migrate` — `DATABASE_MIGRATOR_URL`. `plan:apply --file seed/plans.json` (WORKDIR образа — `/app/apps/platform`) разбирает полную схему env сервиса | `env.schema.ts:100,136,144-149` | §7 п. 4 |
| `member:grant` / `member:revoke`: `--tenant <slug>`, `--role`, `--sub` (или `--email`). Каждый поднимает эпоху на 1 (`reason: member_roles`, `subs: [sub]`). Снять последнего `admin` нельзя — 409 `LAST_ADMIN` | `run-cli.ts:72-109`, `grant/revoke-member-role.use-case.ts` | §7 п. 7, AC-14 |
| `AUTH_ISSUERS` — JSON-массив `{iss, jwksUri, kinds}`. Издатель с хостом `*.invalid` разрешён только при `NODE_ENV ≠ production`. PRD задаёт `NODE_ENV=test` | `env.schema.ts:34-58,116-131` | §7 п. 5 |
| Очередь `platform` (durable). Привязки — точные ключи `identity.organization.*`, `identity.account.*`, `identity.membership.*`. Публикация — с ключом, равным типу события (`platform.policy.changed`), через outbox-relay (200 мс) | `rabbit-subscriber.ts:102-126`, `topology.ts` | §7 п. 5–6 |
| Конверт identity: `id` (`^evt_[0-9A-HJKMNP-TV-Z]{26}$`), `type`, `version`, `occurredAt`, `tenant`, `actor`, `subject`, `data`, `traceId`. Данные: `organization.created` — `tenantId, tenant, name`; `account.created` — `sub, email, givenName, familyName, middleName, emailVerified`; `membership.added` — `sub, tenant, tenantId, memberId, invitationId`; `organization.disabled` — `tenantId, tenant` | `contracts/events/identity-events.schema.json` | §7 п. 7 |
| `membership.added` в компании-клиенте → роль `viewer`. У `viewer` есть `native.files.read` и `knowledge.read`, нет `native.files.write`. У `admin` — все права клиента | `catalog/domain/customer-roles.ts` | AC-13 |
| `organization.created` → компании назначается план по умолчанию из `seed/plans.json` (`default`, все 12 модулей). Без плана событие уходит в DLQ (`NO_DEFAULT_PLAN`), поэтому `plan:apply` идёт до событий. `knowledge` вне `MODULES_READY` → `MODULE_DISABLED` | `seed/plans.json`, `catalog/domain/modules.ts:42`, `module-states.ts:25` | §7 п. 4, AC-13 |
| Компания `disabled` → `COMPANY_SUSPENDED` | `authz/domain/decision.ts:109` | AC-13 |
| `identity.organization.disabled` → эпоха +1 и `platform.policy.changed` с `reason: company_suspended` без `subs` в той же транзакции | `identity-events/use-cases/apply-organization-disabled.use-case.ts:15,48` | AC-13 |
| `GET /ok` → 200 без проверки БД и брокера. `POST /v1/authz/check` → 200 и при отказе. Сервисный токен без `platform:authz` → 403 `SCOPE_REQUIRED` | `get-ok.controller.ts`, `service-api.decorator.ts` | §7 п. 5, AC-13, AC-15 |
| Образ `production`: build-args со значениями по умолчанию. Сборке нужна сеть (corepack, `pnpm fetch`) и BuildKit (`RUN --mount=type=cache`) — поэтому `docker build` CLI, а не сборка через API Testcontainers. В образе есть `dist/cli.js`, `drizzle`, `seed`. Метки с коммитом git нет | `Dockerfile` | D10 |
| `createTestSigner` слушает только `127.0.0.1`. `exposeHostPorts` пробрасывает порт через reverse-SSH-туннель контейнера sshd, адрес в сети — `host.testcontainers.internal` | `verdeect-auth` `src/testing/test-signer.ts:187-190`; документация testcontainers-node | §7 п. 3, §10 п. 3 |

**Решения плана (в PRD не описаны):**

| Решение | Почему | Где |
|---|---|---|
| Готовность сервиса — `GET /ok` = 200 **и** `checkQueue('platform')` с `consumerCount ≥ 1` | `/ok` не проверяет брокер. `checkQueue` без подписчика допускает гонку с первой публикацией. Это уточнение п. 5, не изменение | T7b |
| `tokenProvider` слоя C — обёртка над токеном, выпущенным издателем в `globalSetup` со сроком 1 ч (claims `exp`). `refresh` возвращает тот же токен | JWKS-сервер издателя живёт в процессе `globalSetup`, а тесты идут в worker'ах Vitest. 401 в слое C не проверяется (это AC-7, слой U) | T7b, T7f |
| `exec` CLI из теста — `docker exec <id сервиса> node dist/cli.js …` через `child_process` | контейнер стенда создан в `globalSetup` и в worker не передаётся; передаётся его id | T7d |
| Коммит Platform в отчёте: при сборке — `git rev-parse HEAD` в `../verdeect-platform` и признак незакоммиченных изменений (`git status --porcelain`). При `PLATFORM_IMAGE` — значение `PLATFORM_COMMIT`, а без него `unknown` и `warn`: выпуск по такому прогону не допускается (`docs/releasing.md`) | метки коммита в образе нет; D10 требует коммит в отчёте | T7a, T16e |
| У каждого spec-файла своя компания: `tenantId` — UUID, slug `c13-<суффикс>`, `c14-…`, `c15-…` (схема identity требует `format: uuid` для `tenantId`, `sub`, `memberId`; slug без `_`) | файлы не мешают друг другу на общем стенде | T8a–T8c |
| Версия пакета в E3 — `1.0.0`, раздел CHANGELOG `[1.0.0] - <дата завершения E3>`, `[Unreleased]` пуст | запрос «CHANGELOG с 1.0.0», образец `verdeect-auth`. Если тег ставится позже, мейнтейнер меняет дату (шаг чек-листа) | T19 |
| Проверка структуры `ci.yml` в тесте читает YAML пакетом `yaml` 2.9.1 (точная версия, как `verdeect-auth`) | образец AC-8 `verdeect-auth` | T2, T14 |

**Комбинации стенда (§7 п. 3, п. 9, D10):**

| Вход | Поведение | Проверка |
|---|---|---|
| нет `PLATFORM_IMAGE` | `docker build --target production -t verdeect-platform:contract ../verdeect-platform`. Коммит — из git. Нет каталога `../verdeect-platform` → падение с понятным сообщением | `make test-contract` (T22) |
| `PLATFORM_IMAGE=<ref>` | образ берётся как есть. Коммит — `PLATFORM_COMMIT` или `unknown` + `warn` | `[contract]`-лог |
| `exposeHostPorts` работает (Task 1) | `jwksUri = http://host.testcontainers.internal:<port>/jwks` | T7b |
| `exposeHostPorts` не работает | прокси `/jwks` на `0.0.0.0` к `createTestSigner`. `jwksUri` = адрес шлюза сети Docker (§10 п. 3) | T7b |
| любой шаг упал (код CLI ≠ 0, нет `{"ok":true`, `/ok` не 200, событие не пришло за 5 с) | ошибка с stdout и stderr контейнера (последние 200 строк `docker logs`), без ожидания таймаута Vitest | T7b–T7f |

**Реальные артефакты:** настоящий образ `verdeect-platform` из `../verdeect-platform` (`main`), `seed/plans.json` из образа, копия `identity-events.schema.json` (коммит `7adb423`), существующие копии `platform-events.schema.json`, `src/testing/catalog.ts` и `src/core/codes.ts`. Шаблон README «Тесты потребителя» — настоящий `test/consumer/full/src/consumer.spec.ts`.

### Результат проверки допущения (Task 1, 2026-10-28)
- **Работает.** Docker Engine 29.8.2 (WSL2, ядро 6.18.54.1), Node 24.22.1, `testcontainers` 12.2.1, `@verdeect/auth` 1.0.1.
- `createTestSigner` → `issuer.issuer.jwksUri = http://127.0.0.1:<port>/jwks`; `TestContainers.exposeHostPorts(port)`; контейнер `alpine` в своей `Network` → `wget http://host.testcontainers.internal:<port>/jwks` — код 0, JSON с массивом `keys` (1 ключ Ed25519).
- Вывод: Task 7b использует `exposeHostPorts`, запасной путь §10 п. 3 не нужен. Заметка: `jwksUri` — поле `TestSigner.issuer`, а не самого `TestSigner`.

## Architecture and Decisions
- **Раскладка слоя C** (prd.md §4):
  - `test/contract/support/` — `platform-image.ts`, `platform-stand.ts`, `global-setup.ts`, `identity-events.ts`, `broker.ts`, `platform-cli.ts`, `contract-client.ts`;
  - `test/contract/*.spec.ts` — по файлу на AC;
  - конфиг — `vitest.contract.config.ts` (отдельный, `rules/base.md` «Тесты»).
  - Слой C не входит в `make ci` и `ci.yml` (D10).
- **`globalSetup` → тесты.** Стенд передаёт тестам через `provide`/`inject` Vitest: URL Platform (проброшенный порт 3000), URL AMQP (проброшенный 5672), id контейнера сервиса, два токена (с `platform:authz` и без области), коммит Platform. Тест сам подключается к RabbitMQ (`amqplib`), публикует события и слушает свою очередь.
- **Отчёт прогона (D10).** `globalSetup` печатает блок `[contract] Platform: <commit> (<источник: build ../verdeect-platform | PLATFORM_IMAGE=…>), dirty: yes/no` в начале и повторяет его в teardown. Строка видна в выводе `make test-contract`.
- **Код пакета не меняется.** Слой C вызывает публичный API ядра (`createPlatformAuthzClient`, `raw.*`, `onPolicyChanged`) из `src/core/index.ts`.
- **Выпуск** — копия схемы `verdeect-auth`: `scripts/publish.mjs`, job `publish` (Node 24, `npm install -g npm@^11.15.0`, `environment: npm`, `permissions: {contents: read, id-token: write}` только у него, без `registry-url` и токенов), триггер тегов `v[0-9]+.[0-9]+.[0-9]+`, `concurrency.cancel-in-progress` не отменяет теги.
- **Документация** — по образцу `verdeect-auth/docs`, тексты по prd.md (§5.1–§5.5, §3.4). Тесты документации — в `test/package/` (набор `make pack-check`, в CI).

## Commit Plan
- **Commit 1** (Tasks 1–4): `build(contract): testcontainers, amqplib, yaml, allowBuilds; vitest.contract.config.ts и make test-contract`
- **Commit 2** (Tasks 5–7f): `test(contract): стенд слоя C — Platform в Testcontainers (prd.md §7)`
- **Commit 3** (Tasks 8a–8c): `test(contract): AC-13, AC-14, AC-15 (C) против настоящего Platform`
- **Commit 4** (Tasks 10–15): `ci: job publish по тегу через Trusted Publishing, scripts/publish.mjs (AC-16, NFR-6)`
- **Commit 5** (Tasks 16a–18b): `docs: README, docs/ и проверки документации (AC-12, NFR-5, D1, D10)`
- **Commit 6** (Tasks 19–22, включая 19b): `chore(release): 1.0.0 в CHANGELOG и package.json, AGENTS.md`

## Tasks

### Phase 1: Проверка допущения и каркас слоя C

- [x] **Task 1: проверка допущения §10 п. 3 — `exposeHostPorts` с Docker в WSL** (§10 п. 3, §7 п. 3, D10)
  - Первая задача этапа. Файлы репозитория не меняются. Проверка идёт во временном каталоге scratchpad, не в репозитории.
  - В пустом каталоге поставить `testcontainers` 12.2.1 и `@verdeect/auth` 1.0.1 (точные версии). Запустить скрипт Node с условием `--conditions=development`:
    1. `createTestSigner({ iss: 'https://test-identity.verdeect.invalid', kinds: ['service'] })` — порт берётся из `issuer.jwksUri`;
    2. проброс порта через `TestContainers.exposeHostPorts` до старта контейнера;
    3. своя сеть Testcontainers (`Network`), как в стенде Task 7b; контейнер `alpine` (`sleep infinity`) в этой сети (`withNetwork`) делает `wget -qO- http://host.testcontainers.internal:<port>/jwks`;
    4. ожидается JSON с массивом `keys`.
  - Перед кодом сверить API `exposeHostPorts` и `exec` через Context7 (`/testcontainers/testcontainers-node`).
  - **Итог записать в этот план** — раздел «Результат проверки допущения» под Requirements Reconciliation: работает / не работает, версия Docker, вывод.
    - Работает → Task 7b использует `exposeHostPorts`.
    - Не работает → Task 7b использует запасной путь §10 п. 3: HTTP-прокси `/jwks` на `0.0.0.0`, `jwksUri` = адрес шлюза сети Docker. Перед Task 7b тот же скрипт проверяет и запасной путь — с адресом шлюза именно этой сети.
    - Не работает ни один путь → **остановиться и спросить пользователя**.
  - Логи: скрипт печатает `[contract-probe]` — порт, результат `exec` (код, вывод).
  - **Skill:** none — разовая проверка вне репозитория.

- [x] **Task 2: `package.json` — devDependencies и скрипты** (D10, AC-16, NFR-6; depends on 1)
  - Файл: `package.json` (MODIFY).
  - `devDependencies` (точные версии):
    - `testcontainers` `12.2.1` — как в `verdeect-platform` (NFR-4);
    - `@testcontainers/postgresql` `12.2.1` — как в Platform: ожидание готовности PostgreSQL;
    - `amqplib` `2.2.0` — как в Platform. Типы входят в пакет (`index.d.ts`), `@types/amqplib` не ставится;
    - `yaml` `2.9.1` — как в `verdeect-auth`.
  - Скрипты:
    - `test:contract` — запуск Vitest с конфигом `vitest.contract.config.ts`;
    - `pack:check` — `pnpm build`, затем `publint --strict`, `attw --pack . --profile esm-only` и `pnpm test:package` (AC-16, как `verdeect-auth`).
  - `dependencies` и `peerDependencies` не меняются: `test/unit/package-manifest.spec.ts` остаётся зелёным. `version` меняет Task 19.
  - Файл: `pnpm-workspace.yaml` (MODIFY) — в `allowBuilds` добавить `cpu-features: false`, `protobufjs: false`, `ssh2: false`, как в `verdeect-platform`: их тянет `testcontainers`, нативные сборки не нужны. Без записи pnpm 12 останавливает или предупреждает при `install --frozen-lockfile`. Комментарий шапки дополнить: «testcontainers — только слой C».
  - Затем `pnpm install`, `pnpm-lock.yaml` обновляется. `minimumReleaseAge` не трогать. Если pnpm откажет по возрасту версии — остановиться и спросить.
  - **Skill:** none — правка манифеста.

- [x] **Task 3: `vitest.contract.config.ts` и `tsconfig.json`** (D10, §7; depends on 2)
  - `vitest.contract.config.ts` (CREATE):
    - набор `test/contract/**/*.spec.ts`, окружение node;
    - `globalSetup` — `test/contract/support/global-setup.ts`;
    - `fileParallelism: false`;
    - `testTimeout` 60 с, `hookTimeout` 900 с (сборка образа);
    - `unplugin-swc` не нужен: Nest в слое C не используется;
    - первая строка — комментарий о назначении (`rules/base.md`).
  - `tsconfig.json` (MODIFY): в `include` добавить `vitest.contract.config.ts`. Каталог `test` уже включён.
  - **Skill:** nestjs-code generic vitest.contract.config.ts (CREATE) — конфиг инструментов библиотеки.

- [x] **Task 4: Makefile — `test-contract` и `pack-check`** (D10, AC-16, NFR-6; depends on 2, 3)
  - Файл: `Makefile` (MODIFY).
  - Новая цель `test-contract` в группе «Проверки». Описание: «Слой C против настоящего Platform в Testcontainers (локально, не в ci; PLATFORM_IMAGE, PLATFORM_COMMIT)». Рецепт — `pnpm test:contract`.
    - `PLATFORM_IMAGE` и `PLATFORM_COMMIT` передаются через окружение: объявить их как переопределяемые параметры с пустым значением по умолчанию и экспортировать.
    - `--warn-undefined-variables` не должен ругаться.
  - `pack-check` вызывает `pnpm pack:check` вместо трёх команд. Зависимость от `build` остаётся. `test-package` не меняется.
  - `ci` **не меняется** — `test-contract` в него не входит (D10). Комментарий в шапке: «make test-contract — локально перед тегом (D10)». Строку шапки «Все цели работают на хосте: это npm-библиотека без Docker…» исправить: все цели работают на хосте, только `test-contract` требует Docker (Testcontainers).
  - **Skill:** none — Makefile.
  <!-- Commit checkpoint: tasks 1–4 -->

### Phase 2: Фикстуры событий Identity

- [x] **Task 5: копия `test/fixtures/identity-events.schema.json`** (§7 п. 7, §4)
  - `test/fixtures/identity-events.schema.json` (CREATE) — побайтная копия командой:
    `git -C ../verdeect-platform show 7adb423:apps/platform/contracts/events/identity-events.schema.json > test/fixtures/identity-events.schema.json`
  - `test/fixtures/SOURCES.md` (MODIFY):
    - строка таблицы `identity-events.schema.json` — источник `apps/platform/contracts/events/identity-events.schema.json`, коммит `7adb423`;
    - команда перекопирования;
    - убрать фразу «добавляется на этапе E3».
  - JSON без комментариев, поэтому источник и коммит указываются в `SOURCES.md`, как у `platform-events.schema.json`.
  - Prettier копию не трогает: `test/fixtures/` уже в `.prettierignore`.
  - **Skill:** none — копия файла.

- [x] **Task 6a: `test/contract/support/identity-events.ts` — построители конвертов** (§7 п. 7, AC-13, AC-14; depends on 5)
  - Файл: `test/contract/support/identity-events.ts` (CREATE). Без `testcontainers` и `amqplib`: модуль импортирует и U-тест.
  - Функции строят конверты по схеме-копии и по образцу Platform `test/support/identity-events.ts`:
    - `organizationCreated(tenantId, tenant, name)`, `organizationDisabled(tenantId, tenant)`, `accountCreated(sub, email)`, `membershipAdded(tenantId, tenant, sub, memberId)`;
    - поля конверта:
      - `id` — `evt_` и 26 символов Crockford base32: ULID из времени и `crypto.randomBytes`, без новой зависимости;
      - `version: 1`, `occurredAt` — ISO-время;
      - `tenant` — slug для `organization.*` и `membership.*`, `null` для `account.*`;
      - `actor: {clientId: 'verdeect-identity-cli', channel: 'system'}`;
      - `subject`: организация → `{kind: 'organization', id: tenantId}`, участник → `{kind: 'member', id: memberId}`, учётная запись → `{kind: 'account', id: sub}`;
      - `traceId: null`;
    - `tenantId`, `sub`, `memberId` — UUID (`crypto.randomUUID()` у вызывающего; схема требует `format: uuid`); `invitationId: null`;
    - данные — поля из таблицы сверки: `givenName`, `familyName`, `middleName` — фиксированные строки или `null` по схеме, `emailVerified: true`, `invitationId: null`.
  - Функция проверки конверта — `Ajv2020` (`ajv/dist/2020.js`) + `ajv-formats` по копии схемы, как в `test/unit/fake-platform.spec.ts` (схема draft 2020-12, `unevaluatedProperties`). Возвращает список ошибок, исключений не бросает.
  - Логов нет (чистые построители).
  - **Skill:** nestjs-code generic test/contract/support/identity-events.ts (CREATE).

- [x] **Task 6b: U-тест образцов identity** (§7 п. 7; depends on 5, 6a)
  - Файл: `test/unit/identity-events.spec.ts` (CREATE). Слой U, в CI.
  - Тесты:
    - `§7 п. 7: образцы identity.organization.created, account.created, membership.added, organization.disabled проходят ajv по копии identity-events.schema.json`;
    - `§7 п. 7: id конверта — evt_ и 26 символов Crockford base32, два вызова дают разные id`;
    - `§7 п. 7: конверт с лишним полем в data не проходит схему` — проверка, что ajv строгий и копия рабочая.
  - **Skill:** nestjs-code test unit identity-events (CREATE).

### Phase 3: Стенд слоя C (`test/contract/support`)

- [x] **Task 7a: `test/contract/support/platform-image.ts` — образ и коммит Platform** (D10, §7 п. 4; depends on 3)
  - Файл: `test/contract/support/platform-image.ts` (CREATE).
  - Решает, какой образ запускать, и возвращает `{image, commit, source, dirty}`:
  - Пустая строка в `PLATFORM_IMAGE` или `PLATFORM_COMMIT` считается «не задано»: Makefile экспортирует переменные с пустым значением по умолчанию.
    - задан `PLATFORM_IMAGE` → образ как есть, `source: 'PLATFORM_IMAGE'`, `commit` = `PLATFORM_COMMIT` или `unknown` с `warn`;
    - иначе `docker build --target production -t verdeect-platform:contract <репо>/../verdeect-platform` через `child_process` без shell. Вывод сборки идёт в stdout теста. `commit` = `git -C ../verdeect-platform rev-parse HEAD`, `dirty` = непустой `git status --porcelain`. Нет каталога → ошибка «нет ../verdeect-platform: склонируйте или задайте PLATFORM_IMAGE».
  - Код возврата сборки ≠ 0 → ошибка с хвостом вывода (§7 п. 9).
  - Логи `[contract]`: источник образа, команда сборки, длительность, коммит, dirty.
  - **Skill:** nestjs-code generic test/contract/support/platform-image.ts (CREATE).

- [x] **Task 7b: `test/contract/support/platform-stand.ts` — стенд §7 шаги 1–5, 9** (§7 п. 1–5, п. 9, §10 п. 3, D10; depends on 1, 2, 7a)
  - Файл: `test/contract/support/platform-stand.ts` (CREATE). Путь задан prd.md §4. Функции запуска и остановки стенда.
  - Перед кодом сверить через Context7 API testcontainers-node 12: `Network`, `GenericContainer` (`withNetwork`, `withNetworkAliases`, `withEnvironment`, `withCommand`, `withExposedPorts`, ожидание завершения разовых контейнеров), `exposeHostPorts`, `logs`.
  - Шаги по порядку, каждый с логом `[contract]`:
    1. **Сеть и инфраструктура (п. 1).** Сеть Testcontainers. `PostgreSqlContainer('postgres:17.11-alpine3.24')` из `@testcontainers/postgresql` (ждёт готовности БД, как Platform `test/support/global-setup.ts`) с алиасом `postgres`, суперпользователь — тестовый пароль. `rabbitmq:4.3.6-management-alpine` с алиасом `rabbitmq`, ожидание строки `Server startup complete`, как в Platform `test/support/global-setup.ts`.
    2. **Exchange (п. 2).** Через `amqplib` на проброшенный порт — `assertExchange('verdeect.events', 'topic', {durable: true})`.
    3. **Издатель (п. 3).** `createTestSigner({iss: 'https://test-identity.verdeect.invalid', kinds: ['service']})`. Доступ к JWKS — по итогу Task 1: `exposeHostPorts(port)` и `jwksUri = http://host.testcontainers.internal:<port>/jwks`, либо запасной путь §10 п. 3 (прокси на `0.0.0.0` и адрес шлюза сети). Выпускаются два токена со сроком 1 ч через `sign`:
       - claims как у `serviceToken`, `sub` и `client_id` = `verdeect-files`, `scope: 'platform:authz'`, `aud` = `https://api.verdeect.ru` (п. 8);
       - тот же токен без области — для AC-15.
    4. **Разовые контейнеры образа (п. 4)** в той же сети, по очереди:
       - `node dist/cli.js db:prepare` с `DATABASE_ADMIN_URL` (суперпользователь, хост `postgres`) и паролями `PLATFORM_OWNER_PASSWORD`, `PLATFORM_APP_PASSWORD` — случайные, ≥ 16 символов;
       - `node dist/cli.js migrate` с `DATABASE_MIGRATOR_URL` (`platform_owner`);
       - `node dist/cli.js plan:apply --file seed/plans.json` — с env сервиса из шага 5, потому что команда разбирает полную схему env.
       - Каждый шаг: дождаться выхода, код 0 **и** stdout содержит `{"ok":true`. Иначе — ошибка с stdout и stderr контейнера (п. 9).
    5. **Сервис (п. 5).** Тот же образ. Env:
       - `DATABASE_URL` (`platform_app`), `DATABASE_MIGRATOR_URL`, `RABBITMQ_URL` (`amqp://…@rabbitmq:5672`);
       - `AUTH_ISSUERS` — JSON-массив с одним издателем: `iss`, `jwksUri` из шага 3, `kinds: ['service']`;
       - `AUTH_RESOURCE=https://api.verdeect.ru`, `MODULES_READY=files,web,office,images`, `NODE_ENV=test`, `REPLICA_ID=contract`, `RABBITMQ_RETRY_SECONDS=1`.
       - Проброс порта 3000.
       - Готовность: опрос `GET /ok` до 200 и `checkQueue('platform')` с `consumerCount ≥ 1` (решение плана). Каждая попытка `checkQueue` — на своём канале: `createChannel`, пустой обработчик `'error'`, закрытие в `finally`, как `withProbe` Platform (`test/support/broker.ts:157-165`). 404 или закрытый канал означает «ещё не готов», опрос повторяется: 404 закрывает канал amqplib, а необработанный `error` уронил бы `globalSetup`. По истечении предела ошибка называет последнее состояние (нет очереди или `consumerCount = 0`). Предел — 120 с, затем ошибка с `docker logs` сервиса.
  - Вызовы `amqplib` в процессе `globalSetup` (шаги 2 и 5) обёрнуты: на время вызова `Error.prepareStackTrace` снимается и восстанавливается в `finally`. Хук Vite в главном процессе Vitest падает на стеках amqplib — так делает Platform (`test/support/global-setup.ts:80-91`, тот же Vitest 5.0.4).
  - Остановка: сервис, rabbitmq, postgres, сеть, издатель. Ошибки остановки — `warn`, не падение.
  - **п. 9:** любая ошибка шагов 1–5 оборачивается сообщением со stdout и stderr упавшего контейнера (хвост 200 строк) и имени шага. Ожидания ограничены по времени, бесконечного ожидания нет.
  - Логи без паролей и токенов: URL с паролем выводятся с `***`.
  - **Skill:** nestjs-code generic test/contract/support/platform-stand.ts (CREATE).

- [x] **Task 7c: `test/contract/support/global-setup.ts` — globalSetup и отчёт** (D10, §7; depends on 7a, 7b)
  - Файл: `test/contract/support/global-setup.ts` (CREATE).
  - Поднимает стенд и через `provide` передаёт тестам:
    - `platformUrl`, `amqpUrl` (проброшенный порт), `serviceContainerId`;
    - `authzToken`, `noScopeToken`;
    - `platformCommit`.
  - Типы для `inject` объявлены расширением `ProvidedContext` Vitest.
  - Печатает отчёт D10: `[contract] Platform: <commit> (<source>), dirty: <yes|no>`. В teardown повторяет его после результатов и останавливает стенд.
  - Перед кодом сверить `provide` / `ProvidedContext` Vitest 5 через Context7.
  - **Skill:** nestjs-code generic test/contract/support/global-setup.ts (CREATE).

- [x] **Task 7d: `test/contract/support/platform-cli.ts` — `member:grant` / `member:revoke`** (§7 п. 7, AC-13, AC-14; depends on 7c)
  - Файл: `test/contract/support/platform-cli.ts` (CREATE).
  - `memberGrant(tenant, sub, role)` и `memberRevoke(tenant, sub, role)` — `docker exec <serviceContainerId> node dist/cli.js member:grant --tenant <slug> --sub <sub> --role <role>` через `child_process` без shell.
  - Разбирает последнюю строку stdout как JSON:
    - `ok: true` → результат с эпохой, если она есть в ответе;
    - иначе — ошибка с кодом, stdout, stderr и хвостом `docker logs` сервиса (п. 9).
  - Таймаут `docker exec` — 30 с: CLI на каждый вызов поднимает полный контекст Nest с БД (`run-cli.ts:249-252`). Предел 5 с (§7 п. 7) относится к ожиданию результата — события или ответа `permissions` (Task 7e, 7f), а не к работе CLI.
  - Экспорт `serviceLogsTail(containerId, lines)` (по умолчанию 200 строк) — `docker logs --tail` через `child_process` без shell. Им пользуются 7d, 7e и 7f для вывода логов при сбое (п. 9): worker видит только id контейнера.
  - Логи `[contract]`: команда без секретов, код, `ok`/код ошибки.
  - **Skill:** nestjs-code generic test/contract/support/platform-cli.ts (CREATE).

- [x] **Task 7e: `test/contract/support/broker.ts` — публикация identity и очередь теста** (§7 п. 6–7, п. 9, AC-15 C; depends on 6a, 7c, 7d)
  - Файл: `test/contract/support/broker.ts` (CREATE).
  - Подключение `amqplib` к `amqpUrl`.
  - **п. 6:** `captureQueue()` — эксклюзивная очередь с автоименем, привязанная к `verdeect.events` по ключу `platform.policy.changed`. Создаётся до первого действия теста. Сообщения копятся в массиве.
  - `nextPolicyChanged(predicate)` ждёт подходящее сообщение не дольше 5 с (п. 7). Иначе — ошибка с полученными сообщениями и хвостом `docker logs` сервиса (п. 9).
  - **AC-15 (C):** каждое полученное сообщение сразу проверяется ajv по `test/fixtures/platform-events.schema.json` и zod пакета — через `client.onPolicyChanged` на отдельном клиенте с подделанным `metrics`: `invalid` означает отказ zod. Результаты складываются для теста. Сообщение об отказе ajv: «Platform изменил схему — обновить копию (спросить пользователя)».
  - `publishIdentity(envelope)`: сначала проверка конверта по копии схемы (Task 6a); отказ → ошибка до публикации. Затем публикация в `verdeect.events` с ключом = `type`, `messageId = id`, `type`, `persistent`, `contentType: application/json` — как Platform.
  - Закрытие соединения.
  - Логи `[contract]`: публикация (`type`, `id`), получение `policy.changed` (`tenantId`, `epoch`, `subs`, `reason`).
  - **Skill:** nestjs-code generic test/contract/support/broker.ts (CREATE).

- [x] **Task 7f: `test/contract/support/contract-client.ts` — клиент пакета для слоя C** (§7 п. 8, AC-13–AC-15; depends on 6a, 7c, 7d, 7e)
  - Файл: `test/contract/support/contract-client.ts` (CREATE).
  - Создаёт клиент через публичный `createPlatformAuthzClient` из `src/core/index.ts`:
    - `baseUrl` = `platformUrl`;
    - `tokenProvider` — обёртка над `authzToken` (или `noScopeToken`), `refresh` отдаёт тот же токен (решение плана) и записывает каждый вызов `getToken` с его параметрами в массив `tokenCalls` клиента (для проверки Task 8c, что `refresh: true` не было);
    - `fetch` — обёртка над глобальным, записывает тела запросов `permissions` для проверки `minEpoch` в AC-14;
    - `logger` — запись в массив и `[contract]` в stdout;
    - `metrics` — запись вызовов.
  - `waitFor(probe, description)` — опрос раз в 100 мс не дольше 5 с (п. 7). Иначе — ошибка с последним результатом и хвостом `docker logs` сервиса.
  - Построитель участника: `uniqueTenant(prefix)` даёт `tenantId` = `crypto.randomUUID()` и slug `<prefix>-<суффикс прогона>` без `_`; `sub` участника — тоже UUID. Slug проходит шаблон Platform `^_?[a-z0-9][a-z0-9-]{0,48}$`.
  - `prepareMember(tenantSlug, tenantId, sub)` — события публикуются **по порядку** с ожиданием, потому что Platform обрабатывает очередь `platform` параллельно (prefetch 10, обработчик не сериализован: `rabbit-subscriber.ts:83,124`). `membership.added` до фиксации компании даёт `UnknownTenantError` и повтор через 30 с (`apply-membership-added.use-case.ts:46-49`, `topology.ts:26`), а это больше предела 5 с:
    1. `organization.created`, затем `waitFor` (5 с), пока `raw.permissions` для этого `sub` не вернёт `NOT_MEMBER` с `epoch` не `null`. У неизвестной компании `epoch: null` (`decision.ts:87,101-102`), после создания Platform сбрасывает свой кэш (`apply-organization-created.use-case.ts:45-47`). Если компания уже есть (второй участник `admin` в Task 8a), шаг пропускается;
    2. `account.created` и `membership.added` (`membership.added` учётную запись не проверяет, порядок между ними не важен), затем `waitFor` до `permissions({fresh: true})` = `allow: true` (п. 7).
  - **Skill:** nestjs-code generic test/contract/support/contract-client.ts (CREATE).
  <!-- Commit checkpoint: tasks 5–7f -->

### Phase 4: Контрактные тесты (слой C)

**Architectural deviation (осознанное решение):** `nestjs-code test integration` предписывает `test/integration/*.int-spec.ts`, а тесты лежат в `test/contract/*.spec.ts`. Причины: (1) раскладку задаёт prd.md §4 (`test/contract/` — слой C); (2) `rules/base.md` «Тесты» — файлы `*.spec.ts` по слоям, отдельный конфиг контракта; (3) это библиотека, а не сервис: интеграционного слоя с БД пакета нет, Testcontainers поднимает чужой сервис.

- [x] **Task 8a: `test/contract/ac-13-catalog.spec.ts`** (AC-13, AC-15 (C), UC-1, D10; depends on 5, 6a, 7a–7f)
  - Файл: `test/contract/ac-13-catalog.spec.ts` (CREATE). Компания со slug `c13-<суффикс>` и UUID `tenantId`, участники `viewer` (после `membership.added`) и `admin` (второй участник, `member:grant --role admin`).
  - Тесты:
    - `AC-13: viewer — check('native.files.read') allow, check('native.files.write') FORBIDDEN, check('knowledge.read') MODULE_DISABLED` — тексты §3.4 дословно;
    - `AC-13: решение пакета для каждого права каталога совпадает с POST /v1/authz/check Platform (raw.check)`:
      - для `viewer` по каждому праву `src/testing/catalog.ts` сравниваются `allow`, `code`, `message` и `epoch`;
      - `raw.check` получает тело `{sub, tenant, tenantId, act: 'human', permission}`;
    - `AC-13: admin — permissions ∪ keys(denied) настоящего Platform = права каталога копии`;
    - `AC-13: admin — modules[].id = модули копии в том же порядке`;
    - `AC-13: admin — права с MODULE_DISABLED = права модулей копии вне MODULES_READY (files, web, office, images)`;
    - `AC-13 / UC-1: после identity.organization.disabled и onPolicyChanged с настоящим событием из очереди теста → COMPANY_SUSPENDED`:
      - очередь создана до первого действия;
      - событие — первое `policy.changed` компании после публикации `organization.disabled`, ожидание до 5 с;
      - снимок `viewer` в кэше до события: прямо перед публикацией `organization.disabled` вызвать `check(viewer, 'native.files.read')` — снимок из `beforeAll` мог истечь (TTL 60 с) за время теста `raw.check` и создания `admin`;
      - после `onPolicyChanged` метрика `policyEvent('applied')`, `check` → `COMPANY_SUSPENDED` «Компания приостановлена.»;
    - `AC-15 (C): каждый ответ permissions настоящего Platform в этом файле проходит zod-схему ответа` — ни одного `PlatformContractError` с кодом `INVALID_RESPONSE`, `raw.permissions` для `viewer` и `admin` разобран без ошибки;
    - `AC-15 (C): каждое platform.policy.changed из очереди теста проходит ajv по копии схемы и zod пакета` — по накопленным результатам Task 7e.
  - **Порядок тестов в файле фиксирован** (общая компания): `viewer` → сравнение с `raw.check` → три теста `admin` → `organization.disabled` → AC-15. Отключение компании идёт после всех тестов, которым нужна активная компания.
  - **Участник `admin` создаётся первым шагом тестов `admin`, после сравнения с `raw.check`**, не в `beforeAll`: `member:grant` поднимает эпоху компании и сбил бы сравнение эпох `viewer`. Шаги: `prepareMember` для второго `sub`, `memberGrant(..., 'admin')`, ожидание `nextPolicyChanged` с этим `sub` в `subs`, передача события в `client.onPolicyChanged`, и только потом `permissions` для `admin`. Иначе в кэше пакета и Platform (TTL 30 с) остаётся снимок `viewer` из `prepareMember`, а `minEpoch` — старая эпоха: `knowledge.manage` и `agents.manage` пришли бы как `FORBIDDEN`.
  - При расхождении каталога или схемы — сообщение «Platform изменил каталог/схему, копию нужно обновить». Тест не подгоняется: остановиться и спросить пользователя (правило остановки).
  - **Skill:** nestjs-code test integration ac-13-catalog (CREATE) — слой C, Testcontainers.

- [x] **Task 8b: `test/contract/ac-14-revocation.spec.ts`** (AC-14, AC-15 (C), UC-2, D5, D10; depends on 5, 6a, 7a–7f)
  - Файл: `test/contract/ac-14-revocation.spec.ts` (CREATE). Компания со slug `c14-<суффикс>` и UUID `tenantId`, участник `viewer`. Очередь теста создаётся до первого действия.
  - Тесты (общий участник, порядок внутри файла важен):
    - `AC-14 / UC-2: member:grant --role operator → снимок пакета с эпохой E`:
      - после `memberGrant` дождаться события `policy.changed` с `subs` = `[sub]`, передать в `onPolicyChanged`;
      - `permissions` агента (`act: 'agent'`) → `allow: true`; эпоха `E` = эпоха снимка и совпадает с эпохой события.
    - `AC-14 / UC-2: member:revoke --role operator → событие {epoch: E+1, subs: [sub]} → onPolicyChanged → check с pep = E → CONTEXT_REVOKED, в запросе permissions minEpoch: E+1`:
      - проверить `reason: 'member_roles'` и что тело последнего запроса `permissions` содержит `minEpoch: E+1` без `pep`;
      - текст «Контекст отозван. Нужен новый диалог.».
    - `AC-14 / D5: событие «потеряно» для пакета, токен pep = E+1 → перечитывание с minEpoch = E+1, снимок эпохи E+1 без ожидания TTL Platform`:
      - отдельный клиент B, которому события не передаются. Текущая эпоха компании после отзыва — `F` (= E+1 предыдущего теста); `check` агента с `pep = F` → снимок `F` в кэше B и в кэше Platform;
      - `member:grant --role operator` → эпоха `F+1` (событие дождаться в очереди теста, но B его **не** получает);
      - `check` в B с `pep = F+1` → ровно один новый запрос `permissions` с `minEpoch: F+1`, ответ — эпоха `F+1`, решение по праву. Это сценарий AC-14 с `E := F`;
      - доказательство — тело запроса с `minEpoch: F+1` и эпоха ответа `F+1`. Время не проверяется: Platform сбрасывает свой кэш и по собственному событию из очереди реплики (`policy-changed.consumer.ts:116`), поэтому время ничего не доказывает про `minEpoch`.
    - `AC-15 (C): события policy.changed этого файла проходят ajv по копии и zod пакета; ответы permissions — zod`.
  - **Skill:** nestjs-code test integration ac-14-revocation (CREATE).

- [x] **Task 8c: `test/contract/ac-15-scope.spec.ts`** (AC-15 (C), §3.1, §5.1; depends on 5, 6a, 7a–7f)
  - Файл: `test/contract/ac-15-scope.spec.ts` (CREATE). Компания со slug `c15-<суффикс>` и UUID `tenantId`, участник `viewer`.
  - Тесты:
    - `AC-15 (C): вызов с токеном того же издателя без platform:authz → PlatformContractError с кодом SCOPE_REQUIRED`:
      - клиент с `noScopeToken`, `check` → ошибка `PlatformContractError`, `code === 'SCOPE_REQUIRED'`;
      - кэш пуст (следующий `check` снова идёт в Platform);
      - `getToken({refresh: true})` не вызывался.
    - `AC-15 (C): тот же участник с токеном platform:authz → ответ permissions проходит zod-схему` — контроль, что отказ вызван областью, а не данными.
  - **Skill:** nestjs-code test integration ac-15-scope (CREATE).
  <!-- Commit checkpoint: tasks 8a–8c -->

### Phase 5: Выпуск (D1, NFR-6, AC-16)

- [x] **Task 10: `scripts/publish.mjs`** (AC-16, D1, NFR-6)
  - Файл: `scripts/publish.mjs` (CREATE). Только stdlib. Перенос `verdeect-auth/scripts/publish.mjs` с заменой ссылок на требования (`prd.md D1, NFR-6, AC-16; docs/releasing.md`). Поведение:
    - `GITHUB_REF_NAME` пуст → код 1;
    - не по шаблону `v<major>.<minor>.<patch>` → код 1;
    - ≠ `v` + `version` из `package.json` → код 1, «не совпадает»;
    - `npm view <name>@<version>`: версия есть → код 1, «уже опубликована»; E404 → версии нет; другая ошибка → код 1;
    - иначе `npm publish --access public` (с `--dry-run`, если передан флаг). Код возврата — код npm.
  - Логи `[publish]`: тег, version, ответ реестра, решение, «авторизация: OIDC (Trusted Publishing)», команда, код.
  - ESLint уже покрывает `scripts/**/*.mjs` (блок в `eslint.config.js`).
  - **Skill:** nestjs-code generic scripts/publish.mjs (CREATE) — скрипт выпуска.

- [x] **Task 11: `.github/workflows/ci.yml` — job `publish`** (NFR-6, D1, AC-16; depends on 10)
  - Файл: `.github/workflows/ci.yml` (MODIFY), по образцу `verdeect-auth`.
  - `on.push.tags: ['v[0-9]+.[0-9]+.[0-9]+']`.
  - `concurrency.cancel-in-progress` — только не для тегов.
  - Новый job `publish`:
    - `needs: [lint, test, build]`, `if: startsWith(github.ref, 'refs/tags/v')`, `runs-on: ubuntu-latest`, `environment: npm`;
    - `permissions: {contents: read, id-token: write}` — только у этого job; у workflow остаётся `contents: read`;
    - шаги: checkout → setup-node 24 с `package-manager-cache: false`, без `registry-url` → `npm install -g npm@^11.15.0` → `npm --version` → download-artifact `dist` → `node scripts/publish.mjs`.
  - Секретов, `NODE_AUTH_TOKEN`, `NPM_TOKEN` и `continue-on-error` нет.
  - Шапку-комментарий обновить:
    - цепочка lint → test → build → publish;
    - разовая настройка: environment `npm` только для тегов `v*`, ruleset тегов;
    - 1.0.0 вручную, затем `npm trust`; job `publish` для `v1.0.0` упадёт на «уже опубликована» — это ожидаемо;
    - слой C — локально (D10).
  - **Skill:** none — YAML CI.

- [x] **Task 12: `test/package/support/pack.ts` — окружение команды** (AC-16; depends on 2)
  - Файл: `test/package/support/pack.ts` (MODIFY).
  - `runCommand` принимает необязательный объект переменных окружения, который добавляется поверх `process.env` (как в `verdeect-auth`). Вызовы без него не меняются.
  - **Skill:** nestjs-code generic test/package/support/pack.ts (MODIFY).

- [x] **Task 13: шаблон `test/consumer/full/exports-import.mjs`** (AC-16; depends on 2)
  - Файл: `test/consumer/full/exports-import.mjs` (CREATE).
  - Динамически импортирует `@verdeect/platform-client` и `@verdeect/platform-client/nest` (в `full` есть все peer-зависимости), проверяет наличие `createPlatformAuthzClient` и `PlatformAuthzModule`, печатает `ok`. Ошибка → код ошибки в stdout, код возврата 1.
  - **Skill:** nestjs-code generic test/consumer/full/exports-import.mjs (CREATE).

- [x] **Task 14: `test/package/release.spec.ts`** (AC-16, NFR-6, D1, D10; depends on 2, 4, 10, 11, 12)
  - Файл: `test/package/release.spec.ts` (CREATE) — по образцу `verdeect-auth/tests/package/release.spec.ts`. Локальный реестр на `node:http`, пустой `npm_config_userconfig`, `NODE_AUTH_TOKEN` пуст.
  - Тесты:
    - `AC-16: тег v<version> при совпадающей version и отсутствии в npm — сухой прогон доходит до npm publish --dry-run, код 0, авторизация только OIDC`;
    - `AC-16: тег ≠ version — код 1 до npm publish, «не совпадает»`;
    - `AC-16: версия уже опубликована — код 1 до npm publish, «уже опубликована»`;
    - `AC-16: тег не по шаблону v<major>.<minor>.<patch> — код 1 до npm publish`;
    - `NFR-6: jobs lint → test → build → publish; test — матрица Node 22 и 24; триггеры push (ветки и теги v[0-9]+.[0-9]+.[0-9]+) и pull_request; runs — make install/lint/analyse, make test, make build pack-check`;
    - `NFR-6 / D1: publish — needs lint, test, build; if только refs/tags/v; environment npm; GitHub-hosted runner; Node 24 и npm >= 11.15 до публикации; без registry-url; permissions id-token: write только у publish; без secrets, NODE_AUTH_TOKEN, NPM_TOKEN и continue-on-error`;
    - `D10: ни один jobs.*.steps[].run в ci.yml (разобранный YAML) не содержит test-contract; среди пререквизитов строки ci: Makefile нет test-contract; цель test-contract есть и запускает vitest.contract.config.ts через test:contract` — комментарии ci.yml и Makefile, упоминающие make test-contract, не учитываются;
    - `AC-16: package.json — скрипт pack:check запускает publint --strict, attw --pack . --profile esm-only и test:package; Makefile pack-check вызывает pack:check`.
  - **Skill:** nestjs-code test unit release (CREATE) — набор `test/package`.

- [x] **Task 15: `test/package/consumer.spec.ts` — импорт `.` и `./nest` из архива** (AC-16; depends on 13)
  - Файл: `test/package/consumer.spec.ts` (MODIFY). Существующие тесты AC-12 не меняются.
  - Новый тест `AC-16: упакованный архив — импорт . и ./nest работает` — `node exports-import.mjs` в проекте `full`, stdout `ok`.
  - Импорт `./testing` только с условием `development` уже проверяют существующие тесты AC-12. В Traceability они указаны и для AC-16.
  - **Skill:** nestjs-code test unit consumer (MODIFY).
  <!-- Commit checkpoint: tasks 10–15 -->

### Phase 6: Документация (NFR-5, D1, D10, AC-12 «пример из README»)

Общее для 16a–17: русский язык; ссылки «← README»; тексты кодов и ответов — дословно prd.md §3.4 и §5.4; образец структуры — одноимённые файлы `verdeect-auth/docs`. Факты — только из prd.md и кода `src/`. Новых обещаний нет.

- [x] **Task 16a: `docs/getting-started.md`** (§5.1, §5.3, D3–D8)
  - Файл: `docs/getting-started.md` (CREATE).
  - Содержание:
    - установка с точной версией (D1);
    - `createPlatformAuthzClient` и таблица настроек с ограничениями §5.1;
    - `clientCredentials` (`client_secret_basic`, `scope`, `resource`);
    - `check` / `checkMany` / `permissions({fresh})` / `raw.*` / `clear`;
    - `onPolicyChanged` — сервис сам подписан на RabbitMQ (D7), пример передачи конверта;
    - логгер (pino, `nestjs-pino`) и метрики — адаптер `prom-client` с именами метрик §5.1;
    - кэш и свежесть: TTL, `minEpoch`, граница отзыва G3.
  - **Skill:** none — markdown.

- [x] **Task 16b: `docs/nestjs.md`** (§5.4, D11)
  - Файл: `docs/nestjs.md` (CREATE).
  - Содержание:
    - `PlatformAuthzModule.forRoot` / `forRootAsync`;
    - `@RequirePermission` на методе и классе, несколько прав;
    - четыре варианта подключения `VerdeectAuthGuard` и предупреждение о порядке декораторов на одном методе (D11);
    - сопоставление `Principal` → `Subject`;
    - `request.platformDecision`;
    - таблица ответов guard §5.4 дословно.
  - **Skill:** none — markdown.

- [x] **Task 16c: `docs/testing.md`** (§5.5, UC-4)
  - Файл: `docs/testing.md` (CREATE).
  - Содержание:
    - таблица «где работает `testing`» как в `verdeect-auth/docs/testing.md`: Vitest — сам; Node — `--conditions=development`; production — `ERR_PACKAGE_PATH_NOT_EXPORTED`; `tsc` — типы видны;
    - `createFakePlatform`: `grant`, `deny` (только `GeneralDenyCode`), `setModule`, `setEpoch`, `policyChanged`, `calls`;
    - значения по умолчанию `FakeMember` / `FakeCompany`, slug `tenant` и случаи `TypeError`;
    - неизвестное право → `UNKNOWN_PERMISSION`.
  - Пример теста — ссылка на раздел README «Тесты потребителя» (один источник примера).
  - **Skill:** none — markdown.

- [x] **Task 16d: `docs/errors.md`** (§3.4, §5.1, D6, D9)
  - Файл: `docs/errors.md` (CREATE).
  - Содержание:
    - `PlatformUnavailableError` и `PlatformContractError`: когда возникают (§5.1 «Ответы Platform», Identity), коды (`UNKNOWN_PERMISSION`, `PEP_REQUIRED`, `VALIDATION_FAILED`, `INVALID_RESPONSE`, `HTTP_<status>`, коды Platform и OAuth);
    - fail-closed (D6);
    - таблица кодов решений и текстов §3.4;
    - что делает guard с каждой ошибкой (§5.4).
  - **Skill:** none — markdown.

- [x] **Task 16e: `docs/releasing.md`** (D1, D10, NFR-5, NFR-6)
  - Файл: `docs/releasing.md` (CREATE). Структура — `verdeect-auth/docs/releasing.md` (UC-3 → «Выпуск по шагам»).
  - **Чек-лист выпуска (по порядку):**
    1. `main` зелёный, локально `make ci`;
    2. `make test-contract` против **текущего `main` Platform** (D10): `git -C ../verdeect-platform checkout main` и `git pull`, затем прогон. Коммит из строки `[contract] Platform: …` — в таблицу совместимости README (NFR-5). Прогон с `PLATFORM_IMAGE` без `PLATFORM_COMMIT` или с `dirty: yes` для выпуска не годится;
    3. `version` по semver, раздел CHANGELOG с датой (у 1.0.0 — поправить дату на дату тега);
    4. коммит, тег `vX.Y.Z`, push;
    5. CI: lint → test → build (`pack:check`) → publish;
    6. `npm view`.
  - Таблица проверок `scripts/publish.mjs` и ошибки выпуска.
  - Semver: контракт Platform `v1` ↔ пакет `1.x`, ломающее изменение контракта — мажор (NFR-5). Мажор требует «Как обновиться».
  - Trusted Publishing:
    - разовая настройка GitHub — environment `npm` для тегов `v*`, ruleset тегов;
    - **ручной 1.0.0** (D1): чистый клон тега, `make ci`, `make test-contract`, `npm login`, `npm publish --access public`, `npm logout`, push тега — job `publish` упадёт на «уже опубликована»;
    - затем `npm trust github @verdeect/platform-client --repo smskin/verdeect-platform-client --file ci.yml --env npm --allow-publish` (имена флагов сверить с `npm trust github --help`) и «Require two-factor authentication and disallow tokens».
  - Где смотреть логи `[publish]`. `NPM_TOKEN` не упоминается.
  - **Skill:** none — markdown.

- [x] **Task 17: `README.md`** (NFR-5, §5.4, §5.5, D1, D11, AC-12; depends on 16a–16e)
  - Файл: `README.md` (CREATE) — посадочная страница по образцу `verdeect-auth/README.md`.
  - Файл: `.prettierrc.json` (MODIFY) — override для `README.md`: `embeddedLanguageFormatting: "off"`. Иначе Prettier переотступит блок примера (у `*.md` `tabWidth: 2`, у шаблона 4) и сравнение Task 18a упадёт; `make lint` остаётся зелёным.
  - Разделы:
    - **Установка** — точная версия (D1); peer-зависимости и когда они нужны (NFR-4).
    - **Быстрый старт** — ядро: `createPlatformAuthzClient`, `clientCredentials`, `check`.
    - **Подключение** — четыре варианта из §5.4: `VerdeectAuthGuard` через `APP_GUARD`, на контроллере, на методе ниже `@RequirePermission`, без него. Короткие примеры и предупреждение: `@UseGuards(VerdeectAuthGuard)` выше `@RequirePermission` на том же методе — две проверки токена (D11). Порядок подключения модулей не важен.
    - **Тесты потребителя** (§5.5):
      - таблица условий импорта `testing`, как в `@verdeect/auth` `docs/testing.md`;
      - fenced-блок `ts` — **дословная копия** `test/consumer/full/src/consumer.spec.ts`. Блок обрамлён маркерами-комментариями HTML `<!-- consumer-example:start -->` и `<!-- consumer-example:end -->`, по ним его находит тест (Task 18a).
    - **Совместимость** (NFR-5) — таблица: версия пакета `1.x` ↔ контракт Platform `v1` ↔ PRD Platform v1.11 и коммит, на котором пройден слой C ↔ `@verdeect/auth` `^1.0.1`. Коммит заполняет Task 22, до него — `7adb423`.
    - **API** — таблица на каждый подпуть (`@verdeect/platform-client`, `/nest`, `/testing`): имена значений и типов дословно из `src/core/index.ts`, `src/nest/index.ts`, `src/testing/index.ts`, по строке на экспорт (правило AGENTS.md: README обязателен с вехи выпуска; образец — `verdeect-auth/README.md` «## API»).
    - **Ошибки**, **Метрики** (адаптер `prom-client`, §5.1).
    - **Документация** — ссылки на `docs/*`; **Выпуск** — ссылка на `docs/releasing.md`.
  - **Skill:** none — markdown.

- [x] **Task 18a: `test/package/consumer.spec.ts` — пример из README = шаблон** (AC-12 «пример из README»; depends on 17)
  - Файл: `test/package/consumer.spec.ts` (MODIFY).
  - Новый тест `AC-12: пример «Тесты потребителя» в README совпадает с test/consumer/full/src/consumer.spec.ts`:
    - вырезать fenced-блок между маркерами `consumer-example:start` / `:end` в `README.md`;
    - сравнить с содержимым шаблона строго, с нормализацией только завершающего перевода строки;
    - при расхождении — понятное сообщение «обновите README из шаблона».
  - Отдельный `describe('AC-12: пример из README')` в том же файле. Архив тесту не нужен, файловый `beforeAll` не меняется.
  - **Skill:** nestjs-code test unit consumer (MODIFY).

- [x] **Task 18b: `test/package/docs.spec.ts`** (NFR-5, D1, D10, §4; depends on 16a–16e, 17)
  - Файл: `test/package/docs.spec.ts` (CREATE) — по образцу `verdeect-auth/tests/package/docs.spec.ts`.
  - Тесты:
    - `§4: есть README.md, CHANGELOG.md, AGENTS.md и docs/getting-started.md, nestjs.md, testing.md, errors.md, releasing.md`;
    - `§4: относительные ссылки в Markdown ведут на существующие файлы` — README, CHANGELOG, AGENTS, `docs/**`; код в примерах не считается ссылкой;
    - `NFR-5: README — таблица совместимости: 1.x, контракт v1, PRD Platform v1.11, коммит Platform (7+ hex), @verdeect/auth ^1.0.1`;
    - `§4 / AGENTS.md: каждое имя, экспортированное src/core/index.ts, src/nest/index.ts и src/testing/index.ts, есть в разделе README «API»` — имена берутся разбором `export { … }` и `export type { … }` трёх файлов: разбор многострочный, элементы делятся по `,` и обрезаются, префикс `type ` снимается, при `X as Y` берётся `Y`; если в файле есть `export *`, `export const|function|class` или `export default` — тест падает с «обновите разбор»; раздел «API» — текст от `## API` до следующего `## `; имя ищется в обратных кавычках, а не подстрокой (иначе `Decision` нашёлся бы в `PlatformDecision`);
    - `D11 / §5.4: README «Подключение» — четыре варианта (APP_GUARD, контроллер, метод ниже, без VerdeectAuthGuard) и предупреждение о порядке декораторов`;
    - `D1 / D10: docs/releasing.md — make ci, make test-contract против текущего main Platform, git tag vX.Y.Z, npm publish --access public (1.0.0 вручную), npm trust github, disallow tokens, без NPM_TOKEN`;
    - `NFR-5: docs/releasing.md — контракт v1 ↔ 1.x, ломающее изменение контракта — мажор, «Как обновиться»`.
  - **Skill:** nestjs-code test unit docs (CREATE).
  <!-- Commit checkpoint: tasks 16a–18b -->

### Phase 7: Завершение этапа

- [x] **Task 19: `CHANGELOG.md` `[1.0.0]` и `version` 1.0.0** (D1, NFR-5; depends on 17, 18b)
  - `CHANGELOG.md` (MODIFY):
    - раздел `## [Unreleased]` пуст;
    - текущее содержимое переезжает в `## [1.0.0] - <дата завершения E3, ГГГГ-ММ-ДД>`, вводная строка — «Первый выпуск: ядро (E1), адаптер NestJS и подделка Platform (E2), контрактные тесты и выпуск через CI (E3)»;
    - строка в `### Added` о README и `docs/`;
    - контракт Platform `v1` (PRD v1.11, коммит слоя C).
  - `package.json` (MODIFY): `version` — `1.0.0`.
  - **Skill:** none — markdown и манифест.

- [x] **Task 19b: `test/package/docs.spec.ts` — CHANGELOG `[1.0.0]` и `version`** (D1, NFR-5; depends on 18b, 19)
  - Файл: `test/package/docs.spec.ts` (MODIFY).
  - Тест `D1: CHANGELOG — Keep a Changelog, [Unreleased] и [1.0.0] - ГГГГ-ММ-ДД; version в package.json совпадает с последним выпуском CHANGELOG`.
  - **Skill:** nestjs-code test unit docs (MODIFY).

- [x] **Task 20: `AGENTS.md`** (depends on 3, 4, 5, 6b, 7a–7f, 8a–8c, 10, 11, 13, 14, 16a–16e, 17, 18b)
  - Файл: `AGENTS.md` (MODIFY):
    - утверждения «все цели на хосте» и «Docker — нет» уточнить: Docker нужен только `make test-contract` (слой C);
    - снять пометки «(E3)» и описать фактические файлы: `test/contract/` (`support/*`, три spec-файла), `test/fixtures/identity-events.schema.json`, `docs/*`, `scripts/publish.mjs`, `vitest.contract.config.ts`, job `publish` в `ci.yml`;
    - дополнить строки `test/package/` (`release.spec.ts`, `docs.spec.ts`), `test/unit/` (`identity-events.spec.ts`), `test/consumer/full` (`exports-import.mjs`); удалить фразу «`make test-contract` (слой C) появится в E3, CI — после `/aif-ci`»;
    - в «Команды» — `make test-contract` (переменные `PLATFORM_IMAGE`, `PLATFORM_COMMIT`), `pack-check` через `pack:check`;
    - «Документация» — строки `docs/*` и README.
  - `test/fixtures/SOURCES.md` уже обновлён в Task 5.
  - **Skill:** none — markdown.

- [x] **Task 21: итоговая проверка `make ci`** (AC-12, AC-16, NFR-6; depends on 1–20, 19b)
  - `make ci`: lint, analyse, test (unit, в том числе `identity-events.spec.ts`, и perf), build, pack-check (`pack:check`: publint, attw, `test:package` с `consumer`, `release`, `docs`).
  - Всё зелёное, без пропусков. Prettier и ESLint — на всех новых файлах, включая `test/contract/**`: `make lint` проверяет и их, хотя они не запускаются в CI.
  - `make analyse` компилирует `test/contract/**` и `vitest.contract.config.ts`.
  - **Skill:** none — запуск проверок.

- [x] **Task 22: прогон `make test-contract` против текущего `main` Platform и коммит в README** (AC-13, AC-14, AC-15 (C), D10, NFR-5; depends on 4, 8a–8c, 17, 18b, 19, 19b, 21)
  - `git -C ../verdeect-platform status` — чисто, ветка `main`, актуальна (`git -C ../verdeect-platform pull origin main`, отдельной командой). Не так — спросить пользователя, прежде чем трогать чужой репозиторий.
  - `make test-contract` — все тесты AC-13, AC-14, AC-15 (C) зелёные. Отчёт `[contract] Platform: <commit> …, dirty: no` есть в выводе.
  - Красный тест из-за поведения Platform, не совпадающего с prd.md, — **остановиться и спросить пользователя** (правило остановки). Тест не подгонять.
  - Коммит из отчёта (7 знаков) записать в таблицу совместимости README (Task 17) и в CHANGELOG `[1.0.0]` (Task 19). Затем `make pack-check` для `docs.spec.ts`.
  - **Skill:** none — запуск проверок и правка markdown.
  <!-- Commit checkpoint: tasks 19–22 (19b) -->

## Traceability

| Требование | Задачи | Тест |
|---|---|---|
| AC-13 (C, UC-1, D10) | 5, 6a, 7a–7f, 8a, 22 | `test/contract/ac-13-catalog.spec.ts`: «AC-13: viewer …», «AC-13: решение пакета … совпадает с POST /v1/authz/check», «AC-13: admin — permissions ∪ keys(denied) …», «AC-13: admin — modules[].id …», «AC-13: admin — права с MODULE_DISABLED …», «AC-13 / UC-1: после identity.organization.disabled … COMPANY_SUSPENDED» |
| AC-14 (C, UC-2) | 7a–7f, 8b, 22 | `test/contract/ac-14-revocation.spec.ts`: «AC-14 / UC-2: member:grant …», «AC-14 / UC-2: member:revoke … CONTEXT_REVOKED, minEpoch: E+1», «AC-14 / D5: событие «потеряно» … pep = E+1» |
| AC-15 (C) | 7b, 7e, 7f, 8a, 8b, 8c, 22 | `ac-13-catalog.spec.ts` / `ac-14-revocation.spec.ts`: «AC-15 (C): … ajv по копии и zod пакета», «AC-15 (C): каждый ответ permissions … zod»; `ac-15-scope.spec.ts`: «AC-15 (C): … без platform:authz → SCOPE_REQUIRED», «AC-15 (C): тот же участник с токеном platform:authz …» |
| AC-16 (U, D1, NFR-6) | 2, 4, 10, 12, 13, 14, 15, 21 | `test/package/release.spec.ts`: «AC-16: тег v<version> …», «AC-16: тег ≠ version …», «AC-16: версия уже опубликована …», «AC-16: тег не по шаблону …», «AC-16: package.json — скрипт pack:check …»; `test/package/consumer.spec.ts`: «AC-16: упакованный архив — импорт . и ./nest», «AC-12 / UC-4 A3: node без условия …», «AC-12: node --conditions=development …» (`./testing` только с `development`); `make pack-check` (`publint --strict`, `attw --profile esm-only`) |
| AC-12 — пример из README | 17, 18a | `test/package/consumer.spec.ts`: «AC-12: пример «Тесты потребителя» в README совпадает с test/consumer/full/src/consumer.spec.ts»; «AC-12: Vitest без настройки условий … проходит пример потребителя» (E2) |
| D1 | 10, 11, 14, 16e, 19, 19b | `release.spec.ts`: «NFR-6 / D1: publish — …»; `docs.spec.ts`: «D1 / D10: docs/releasing.md …», «D1: CHANGELOG …» |
| D10 | 1, 3, 4, 7a–7c, 14, 16e, 22 | `release.spec.ts`: «D10: в ci.yml и в цели ci нет test-contract …»; `docs.spec.ts`: «D1 / D10: …»; отчёт `[contract] Platform: <commit>` в `make test-contract` |
| NFR-5 | 16e, 17, 18b, 19, 22 | `docs.spec.ts`: «NFR-5: README — таблица совместимости …», «NFR-5: docs/releasing.md — контракт v1 ↔ 1.x …» |
| NFR-6 | 2, 4, 10, 11, 14 | `release.spec.ts`: «NFR-6: jobs lint → test → build → publish …», «NFR-6 / D1: publish — …» |
| §7 п. 1–9 (стенд) | 1, 5, 6a, 6b, 7a–7f | п. 1–5, 9 — `platform-stand.ts` (через все тесты C); п. 6–7 — `broker.ts`, `contract-client.ts`; п. 7 (образцы по копии) — `test/unit/identity-events.spec.ts` «§7 п. 7: …»; п. 8 — `global-setup.ts`, `contract-client.ts` |
| §10 п. 3 `[ASSUMPTION]` | 1, 7b | итог Task 1 в этом плане; выбранный путь — в `platform-stand.ts` |
| UC-1, UC-2 (сквозная проверка) | 8a, 8b | «AC-13 / UC-1: …», «AC-14 / UC-2: …» |
| D11, §5.4, §5.5 (документация) | 16b, 16c, 17, 18b | `docs.spec.ts`: «D11 / §5.4: README «Подключение» …» |

## Definition of Done
- Все задачи отмечены. `make ci` зелёный (Task 21), `make test-contract` зелёный против текущего `main` Platform, в отчёте коммит (Task 22).
- Каждое требование скоупа из Traceability покрыто тестом с ID в названии.
- `test/fixtures/identity-events.schema.json` — побайтная копия `7adb423`, источник в `SOURCES.md`.
- README, `docs/*`, CHANGELOG `[1.0.0]` готовы. Пример README совпадает с шаблоном (тест). Ручной выпуск 1.0.0, `npm trust` и запрет токенов делает мейнтейнер по `docs/releasing.md` вне плана (D1).
- Код `src/` не изменён.
