# AGENTS.md

> Карта репозитория для ИИ-агентов и новых разработчиков. Обновляйте её при заметных изменениях структуры. Раздел «Документация» ведёт `/aif-docs`.

## Обзор проекта

`@verdeect/platform-client` — npm-библиотека для сервисов Вердикта 2.0. Ядро решает, есть ли у участника право, локально из кэша снимка `POST /v1/authz/permissions` Platform. Подпуть `nest` даёт guard `@RequirePermission`, подпуть `testing` — подделку Platform. Подробности — `.ai-factory/DESCRIPTION.md`.

## Технологический стек

- **Язык:** TypeScript (ESM, Node ≥ 22.12; CI — Node 22 и 24)
- **Runtime-зависимость:** `zod` 4.6.7, единственная
- **Фреймворк:** NestJS 12 и `@verdeect/auth` ^1.0.1 — необязательные peer-зависимости подпути `nest`
- **Тесты:** Vitest (unit, perf с `--expose-gc`, проверки пакета). Testcontainers — только контрактные тесты, локально.
- **Пакетный менеджер:** pnpm
- **CI и выпуск:** GitHub Actions. Публикация — через npm Trusted Publishing, только по тегу `v<semver>`.
- **БД, ORM, брокер, Docker, HTTP-сервер:** нет, это библиотека.

## Структура проекта

Этапы E1 (ядро) и E2 (Nest и подделка) готовы. Помеченное «(E3)» появится на этапе E3 (PRD §4).

```
verdeect-platform-client/
├── src/
│   ├── core/                     # ядро — точка входа "."; только zod
│   │   ├── index.ts              # публичный контракт ядра (явный список реэкспортов)
│   │   ├── types.ts              # публичные интерфейсы TS (§3.2, §5.1)
│   │   ├── codes.ts              # копия decision-codes.ts Platform (источник + коммит)
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
│   │   └── support/              # подделанные fetch, часы, logger, metrics, TokenProvider; nest-app.ts; setup.ts (AC-19)
│   ├── perf/                     # check.perf.spec.ts — p99 и память снимка (AC-17)
│   ├── fixtures/                 # platform-events.schema.json (копия Platform), SOURCES.md
│   ├── contract/                 # (E3) слой C против образа verdeect-platform; support/platform-stand.ts
│   ├── package/                  # проверки архива (AC-12): consumer.spec.ts, support/pack.ts, consumer-project.ts
│   └── consumer/                 # шаблоны проектов-потребителей архива: core, nest-no-auth, full
├── docs/                         # (E3) getting-started, nestjs, testing, errors, releasing
├── scripts/publish.mjs           # (E3) публикация из CI
├── .github/workflows/ci.yml      # (после E1, по образцу verdeect-auth)
├── package.json                  # exports трёх подпутей, peer-зависимости optional
├── pnpm-workspace.yaml           # настройки pnpm
├── tsconfig.json / tsconfig.build.json
├── eslint.config.js / .prettierrc.json
├── vitest.config.ts / vitest.perf.config.ts / vitest.package.config.ts
├── Makefile                      # install, lint, analyse, test, build, pack-check, ci, clean
├── requirements/                 # пакеты требований
│   ├── INDEX.md
│   └── 0000-platform-client/     # prd.md, README.md (этапы E1–E3)
├── .ai-factory/                  # контекст AI Factory
├── .claude/                      # скилы и агенты Claude Code
├── .serena/                      # настройки Serena MCP
└── .mcp.json                     # MCP-серверы проекта
```

## Команды

Единая точка входа — `Makefile` (`make help`), все цели на хосте:

```bash
make install         # pnpm install --frozen-lockfile
make lint            # ESLint (TSDoc, границы ядра) + Prettier check
make analyse         # tsc --noEmit
make test            # слой U (test/unit), затем perf AC-17; make test FILTER='AC-6'
make build           # dist/ (.js + .d.ts)
make pack-check      # publint --strict + attw esm-only + проекты-потребители (AC-12)
make test-package    # только проекты-потребители упакованного архива (после build)
make ci              # lint analyse test build pack-check
make clean           # dist, coverage, *.tgz
```

`make test-contract` (слой C) появится в E3, CI — после `/aif-ci`.

## Ключевые точки входа

| Файл | Назначение |
|---|---|
| `requirements/0000-platform-client/prd.md` | источник требований: D1–D11, контракт Platform §3, API §5, AC-1–AC-19, NFR-1–NFR-6 |
| `requirements/0000-platform-client/README.md` | этапы E1–E3, готовность |
| `src/core/index.ts` | `@verdeect/platform-client` — публичный контракт ядра |
| `src/core/client.ts` | `createPlatformAuthzClient`: оркестровка кэша, свежести и запросов |
| `src/nest/index.ts` | `@verdeect/platform-client/nest` — модуль, декоратор, guard |
| `src/testing/index.ts` | `@verdeect/platform-client/testing` — `createFakePlatform` |
| `package.json` | `exports` трёх подпутей, peer-зависимости |
| `Makefile` | единая точка входа для проверок (`make ci`, `make test-contract`) |

## Документация

| Документ | Путь | Описание |
|---|---|---|
| PRD | `requirements/0000-platform-client/prd.md` | требования к библиотеке |
| Этапы | `requirements/0000-platform-client/README.md` | E1 «Ядро клиента», E2 «Nest и подделка», E3 «Контракт и выпуск» |
| Индекс требований | `requirements/INDEX.md` | список пакетов требований |

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
  - `apps/platform/src/modules/catalog/domain/` — коды и каталог;
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
- Выпуск — только тег `vX.Y.Z` и CI. Перед тегом нужен зелёный `make test-contract` против текущего `main` Platform (D10). Ручной `npm publish` запрещён, исключение — 1.0.0 (D1).
- Для `.ts`-файлов используйте скилы `nestjs-specialist` и `nestjs-code` (для компонентов библиотеки — тип `generic`).
