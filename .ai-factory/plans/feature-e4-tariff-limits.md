# План реализации: E4 «Лимиты тарифа (1.1.0)» `@verdeect/platform-client`

Branch: feature/e4-tariff-limits
Created: 2026-10-29

## Original Request
Реализуй этап roadmap «E4 Лимиты тарифа (1.1.0)» по пакету требований requirements/0000-platform-client/ (ревизия r6, PRD v1.12).

Скоуп этапа: UC-5; AC-20, AC-21, AC-22; prd.md §3.2 (интерфейс Limits и абзац «limits»: fileSizeMb обязателен, остальные ключи копии необязательны и отсутствуют, если Platform их не прислал; незнакомый ключ number | null — как есть, иное значение — отбросить с debug, без ошибки; известный ключ не number | null → PlatformContractError; общий отказ — тот же тип), §5.5 (FakeCompany.limits, setLimits; по умолчанию семь ключей null; ключ вне копии или значение не null и не целое ≥ 1 → TypeError; setLimits эпоху не меняет), NFR-5 (строка 1.1.0 в таблице совместимости README), NFR-1 (AC-17 после изменения). Копия ключей — /home/administrator/projects/verdeect2/verdeect-platform/apps/platform/src/modules/catalog/domain/limits.ts → src/core/limits.ts с путём источника и коммитом в шапке; тест сверяет ключи с соседним репозиторием, как catalog.ts. Публичный тип Limits экспортируется из ядра и описан в TSDoc; README — раздел о лимитах и setLimits в примере «Тесты потребителя» (шаблон test/consumer/full обновляется вместе с ним, AC-12); CHANGELOG [1.1.0]; version 1.1.0. AC-22 (слой C) — против main verdeect-platform с этапом E7 Platform (PRD v1.14: в ответе permissions весь объект Limits — семь ключей, в общем отказе все null); если в текущем main Platform этих ключей ещё нет — AC-22 пометь как ожидающий и остановись перед тегом, спроси меня. Тег v1.1.0 ставит выпуск после слияния (job publish в CI, Trusted Publishing). Источник истины — requirements/0000-platform-client/prd.md; приоритет при конфликте: prd.md > ROADMAP/DESCRIPTION. Уже реализованные этапы E1–E3 — существующий код, не переделывай его без требования; ответ permissions без новых ключей (Platform v1.11) должен работать как в 1.0.x. Покрой все требования скоупа; ссылайся на их ID в задачах и в названиях тестов. Открытые вопросы [OPEN] не додумывай — спроси меня.

## Settings
- Testing: yes. Тесты обязательны для пакета требований (skill-context «Mandatory Test Phases», «Library Package Scope»): слой U, perf, проверки пакета, проект-потребитель, слой C.
- Logging: verbose. Ядро пишет только через `options.logger`, без него молчит:
  - `debug` `'limits keys dropped'` с `{ endpoint: 'permissions', tenantId, sub, keys }` — только имена отброшенных незнакомых ключей `limits`, без значений: ответ недоверенный (NFR-3). Для `raw.permissions` полей `tenantId` и `sub` нет.
  - Известный ключ с неверным значением уже логируется существующим путём `INVALID_RESPONSE` через `withContractLog`. Новых `warn` и `error` нет.
  - Подделка (`src/testing`) логов не пишет, как и сейчас. Инфраструктура слоя C — префикс `[contract]`, как в E3.
- Docs: yes — обязательная точка `/aif-docs` в конце: README, `docs/getting-started.md`, `docs/testing.md`, CHANGELOG, AGENTS.md.

## Roadmap Linkage
Milestone: "E4 Лимиты тарифа (1.1.0)"
Rationale: план реализует ровно скоуп E4 из `requirements/0000-platform-client/README.md` (r6) и `.ai-factory/ROADMAP.md`. E1–E3 — существующий код, план его расширяет.

## Requirements Reconciliation
Authority: `requirements/0000-platform-client/prd.md` **v1.12 (r6)** > `.ai-factory/ROADMAP.md` / `.ai-factory/DESCRIPTION.md`. Раскладка — `.ai-factory/ARCHITECTURE.md`, соглашения — `.ai-factory/rules/base.md`. Контракт Platform — prd.md §3 и код `verdeect-platform`.

**Milestone scope:** UC-5 (A1–A3); AC-20, AC-21, AC-22; §3.2 (`Limits`, абзац «limits»); §5.5 (`FakeCompany.limits`, `setLimits`, абзац о лимитах подделки); NFR-1 (AC-17 после изменения); NFR-5 (таблица совместимости); AC-12 — только синхронизация примера README «Тесты потребителя» с шаблоном (AC-21). Вне скоупа: AC-1–AC-19 — E1–E3, готово; поведение решений по правам не меняется.

