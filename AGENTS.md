# AGENTS.md

> Карта репозитория для ИИ-агентов и новых разработчиков. Обновляйте её при заметных изменениях структуры. Раздел «Документация» ведёт `/aif-docs`.

## Обзор проекта

`@verdeect/platform-client` — npm-библиотека для сервисов Вердикта 2.0. Ядро решает, есть ли у участника право, локально из кэша снимка `POST /v1/authz/permissions` Platform. Подпуть `nest` даёт guard `@RequirePermission`, подпуть `testing` — подделку Platform. Подробности — `.ai-factory/DESCRIPTION.md`.

## Технологический стек

- **Язык:** TypeScript (ESM, Node ≥ 22.12; CI — Node 22 и 24)
- **Runtime-зависимость:** `zod` 4.6.7, единственная
- **Фреймворк:** NestJS 12 и `@verdeect/auth` ^1.0.1 — необязательные peer-зависимости подпути `nest`
- **Тесты:** Vitest (unit, perf с `--expose-gc`, проверки пакета, контракт) по уровням `make test` / `test-module` / `test-timing` / `test-integration` / `test-full`. Testcontainers, `amqplib` — только слой C (`make test-integration`, псевдоним `make test-contract`), локально.
- **Пакетный менеджер:** pnpm
- **CI и выпуск:** GitHub Actions. Публикация — через npm Trusted Publishing, только по тегу `v<semver>`.
- **БД, ORM, брокер, HTTP-сервер:** нет, это библиотека. Docker нужен только слою C: `make test-integration` и `make test-full`.

## Структура проекта

Этапы E1 (ядро), E2 (Nest и подделка), E3 (контракт и выпуск) и E4 (лимиты тарифа, 1.1.0; слой C — Platform `513886e`) готовы.

