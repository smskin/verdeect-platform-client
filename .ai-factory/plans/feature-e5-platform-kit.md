# План реализации: E5 «Platform на kit (1.1.2)» `@verdeect/platform-client`

Branch: feature/e5-platform-kit
Created: 2026-11-14

## Original Request
Реализуй этап roadmap «E5 Platform на kit (1.1.2)» по пакету требований requirements/0000-platform-client/ (ревизия r8, PRD v1.14).

Скоуп этапа: AC-23; prd.md §5.3 (все формы actor Platform принимаются в onPolicyChanged), §5.5 (конверт policyChanged подделки — actor {clientId: 'verdeect-platform-cli', channel: 'system'} без accountId), §7 «Стенд слоя C» шаги 4–5 (подготовка БД CLI verdeect-kit из /app/apps/platform, ключи DB_OWNER_PASSWORD/DB_APP_PASSWORD, проверка команд kit по коду выхода и отсутствию error, готовность по /health на порту метрик); AC-13, AC-14, AC-15 (C) и AC-22 — зелёные против Platform main 91b0123 (клон /home/administrator/projects/verdeect2/.cache/verdeect-platform через PLATFORM_DIR); копии из Platform (test/fixtures/platform-events.schema.json, identity-events.schema.json, src/core/codes.ts, src/core/limits.ts, src/testing/catalog.ts) — @ 91b0123 с обновлением ссылки на коммит в шапках, SOURCES.md, ARCHITECTURE.md, DESCRIPTION.md, .ai-factory/rules/base.md; выпуск 1.1.2 (version, CHANGELOG [1.1.2], таблица совместимости NFR-5, тег v1.1.2 через CI). Источник истины — requirements/0000-platform-client/prd.md; приоритет при конфликте: prd.md > ROADMAP/DESCRIPTION; переменные окружения сервиса Platform — по docs/deployment.md Platform @ 91b0123. Уже реализованные этапы E1–E4 — существующий код, не переделывай его без требования; публичный API пакета не меняется. Если в копиях Platform меняется что-то кроме actor событий и ссылки на коммит — не копируй, остановись и спроси меня. ../verdeect-platform — только чтение (ветку не переключать, fetch/pull/worktree не делать). Покрой все требования скоупа; ссылайся на их ID в задачах и в названиях тестов. Открытые вопросы [OPEN] не додумывай — спроси меня.

## Settings
- Testing: yes. Тесты обязательны для пакета требований (skill-context «Mandatory Test Phases», «Library Package Scope»): слой U, проверки пакета (`make ci`), слой C. Perf (AC-17) не затрагивается: горячий путь `check` не меняется.
- Logging: verbose. Ядро новых логов не пишет: §5.3 уже выполнен кодом, меняются только тесты. Подделка логов не пишет, как и сейчас. Стенд слоя C пишет с префиксом `[contract]`:
  - `info` `[contract] db mode: kit|legacy` — какой формой готовится БД;
  - `info` на каждую разовую команду: имя, код выхода, stdout (секретов в stdout нет; пароли передаются через `-e KEY` без значения, как сейчас);
  - `info` время готовности и число опросов (уже есть).
  Префиксов `[FIX]` не добавлять (memory «No [FIX] log prefix»).
- Docs: yes — обязательная точка `/aif-docs` в конце: README, `docs/testing.md`, `docs/releasing.md`, CHANGELOG, AGENTS.md.

## Roadmap Linkage
Milestone: "E5 Platform на kit (1.1.2)"
Rationale: план реализует ровно скоуп этапа E5 из `requirements/0000-platform-client/README.md` (AC-23; AC-13–15 (C), AC-22 против `91b0123`).

## Requirements Reconciliation

**Иерархия источников.** `requirements/0000-platform-client/prd.md` v1.14 (r8) > `.ai-factory/ROADMAP.md` / `DESCRIPTION.md`. Окружение сервиса и команды подготовки Platform — `docs/deployment.md` и `apps/platform/.env.example` Platform @ `91b0123`; при расхождении с перечнем §7 п. 5 прав Platform (так сказано в §7 п. 5).

**Milestone scope:** AC-23; AC-13, AC-14, AC-15 (C), AC-22 — повторный прогон против `91b0123`; §5.3 (формы `actor`), §5.5 (конверт `policyChanged` подделки), §7 шаги 4–5; NFR-5 (строка совместимости), выпуск 1.1.2. Остальные AC пакета закрыты E1–E4, их код — существующий.

