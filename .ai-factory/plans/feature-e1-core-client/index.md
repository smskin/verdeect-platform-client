<!-- aif:plan-mode:ultra -->
# Ultra-план реализации: E1 «Ядро клиента» `@verdeect/platform-client`

Mode: ultra
Branch: feature/e1-core-client
Created: 2026-10-27

## Original Request
Реализуй этап roadmap «E1 Ядро клиента» по пакету требований requirements/0000-platform-client/ (ревизия r1, PRD v1.7).

Скоуп этапа: AC-1–AC-7, AC-7a, AC-7b, AC-8, AC-8b, AC-9, AC-11, AC-15 (только часть U), AC-17, AC-18, AC-19; D2–D9; NFR-1–NFR-4; prd.md §3 (контракт Platform: типы ответов, zod-схемы, коды и тексты), §5.1–5.3 целиком (createPlatformAuthzClient и проверка настроек, TokenProvider с refresh и clientCredentials с client_secret_basic, ошибки PlatformUnavailableError / PlatformContractError, logger и ограничение warn, PlatformClientMetrics, check и checkMany, «Приём ответа», объединение запросов по (ключ, minEpoch), lastSeenEpoch с LRU, refreshAfter, fresh, raw, clear, onPolicyChanged). Каркас пакета — по образцу /home/administrator/projects/verdeect2/verdeect-auth: package.json (exports «.», «./nest», «./testing» — у testing только {types, development}, без default; engines node ≥ 22.12; packageManager pnpm; dependencies — только zod 4.6.7; peer — по NFR-4), tsconfig, tsconfig.build.json, eslint, prettier, vitest.config.ts и vitest.perf.config.ts (--expose-gc); src/nest и src/testing в этом этапе — пустые точки входа (их содержимое — E2). Копии из /home/administrator/projects/verdeect2/verdeect-platform (main 7adb423) с путём источника и коммитом в шапке: apps/platform/src/modules/catalog/domain/decision-codes.ts → src/core/codes.ts; apps/platform/contracts/events/platform-events.schema.json → test/fixtures/ (для AC-15 U, ajv — devDependency). Makefile, CI и Docker в этап НЕ входят: Makefile и CI генерируют /aif-build-automation и /aif-ci после этапа, Docker библиотеке не нужен; тесты запускаются скриптами pnpm. Остальное из пакета — другие этапы. Источник истины — requirements/0000-platform-client/prd.md; приоритет при конфликте: prd.md > ROADMAP/DESCRIPTION; если prd.md расходится с кодом verdeect-platform — остановись и спроси меня. Покрой все требования скоупа; ссылайся на их ID в задачах и в названиях тестов. Открытые вопросы [OPEN] не додумывай — спроси меня. Фазы должны оставлять проект в рабочем состоянии: тесты зелёные после каждой фазы.

## Settings
- Testing: yes (обязательно для пакета требований — skill-context «Mandatory Test Phases», «Library Package Scope»)
- Logging: verbose — все `debug`-события NFR-3 плюс `warn`/`error` с ограничением частоты; уровни задаёт NFR-3, логгер внедряется
- Docs: no — `WARN [docs]` без обязательного чекпоинта; README, `docs/`, CHANGELOG — этап E3; в E1 — TSDoc (проверяет ESLint) и `AGENTS.md` (Task 30)

## Roadmap Linkage
Milestone: "E1 Ядро клиента"
Rationale: План реализует ровно скоуп E1 из `requirements/0000-platform-client/README.md` и `.ai-factory/ROADMAP.md`; E2 (Nest, подделка) и E3 (контракт, выпуск) — вне плана.

## Requirements Reconciliation
Authority: `requirements/0000-platform-client/prd.md` **v1.8 (r2)** > `.ai-factory/ROADMAP.md` / `.ai-factory/DESCRIPTION.md`; раскладка и правила зависимостей — `.ai-factory/ARCHITECTURE.md`, соглашения — `.ai-factory/rules/base.md`. Контракт Platform §3 сверен с кодом `verdeect-platform` `7adb423` (`rs-member-permissions.ts`, `r-check-permission.ts`, `r-member-permissions.ts`, `decision.ts`, `decision-codes.ts`, `platform-events.schema.json`, `drizzle/0000_tables.sql`): **расхождений нет**. Единственный пробел PRD (метрика `request('token', …)` при сигнатуре `clientCredentials` без `metrics`) закрыт пользователем ревизией r2 / PRD v1.8 (коммит `be9ef82`) — план следует v1.8.