```
verdeect-platform-client/
├── src/
│   ├── core/                     # ядро — точка входа "."; только zod
│   │   ├── index.ts              # публичный контракт ядра (явный список реэкспортов)
│   │   ├── types.ts              # публичные интерфейсы TS (§3.2, §5.1)
│   │   ├── codes.ts              # копия decision-codes.ts Platform (источник + коммит)
│   │   ├── limits.ts             # копия схемы Limits Platform (источник + коммит); .d.ts удаляется при сборке (AC-12)
│   │   ├── errors.ts             # PlatformUnavailableError, PlatformContractError
│   │   ├── schemas.ts            # zod-схемы (внутренние) и функции parse*
│   │   ├── options.ts            # проверка настроек → TypeError, значения по умолчанию
│   │   ├── log-limiter.ts        # ограничение частоты warn/error (NFR-3)
│   │   ├── transport.ts          # HTTP к Platform: таймаут, 401 → refresh, классификация
│   │   ├── token-provider.ts     # clientCredentials (client_secret_basic, кэш, refresh)
│   │   ├── cache.ts              # снимки, LRU, индекс по tenantId, lastSeenEpoch, объединение
│   │   ├── decide.ts             # локальное решение check/checkMany (§5.2)
│   │   └── client.ts             # createPlatformAuthzClient: оркестровка
│   ├── nest/                     # адаптер NestJS — "./nest"
│   │   ├── index.ts              # публичный контракт подпути nest
│   │   ├── platform-authz.module.ts         # PlatformAuthzModule.forRoot/forRootAsync, PLATFORM_AUTHZ_CLIENT
│   │   ├── require-permission.decorator.ts  # SetMetadata + UseGuards(PermissionGuard), TypeError без прав
│   │   ├── permission.guard.ts              # Principal → Subject, checkMany, request.platformDecision
│   │   └── responses.ts                     # тела и тексты ответов guard (§5.4)
│   └── testing/                  # подделка Platform — "./testing" (только условие development)
│       ├── index.ts              # публичный контракт подпути testing
│       ├── fake-platform.ts      # createFakePlatform: клиент ядра, транспорт в памяти
│       └── catalog.ts            # копия каталога прав и модулей Platform (источник + коммит)
├── test/
│   ├── unit/                     # слой U: *.spec.ts ядра, nest (@nestjs/testing + Fastify) и testing
│   │   ├── limits.spec.ts           # AC-20: шапка, ключи и совпадение копии limits.ts с источником
│   │   ├── client-limits.spec.ts    # AC-20, UC-5 A1/A2: limits через клиент, кэш, отброшенные ключи
│   │   ├── identity-events.spec.ts  # §7 п. 7: образцы конвертов identity.* слоя C по копии схемы
│   │   ├── contract-broker.spec.ts  # AC-15 (C): разбор platform.policy.changed без Docker
│   │   └── support/              # подделанные fetch, часы, logger, metrics, TokenProvider; nest-app.ts; setup.ts (AC-19)
│   ├── perf/                     # check.perf.spec.ts — p99 и память снимка (AC-17)
│   ├── fixtures/                 # platform-events.schema.json, identity-events.schema.json (копии Platform), SOURCES.md
│   ├── contract/                 # слой C против образа verdeect-platform (D10), только make test-integration / test-full
│   │   ├── ac-13-catalog.spec.ts      # AC-13, AC-15 (C), UC-1: каталог, raw.check, COMPANY_SUSPENDED
│   │   ├── ac-14-revocation.spec.ts   # AC-14, AC-15 (C), UC-2: member:grant/revoke, CONTEXT_REVOKED, minEpoch
│   │   ├── ac-15-scope.spec.ts        # AC-15 (C): SCOPE_REQUIRED без platform:authz
│   │   ├── ac-22-limits.spec.ts       # AC-22, UC-5: limits по тарифу default; PLATFORM_LIMITS=legacy — без B.1
│   │   └── support/
│   │       ├── global-setup.ts        # globalSetup: образ → стенд → provide; отчёт «[contract] Platform: <commit>»
│   │       ├── platform-image.ts      # docker build ../verdeect-platform или PLATFORM_IMAGE; коммит, dirty
│   │       ├── platform-stand.ts      # §7 п. 1–5, 9: сеть, PostgreSQL, RabbitMQ, издатель, db:prepare → migrate → plan:apply, сервис
│   │       ├── identity-events.ts     # построители конвертов identity.*, проверка ajv по копиям схем
│   │       ├── broker.ts              # очередь теста platform.policy.changed (ajv + zod), публикация identity.*
│   │       ├── platform-cli.ts        # member:grant/revoke через docker exec, хвост docker logs
│   │       └── contract-client.ts     # клиент пакета с записью вызовов, waitFor 5 с, prepareMember
│   ├── package/                  # проверки архива: consumer.spec.ts (AC-12, AC-16), release.spec.ts (AC-16, NFR-6, D10), docs.spec.ts (§4, NFR-5, D1)
│   │   └── support/              # pack.ts (runCommand с env), consumer-project.ts
│   ├── consumer/                 # шаблоны проектов-потребителей архива: core, nest-no-auth, full (exports-import.mjs — AC-16)
│   └── support/timeout-scale.ts  # TEST_TIMEOUT_SCALE — множитель testTimeout/hookTimeout конфигов Vitest
├── docs/                         # getting-started, nestjs, testing, errors, releasing
├── scripts/publish.mjs           # публикация из CI: тег = version, версии нет в npm (AC-16)
├── .github/workflows/ci.yml      # lint → test (make test, make test-timing) → build (pack-check, Node 22 и 24) → publish по тегу v* (Trusted Publishing)
├── README.md / CHANGELOG.md      # посадочная страница, таблица совместимости; изменения по версиям
├── package.json                  # exports трёх подпутей, peer-зависимости optional
├── pnpm-workspace.yaml           # настройки pnpm
├── tsconfig.json / tsconfig.build.json
├── eslint.config.js / .prettierrc.json
├── vitest.config.ts / vitest.perf.config.ts / vitest.package.config.ts / vitest.contract.config.ts
├── Makefile                      # install, lint, analyse, build, pack-check, ci; уровни test, test-module, test-timing, test-integration (test-contract), test-load, test-full; clean
├── requirements/                 # пакеты требований
│   ├── INDEX.md
│   └── 0000-platform-client/     # prd.md, README.md (этапы E1–E3)
├── .ai-factory/                  # контекст AI Factory
├── .claude/                      # скилы и агенты Claude Code
├── .serena/                      # настройки Serena MCP
└── .mcp.json                     # MCP-серверы проекта
```