**Состояние при планировании (2026-11-14).**
- `../verdeect-platform` содержит `91b0123` (только чтение: `git show`, `git diff`). Свой клон `/home/administrator/projects/verdeect2/.cache/verdeect-platform` стоит на `10b757b`, коммита `91b0123` в нём нет — T6 его обновляет (свой клон, правило PC-13 не нарушается).
- Сверка копий `10b757b..91b0123` (`git -C ../verdeect-platform diff --stat`): `decision-codes.ts`, `limits.ts`, `permissions.ts`, `modules.ts`, `identity-events.schema.json` — без изменений; `platform-events.schema.json` — только `actor`: `required: ["channel"]` вместо `["clientId","accountId","channel"]`, `clientId` — `{type: string, minLength: 1}` вместо `enum`. Условие пользователя («кроме actor и коммита — стоп») выполняется. Новые файлы `agent.usage.recorded.schema*.json` — не наши копии, не берём.
- §5.3 уже выполнен кодом: `src/core/schemas.ts:62` — `policyChangedSchema` (`z.looseObject`) не проверяет `actor`. Нужен только тест AC-23.
- §5.5: `src/testing/fake-platform.ts:505` — `actor: { clientId: 'verdeect-platform', accountId: null, channel: 'system' }` → меняется.
- §7 п. 5 уже есть в стенде (`platform-stand.ts` `waitReady`, `warmUp`): `waitReady` опрашивает `GET /health` на `METRICS_PORT=9100` + `checkQueue('platform')`, затем `warmUp`. Переменные сервиса совпадают с `.env.example` @ `91b0123` (обязательных ключей без умолчания сверх нынешних нет). Меняется только общий дедлайн (см. решения).
- §7 п. 4 — меняется: сейчас `node dist/cli.js db:prepare` (`PLATFORM_OWNER_PASSWORD`, `PLATFORM_APP_PASSWORD`) → `migrate` → `plan:apply`. Образ @ `91b0123`: WORKDIR `/app/apps/platform`, kit — `node_modules/.bin/verdeect-kit`, при ошибке пишет в stdout `{"error": …}` (`verdeect-kit/src/cli/commands/db.ts:222`), поля `ok` нет.

**Решения плана (в PRD не описаны):**
1. **Обе формы подготовки БД, автовыбор** (ответ пользователя 2026-11-14). Признак — наличие `node_modules/.bin/verdeect-kit` в образе (`docker run --rm -w /app/apps/platform <image> node -e "process.exit(require('node:fs').existsSync('node_modules/.bin/verdeect-kit')?0:1)"`: без shell, работает на любом node-образе). Есть → `kit`, нет → `legacy` (прежние команды PRD «До E5»). Так остаётся рабочим необязательный прогон `PLATFORM_LIMITS=legacy` против старых образов.
2. **Проверка команд** (§7 п. 4): `kit` — код 0 и ни одна строка stdout, разобранная как JSON-объект, не содержит поля `error`; `plan:apply` и все `legacy`-команды — код 0 и `{"ok":true` в stdout (как сейчас).
3. **Один дедлайн готовности** (§7 п. 5 «не дольше `PLATFORM_READY_TIMEOUT_MS`»): дедлайн считается до старта контейнера сервиса; старт (`Wait.forHttp('/ok')`), `waitReady` и прогрев получают остаток; прогрев — `min(30 с, остаток)`, его сбой по-прежнему `warn`.
4. **`docs/releasing.md`**: инструкция прогона против `main` Platform переводится с `git worktree add` в `../verdeect-platform` на свой клон (`git clone ../verdeect-platform <dir>` или `.cache/verdeect-platform`) — worktree пишет в чужой `.git` (правило PC-13 в `CLAUDE.md` воркспейса), а прогон E5 идёт именно через клон.

**Комбинации (стенд × образ Platform):**