**Milestone scope:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-7a, AC-7b, AC-8, AC-8b, AC-9, AC-11, AC-15 (U), AC-17, AC-18, AC-19; D2, D3, D4, D5, D6, D7, D8, D9; NFR-1, NFR-2, NFR-3, NFR-4; §3, §5.1–5.3. Вне скоупа (другие этапы): AC-8a, AC-10, AC-12 (E2); AC-13, AC-14, AC-15 (C), AC-16 (E3); D1, D10, D11; NFR-5, NFR-6; §5.4, §5.5, §7 «Стенд». UC-1–UC-4 — в E2; в E1 реализуется ядро, на котором они стоят (их альтернативные потоки, касающиеся ядра, покрыты AC выше).

**Открытые вопросы:** `[OPEN]` п. 1 (`@verdeect/kit`) и п. 2 (`reserve/commit/release`) — вне E1, не планируются. `[ASSUMPTION]` п. 3 (`exposeHostPorts`) — слой C, E3. Блокирующих вопросов нет.

| Решение / поддерживаемая комбинация | Источник | Проверка |
|---|---|---|
| Тело `permissions` — `sub, tenant, tenantId, act` + `minEpoch = max(lastSeenEpoch, pep)` (если известно); без `pep`, `asid`, `wid` | prd.md §3.2, D5 | Task 27: AC-6 «один запрос с `minEpoch: 9` и без `pep`»; Task 28: AC-19 «запрос к Platform — без `asid`/`wid`» |
| Человек × снимка нет → запрос; × снимок живой → из кэша; × истёк → запрос | §5.2 шаг 2, §5.3, D6 | Task 26 AC-1; Task 23 TTL |
| Агент × `pep` нет → `PEP_REQUIRED`; `pep` не целое ≥ 1 → `VALIDATION_FAILED`; без запроса | §5.2 шаг 1 | Task 23, Task 27 AC-6 |
| Снимок общий отказ (любой `act`) → решение снимка для всех прав, право не проверяется | §5.2 шаг 3 | Task 23 AC-8/AC-8b; Task 28 AC-8 |
| Снимок-разрешение × право вне каталога → `UNKNOWN_PERMISSION` (первое по порядку) | §5.2 шаг 4, `checkMany` | Task 23, Task 28 AC-8b |
| Агент × `pep < epoch` → `CONTEXT_REVOKED` без запроса | §5.2 шаг 5, D5 | Task 27 AC-6 |
| Агент × `pep > epoch` × снимок запрошен с `minEpoch < pep` × `refreshAfter` нет/прошёл → повторное чтение с `minEpoch = max(lastSeen, pep)` | §5.2 шаг 5 | Task 27 AC-6, AC-7 |
| То же × Platform недоступен → решение по снимку, `refreshAfter = now + denyTtl`, `warn PLATFORM_UNAVAILABLE`; срок снимка не меняется | §5.2 шаг 5, D6 | Task 27 AC-7 (4 с / 6 с / 54 с / 56 с) |
| То же × `PlatformContractError` → вызывающему | §5.2 шаг 5 | Task 24 (ветка `throw`), Task 28 AC-7a |
| Агент × `pep > epoch` × снимок уже запрошен с `minEpoch ≥ pep` → решение по снимку без запроса | §5.2 шаг 5 | Task 27 AC-6 (`PEP_AHEAD`, 4 с без запросов) |
| «Приём ответа»: `epoch = null` → кэш на `denyTtl`, `lastSeenEpoch` не меняется (п. 0) | §5.2 | Task 23, Task 26 AC-3 |
| «Приём ответа»: `epoch < lastSeenEpoch` → `STALE_SNAPSHOT`, вызывающему, не в кэш, `warn`, `stale` (п. 1, раньше п. 2) | §5.2 | Task 23, Task 27 AC-5, AC-6 |
| «Приём ответа»: `epoch < minEpoch` → кэш на `denyTtl`, `warn PEP_AHEAD` (п. 2) | §5.2 | Task 23, Task 27 AC-6 |
| «Приём ответа»: иначе → `cacheTtl` (разрешение) / `denyTtl` (общий отказ) (п. 3) | §5.2 | Task 23, Task 26 AC-1, AC-3 |
| Запись: живой снимок с большей эпохой не затирается; равная — заменяет; `null` ниже любой | §5.2 «Объединение» | Task 23, Task 27 AC-6 |
| Объединение: только тот же ключ, то же поколение, `inflight.minEpoch ≥ нужного` | §5.2, §5.1 `clear()` | Task 23, Task 26 AC-2, AC-19, Task 27 AC-6 |
| `fresh` × снимок в кэше → запрос мимо кэша с `minEpoch = lastSeen`, ответ в кэш; × ошибка → вызывающему | §5.1 `fresh`, D6 | Task 27 AC-7, Task 28 AC-7b |
| `raw.*` → тело как есть, кэш не трогается, 401 → refresh + повтор, `raw.permissions` по схеме | §5.1 `raw.*` | Task 28 AC-7b |
| Событие × `subs` → снимки этих `sub` (human и agent); × без `subs` или `[]` → вся компания; удаляются только с `epoch < event.epoch` или `null` | §5.3, D4 | Task 23, Task 26 AC-4 |
| Событие × эпоха > `lastSeenEpoch` → `applied`, иначе `ignored`; неверный конверт → `warn` + `invalid`, без исключения | §5.1 «Метрики», §5.3 | Task 26 AC-4, Task 28 AC-18 |
| Ответ Platform: 200 по схеме → ok; 200 не по схеме/не JSON → `INVALID_RESPONSE`; 401 → refresh + 1 повтор → 401 → Unavailable; 403/404/422/прочие 4xx → `PlatformContractError` (код Platform или `HTTP_<status>`); 5xx/таймаут/обрыв → Unavailable | §5.1 «Ответы Platform» | Task 20, Task 27 AC-7, Task 28 AC-7a |
| Identity: 200 по схеме → кэш до `exp − 30 с`; 5xx/429/таймаут/сеть → Unavailable; прочие 4xx → `PlatformContractError(error)`; не по схеме → `INVALID_RESPONSE`; неудача не кэшируется | §5.1 `clientCredentials` | Task 19 AC-9 |
| Метрика `request('token', …)` — только `clientCredentials` из своего `metrics`, только на HTTP-запрос | prd.md v1.8 §5.1, AC-18 | Task 19 AC-18 |