**Открытые вопросы.** `[OPEN]` §10 п. 1 (`@verdeect/kit`) и п. 2 (`reserve/commit/release`) — вне E4, не планируются. Блокирующих вопросов нет.

**Состояние Platform при планировании (2026-10-29).** `origin/main` = `7adb423`. В ответе `permissions` пока только `limits: { fileSizeMb }`: `rs-member-permissions.ts:19,31,61`, `member-permissions.ts:29,42`. Дополнения B.1 / E7 Platform в `main` **нет**. Поэтому **AC-22 сейчас ожидающий**: T12 проверяет совместимость с Platform v1.11 (PRD A1, необязательный прогон AC-22), а T13 останавливается перед выпуском (⛔). Тег `v1.1.0` — только после ответа пользователя.

**Уточнение PRD при планировании (2026-10-29, по запросу пользователя, отдельный коммит):** §5.5 — компанию, отсутствующую в `companies`, заводит и `setLimits`: `epoch = 1`, все модули `enabled`, лимиты — семь `null`, у `setLimits` — переданные поверх них. AC-21 — `setLimits(u, {assistants: 3})` для незаведённой компании `u` → `epoch = 1`, `assistants: 3`, остальные `null`.

**Architectural deviation (все `Skill: nestjs-code generic`).** Дерево решений `nestjs-specialist` (`module`, `use-case`, `http-*`, `shared`) к библиотеке неприменимо. Причины:
1. это библиотека, а не сервис: в ARCHITECTURE.md слои сервиса отмечены как «Не действуют»;
2. ARCHITECTURE.md предписывает `nestjs-code generic <path>` с обоснованием «компонент библиотеки, не сервиса».

Решение осознанное, как в E1–E3. Касается T2, T3, T4, T7 и `global-setup.ts` в T12.

**Решения плана (в PRD не описаны):**

| Решение | Почему | Где |
|---|---|---|
| `src/core/limits.ts` — дословная копия источника (zod-схема `LimitsSchema`, тип `Limits`) после двух строк шапки; ключи — `Object.keys(LimitsSchema.shape)` | так же, как `catalog.ts`: тест сравнивает текст копии с `git show <commit>:…`; zod — единственная зависимость ядра. Строгая схема копии нужна подделке (§5.5: ключ вне копии или значение не целое ≥ 1 → `TypeError`) | T1, T7 |
| Коммит в шапке — `7adb423` | как у `codes.ts` и `catalog.ts`; файл в `7adb423` = последнему изменению `c86ae84` | T1 |
| Клиент **не** проверяет известные ключи на «целое ≥ 1»: только `number \| null` | §3.2: «Известный ключ — `number \| null`, иначе → `PlatformContractError`». Строгость Platform — забота Platform | T3 |
| Публичный `Limits` — интерфейс в `types.ts` по §3.2 (индексная сигнатура `number \| null \| undefined`). Тип `Limits` из копии не реэкспортируется | NFR-4: zod-типы наружу не выходят. Публичная форма шире копии: незнакомые ключи | T2 |
| `DeniedPermissions.limits` — тоже `Limits` (было `{ fileSizeMb: null }`) | §3.2: в общем отказе `limits: Limits`, значения не проверяются сверх типа. Тип расширяется — минор | T2, T3 |
| Отброшенные ключи сообщает `parsePermissionsResponse(value, onDroppedLimits?)`, лог пишет `client.ts` | схемы не знают логгер; одна точка разбора для `permissions()` и `raw.permissions` | T3, T4 |
| Строки таблицы совместимости: `1.0.x` (v1.11, `7adb423`) и `1.1.x` (PRD Platform с B.1 и коммит зелёного слоя C) | NFR-5: версия пакета ↔ PRD Platform и коммит. Одна строка `1.x` не может нести два коммита | T14 |
| AC-22: по умолчанию проверка с B.1; `PLATFORM_LIMITS=legacy` — необязательный прогон против Platform без дополнения | AC-22 описывает оба прогона; выпускной `make test-contract` (D10) идёт без переменной и краснеет, пока B.1 нет в `main` | T12, T13 |

**Комбинации `limits` в ответе (§3.2, AC-20):**

| Вход `limits` | Результат `permissions().limits` | Побочное | Тест |
|---|---|---|---|
| `{fileSizeMb: 50}` (Platform v1.11) | `{fileSizeMb: 50}`, других ключей нет (`'assistants' in limits === false`) | — (как 1.0.x) | T5 |
| пять ключей AC-20 (`assistants: 3`, `concurrentChats: null`, …) | все пять как есть, и из кэша | — | T5 |
| `{fileSizeMb: 50, newLimit: 7}` | `newLimit: 7` есть | — | T5 |
| `{fileSizeMb: 50, flags: 'x'}` | `flags` нет, решение по правам получено | `debug 'limits keys dropped'`, `keys: ['flags']` | T5 |
| `{fileSizeMb: 50, assistants: 'x'}` | `PlatformContractError('INVALID_RESPONSE')`, в кэш не попал | существующий лог контракта | T5 |
| нет `fileSizeMb` | `PlatformContractError` (как 1.0.x) | — | T5 |
| общий отказ, семь `null` | проходит схему | — | T5 |
| общий отказ `{fileSizeMb: null}` (v1.11) | проходит, как 1.0.x | — | T5 |