| Образ | db mode | Шаг 4 | Проверка шага 4 | Прогон в плане |
|---|---|---|---|---|
| `91b0123`+ (kit) | `kit` | `verdeect-kit db prepare --service platform` (`DATABASE_ADMIN_URL`, `DB_OWNER_PASSWORD`, `DB_APP_PASSWORD`) → `db move-journal --from drizzle --to platform` → `db migrate --folder drizzle --schema platform` (`DATABASE_MIGRATOR_URL`) → `node dist/cli.js plan:apply --file seed/plans.json` (окружение сервиса) | kit: код 0, нет `error`; plan:apply: код 0, `{"ok":true` | T6, выпускной: AC-13, 14, 15 (C), 22 |
| `7adb423`–`10b757b` | `legacy` | `node dist/cli.js db:prepare` (`PLATFORM_OWNER_PASSWORD`, `PLATFORM_APP_PASSWORD`) → `migrate` → `plan:apply` | код 0, `{"ok":true` | T6, первый прогон на клоне `10b757b` (регрессия формы «До E5») |

**Формы `actor` (AC-23)** — все принимаются, сброс одинаковый: `{clientId: 'verdeect-platform', channel}`, `{clientId: 'verdeect-platform-cli', channel}`, `{channel}`, `{clientId: 'verdeect-platform-cli', accountId: null, channel}` (`channel: 'system'`).

**Реальный артефакт.** AC-15 (C) прогоняет настоящие события `platform.policy.changed` Platform `91b0123` (CLI `member:revoke` → `actor` без `accountId`) через ajv по перекопированной схеме и zod пакета; AC-23 проверяет конверт подделки ajv по той же копии.

**Architectural deviation (все `Skill: nestjs-code generic`).** Дерево решений `nestjs-specialist` к библиотеке неприменимо: (1) это библиотека, слои сервиса в ARCHITECTURE.md помечены «Не действуют»; (2) ARCHITECTURE.md предписывает `nestjs-code generic <path>` для компонентов библиотеки. Решение осознанное, как в E1–E4. Касается T2 и T4.

**`[OPEN]` пакета** (§10 п. 1 — подписка в kit, п. 2 — reserve/commit/release) в скоуп E5 не входят и не планируются.

## Tasks

### Phase 1: Копии @ `91b0123`, подделка, AC-23

- [x] **Task 1: Перекопировать копии Platform @ `91b0123`**
  - Сначала повторить сверку: `git -C ../verdeect-platform diff 10b757b 91b0123 -- apps/platform/contracts/events/platform-events.schema.json apps/platform/contracts/events/identity-events.schema.json apps/platform/src/modules/catalog/domain/decision-codes.ts apps/platform/src/modules/catalog/domain/limits.ts apps/platform/src/modules/catalog/domain/permissions.ts apps/platform/src/modules/catalog/domain/modules.ts`. Ожидается только блок `actor` в `platform-events.schema.json`. Любое другое отличие → ⛔ стоп, вопрос пользователю (условие запроса).
  - `test/fixtures/platform-events.schema.json`, `test/fixtures/identity-events.schema.json` — `git -C ../verdeect-platform show 91b0123:apps/platform/contracts/events/<file> > test/fixtures/<file>` (побайтно). `test/fixtures/SOURCES.md` — коммит `91b0123` в обеих строках.
  - `src/core/codes.ts`, `src/core/limits.ts`, `src/testing/catalog.ts` — только `@ 10b757b` → `@ 91b0123` в строке 1 шапки (тело совпадает с источником).
  - Тесты шапок: `test/unit/codes.spec.ts:44`, `test/unit/limits.spec.ts:18`, `test/unit/catalog.spec.ts:33` — `@ 91b0123`; тесты «совпадает с источником в коммите шапки» читают `../verdeect-platform` через `git show` — только чтение, `91b0123` там есть. Комментарий `test/perf/check.perf.spec.ts:6` — `@ 91b0123`.
  - Ссылки на коммит копий: `.ai-factory/DESCRIPTION.md` (стр. 9 «`main` `10b757b`+» → `91b0123`+, стр. 65), `.ai-factory/ARCHITECTURE.md:144`, `.ai-factory/rules/base.md:21` — `10b757b` → `91b0123`; в DESCRIPTION.md строку этапов дополнить E5. Иное в этих файлах не трогать.
  - Существующие образцы с `accountId: null` (`test/unit/schemas.spec.ts:38`, `test/unit/support/test-client.ts:81`) по новой копии остаются валидными (`accountId` — `type: null`, необязателен) — не менять.
  - `make test` зелёный (AC-8a, AC-11, AC-15 (U), AC-20).
  - Логи: нет (данные).
  - **Skill:** none — копии файлов и документация; `nestjs-code test unit codes|limits|catalog (MODIFY)` — для строк шапки в спеках.