## Команды

Единая точка входа — `Makefile` (`make help`), все цели на хосте; Docker нужен только `test-integration` и `test-full`. Уровни и время — `docs/testing.md`, раздел «Уровни тестов пакета»:

```bash
make install         # pnpm install --frozen-lockfile
make lint            # ESLint (TSDoc, границы ядра) + Prettier check
make analyse         # tsc --noEmit
make test            # слой U (test/unit) без perf; make test FILTER='AC-6'
make test-module     # слой U по файлам: make test-module M='cache decide' (подстроки test/unit/<m>; без M — весь слой U)
make test-timing     # perf AC-17 (--expose-gc), только на тихой машине; при load > ядер — [test-timing] WARN
make build           # dist/ (.js + .d.ts)
make test-integration # слой C в Testcontainers (локально, не в ci); PLATFORM_IMAGE=<ref> PLATFORM_COMMIT=<sha>; PLATFORM_DIR=<worktree>; PLATFORM_LIMITS=legacy — Platform без B.1; PLATFORM_CLI_TIMEOUT_MS=<мс> — предел вызова CLI (120000)
make test-contract   # псевдоним test-integration (docs/releasing.md, D10)
make test-load       # нагрузочного набора нет — сообщение и код 0
make test-full       # перед /aif-commit, слиянием и тегом: lint analyse test pack-check test-integration test-timing (те же PLATFORM_*)
make pack-check      # pnpm pack:check: publint --strict + attw esm-only + test:package (AC-12, AC-16)
make test-package    # только проекты-потребители упакованного архива (после build)
make ci              # lint analyse test test-timing build pack-check — то же, что CI
# TEST_TIMEOUT_SCALE=2..3 — множитель тайм-аутов конфигов Vitest, только локально на загруженной машине (в CI — 1)
make clean           # dist, coverage, *.tgz
```

## Ключевые точки входа

| Файл | Назначение |
|---|---|
| `requirements/0000-platform-client/prd.md` | источник требований: D1–D11, контракт Platform §3, API §5, AC-1–AC-19, NFR-1–NFR-6 |
| `requirements/0000-platform-client/README.md` | этапы E1–E3, готовность |
| `src/core/index.ts` | `@verdeect/platform-client` — публичный контракт ядра |
| `src/core/client.ts` | `createPlatformAuthzClient`: оркестровка кэша, свежести и запросов |
| `src/nest/index.ts` | `@verdeect/platform-client/nest` — модуль, декоратор, guard |
| `src/testing/index.ts` | `@verdeect/platform-client/testing` — `createFakePlatform` |
| `test/contract/support/global-setup.ts` | стенд слоя C и отчёт коммита Platform (D10) |
| `scripts/publish.mjs` | публикация из CI по тегу |
| `package.json` | `exports` трёх подпутей, peer-зависимости |
| `Makefile` | единая точка входа для проверок (`make ci`, `make test-full`, уровни тестов) |

## Документация

| Документ | Путь | Описание |
|---|---|---|
| PRD | `requirements/0000-platform-client/prd.md` | требования к библиотеке |
| Этапы | `requirements/0000-platform-client/README.md` | E1 «Ядро клиента», E2 «Nest и подделка», E3 «Контракт и выпуск» |
| Индекс требований | `requirements/INDEX.md` | список пакетов требований |
| README | `README.md` | установка, подключение, тесты потребителя, совместимость, API |
| Ядро | `docs/getting-started.md` | клиент, токен, решение, события, кэш, метрики |
| NestJS | `docs/nestjs.md` | модуль, `@RequirePermission`, ответы guard |
| Тесты сервиса | `docs/testing.md` | `createFakePlatform`, условие `development` |
| Ошибки | `docs/errors.md` | коды решений, ошибки, fail-closed |
| Выпуск | `docs/releasing.md` | чек-лист выпуска, Trusted Publishing, ручной 1.0.0 |