**Репрезентативные реальные артефакты:** коды `decision-codes.ts` и JSON Schema `platform-events.schema.json` копируются из коммита `7adb423`. AC-11 сверяет копию кодов с источником, если рядом есть `verdeect-platform`. AC-15 (U) гоняет образцы через настоящую схему Platform (ajv 2020-12 + formats).

## Architecture and Decisions
- **Раскладка** — ARCHITECTURE.md: `src/core/{types,codes,errors,schemas,options,log-limiter,transport,token-provider,cache,decide,client,index}.ts`; `src/nest/index.ts` и `src/testing/index.ts` пустые до E2. Тесты — в `test/unit` (U), `test/perf` (AC-17), `test/fixtures` (prd.md §4), а не рядом с кодом.
- **`exports["."]` → `dist/core/index.*`.** Ядро лежит в `src/core` (prd.md §4). Формулировку AC-12 «`dist/index.js`» E2 трактует как «цель `exports["."]`».
- **Схемы без zod в `.d.ts`.** `schemas.ts` экспортирует только функции `parse*`, типы которых не ссылаются на zod (NFR-4, подготовка AC-12). Проверка — `grep` по `dist/**/*.d.ts` в Task 30.
- **Копии из Platform** с шапкой «источник @ коммит». `codes.ts` — в `.prettierignore` и без правила TSDoc. JSON-копия — побайтно, источник указан в `test/fixtures/SOURCES.md`, так как в JSON нет комментариев.
- **Коды `PlatformContractError`, не названные в PRD:** `INVALID_RESPONSE` (ответ не по схеме или не JSON), `HTTP_<status>` (тело без кода Platform/OAuth), `VALIDATION_FAILED` с `details.field` (`pep`, `permissions`).
- **Поля `PlatformUnavailableError`:** `endpoint` и `reason` (`network | timeout | http_5xx | http_429 | unauthorized`) — аддитивно к `code` из §5.1.
- **Время:** TTL, окна логов и длительности для метрик меряет внедрённый `clock` (мс). Единственный таймер — таймаут запроса (`setTimeout` + `AbortController`). Первый ответ 401 считается в метрике как `unavailable`, повтор — отдельным вызовом.
- **Логи:** `warn PLATFORM_UNAVAILABLE` пишет транспорт (одно место, ограничение по `endpoint`, в том числе `token`). `error PlatformContractError` пишет обёртка публичных методов клиента (ограничение по коду, покрывает и локальные коды). `STALE_SNAPSHOT`, `PEP_AHEAD` и неверный конверт пишутся без ограничения.
- **Каркас без задела на E2:** в `devDependencies` нет SWC, `@nestjs/*`, `@verdeect/auth`, `publint`, `attw`; их добавят E2 и E3. Peer-зависимости объявлены уже сейчас (NFR-4).
- **Память снимка (AC-17):** снимок хранится как есть. Интернирование строк — заранее специфицированный запасной план Task 29, шаг 4, который выполняется только при красном замере.
- **Architectural deviation (все задачи со `Skill: nestjs-code generic`).** Отклонение от дерева решений `nestjs-specialist` §7–8, где типы — `module`, `use-case`, `action`, `repository`, `http-*` и т. д. Причины: (1) это публикуемая библиотека без модулей, DI-слоёв, БД, транзакций и HTTP-сервера, поэтому ни один тип сервиса не описывает её файлы; (2) `.ai-factory/ARCHITECTURE.md` («Организация кода») и образец `verdeect-auth` прямо предписывают `nestjs-code generic <path>` для компонентов библиотеки; (3) общие правила специалиста (ESM `.js`, именование §10, `strict`, Vitest, ID в именах тестов) сохраняются. Решение осознанное. По той же причине нет задач `nestjs-generate-documentation`: CLAUDE.md уровней 1–3 описывают модули сервиса, которых нет. Карта репозитория — `AGENTS.md` (Task 30).
- **README, CHANGELOG, `docs/` — E3** (prd.md §9). Публичная поверхность в E1 документируется TSDoc, это проверяет ESLint.