- [x] **Task 2: `actor` конверта `policyChanged` подделки (§5.5)** — после T1
  - `src/testing/fake-platform.ts:505`: `actor: { clientId: 'verdeect-platform-cli', channel: 'system' }` — без `accountId`, как CLI Platform на `@verdeect/kit`. Публичный API не меняется: `FakePlatform.policyChanged` возвращает `unknown` (`fake-platform.ts:103`).
  - TSDoc `policyChanged` / раздел «Подделка» в `docs/testing.md`, если там показан `actor`, — привести к новой форме (grep `accountId` по `docs/`, `README.md`).
  - Логи: нет (подделка не логирует).
  - **Skill:** nestjs-code generic src/testing/fake-platform.ts (MODIFY).

- [x] **Task 3: Тесты AC-23 (слой U)** — после T1, T2
  - `test/unit/client-cache.spec.ts`, в `describe('AC-4: onPolicyChanged')` рядом с AC-4 (стр. 102), с локальным `warmUp()` (стр. 94–100) и `policyEvent` из `test/unit/support/test-client.ts`:
    - `it.each` по четырём формам из Reconciliation: `'AC-23: onPolicyChanged с actor %s сбрасывает снимки компании'` — `warmUp()` → `t.client.onPolicyChanged({ ...policyEvent('cmp_1', 8, { subs: ['usr_a'] }), actor })` → `check(HUMAN_A, PERMS[0])` даёт третий запрос с `minEpoch: 8`, `check(HUMAN_B, PERMS[0])` — без запроса (как AC-4); итог одинаков для всех форм.
  - `test/unit/fake-platform.spec.ts`: `it('AC-23: fake.policyChanged(t, [s]) — actor {clientId: verdeect-platform-cli, channel: system} без accountId, проходит ajv по копии platform-events.schema.json @ 91b0123')` — `toEqual` по `actor` и `'accountId' in actor === false`, `validate(envelope)` true. Существующий тест AC-8a (стр. 130) не трогать.
  - `test/unit/schemas.spec.ts`: в `describe('AC-15 …')` добавить `it.each` по четырём формам — `'AC-23: actor %s проходит ajv по копии и zod пакета'`.
  - Логи: нет.
  - **Skill:** nestjs-code test unit client-cache (MODIFY); nestjs-code test unit fake-platform (MODIFY); nestjs-code test unit schemas (MODIFY).

<!-- Commit checkpoint: T1–T3 -->

### Phase 2: Стенд слоя C под Platform на kit (§7 шаги 4–5)

- [x] **Task 4: Подготовка БД через `verdeect-kit`, автовыбор формы, общий дедлайн** — без зависимостей (параллельно Phase 1)
  - `test/contract/support/platform-stand.ts`:
    - `detectDbMode(image): Promise<'kit' | 'legacy'>` — команда из решения 1 (`runProcess`, предел `ONE_SHOT_TIMEOUT_MS`); код 0 → `kit`, 1 → `legacy`, иное → ошибка шага с stdout/stderr. Лог `info` `[contract] db mode: kit|legacy`.
    - `runCli` → `runOneShot(image, network, env, argv, check)`: `docker run --rm --network <net> -w /app/apps/platform -e KEY… <image> ...argv`; `check: 'ok' | 'no-error'`. `'ok'` — прежнее правило; `'no-error'` — код 0 и ни одна строка stdout, начинающаяся с `{` и разбираемая `JSON.parse`, не имеет ключа `error`. Лог — как сейчас (`[contract] cli <argv>: код N, stdout …`). Сообщение об ошибке — с хвостами stdout/stderr (п. 9).
    - Шаг 4, `kit`: `node_modules/.bin/verdeect-kit db prepare --service platform` с `{DATABASE_ADMIN_URL, DB_OWNER_PASSWORD, DB_APP_PASSWORD}` → `… db move-journal --from drizzle --to platform` и `… db migrate --folder drizzle --schema platform` с `{DATABASE_MIGRATOR_URL}` → `node dist/cli.js plan:apply --file seed/plans.json` с `serviceEnv` (`check: 'ok'`). Имена шагов: `п. 4: verdeect-kit db prepare` и т. д.
    - Шаг 4, `legacy`: прежние три команды без изменений поведения.
    - Пароли — `secret()` (32 hex ≥ 16 символов, требование kit). Комментарий шапки файла и `secret()` — упомянуть обе формы.
    - Шаг 5 (решение 3): `deadline = Date.now() + readyTimeoutMs()` до старта сервиса; `withStartupTimeout(remaining())`, `waitReady(…, remaining())`, `warmUp` с `AbortSignal.timeout(Math.min(WARMUP_TIMEOUT_MS, remaining()))` (при `remaining() <= 0` — `warn` без запроса). Окружение сервиса сверить с `apps/platform/.env.example` @ `91b0123` (`git -C ../verdeect-platform show`): обязательные без умолчания уже есть; лишнего не добавлять.
  - `test/contract/support/global-setup.ts`: строку `db mode` не дублировать — её пишет стенд.
  - `test/contract/support/ready-timeout.ts`: TSDoc `readyTimeoutMs` — «общий предел старта контейнера, опроса /health и прогрева» (решение 3).
  - Логи: см. Settings; секреты не в argv и не в логах (`redact` для URL).
  - **Skill:** nestjs-code generic test/contract/support/platform-stand.ts (MODIFY).