**Комбинации подделки (§5.5, AC-21):**

| Вход | Результат | Тест |
|---|---|---|
| по умолчанию | семь ключей копии = `null` в разрешении и в общем отказе | T8 |
| `companies: [{tenantId, limits: {assistants: 3}}]` | `assistants: 3`, остальные `null` | T8 |
| `setLimits(t, {concurrentChats: 2})` → `client.clear()` | `concurrentChats: 2`, `assistants` прежний; эпоха та же | T8 |
| `setLimits(t, {assistants: null})` | ключ снова `null` | T8 |
| `setLimits(u, {assistants: 3})`, `u` не заведена (§5.5, AC-21) | компания заводится: `epoch = 1`, `assistants: 3`, остальные `null` | T8 |
| `{foo: 1}` / `{assistants: 0}` / `{assistants: 'x'}` / `{assistants: 1.5}` — в `setLimits` или `companies[].limits` | `TypeError` | T8 |

**Реальные артефакты:** `apps/platform/src/modules/catalog/domain/limits.ts` `verdeect-platform` в `7adb423` (сравнение копии T5); `../verdeect-platform/seed/plans.json` (корень репозитория, коммит прогона) — значения тарифа `default` в AC-22, T12; настоящий шаблон `test/consumer/full/src/consumer.spec.ts` (AC-12, T9).

## Tasks

### Phase 1: Ядро — копия `Limits`, тип, схема ответа

- [x] **Task 1: Копия `src/core/limits.ts` (§3.2, AC-20)**
  - Создать `src/core/limits.ts`. Строка 1: `// Копия verdeect-platform apps/platform/src/modules/catalog/domain/limits.ts @ 7adb423 (prd.md §3.2, AC-20).` Строка 2: `// Не править вручную: только перекопировать из источника и обновить коммит в этой строке.` Дальше — содержимое `git -C ../verdeect-platform show 7adb423:apps/platform/src/modules/catalog/domain/limits.ts` байт в байт.
  - `eslint.config.js`: добавить `src/core/limits.ts` в override копий (`files: ['src/core/codes.ts', 'src/testing/catalog.ts']`, `jsdoc/require-jsdoc: off`) и обновить комментарий над ним. Prettier копию не переформатирует: стиль Platform совпадает. Если `make lint` не согласен — копию не правим, файл добавляем в `.prettierignore` и пишем об этом в отчёте задачи.
  - Из `src/core/index.ts` копия **не** экспортируется (NFR-4).
  - Логи: нет (данные).
  - **Skill:** none — копия файла и конфиг линтера.

- [x] **Task 2: Публичный тип `Limits` (§3.2, UC-5)** — после T1
  - `src/core/types.ts`: интерфейс `Limits` по §3.2 с TSDoc на каждом поле: `fileSizeMb: number | null` обязателен; `members?`, `storageMb?`, `modelRequestsPerMonth?`, `modelRequestsPerMemberPerMonth?`, `concurrentChats?`, `assistants?` — `number | null`; `[key: string]: number | null | undefined`. Описание: ключи — копия схемы `Limits` Platform; `null` — без лимита; отсутствующий ключ — Platform не прислал (≠ `null`).
  - `AllowedPermissions.limits: Limits`; `DeniedPermissions.limits: Limits` с TSDoc «Platform шлёт `null`; значения не проверяются сверх типа».
  - `src/core/index.ts`: `export type { Limits }` в явный список реэкспортов.
  - CHANGELOG `[Unreleased]`: `### Added` — «Тип `Limits` — лимиты тарифа компании в ответе `permissions` (с 1.1.0): копия ключей схемы Platform, незнакомые числовые ключи передаются как есть». `### Changed` — «`DeniedPermissions.limits` — тип `Limits` (раньше `{ fileSizeMb: null }`)».
  - Логи: нет (типы).
  - **Skill:** nestjs-code generic src/core/types.ts (MODIFY).

