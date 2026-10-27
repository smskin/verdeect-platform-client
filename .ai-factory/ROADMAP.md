# Roadmap проекта

> Библиотека `@verdeect/platform-client` — клиент авторизации Platform для сервисов Вердикта 2.0: решение по праву из кэша снимка, Nest-guard `@RequirePermission` и подделка Platform для тестов потребителей.

## Этапы

- [x] **E1 Ядро клиента** — каркас пакета по образцу `verdeect-auth` (`package.json` с `exports` `.`/`./nest`/`./testing`, tsconfig, eslint, prettier, конфиги Vitest — unit и perf); §3, §5.1–5.3: типы и схемы, копия кодов (`src/core/codes.ts`), кэш и LRU, объединение запросов, `minEpoch` и `lastSeenEpoch`, «Приём ответа», локальное решение и `checkMany`, `fresh`, `raw`, `clear`, `onPolicyChanged`, `clientCredentials` с `refresh`, ошибки, логгер, метрики, проверка настроек; D3–D9; NFR-1–NFR-4. Makefile и CI — нет (после этапа, 5.1a); Docker — не нужен · requirements/0000-platform-client · — (ядро для UC-1–UC-3), AC-1–AC-7, AC-7a, AC-7b, AC-8, AC-8b, AC-9, AC-11, AC-15 (U), AC-17, AC-18, AC-19
- [x] **E2 Nest и подделка** — §5.4: `PlatformAuthzModule`, `@RequirePermission`, `PermissionGuard` (D11), тексты ответов; §5.5: `createFakePlatform` с `setModule`, копия каталога (`src/testing/catalog.ts`), условие `development`; проект-потребитель `test/consumer` · requirements/0000-platform-client · UC-1–UC-4, AC-8a, AC-10, AC-12
- [x] **E3 Контракт и выпуск** — стенд слоя C (§7) и контрактные тесты против Platform `7adb423`+; цель `make test-contract`; доработка `ci.yml` из 5.1a до publish (D1, NFR-6), `scripts/publish.mjs`, `docs/` (в том числе `releasing.md`), README (подключение, тесты потребителя, таблица совместимости — NFR-5), CHANGELOG; NFR-5, NFR-6 · requirements/0000-platform-client · — (сквозная проверка UC-1, UC-2), AC-13, AC-14, AC-15 (C), AC-16

## Завершено

| Этап | Дата |
|------|------|
| E1 Ядро клиента | 2026-10-27 |
| E2 Nest и подделка | 2026-10-28 |
| E3 Контракт и выпуск | 2026-10-28 |

## Requirements Map

| Этап | Пакет | UC | AC | Зависит от |
|------|-------|----|----|------------|
| E1 Ядро клиента | requirements/0000-platform-client | — (ядро для UC-1–UC-3) | AC-1–AC-7, AC-7a, AC-7b, AC-8, AC-8b, AC-9, AC-11, AC-15 (U), AC-17, AC-18, AC-19 | — |
| E2 Nest и подделка | requirements/0000-platform-client | UC-1–UC-4 | AC-8a, AC-10, AC-12 | E1 |
| E3 Контракт и выпуск | requirements/0000-platform-client | — (сквозная проверка UC-1, UC-2) | AC-13, AC-14, AC-15 (C), AC-16 | E2 |