- [x] **Task 10: Unit-тесты разбора вывода разовых команд (§7 п. 4)** — после T4
  - В T4 логику проверки вынести в чистые экспортируемые функции `test/contract/support/platform-stand.ts`: `kitOutputOk(code: number, stdout: string): boolean` и `dbModeOf(code: number): 'kit' | 'legacy'` (иное — `Error`); `runOneShot` и `detectDbMode` вызывают их.
  - `test/unit/contract-stand.spec.ts` (новый, по образцу `test/unit/contract-broker.spec.ts` — импорт чистых функций из `test/contract/support/`):
    - `'§7 п. 4: kitOutputOk — код 0 и пустой stdout → true'`;
    - `'§7 п. 4: kitOutputOk — код ≠ 0 → false'`;
    - `'§7 п. 4: kitOutputOk — строка {"error":…} среди строк лога → false'`;
    - `'§7 п. 4: kitOutputOk — не-JSON строки и JSON без error игнорируются → true'`;
    - `'§7 п. 4: dbModeOf — 0 → kit, 1 → legacy, 2 → ошибка'`.
  - Тест не поднимает Docker и входит в `make test` (`test/unit/**`). `platform-stand.ts` на уровне модуля env не читает (`readyTimeoutMs()` — только при вызове), импорт безопасен.
  - Логи: нет.
  - **Skill:** nestjs-code test unit contract-stand (CREATE).

- [x] **Task 5: Документация стенда** — после T4
  - `docs/testing.md` (раздел слоя C): подготовка БД — автовыбор `kit`/`legacy`, строка `[contract] db mode`; стр. 81 — `PLATFORM_READY_TIMEOUT_MS` как общий предел старта, опроса `/health` и прогрева.
  - `docs/releasing.md` (решение 4): блок с `git worktree add` заменить на свой клон: `git clone ../verdeect-platform <dir>` (или существующий `.cache/verdeect-platform`: `git -C <dir> fetch origin`, `git -C <dir> checkout --detach <commit>`), `make test-full PLATFORM_DIR=<dir>`; фраза «Другой коммит Platform — тот же worktree» → «тот же клон на `<commit>`».
  - Логи: нет.
  - **Skill:** none — документация.