- [x] **Task 3: Схема `limits` в ответе permissions (§3.2, AC-20)** — после T1, T2
  - `src/core/schemas.ts`. `LIMIT_KEYS = Object.keys(LimitsSchema.shape)` из `./limits.js`. Схема `limits`:
    - `fileSizeMb: z.number().nullable()` — обязателен;
    - остальные ключи копии — `z.number().nullable().optional()`: отсутствующий ключ так и остаётся отсутствующим, а не `undefined`-полем — проверить `in`;
    - `.catchall(z.unknown())`.
  - Одна схема — и в `allowedSchema`, и в `deniedSchema`: заменить `z.object({ fileSizeMb: z.null() })`.
  - `parsePermissionsResponse(value, onDroppedLimits?: (keys: readonly string[]) => void)`: после `safeParse` пройти по ключам `limits` вне `LIMIT_KEYS`. Значение `number` (конечное) или `null` — оставить. Иное — удалить из результата и собрать имя. Если имена собраны — вызвать `onDroppedLimits(keys)`. Проверку `satisfies z.ZodType<PermissionsResponse>` перенести на очищенный результат: тип результата функции — `PermissionsResponse`, без `as` к неверному типу.
  - TSDoc `parsePermissionsResponse` (сейчас `schemas.ts:85`: «…; лишние поля отбрасываются.») обновить: лишние поля верхнего уровня отбрасываются; в `limits` незнакомые ключи `number | null` сохраняются, прочие отбрасываются и передаются в `onDroppedLimits`. Описать параметр `onDroppedLimits`.
  - Неверный известный ключ или отсутствие `fileSizeMb` → `undefined` → существующий `INVALID_RESPONSE` транспорта (`PlatformContractError`). Новых путей ошибок нет.
  - Горячий путь NFR-1 не задет: разбор идёт один раз на HTTP-ответ. `cache.ts` хранит `limits` как есть (строка 283) и не меняется.
  - Логи: функция не логирует (нет логгера) — сообщает через колбэк.
  - **Skill:** nestjs-code generic src/core/schemas.ts (MODIFY).

- [x] **Task 4: Лог отброшенных ключей в клиенте (§3.2, AC-20)** — после T3
  - `src/core/client.ts`. В `requestSnapshot` (строка ~94) парсер — `(json) => parsePermissionsResponse(json, (keys) => logger?.debug({ endpoint: 'permissions', tenantId, sub, keys }, 'limits keys dropped'))`. В `raw.permissions` — тот же лог без `tenantId` и `sub`.
  - Объект лога строится только при заданном `logger`, без лишних аллокаций, как в `decideFor`.
  - Логи: `debug 'limits keys dropped'` — только имена ключей (NFR-3).
  - **Skill:** nestjs-code generic src/core/client.ts (MODIFY).

- [x] **Task 5: Тесты AC-20 (слой U)** — после T1–T4
  - `test/unit/limits.spec.ts`, новый, по образцу `test/unit/catalog.spec.ts`:
    - `AC-20: шапка копии limits.ts содержит путь источника и коммит`;
    - `AC-20: ключи копии — семь ключей схемы Limits Platform` (точный набор: `members`, `storageMb`, `fileSizeMb`, `modelRequestsPerMonth`, `modelRequestsPerMemberPerMonth`, `concurrentChats`, `assistants`);
    - `it.runIf(existsSync(PLATFORM_GIT))('AC-20: копия совпадает с источником verdeect-platform в коммите шапки')` — текст после двух строк шапки равен `git show <commit>:…/limits.ts`.
  - `test/unit/schemas.spec.ts`, `describe('AC-20: limits в ответе permissions (§3.2)')`, по строкам таблицы «Комбинации `limits`»: пять ключей; только `fileSizeMb` (нет других ключей — `in`); `newLimit: 7`; `flags: 'x'` отброшен и колбэк получил `['flags']`; `assistants: 'x'` → `undefined`; нет `fileSizeMb` → `undefined`; общий отказ с семью `null` и с `{fileSizeMb: null}` проходит.
  - `test/unit/client-limits.spec.ts`, новый, на существующей поддержке, без новых заглушек: клиент — `createTestClient({ handler })` из `test/unit/support/test-client.ts`; ответ — `{ ...allowedSnapshot(), limits: {...} }` и `{ ...generalDeny(...), limits: {...} }` из `support/snapshots.ts` (там `limits` зашит, параметра нет); лог — `log` из `TestClient`; число запросов — `permissionsRequests()`:
    - `AC-20: permissions().limits — пять ключей, в том числе из кэша` — второй вызов без запроса;
    - `AC-20 / UC-5 A1: Platform v1.11 — только fileSizeMb, решения как в 1.0.x` — `check` разрешает, в `limits` один ключ;
    - `AC-20 / UC-5 A2: незнакомый числовой ключ как есть; нечисловой — отброшен, debug, решение получено` — logger получил `'limits keys dropped'` с `keys: ['flags']` и без значений;
    - `AC-20: assistants: 'x' → PlatformContractError, снимок не закэширован` — второй вызов снова идёт в fetch;
    - `AC-20: raw.permissions применяет ту же схему`.
  - Логи: тест проверяет лог debug.
  - **Skill:** nestjs-code test unit limits (CREATE) — `limits.spec.ts`; nestjs-code test unit client-limits (CREATE) — `client-limits.spec.ts`; nestjs-code test unit schemas (MODIFY) — `schemas.spec.ts`.