## Phase Index
1. [Phase 1: Каркас пакета](phase-01-scaffold.md) — Tasks 1-6
2. [Phase 2: Контракт Platform — типы, коды, ошибки, схемы](phase-02-contract.md) — Tasks 7-12
3. [Phase 3: Настройки, ограничение логов, clientCredentials, транспорт](phase-03-transport-token.md) — Tasks 13-20
4. [Phase 4: Кэш снимков и локальное решение](phase-04-cache-decide.md) — Tasks 21-23
5. [Phase 5: PlatformAuthzClient](phase-05-client.md) — Tasks 24-28
6. [Phase 6: Производительность и завершение этапа](phase-06-perf-finish.md) — Tasks 29-30

## Cross-Phase Dependencies
- Phase 2 зависит от Phase 1: нужны `package.json` с `zod`/`ajv`, tsconfig, eslint и Vitest.
- Task 13–16 зависят от Task 7, 9 и 10 (типы, ошибки, функции разбора). Task 16 (`clientCredentials`) использует `sendRequest` и `parseJsonText` из Task 15.
- Task 21–22 зависят от Task 7–9. Task 21 не зависит от Phase 3. Task 23 создаёт `test/unit/support/snapshots.ts`, который используют Task 26–28.
- Task 24 зависит от Task 13–16 и 21–22. Task 25 — от Task 24, 16 и 9.
- Task 26–28 зависят от Task 17 (поддержка тестов), Task 23 (фикстуры снимков) и Task 24–25.
- Task 29 зависит от Task 24–25. Task 30 — последней.

## Tasks

