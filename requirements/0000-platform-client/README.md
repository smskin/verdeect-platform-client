# 0000-platform-client — библиотека `@verdeect/platform-client`

Клиент авторизации Platform для сервисов Вердикта 2.0 (Orchestrator, Files, Media): решение по праву локально из кэша снимка `POST /v1/authz/permissions`, сброс по `platform.policy.changed`, свежесть через `minEpoch`, guard `@RequirePermission` для NestJS, подделка Platform для тестов потребителей.

- **Режим:** INIT (новый репозиторий `verdeect2/verdeect-platform-client`, GitHub `smskin/verdeect-platform-client`)
- **Ревизия:** r2 · 2026-10-27 · PRD v1.8
- **Источник истины:** `prd.md`; контракт Platform — `platform-lite/prd.md` v1.11 (§5.6, §6.1, §7.1–7.3, §9.2, §11, §15), код — `verdeect-platform` `main` `7adb423`
- **Стек:** TypeScript (ESM, Node ≥ 22.12) · `zod` 4.6.7 · NestJS 12 и `@verdeect/auth` ^1.0.1 (необязательные peer) · Vitest · Testcontainers (только слой C, локально) · pnpm
- **Специалисты:** `nestjs-specialist`, `nestjs-code`, `nestjs-generate-documentation`
- **Образцы:** `/home/administrator/projects/verdeect2/verdeect-auth` (пакет, CI, выпуск, `testing`); `/home/administrator/projects/verdeect2/verdeect-platform` (источник копий: коды, каталог, JSON Schema; образ для слоя C)

## Файлы

| Файл | Что внутри |
|---|---|
| `prd.md` | D1–D11, цели и не-цели, контракт Platform (§3), репозиторий (§4), API пакета (§5), UC-1–UC-4, стенд слоя C и AC-1–AC-19 (§7), NFR-1–NFR-6, этапы, открытые вопросы |

## Этапы

| № | Этап | Содержание | UC | AC | Режим плана | Зависит от |
|---|---|---|---|---|---|---|
| E1 | Ядро клиента | каркас пакета по образцу `verdeect-auth` (`package.json` с `exports` `.`/`./nest`/`./testing`, tsconfig, eslint, prettier, конфиги Vitest — unit и perf); §3, §5.1–5.3: типы и схемы, копия кодов (`src/core/codes.ts`), кэш и LRU, объединение запросов, `minEpoch` и `lastSeenEpoch`, «Приём ответа», локальное решение и `checkMany`, `fresh`, `raw`, `clear`, `onPolicyChanged`, `clientCredentials` с `refresh`, ошибки, логгер, метрики, проверка настроек; D3–D9; NFR-1–NFR-4. Makefile и CI — нет (после этапа, 5.1a); Docker — не нужен | — (ядро для UC-1–UC-3) | AC-1–AC-7, AC-7a, AC-7b, AC-8, AC-8b, AC-9, AC-11, AC-15 (U), AC-17, AC-18, AC-19 | ultra | — |
| E2 | Nest и подделка | §5.4: `PlatformAuthzModule`, `@RequirePermission`, `PermissionGuard` (D11), тексты ответов; §5.5: `createFakePlatform` с `setModule`, копия каталога (`src/testing/catalog.ts`), условие `development`; проект-потребитель `test/consumer` | UC-1–UC-4 | AC-8a, AC-10, AC-12 | full | E1 |
| E3 | Контракт и выпуск | стенд слоя C (§7) и контрактные тесты против Platform `7adb423`+; цель `make test-contract`; доработка `ci.yml` из 5.1a до publish (D1, NFR-6), `scripts/publish.mjs`, `docs/` (в том числе `releasing.md`), README (подключение, тесты потребителя, таблица совместимости — NFR-5), CHANGELOG; NFR-5, NFR-6 | — (сквозная проверка UC-1, UC-2) | AC-13, AC-14, AC-15 (C), AC-16 | full | E2 |

Выпуск 1.0.0 (тег `v1.0.0`) — вручную после E3, затем `npm trust` и запрет публикации токенами (D1). Следом — подключение пакета в Orchestrator, Files, Media (их чаты).

## Готовность (Definition of Ready)

| # | Пункт | Статус |
|---|---|---|
| R1 | Описание | ✅ §1–§2 |
| R2 | Use cases | ✅ UC-1–UC-4: актор, предусловие, шаги, альтернативные потоки, результат |
| R3 | Критерии приёмки | ✅ AC-1–AC-19, ссылки на UC/D/NFR; формат сжатый (без Given/When/Then) — как у PRD Identity и Platform |
| R4 | Макеты | — (UI нет) |
| R5 | Роли и права | ✅ §5.4 — таблица ответов по видам токенов, включая «без токена» |
| R6 | Данные | ✅ кэш и ключи (§5.3); БД нет |
| R7 | Контракт | ✅ §3 (Platform), §5 (API пакета) |
| R8 | Открытые вопросы | ✅ влияющих нет; `[OPEN]` — kit, резерв лимитов; `[ASSUMPTION]` — `exposeHostPorts` (проверка первой задачей E3) |
| R9 | Изменение | — (новая библиотека) |
| R10 | Тестовые данные | — (UI нет; данные слоя C — стенд §7) |
| R11 | Этапы | ✅ каждый UC — в E2 (E1 — фундамент ядра, E3 — сквозная проверка); каждый AC — ровно в одном этапе (AC-15 разделён на U в E1 и C в E3) |
| R12 | Визуальная проверка | — (UI нет) |

Желательные: NFR — ✅ NFR-1–NFR-6; безопасность — ✅ (токены и секреты не в логах, AC-19); аудит, уведомления, i18n — не применимо.

## История ревизий

- r1 — 2026-10-27: первая выдача; PRD v1.7 (v1.3 — сверка с Platform v1.11 и кодом; v1.4–v1.7 — четыре `/prd-review`).
- r2 — 2026-10-27: вопрос из планирования E1 — метрика `request('token', …)` из `metrics` в опциях `clientCredentials` (§5.1, AC-18); PRD v1.8.