- [x] **Task 6: AC-17 после изменения (NFR-1)** — после T3
  - `test/perf/check.perf.spec.ts`: снимок фикстуры (строка 64) — `limits` из семи ключей (`fileSizeMb: 50`, остальные числа или `null`). Так память ≤ 2 КБ на снимок мерится на реальной форме 1.1.0. Названия тестов AC-17 не меняются. В описание добавить «(после E4: limits — семь ключей)».
  - Запустить `make test`: p99 < 0,2 мс, ≤ 2 КБ. При провале — не ослаблять порог, а искать причину в T3.
  - Логи: нет.
  - **Skill:** nestjs-code test unit check.perf (MODIFY).

### Phase 2: Подделка — `FakeCompany.limits`, `setLimits`

- [x] **Task 7: Лимиты подделки (§5.5, AC-21, UC-5 A3)** — после T1, T2
  - `src/testing/fake-platform.ts`:
    - `CompanyState.limits: Record<string, number | null>`. При заведении компании (строка ~250) — семь ключей копии со значением `null`: `Object.keys(LimitsSchema.shape)` из `../core/limits.js`; импорт `testing → core` разрешён, как `codes.js`.
    - `FakeCompany.limits?: Partial<Limits>` с TSDoc. Применяется после заведения компании и меняет только переданные ключи.
    - `FakePlatform.setLimits(tenantId: string, limits: Partial<Limits>): void` с TSDoc: «сливается с текущими; `null` — без лимита; эпоху не меняет — смена видна после TTL снимка или `clear()`». Неизвестную компанию заводит, как `setModule` (§5.5): `epoch = 1`, все модули `enabled`, лимиты — переданные поверх семи `null`.
    - Проверка `assertLimits(method, value)`: `LimitsSchema.partial().safeParse(value)`. Неуспех (ключ вне копии, значение не `null` и не целое ≥ 1, не объект) → `TypeError('platform-client/testing: <method>: …')` по образцу `assertEpoch`, с именами ключей.
    - `snapshotFor`: и разрешение, и общий отказ несут `{ ...companyState.limits }` (§5.5: «Ответ разрешения и общего отказа несёт лимиты компании»). При неизвестной компании (`NOT_MEMBER` без компании) — семь `null`. Убрать константные `limits: { fileSizeMb: null }` (строки 319, 372).
    - `setLimits` не трогает `epoch` и не публикует `policyChanged`.
  - `src/testing/index.ts`: изменений нет, если `FakeCompany` и `FakePlatform` уже реэкспортированы — проверить.
  - CHANGELOG `[Unreleased]` `### Added`: «`FakePlatform.setLimits` и `FakeCompany.limits` — лимиты компании подделки; по умолчанию семь ключей `null`».
  - Логи: подделка не логирует (существующее соглашение `src/testing`). Ошибки ввода — `TypeError` с понятным текстом.
  - **Skill:** nestjs-code generic src/testing/fake-platform.ts (MODIFY).

- [x] **Task 8: Тесты AC-21 (слой U)** — после T7
  - `test/unit/fake-platform.spec.ts`, `describe('AC-21: лимиты подделки (§5.5, UC-5 A3)')`, по строкам таблицы «Комбинации подделки»:
    - `AC-21: по умолчанию — семь ключей null` — и для разрешения, и для `deny`;
    - `AC-21: companies[].limits — переданный ключ, остальные null`;
    - `AC-21: setLimits сливается; видно после client.clear(); эпоха не меняется` — до `clear()` снимок из кэша прежний;
    - `AC-21: setLimits(u, {assistants: 3}) для незаведённой компании — epoch 1, assistants 3, остальные null` (через `fake.client.permissions` участника, выданного после `setLimits`, и `epoch` снимка);
    - `AC-21: setLimits/companies.limits — {foo: 1}, {assistants: 0}, {assistants: 'x'}, {assistants: 1.5} → TypeError` (`it.each`).
  - Логи: нет.
  - **Skill:** nestjs-code test unit fake-platform (MODIFY).

<!-- Commit checkpoint: T1–T8 -->

### Phase 3: Проект-потребитель и README (AC-12, AC-21, UC-5)