## Файлы контекста ИИ

| Файл | Назначение |
|---|---|
| `AGENTS.md` | эта карта репозитория |
| `.ai-factory/DESCRIPTION.md` | описание проекта, стек, интеграции, нефункциональные требования |
| `.ai-factory/ARCHITECTURE.md` | архитектура, правила зависимостей между точками входа |
| `.ai-factory/rules/base.md` | соглашения кода |
| `.ai-factory/config.yaml` | настройки AI Factory (язык, git) |

## Внешние образцы и источники

- `/home/administrator/projects/verdeect2/verdeect-auth` — образец пакета: `package.json`, tsconfig, eslint, prettier, Vitest, Makefile, `ci.yml`, `scripts/publish.mjs`, `docs/`, подпуть `testing`.
- `/home/administrator/projects/verdeect2/verdeect-platform` — источник копий:
  - `apps/platform/src/modules/catalog/domain/` — коды, каталог и `limits.ts`;
  - `apps/platform/contracts/events/*.schema.json` — схемы событий;
  - `apps/platform/src/modules/authz/http/` — ответы `authz`;
  - образ для слоя C.

## Правила для агентов

- Не объединяйте shell-команды через `&&`, `||` или `;`. Каждая команда — отдельный вызов.
  - Неправильно: `git checkout main && git pull`
  - Правильно: сначала `git checkout main`, затем `git pull origin main`
- Источник истины контракта — PRD §3, а за ним — `platform-lite/prd.md` v1.11 и код `verdeect-platform`. При расхождении сначала правится источник, потом PRD, потом код.
- Ядро (`src/core/`) не импортирует `@nestjs/*`, `rxjs`, `reflect-metadata`, `@verdeect/auth`, `src/nest/`, `src/testing/`. `src/nest/` не импортирует `src/testing/`.
- Копии из `verdeect-platform` не правятся вручную, только синхронизируются с источником. Коммит источника указывается в шапке.
- Новый публичный экспорт добавляется вместе с TSDoc, строкой в README и в CHANGELOG. До первого выпуска (в CHANGELOG только `[Unreleased]`) достаточно TSDoc и записи в `[Unreleased]`; README обязателен с вехи выпуска.
- Уровни тестов: во время работы — `make test` и `make test-module M=…` по затронутым файлам; перед `/aif-commit` и слиянием — `make test-full` (слой C — `PLATFORM_DIR=<worktree origin/main Platform>`, `../verdeect-platform` не переключать). `make test-timing` — на тихой машине. На загруженной машине — `TEST_TIMEOUT_SCALE=2..3` локально; тайм-ауты в spec-файлах не поднимать, тест, упавший по тайм-ауту, сначала перезапустить отдельно.
- У слоя C нет проектов Vitest `shared` / `isolated` («Fast Test Suites» (3)): 4 файла делят один стенд `globalSetup` и идут по очереди (`fileParallelism: false`); время уходит на сборку образа и стенд, а не на импорт модулей; файлы не пишут `process.env`, не используют `vi.mock` / `vi.stubEnv` и не патчат прототипы. Проекты понадобятся, если появятся такие файлы или заметное время импорта.
- `test/unit/package-manifest.spec.ts` (NFR-4: `dependencies` — только zod, peer optional) — тест требования, читает `package.json` без запуска приложения; остаётся в слое U. Проверок lockfile или `pnpm why` в тестах нет, поэтому `make analyse` — только `tsc --noEmit`.
- Выпуск — только тег `vX.Y.Z` и CI. Перед тегом нужен зелёный `make test-full` против текущего `main` Platform (D10; `make test-contract` — псевдоним только слоя C). Ручной `npm publish` запрещён, исключение — 1.0.0 (D1).
- Для `.ts`-файлов используйте скилы `nestjs-specialist` и `nestjs-code` (для компонентов библиотеки — тип `generic`).
