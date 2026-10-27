# Базовые правила проекта

> Кода пока нет. Соглашения взяты из образца `verdeect-auth`, скила `nestjs-specialist` (в объёме библиотеки) и PRD `requirements/0000-platform-client/prd.md`. После E1 сверьте их с кодом и при необходимости поправьте.

## Соглашения об именовании

- Файлы: kebab-case, у Nest-компонентов — суффикс роли (`platform-authz.module.ts`, `permission.guard.ts`, `require-permission.decorator.ts`). У ядра суффикса нет (`client.ts`, `cache.ts`, `decide.ts`, `token-provider.ts`). Раскладка — PRD §4.
- Тесты лежат в `test/` по слоям: `test/unit` и `test/perf` (слой U), `test/contract` (слой C), `test/consumer`. Файлы — `*.spec.ts`.
- Переменные и функции: camelCase (`createPlatformAuthzClient`, `clientCredentials`, `createFakePlatform`, `lastSeenEpoch`).
- Константы модуля: SCREAMING_SNAKE (`DEFAULT_CACHE_TTL_SEC`, `TOKEN_EXPIRY_SKEW_SEC`). DI-токены — `Symbol('…')` с тем же именем.
- Классы и типы: PascalCase (`PlatformAuthzClient`, `PermissionGuard`, `PlatformUnavailableError`). Вместо `enum` — союзы строковых литералов (`DecisionCode`, `GeneralDenyCode`).
- Декораторы NestJS — PascalCase-фабрики (`RequirePermission(...)`).
- Коды решений и ошибок — SCREAMING_SNAKE строки, дословно как у Platform и `@verdeect/auth` (`FORBIDDEN`, `PLAN_MODULE`, `PLATFORM_UNAVAILABLE`, `UNKNOWN_PERMISSION`).

## Структура модулей

- `src/core/` — ядро (точка входа `.`). Из внешних пакетов — только `zod`. Не импортирует `@nestjs/*`, `rxjs`, `reflect-metadata`, `@verdeect/auth`, `src/nest/`, `src/testing/`.
- `src/nest/` — адаптер NestJS (`./nest`). Зависит от ядра, `@nestjs/*` и `@verdeect/auth/nest`. Не импортирует `src/testing/`.
- `src/testing/` — подделка Platform (`./testing`). Зависит только от ядра. Рабочий код её не импортирует.
- Каждая точка входа — `index.ts` с явным списком реэкспортов (`export { … }`, `export type`). Zod-схемы (`schemas.ts`) не экспортируются.
- Копии из `verdeect-platform` (`src/core/codes.ts`, `src/testing/catalog.ts`, `test/fixtures/*.schema.json`) правятся только синхронизацией с источником. В шапке копии — путь к источнику и коммит.
- ESM: относительные импорты с суффиксом `.js`. Типы — через `import type`.

## Обработка ошибок

- Ошибки домена — только `PlatformUnavailableError` (`code = 'PLATFORM_UNAVAILABLE'`) и `PlatformContractError` (`code` — код Platform, код OAuth или локальный код). Какая ситуация к какой ошибке относится — PRD §5.1.
- Fail-closed (D6): если годного снимка нет, кэш ошибку не маскирует. Снимок с истёкшим сроком не отдаётся. `fresh` и `raw.*` передают ошибку вызывающему.
- Неверные настройки → `TypeError` при создании клиента: имена параметров есть, значений нет. `@RequirePermission()` без прав → `TypeError` при объявлении.
- `onPolicyChanged` не бросает исключений: неверный конверт → `warn` и метрика `invalid`.
- Guard переводит ошибки в `HttpException` с телом `{error: {code, message, details: {}}}` по таблице §5.4. Внутренние причины клиенту не раскрываются.
- Неудачи не кэшируются: ни токен, ни ответ не по схеме, ни `PlatformContractError`.

## Поток управления

- Prefer flat, readable control flow over deeply nested conditionals. Use guard clauses, early `return`/`continue`, small named helper methods, or explicit classification logic when they make the code easier to follow. Handle edge cases and irrelevant branches early so the main path stays visible.
- Шаги локального решения (§5.2) и «Приёма ответа» в коде идут в том же порядке, что в PRD. Номер шага указан в комментарии.
- Всегда фигурные скобки (`curly: all`), однострочных `if` нет.

## Логирование

- Ядро пишет только через внедрённый `logger` (`debug/warn/error`, сигнатура pino). Если `logger` не передан, ядро молчит. `PlatformAuthzModule` без явного `logger` использует обёртку над `new Logger('PlatformAuthz')`.
- Разрешены `sub`, `tenantId`, `permission`, `code`, `endpoint`. На уровне `debug` для агента — ещё `asid` и `wid`. Запрещены токен, `Authorization`, `clientSecret` и тело ответа Identity.
- Ограничение частоты (NFR-3):
  - `error` — не чаще раза в 60 с на код;
  - `warn` о недоступности — не чаще раза в 10 с на `endpoint`, с полем `suppressed`;
  - `PEP_AHEAD`, `STALE_SNAPSHOT` и неверный конверт — без ограничения.
- `testing` не логирует.

## Тесты

- Vitest. Jest не используется. Конфиги:
  - `vitest.config.ts` — unit;
  - `vitest.perf.config.ts` — perf, `--expose-gc`;
  - `vitest.package.config.ts` — проверки пакета;
  - отдельный — контракт.
- Имена `describe`/`it` начинаются с ID критерия или сценария: `AC-6: …`, `UC-2: …`, `D5: …`.
- Unit-тесты работают без сети и Docker: внедряются `fetch` и `clock`, для Nest — `@nestjs/testing`.
- Слой C (Testcontainers, образ `verdeect-platform`) запускается только локально через `make test-contract`. В CI его нет.

## Комментарии и документация в коде

- Первая строка файла — комментарий `//` с назначением и ссылками на требования (`prd.md §5.2`, `D5`, `AC-6`).
- TSDoc `/** … */` — у каждого публичного экспорта и его полей. Проверяет ESLint.
- Комментарии и документация — на русском, идентификаторы — на английском.

## Стиль кода

- Prettier: отступ 4 пробела (в yaml, json и md — 2), одинарные кавычки, точки с запятой, ширина строки 100, висячие запятые, `lf`.
- `readonly` — у полей публичных интерфейсов и параметров конструктора. `any` запрещён. Недоверенный ввод — `unknown` и проверка zod.
- Зависимости:
  - `zod` и все `devDependencies` — точные версии;
  - peer-зависимости — диапазоны `^`, все `optional` (NFR-4);
  - `minimumReleaseAge` pnpm — значение по умолчанию (сутки). Исключения — только с обоснованием и условием снятия.