- [x] **Task 9: Шаблон `test/consumer/full` — лимиты (AC-21, AC-12)** — после T7
  - `test/consumer/full/src/consumer.spec.ts`: добавить кейс `UC-5: setLimits → limits после clear()`: `fake.setLimits('org_acme', { assistants: 3 })`; `fake.client.clear()`; `(await fake.client.permissions({ sub: 'acc_1', tenant: 'acme', tenantId: 'org_acme', act: 'human' })).limits.assistants` = 3. Шапку комментария дополнить UC-5.
  - `test/consumer/full/types-check.ts`: `import type { Limits } from '@verdeect/platform-client'` и присваивание, проверяющее, что `limits.assistants` имеет тип `number | null | undefined`.
  - Логи: нет.
  - **Skill:** nestjs-code test unit consumer (MODIFY).

- [x] **Task 10: README и docs — лимиты (UC-5, AC-21, AC-12)** — после T2, T9
  - `README.md`:
    - новый раздел `## Лимиты тарифа` после «Быстрый старт»: `permissions().limits`, `null` — без лимита, ключа нет — Platform не прислал (`'assistants' in limits`), незнакомые числовые ключи как есть, с 1.1.0;
    - «Тесты потребителя» — код примера заменить текстом нового шаблона `test/consumer/full/src/consumer.spec.ts` (проверяет `test/package/consumer.spec.ts`, AC-12);
    - «API»: `Limits` — в колонку «Типы» строки `@verdeect/platform-client` (`docs.spec.ts` требует имя каждого экспорта). Методов в этой таблице нет — `setLimits` описывается в `docs/testing.md`.
  - `docs/getting-started.md`: раздел «Лимиты тарифа» (как в README, с примером чтения `assistants`).
  - `docs/testing.md`:
    - строка `setLimits(tenantId, limits)` в таблицу методов после `setEpoch` (строка 34): «сливается с текущими; `null` — без лимита; ключ вне копии или не целое ≥ 1 → `TypeError`; эпоха не меняется — видно после `clear()` или TTL»;
    - строка 43 — `FakeCompany {tenantId, tenant?, epoch?, modules?, limits?}`, по умолчанию семь ключей `null`, и `setLimits` в списке методов, заводящих компанию (§5.5).
  - Логи: нет.
  - **Skill:** none — документация.

- [x] **Task 11: Проверки пакета** — после T9, T10
  - `make build`, затем `make pack-check`: publint, attw, `test:package`, в том числе AC-12 «пример из README» и проект `full` с `types-check.ts`. `make lint`, `make analyse`, `make test`.
  - Логи: префикс `[package-check]` — существующий.
  - **Skill:** none — команды.

### Phase 4: Слой C — AC-22

- [x] **Task 12: Контрактный тест AC-22 (слой C, UC-5)** — после T3
  - `test/contract/ac-22-limits.spec.ts`, новый, по образцу `ac-13-catalog.spec.ts`: своя компания `c22-<суффикс>` (`uniqueTenant('c22')`). Участник — `prepareMember` из `support/contract-client.ts`: он даёт роль `viewer`. Затем `memberGrant(<id контейнера сервиса>, tenant, sub, 'admin')` из `support/platform-cli.ts`, как `--role operator` в `ac-14-revocation.spec.ts`, и `permissions(subject, { fresh: true })` до проверок `limits` — AC-22 требует участника `admin`.
  - Значения тарифа `default` — прочитать `seed/plans.json` из `../verdeect-platform` в коммите прогона. Если `fileSizeMb` в тарифе не 50, или четыре ключа B.1 не `null`, или ключей нет вообще — ⛔ стоп и вопрос пользователю: тест не подгоняется.
  - `it.runIf(process.env.PLATFORM_LIMITS !== 'legacy')('AC-22: permissions() admin — fileSizeMb и четыре ключа B.1 по тарифу default; ответ проходит схему пакета')`: `client.permissions(...)` не бросает (zod-схема пакета); `limits.fileSizeMb === 50`; `assistants`, `concurrentChats`, `modelRequestsPerMonth`, `modelRequestsPerMemberPerMonth` присутствуют (`in`) со значениями тарифа (`null`).
  - `it.runIf(process.env.PLATFORM_LIMITS === 'legacy')('AC-22 (без B.1): в limits только fileSizeMb')`: `Object.keys(limits)` = `['fileSizeMb']`.
  - `test/contract/support/global-setup.ts`: в отчёт добавить строку `[contract] limits mode: b1|legacy`.
  - `docs/releasing.md`: в чек-лист выпуска — «`make test-contract` без `PLATFORM_LIMITS`».
  - Логи: `[contract]` — режим, ключи `limits` ответа (только имена).
  - **Skill:** nestjs-code test integration ac-22-limits (CREATE) — слой C, Testcontainers; nestjs-code generic test/contract/support/global-setup.ts (MODIFY); `docs/releasing.md` — none, документация.