- [x] **Task 6: Прогоны слоя C ⛔** — после T3, T4, T5, T10
  - Свой клон `/home/administrator/projects/verdeect2/.cache/verdeect-platform` (сейчас `10b757b`, чистый):
    1. Прогон формы «До E5»: `make test-contract PLATFORM_DIR=/home/administrator/projects/verdeect2/.cache/verdeect-platform` → в выводе `[contract] Platform: 10b757b…, dirty: no`, `db mode: legacy`. Ожидание: AC-13, AC-14, AC-15 (C), AC-22 зелёные — события `10b757b` (`clientId` из прежнего enum, `accountId: null`) валидны и по новой копии. Красный — разобрать до шага 2.
    2. `git -C <клон> fetch origin`; если `91b0123` не пришёл — `git -C <клон> fetch /home/administrator/projects/verdeect2/verdeect-platform 91b0123` (чтение чужого репозитория, в него не пишет). `git -C <клон> checkout --detach 91b0123`.
    3. Выпускной прогон: `make test-full PLATFORM_DIR=<клон>` без `PLATFORM_LIMITS` → `[contract] Platform: 91b0123…, dirty: no`, `db mode: kit`, `limits mode: b1`; AC-13, AC-14, AC-15 (C), AC-22 зелёные; `lint`, `analyse`, `test`, `pack-check`, perf зелёные.
  - Код 124 CLI — медленный старт под нагрузкой (memory «Release flow lessons»): повтор с `PLATFORM_CLI_TIMEOUT_MS` / `TEST_TIMEOUT_SCALE`, не правка тестов. Perf `[test-timing] WARN` — повтор на тихой машине.
  - ⛔ Красный AC-13/14/15 (C)/22 на `91b0123` не из-за нагрузки — стоп, вопрос пользователю (контракт или копия). Результаты (коммит, число пройденных) записать в этот план под задачей.
  - Логи: `[contract]`.
  - **Skill:** none — команды.
  - **Результаты (2026-11-14):**
    1. `10b757b` (`dirty: no`, `db mode: legacy`, `limits mode: b1`): слой C — 4 файла, 17 passed, 1 skipped (`AC-22 (без B.1)`, только при `PLATFORM_LIMITS=legacy`).
    2. `91b0123` (`dirty: no`, `db mode: kit`, `limits mode: b1`), `make test-full`: unit 378 passed; package 27 passed; слой C — 4 файла, 17 passed, 1 skipped (то же); perf 2 passed, но `[test-timing] WARN` (load average 8.08, ядер 5) — perf для выпуска повторить на тихой машине (`make test-timing`).
    3. Повтор perf (load average 2.32, ядер 5): `make test-timing` — 2 passed без WARN, p99 = 0.0065 мс, 1355 B на снимок.

<!-- Commit checkpoint: T4, T10, T5, T6 -->

### Phase 3: Выпуск 1.1.2 (только после зелёного T6)

- [x] **Task 7: Версия 1.1.2, CHANGELOG, совместимость (NFR-5)** — после T6
  - `package.json`: `"version": "1.1.2"`; установка `1.1.2` в README (стр. 29, сейчас ещё `1.1.0`) и `docs/getting-started.md:12` (`1.1.1`).
  - `CHANGELOG.md`: `## [1.1.2] - <дата тега>` под пустым `[Unreleased]`. Вступление: «Контракт Platform `v1`, PRD Platform v1.26; слой C пройден на `verdeect-platform` `91b0123` (Platform на `@verdeect/kit`). Код клиента не меняется: `onPolicyChanged` уже принимает все формы `actor` (AC-23).» `### Changed`: конверт `policyChanged` подделки — `actor: {clientId: 'verdeect-platform-cli', channel: 'system'}` без `accountId`, как CLI Platform; тесты потребителя, сверяющие `actor` подделки дословно, нужно обновить.
  - README «Совместимость»: строка `1.1.x` — `v1`, v1.26, `91b0123`, `^1.0.1`; под строкой 1.1.1 добавить «1.1.2 — Platform ≥ `91b0123` для слоя C; конверт `policyChanged` подделки — `actor` без `accountId`, как CLI Platform на `@verdeect/kit`.» Строку `1.0.x` не трогать.
  - `test/package/docs.spec.ts` (тест NFR-5, стр. 102–122): добавить `expect(compatibility).toMatch(/1\.1\.2 — Platform ≥ `91b0123`/)`; строки 1.0.x/1.1.1 не менять.
  - `test/package/release.spec.ts` — связь version ↔ CHANGELOG сходится. `make ci` зелёный.
  - Логи: нет.
  - **Skill:** nestjs-code test unit docs (MODIFY) — для `docs.spec.ts`; остальное — none (манифест и документация).