### Phase 1: Каркас пакета
- [x] Task 1: Манифест пакета и установка зависимостей ([details](phase-01-scaffold.md#task-1-манифест-пакета-и-установка-зависимостей))
- [x] Task 2: Конфигурация TypeScript ([details](phase-01-scaffold.md#task-2-конфигурация-typescript)) (depends on 1)
- [x] Task 3: Линтер, форматирование, git-игнор ([details](phase-01-scaffold.md#task-3-линтер-форматирование-git-игнор)) (depends on 1)
- [x] Task 4: Конфигурация Vitest (unit) ([details](phase-01-scaffold.md#task-4-конфигурация-vitest-unit)) (depends on 1)
- [x] Task 5: Точки входа `.`, `./nest`, `./testing` ([details](phase-01-scaffold.md#task-5-точки-входа--nest-testing)) (depends on 2)
- [x] Task 6: Тест манифеста пакета (D2, NFR-4) ([details](phase-01-scaffold.md#task-6-тест-манифеста-пакета-d2-nfr-4)) (depends on 1, 2, 3, 4, 5)

### Phase 2: Контракт Platform — типы, коды, ошибки, схемы
- [x] Task 7: Публичные типы ядра ([details](phase-02-contract.md#task-7-публичные-типы-ядра-srccoretypests)) (depends on 6)
- [x] Task 8: Копия кодов Platform ([details](phase-02-contract.md#task-8-копия-кодов-platform-srccorecodests)) (depends on 3)
- [x] Task 9: Классы ошибок ([details](phase-02-contract.md#task-9-классы-ошибок-srccoreerrorsts)) (depends on 7)
- [x] Task 10: Внутренние схемы и функции разбора ([details](phase-02-contract.md#task-10-внутренние-схемы-и-функции-разбора-srccoreschemasts)) (depends on 7)
- [x] Task 11: Копия JSON Schema событий Platform ([details](phase-02-contract.md#task-11-копия-json-schema-событий-platform-testfixtures)) (depends on 3)
- [x] Task 12: Тесты AC-11 и AC-15 (U), схема ответа ([details](phase-02-contract.md#task-12-тесты-ac-11-и-ac-15-u-схема-ответа-permissions)) (depends on 8, 9, 10, 11)

### Phase 3: Настройки, ограничение логов, clientCredentials, транспорт
- [x] Task 13: Проверка настроек клиента ([details](phase-03-transport-token.md#task-13-проверка-настроек-клиента-srccoreoptionsts)) (depends on 7)
- [x] Task 14: Ограничитель частоты логов ([details](phase-03-transport-token.md#task-14-ограничитель-частоты-логов-srccorelog-limiterts)) (depends on 7)
- [x] Task 15: HTTP-транспорт к Platform ([details](phase-03-transport-token.md#task-15-http-транспорт-к-platform-srccoretransportts)) (depends on 9, 10, 14)
- [x] Task 16: `clientCredentials` ([details](phase-03-transport-token.md#task-16-clientcredentials-srccoretoken-providerts)) (depends on 9, 10, 15)
- [x] Task 17: Инфраструктура тестов слоя U ([details](phase-03-transport-token.md#task-17-инфраструктура-тестов-слоя-u-testunitsupport)) (depends on 7)
- [x] Task 18: Тесты настроек и ограничителя логов ([details](phase-03-transport-token.md#task-18-тесты-настроек-и-ограничителя-логов-ac-19-настройки-nfr-3)) (depends on 13, 14, 17)
- [x] Task 19: Тесты `clientCredentials` ([details](phase-03-transport-token.md#task-19-тесты-clientcredentials-ac-9-ac-18-token)) (depends on 16, 17)
- [x] Task 20: Тесты транспорта ([details](phase-03-transport-token.md#task-20-тесты-транспорта-ac-7-ac-7a-ac-18-ac-19-транспорт)) (depends on 15, 17)

### Phase 4: Кэш снимков и локальное решение
- [x] Task 21: Кэш снимков ([details](phase-04-cache-decide.md#task-21-кэш-снимков-srccorecachets)) (depends on 7)
- [x] Task 22: Локальное решение ([details](phase-04-cache-decide.md#task-22-локальное-решение-srccoredecidets)) (depends on 7, 8, 9)
- [x] Task 23: Тесты кэша и решения ([details](phase-04-cache-decide.md#task-23-тесты-кэша-и-решения)) (depends on 21, 22)

### Phase 5: PlatformAuthzClient
- [x] Task 24: Клиент ([details](phase-05-client.md#task-24-клиент-srccoreclientts)) (depends on 13, 14, 15, 21, 22)
- [x] Task 25: Публичный контракт ядра ([details](phase-05-client.md#task-25-публичный-контракт-ядра-srccoreindexts)) (depends on 9, 16, 24)
- [x] Task 26: Тесты клиента — кэш, объединение, событие, LRU, `clear()` ([details](phase-05-client.md#task-26-тесты-клиента--кэш-объединение-событие-lru-clear-ac-1ac-4-ac-19)) (depends on 17, 23, 25)
- [x] Task 27: Тесты клиента — свежесть и недоступность ([details](phase-05-client.md#task-27-тесты-клиента--свежесть-и-недоступность-ac-5-ac-6-ac-7)) (depends on 26)
- [x] Task 28: Тесты клиента — контракт, `fresh`, `raw`, `checkMany`, метрики, логи ([details](phase-05-client.md#task-28-тесты-клиента--контракт-fresh-raw-checkmany-метрики-логи-ac-7a-ac-7b-ac-8-ac-8b-ac-18-ac-19)) (depends on 26)

### Phase 6: Производительность и завершение этапа
- [x] Task 29: Набор производительности (AC-17, NFR-1) ([details](phase-06-perf-finish.md#task-29-набор-производительности-ac-17-nfr-1)) (depends on 25)
- [x] Task 30: `AGENTS.md` и итоговая проверка этапа ([details](phase-06-perf-finish.md#task-30-agentsmd-и-итоговая-проверка-этапа)) (depends on 28, 29)

## Traceability

| Требование | Задачи | Тест-файл / название теста |
|---|---|---|
| AC-1 | 21, 24 | `test/unit/client-cache.spec.ts` — `AC-1: 100 вызовов check по 10 разным правам → 1 запрос; через 61 с → второй` |
| AC-2 | 21, 24 | `client-cache.spec.ts` — `AC-2: 50 одновременных check …`, `AC-2: ошибка этого запроса …`; `cache.spec.ts` — `AC-2: joinInflight …` |
| AC-3 | 21, 24 | `client-cache.spec.ts` — `AC-3: COMPANY_SUSPENDED …`, `AC-3: NOT_MEMBER с epoch: null …`; `cache.spec.ts` — `AC-3: …` |
| AC-4 | 10, 21, 24 | `client-cache.spec.ts` — `AC-4: subs: [A] …`, `… без subs …`, `… subs: [] …`, `… эпоха события ≤ …`, `… незнакомый reason …`, `… → warn, без исключения …`, `… 11 компаниям …`; `cache.spec.ts` — `AC-4: …` |
| AC-5 | 21, 24 | `client-freshness.spec.ts` — `AC-5: после события с эпохой 8 …`, `AC-5: ответ эпохи 7 …`; `cache.spec.ts` — `AC-5: epoch < lastSeenEpoch → stale …` |
| AC-6 | 21, 22, 24 | `client-freshness.spec.ts` — все `AC-6: …` из Task 27; `decide.spec.ts` — `AC-6: агент без pep …`, `AC-6: pep = %s …`, `AC-6: pep < epoch …`; `cache.spec.ts` — `AC-6: …` |
| AC-7 | 14, 15, 24 | `client-freshness.spec.ts` — `AC-7: %s — снимок в пределах TTL …`, `… таймаут 2 с …`, `… 401 …`, `… срок ещё 55 с …`, `… поднялся на 6-й секунде …`, `… fresh при 503 …`, `… 100 вызовов за 5 с …`; `transport.spec.ts` — `AC-7: …`; `log-limiter.spec.ts` — `NFR-3: warn …` |
| AC-7a | 14, 15, 24 | `client-api.spec.ts` — `AC-7a: %s → PlatformContractError %s …`, `AC-7a: 10 повторов …`; `transport.spec.ts` — `AC-7a: …` |
| AC-7b | 24 | `client-api.spec.ts` — `AC-7b: …` (7 кейсов) |
| AC-8 | 10, 22, 24 | `client-api.spec.ts` — `AC-8: …`; `decide.spec.ts` — `AC-8: …`; `schemas.spec.ts` — `AC-8: …` |
| AC-8b | 22, 24 | `client-api.spec.ts` — `AC-8b: …`; `decide.spec.ts` — `AC-8b: …` |
| AC-9 | 16 | `test/unit/token-provider.spec.ts` — все `AC-9: …` из Task 19 |
| AC-11 | 8, 9 | `test/unit/codes.spec.ts` — `AC-11: каждый код §3.4 — дословный текст`, `AC-11: PLATFORM_UNAVAILABLE …`, `AC-11: шапка копии …`, `AC-11: тело копии совпадает …` |
| AC-15 (U) | 10, 11 | `test/unit/schemas.spec.ts` — `AC-15: reason %s без subs …`, `… с subs …`, `AC-15: zod мягче …`, `AC-15: subs: [] …`, `AC-15: нет data.tenantId …` |
| AC-17 | 29 | `test/perf/check.perf.spec.ts` — `AC-17: check из кэша — p99 < 0,2 мс …`, `AC-17: память — ≤ 20 МБ …` |
| AC-18 | 15, 16, 24 | `client-api.spec.ts` — `AC-18: …` (9 кейсов, в том числе `AC-18: клиент Platform не пишет request(token, …)`, v1.8); `transport.spec.ts` — `AC-18: …`; `token-provider.spec.ts` — `AC-18: …` (v1.8: `token`) |
| AC-19 | 13, 15, 17, 21, 24 | `options.spec.ts` — `AC-19: %s неверен → TypeError …`; `transport.spec.ts` — `AC-19: Authorization …`, `AC-19: traceparent …`; `client-cache.spec.ts` — `AC-19: maxEntries 100 …`, `AC-19: после clear() …` (4); `client-api.spec.ts` — `AC-19: клиент с clientCredentials … логгер …`; `test/unit/support/setup.ts` — проверка логов после каждого теста |
| D2, NFR-4 | 1, 3, 5, 10, 30 | `test/unit/package-manifest.spec.ts` — `D2: …`, `NFR-4: …`; ESLint `no-restricted-imports`; `grep` по `dist` (Task 30) |
| D3, D4 | 21, 24 | AC-1, AC-2, AC-3, AC-4 |
| D5 | 22, 24 | AC-6 |
| D6 | 21, 24 | AC-7 |
| D7 | 24 | AC-4 (`onPolicyChanged` принимает конверт, к брокеру не подключается) |
| D8 | 7, 15, 16 | AC-7 (401 → refresh), AC-9 |
| D9 | 8, 9 | AC-11 |
| NFR-1 | 29 | AC-17 |
| NFR-2 | 7, 15, 16, 24 | AC-18 |
| NFR-3 | 14, 15, 24 | AC-7, AC-7a, AC-19; `log-limiter.spec.ts` — `NFR-3: …` |

UC-1–UC-4 целиком проверяются в E2 (guard и подделка) и E3 (слой C). Их шаги, которые выполняет ядро, покрыты AC выше: UC-1 A1 → AC-2, UC-1 A2 → AC-7, UC-2 → AC-6, UC-2 A2 → AC-7, UC-2 A3/A4 → AC-6, UC-3 → AC-4, AC-7b, UC-3 A1 → AC-7, UC-3 A2 → AC-4, UC-3 A3 → AC-7b.

## Commit Plan
- **Commit 1** (после задач 1-6): `chore: каркас пакета @verdeect/platform-client — exports, конфиги, Vitest`
- **Commit 2** (после задач 7-12): `feat(core): контракт Platform — типы, копия кодов, ошибки, схемы (AC-11, AC-15 U)`
- **Commit 3** (после задач 13-20): `feat(core): настройки, ограничение логов, транспорт и clientCredentials (AC-7, AC-7a, AC-9, AC-18, AC-19)`
- **Commit 4** (после задач 21-23): `feat(core): кэш снимков и локальное решение (§5.2, §5.3)`
- **Commit 5** (после задач 24-28): `feat(core): PlatformAuthzClient — check, checkMany, fresh, raw, onPolicyChanged, clear (AC-1–AC-8b, AC-18, AC-19)`
- **Commit 6** (после задач 29-30): `test(perf): AC-17 — p99 и память снимка; docs(agents): структура после E1`

## Definition of Done
- Каждый AC скоупа есть хотя бы в одном зелёном тесте, ID в названии (таблица Traceability).
- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:perf`, `pnpm build` — код 0.
- `dist/**/*.d.ts` не содержит `zod`; `dist/core` не ссылается на `@nestjs/*`, `reflect-metadata`, `rxjs`, `@verdeect/auth`.
- `src/core/codes.ts` и `test/fixtures/platform-events.schema.json` совпадают с `verdeect-platform` `7adb423` (шапка и `SOURCES.md`).
- В `requirements/` план ничего не меняет (r2 закоммичен до плана отдельным коммитом `be9ef82`).