- [x] **Task 13: Прогон слоя C и шлюз AC-22 ⛔** — после T11, T12
  - `PLATFORM_LIMITS=legacy make test-contract` против текущего `../verdeect-platform` `main` (`7adb423`): AC-13, AC-14, AC-15 (C) и AC-22 (без B.1) зелёные. Это подтверждает UC-5 A1: 1.1.0 работает с Platform v1.11.
  - `git -C ../verdeect-platform fetch origin`; проверить, что `origin/main` отдаёт B.1/E7: `limits` в `rs-member-permissions.ts` шире `fileSizeMb`.
    - **Нет** (так было при планировании) → записать в этот план под задачей «AC-22: ожидающий — Platform `main` = <sha> без B.1» и ⛔ **остановиться**: Phase 5 не начинается, пользователь получает вопрос. Ветку можно слить в `main` без выпуска — только по решению пользователя.
    - **Да** → переключить `../verdeect-platform` на `origin/main` (с согласия пользователя: это соседний репозиторий) и выполнить `make test-contract` без переменной. Все AC слоя C, включая AC-22, должны быть зелёными. Сохранить коммит из `[contract] Platform: <commit>` для T14. Если `limits.ts` в этом коммите изменился — ⛔ вопрос пользователю: перекопировать по правилу копий, T1 и T5.
  - Логи: `[contract]`.
  - **Skill:** none — команды.
  - **AC-22: ожидающий — Platform `main` = `7adb423` без B.1** (2026-10-29, `git fetch origin`).
  - Прогон `PLATFORM_LIMITS=legacy` (2026-10-29) шёл против локального `../verdeect-platform` на ветке `fix/pool-client-release` (`8bf749b`, dirty: no), а не против `main`. Результат: 14 пройдено, 1 упал, 1 пропущен.
    - AC-13, AC-15 (C) и «AC-22 (без B.1)» зелёные: в `limits` только `fileSizeMb`.
    - AC-14 / D5 красный: `member:grant` CLI выполнил команду (`exitCode 0`, «command finished»), но процесс не завершился → код 124 (таймаут `docker exec`). Код пакета E4 этот путь не трогает. Вероятная причина — изменение пулов в `8bf749b`; нужен повтор против `7adb423`.
  - Повтор (2026-10-29, по решению пользователя): `make test-contract PLATFORM_LIMITS=legacy PLATFORM_DIR=/tmp/platform-7adb423` (git worktree `7adb423`, после прогона удалён). `[contract] Platform: 7adb423…, dirty: no` — 15 пройдено, 1 пропущен (AC-22 с B.1): AC-13, AC-14, AC-15 (C) и «AC-22 (без B.1)» зелёные — UC-5 A1 подтверждён. Для прогона добавлена переменная `PLATFORM_DIR` (Makefile, `platform-image.ts`).
  - ⛔ Решение пользователя: выпуска нет. AC-22 ожидающий; ветка E4 ждёт слияния доводки r11 Platform; тег `v1.1.0` не ставится. T14–T15 не выполняются.
  - Прогон на `a4fb27f` (r9, r10, без B.1): у CLI код 124. Диагностика PL-01: CLI не зависал, а медленно стартовал под нагрузкой хоста. Исправлено в PC-02: предел CLI 120 с и `PLATFORM_CLI_TIMEOUT_MS`.
  - **AC-22 зелёный** (2026-10-29, PC-03). Платформа r11 влита: `origin/main` = `513886e` (PRD Platform v1.14, D25).
    - Копия `limits.ts` перекопирована: добавлен `NULL_LIMITS`, ключи и правила значений прежние. Остальные копии не менялись, обновлена только ссылка `@ 513886e`.
    - AC-22 дополнен двумя проверками: у admin все семь ключей Limits со значениями тарифа; при общем отказе (`NOT_MEMBER`) все семь ключей `null`.
    - Прогон `make test-contract PLATFORM_DIR=<worktree 513886e>` без `PLATFORM_LIMITS`: `[contract] Platform: 513886e…, dirty: no`, `limits mode: b1`, 16 пройдено, 1 пропущен (вариант legacy).

<!-- Commit checkpoint: T9–T13 -->

### Phase 5: Выпуск 1.1.0 (только после зелёного AC-22 и ответа пользователя)