- [x] **Task 8: Слияние и тег `v1.1.2` ⛔** — после T7, T9
  - Перед действием — подтверждение пользователя (внешнее действие).
  - Слить `feature/e5-platform-kit` в `main` (`--no-ff`, как E3/E4), `git push origin main`.
  - `git tag v1.1.2` на коммите слияния, `git push origin v1.1.2` → CI: lint → test → build → publish (Trusted Publishing). Ручной `npm publish` запрещён. `gh` нет — статус CI проверять по `npm view` (memory: `npm view` отстаёт на минуты, повторить).
  - `npm view @verdeect/platform-client@1.1.2 version` → `1.1.2`.
  - Логи: `[publish]` — существующий префикс `scripts/publish.mjs`.
  - **Skill:** none — git и CI.
  - **Результат (2026-11-14):** слияние `5c6e7d8` (`--no-ff`) в `main`, `make ci` на слиянии зелёный (unit 380, package 27); тег `v1.1.2` → CI publish; `npm view @verdeect/platform-client@1.1.2 version` → `1.1.2`, provenance SLSA v1.

### Phase 4: Документация

- [x] **Task 9: AGENTS.md и `/aif-docs`** — после T3, T5, T7, T10
  - AGENTS.md: строку «Этапы E1 … готовы» (стр. 21) дополнить E5 (Platform на kit, 1.1.2; слой C — `91b0123`); в «Структура проекта» — `test/unit/contract-stand.spec.ts  # §7 п. 4, разбор вывода разовых команд`; таблица стр. 139 — E4, E5; стр. 67 (комментарий `platform-stand.ts`) — «подготовка БД verdeect-kit (db prepare → move-journal → migrate) или db:prepare → migrate по образу (db mode), plan:apply»; стр. 108 — `PLATFORM_DIR=<клон>` вместо `<worktree>`.
  - `/aif-docs` — обязательная точка: README, `docs/`, CHANGELOG согласованы с кодом (grep `10b757b` вне CHANGELOG/истории совместимости — не должно остаться ссылок на коммит копий).
  - Логи: нет.
  - **Skill:** none — документация.

## Commit Plan
- **Checkpoint 1** (T1–T3, плюс `.ai-factory/ROADMAP.md` с этапом E5 и этот план): `feat(testing): actor подделки без accountId, копии Platform @ 91b0123 (AC-23)`
- **Checkpoint 2** (T4, T10, T5, T6): `test(contract): стенд слоя C под Platform на @verdeect/kit (§7 шаги 4–5)`
- **Checkpoint 3** (T7, T9): `chore(release): v1.1.2 — Platform на kit`; T8 коммитов не создаёт (слияние и тег).

## Traceability

| ID | Задачи | Тест |
|---|---|---|
| AC-23 (§5.3, формы `actor`) | T3 | `test/unit/client-cache.spec.ts` «AC-23: onPolicyChanged с actor %s сбрасывает снимки компании»; `test/unit/schemas.spec.ts` «AC-23: actor %s проходит ajv по копии и zod пакета» |
| AC-23 (§5.5, подделка) | T2, T3 | `test/unit/fake-platform.spec.ts` «AC-23: fake.policyChanged(t, [s]) — actor … без accountId, проходит ajv …» |
| AC-13 (C) | T4, T6 | `test/contract/ac-13-catalog.spec.ts` — зелёный на `91b0123` |
| AC-14 (C) | T4, T6 | `test/contract/ac-14-revocation.spec.ts` — зелёный на `91b0123` |
| AC-15 (C) | T1, T4, T6 | `test/contract/ac-15-scope.spec.ts` — настоящие события `91b0123` проходят ajv по копии @ `91b0123` и zod |
| AC-22 (C) | T4, T6 | `test/contract/ac-22-limits.spec.ts` — зелёный на `91b0123`, `limits mode: b1` |
| §7 шаг 4 (kit / legacy) | T4, T10, T6 | `test/unit/contract-stand.spec.ts` «§7 п. 4: kitOutputOk …», «§7 п. 4: dbModeOf …»; прогоны T6: `db mode: kit` на `91b0123`, `db mode: legacy` на `10b757b` |
| §7 шаг 5 (`/health`, дедлайн) | T4, T6 | прогоны T6 (лог готовности) |
| Копии @ `91b0123` (AC-8a, AC-11, AC-15 U, AC-20) | T1 | `test/unit/catalog.spec.ts`, `codes.spec.ts`, `limits.spec.ts` (шапка и совпадение с источником); `schemas.spec.ts` AC-15 |
| NFR-5 | T7 | `test/package/docs.spec.ts` «NFR-5: README — таблица совместимости …» |
| Выпуск 1.1.2 | T7, T8 | `test/package/release.spec.ts`; `npm view @verdeect/platform-client@1.1.2 version` |