- [x] **Task 14: Версия 1.1.0, CHANGELOG, совместимость (NFR-5)** — после T13 (AC-22 зелёный)
  - `package.json`: `"version": "1.1.0"`.
  - CHANGELOG: `[Unreleased]` → `## [1.1.0] - <дата>` со вступлением: «Лимиты тарифа в ответе `permissions` (UC-5); контракт Platform `v1`, PRD Platform <версия с B.1>; слой C пройден на `<коммит T13>`». Пустой `[Unreleased]` над ним.
  - README «Совместимость»: строки `1.0.x` (`v1`, v1.11, `7adb423`, `^1.0.1`) и `1.1.x` (`v1`, <PRD Platform с B.1>, `<коммит T13>`, `^1.0.1`). Версию в инструкции по установке README и `docs/getting-started.md` поднять до 1.1.0, как в 1.0.1.
  - `test/package/docs.spec.ts`: тест NFR-5 — проверять обе строки (`1.0.x` с v1.11 и `7adb423`; `1.1.x` с PRD Platform и коммитом 7+ hex). Название: `NFR-5: README — таблица совместимости: 1.0.x и 1.1.x, контракт v1, PRD Platform и коммит, @verdeect/auth ^1.0.1`.
  - Проверить `test/package/release.spec.ts`: связь version ↔ CHANGELOG должна сойтись.
  - `make ci`.
  - Логи: нет.
  - **Skill:** nestjs-code test unit docs (MODIFY) — для `docs.spec.ts`; остальное — none (манифест и документация).

- [ ] **Task 15: Слияние и тег `v1.1.0` ⛔** — после T14
  - Перед действием — подтверждение пользователя (внешнее действие).
  - Слить `feature/e4-tariff-limits` в `main` (`--no-ff`, как E3), `git push origin main`.
  - `git tag v1.1.0` на коммите слияния, `git push origin v1.1.0` → CI: lint → test → build → publish (Trusted Publishing). Ручной `npm publish` запрещён.
  - Проверить job publish и `npm view @verdeect/platform-client@1.1.0 version`.
  - Логи: `[publish]` — существующий префикс `scripts/publish.mjs`.
  - **Skill:** none — git и CI.

### Phase 6: Документация

- [x] **Task 16: AGENTS.md и `/aif-docs`** — после T10, T12 (и T14, если выпуск идёт)
  - AGENTS.md: в «Структура проекта» — `src/core/limits.ts  # копия схемы Limits Platform (источник + коммит)`, `test/unit/limits.spec.ts`, `test/unit/client-limits.spec.ts`, `test/contract/ac-22-limits.spec.ts  # AC-22, UC-5`. Строку «Этапы E1 … готовы» дополнить E4. В «Внешние образцы и источники» — `catalog/domain/limits.ts`.
  - `/aif-docs` — обязательная точка: README, `docs/`, CHANGELOG согласованы с кодом.
  - Логи: нет.
  - **Skill:** none — документация.

## Commit Plan
- **Checkpoint 1** (T1–T8, плюс `.ai-factory/ROADMAP.md` с вехой E4 и этот план): `feat(core): limits в ответе permissions по копии Limits Platform, лимиты подделки (AC-20, AC-21)`
- **Checkpoint 2** (T9–T13): `test(contract): AC-22 limits; пример README и шаблон потребителя с setLimits`
- **Checkpoint 3** (T14): `chore(release): v1.1.0 — лимиты тарифа`
- **Checkpoint 4** (T16): `docs: AGENTS.md — E4`; T15 коммитов не создаёт (слияние и тег).

## Traceability

| ID | Задачи | Тест |
|---|---|---|
| UC-5 (основной) | T2–T4, T9 | `test/unit/client-limits.spec.ts` «AC-20: permissions().limits — пять ключей, в том числе из кэша»; `test/consumer/full/src/consumer.spec.ts` «UC-5: setLimits → limits после clear()» |
| UC-5 A1 | T3, T13 | `client-limits.spec.ts` «AC-20 / UC-5 A1: Platform v1.11 …»; `ac-22-limits.spec.ts` «AC-22 (без B.1) …» |
| UC-5 A2 | T3, T4 | `client-limits.spec.ts` «AC-20 / UC-5 A2: …» |
| UC-5 A3 | T7, T9 | `fake-platform.spec.ts` «AC-21: setLimits сливается …»; consumer «UC-5: setLimits …» |
| AC-20 | T1–T6 | `test/unit/limits.spec.ts` (шапка, ключи, совпадение с источником); `schemas.spec.ts` «AC-20: limits в ответе permissions (§3.2)»; `client-limits.spec.ts`; `test/perf/check.perf.spec.ts` AC-17 |
| AC-21 | T7–T10 | `fake-platform.spec.ts` «AC-21: …»; `test/package/consumer.spec.ts` «AC-12: пример «Тесты потребителя» в README совпадает с …» |
| AC-22 | T12, T13 | `test/contract/ac-22-limits.spec.ts` «AC-22: permissions() admin …», «AC-22: общий отказ (NOT_MEMBER) …» — зелёные на Platform `513886e`; «AC-22 (без B.1) …» |
| NFR-1 (AC-17) | T6 | `test/perf/check.perf.spec.ts` |
| NFR-5 | T14 | `test/package/docs.spec.ts` «NFR-5: …» |
| AC-12 | T9–T11 | `test/package/consumer.spec.ts` |
