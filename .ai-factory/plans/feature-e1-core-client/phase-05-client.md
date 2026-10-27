# Фаза 5: `PlatformAuthzClient`

Plan: [index.md](index.md)
Tasks: 24-28
Depends on: Phase 3, Phase 4

## Цель

`createPlatformAuthzClient` собирает настройки, ограничитель логов, транспорт, кэш и решение в публичный клиент §5.1: `check`, `checkMany`, `permissions({fresh})`, `onPolicyChanged`, `clear`, `raw.*`. Точка входа `.` экспортирует публичную поверхность. Поведенческие AC слоя U проходят на уровне клиента: AC-1–AC-7, AC-7a, AC-7b, AC-8, AC-8b, AC-18, AC-19.

## Свидетельства из текущего кода

| Путь | Символы | Зачем |
|---|---|---|
| `src/core/options.ts` (Task 13) | `resolveOptions`, `ResolvedClientOptions` | Первый шаг фабрики |
| `src/core/log-limiter.ts` (Task 14) | `createLogLimiter`, `LogLimiter.contractError` | `error` о контракте — один раз на вызывающего, с ограничением частоты |
| `src/core/transport.ts` (Task 15) | `createTransport`, `Transport.post` | Запросы `permissions`, `check`, `batch` |
| `src/core/token-provider.ts` (Task 16) | `clientCredentials` | Реэкспорт из `index.ts` |
| `src/core/cache.ts` (Task 21) | `SnapshotCache`, `snapshotKey`, `AcceptResult` | Состояние клиента |
| `src/core/decide.ts` (Task 22) | `assertDecidableSubject`, `normalizePermissions`, `needsPepReread`, `decideMany` | Шаги §5.2 |
| `src/core/schemas.ts` (Task 10) | `parsePermissionsResponse`, `parsePolicyChanged` | Проверка ответа и конверта |
| `test/unit/support/*` (Task 17, 23) | `createFetchStub`, `createClock`, `createRecordingLogger`, `createRecordingMetrics`, `createTokenStub`, `allowedSnapshot`, `generalDeny`, `HUMAN_A`, `agent` | Тесты клиента |

## Файлы для изменения

| Путь | Действие | Что сделать |
|---|---|---|
| `src/core/client.ts` | create | `createPlatformAuthzClient` |
| `src/core/index.ts` | modify | Явный список публичных экспортов |
| `test/unit/support/test-client.ts` | create | `createTestClient` — клиент с подделками |
| `test/unit/client-cache.spec.ts` | create | AC-1, AC-2, AC-3, AC-4, AC-19 (LRU, `clear()`) |
| `test/unit/client-freshness.spec.ts` | create | AC-5, AC-6, AC-7 |
| `test/unit/client-api.spec.ts` | create | AC-7a, AC-7b, AC-8, AC-8b, AC-18, AC-19 («Логи») |

## Task 24: Клиент (`src/core/client.ts`)

### Зачем
Публичный объект §5.1 — единственная точка, через которую потребитель (а в E2 — guard и подделка) работает с ядром. Здесь находится вся оркестровка: промах, объединение запросов, повторное чтение по `pep` с `refreshAfter`, «Приём ответа» с логами и метриками, `fresh`, `raw`, событие, `clear`.

### Шаги реализации
1. Создать `src/core/client.ts`. Первая строка: `// PlatformAuthzClient (prd.md §5.1–5.3, D3–D7): решение из кэша снимка, свежесть через minEpoch, сброс по событию, raw.`
2. Экспорт:
   ```ts
   /** Создаёт клиента; неверные настройки — TypeError с именами параметров (§5.1). */
   export function createPlatformAuthzClient(options: PlatformAuthzClientOptions): PlatformAuthzClient;
   ```
3. Сборка:
   ```ts
   const o = resolveOptions(options);
   const limiter = createLogLimiter(o.logger, o.clock);
   const transport = createTransport({ baseUrl: o.baseUrl, tokenProvider: o.tokenProvider, fetch: o.fetch, clock: o.clock, requestTimeoutMs: o.requestTimeoutMs, traceparent: o.traceparent, logger: o.logger, metrics: o.metrics, limiter });
   const cache = new SnapshotCache({ maxEntries: o.maxEntries, lastSeenMaxEntries: o.lastSeenMaxEntries, cacheTtlMs: o.cacheTtlMs, denyTtlMs: o.denyTtlMs });
   ```
4. Внутренние функции (замыкания, не экспортируются).
   - `maxDefined(a?: number, b?: number): number | undefined` — максимум из заданных или `undefined`.
   - `requestSnapshot(subject, key, minEpoch)` — запрос `permissions` с объединением (§5.2):
     ```
     joined = cache.joinInflight(key, minEpoch)
     if joined: logger?.debug({ tenantId, sub, act, minEpoch }, 'snapshot request joined'); return joined
     generation = cache.generation
     body = { sub, tenant, tenantId, act } плюс minEpoch, только если задан   // без pep, asid, wid (§3.2, D5)
     logger?.debug({ tenantId, sub, act, minEpoch }, 'snapshot request')
     promise = transport.post('permissions', body, parsePermissionsResponse).then((snapshot) => {
         result = cache.accept({ key, tenantId, snapshot, requestedMinEpoch: minEpoch, generation, now: clock() })
         if result.kind === 'stale': metrics?.cacheResult('stale'); logger?.warn({ tenantId, sub, epoch: snapshot.epoch, lastSeenEpoch: result.lastSeenEpoch }, 'STALE_SNAPSHOT')
         if result.kind === 'pep_ahead': logger?.warn({ tenantId, sub, epoch: snapshot.epoch, minEpoch }, 'PEP_AHEAD')
         return snapshot
     })
     cache.trackInflight(key, minEpoch, promise)
     return promise
     ```
     `warn` и метрика пишутся один раз на HTTP-запрос: в `.then` общего промиса, а не у каждого присоединившегося.
   - `decideFor(subject, permissions)` — шаги 1–6 §5.2:
     ```
     assertDecidableSubject(subject)                                        // шаг 1, без запроса
     key = snapshotKey(subject.tenantId, subject.sub, subject.act)
     pep = subject.act === 'agent' ? subject.pep : undefined
     now = clock()
     cached = cache.get(key, now)
     requested = false
     if cached: snapshot = cached.snapshot; requestedMinEpoch = cached.requestedMinEpoch
     else:                                                                   // шаг 2
         requestedMinEpoch = maxDefined(cache.lastSeen(subject.tenantId), pep)
         metrics?.cacheResult('miss'); logger?.debug({ tenantId, sub, act, minEpoch: requestedMinEpoch }, 'snapshot cache miss')
         snapshot = await requestSnapshot(subject, key, requestedMinEpoch); requested = true
     // шаг 5, pep > epoch: повторное чтение — если снимок запрошен с minEpoch < pep и refreshAfter не задан или прошёл
     if pep !== undefined && needsPepReread(snapshot, subject) && (requestedMinEpoch ?? 0) < pep && (cached?.refreshAfter === undefined || now >= cached.refreshAfter):
         minEpoch = maxDefined(cache.lastSeen(subject.tenantId), pep)
         metrics?.cacheResult('miss'); requested = true
         try: snapshot = await requestSnapshot(subject, key, minEpoch)       // ответ — через «Приём ответа», затем снова с шага 3
         catch error:
             if !(error instanceof PlatformUnavailableError): throw error  // PlatformContractError — вызывающему
             cache.deferRefresh(key, clock() + o.denyTtlMs)                  // D6: срок жизни и minEpoch снимка не меняются
             logger?.debug({ tenantId, sub, pep, epoch: snapshot.epoch }, 'pep re-read failed, deciding by cached snapshot')
             // warn PLATFORM_UNAVAILABLE уже записал транспорт через ограничитель (NFR-3)
     if !requested: metrics?.cacheResult('hit')
     decisions = decideMany(snapshot, subject, permissions)                 // шаги 3–6; pep > epoch → по снимку
     if subject.act === 'agent': logger?.debug({ tenantId, sub, permissions, pep, epoch: snapshot.epoch, asid: subject.asid, wid: subject.wid, results: <по каждому праву: true | код> }, 'agent decision')   // §3.2: asid и wid — только в лог debug
     return decisions
     ```
     Повторное чтение возможно только для снимка из кэша: снимок, только что полученный с `minEpoch = max(lastSeen, pep)`, уже запрошен с `minEpoch ≥ pep` («если и после этого `pep > epoch` → решение по снимку»).
   - `withContractLog(fn)` — обёртка публичных асинхронных методов: при `PlatformContractError` вызывает `limiter.contractError(error.code, typeof error.details.permission === 'string' ? { permission: error.details.permission } : {})` и пробрасывает ошибку. Другие ошибки пробрасываются без лога: недоступность уже записал транспорт.
5. Публичные методы:
   ```
   check: withContractLog(async (subject, permission) => {
       decisions = await decideFor(subject, [permission])
       decision = decisions[permission]; if decision === undefined → throw new Error('platform-client: invariant: decision missing')   // недостижимо, нужно для noUncheckedIndexedAccess
       return decision
   })
   checkMany: withContractLog(async (subject, permissions) => decideFor(subject, normalizePermissions(permissions)))   // [] → VALIDATION_FAILED до шага 1 и без запроса
   permissions: withContractLog(async (subject, options) => {
       key = snapshotKey(subject.tenantId, subject.sub, subject.act)
       if options?.fresh !== true:
           cached = cache.get(key, clock()); if cached: metrics?.cacheResult('hit'); return cached.snapshot
       metrics?.cacheResult('miss')
       return requestSnapshot(subject, key, cache.lastSeen(subject.tenantId))   // fresh: мимо кэша, minEpoch по §3.2, объединение действует; ошибка не подменяется кэшем (D6)
   })
   onPolicyChanged(envelope) {                                              // без исключений (§5.1, UC-3 A2)
       parsed = parsePolicyChanged(envelope)
       if !parsed.ok: metrics?.policyEvent('invalid'); logger?.warn({ issues: parsed.issues }, 'invalid platform.policy.changed envelope'); return
       { raised, deleted } = cache.applyPolicyChange(event.tenantId, event.epoch, event.subs)
       metrics?.policyEvent(raised ? 'applied' : 'ignored')
       logger?.debug({ tenantId, epoch, subs: event.subs?.length ?? 'all', deleted, applied: raised }, 'platform.policy.changed')
   }
   clear() { cache.clear(); logger?.debug({}, 'cache cleared') }      // ожидания clientCredentials не трогает (§5.1)
   raw: {
       check: withContractLog((body) => transport.post('check', body, (json) => json)),
       batch: withContractLog((body) => transport.post('batch', body, (json) => json)),
       permissions: withContractLog((body) => transport.post('permissions', body, parsePermissionsResponse)),
   }
   ```
   - `raw.*` не читает и не пишет кэш и не подставляет `minEpoch`. Тело уходит как есть, ответы `check` и `batch` возвращаются `unknown` без проверки. Невалидный JSON даёт `undefined` → `INVALID_RESPONSE` (§5.1 «`raw.*`»).
   - `subject` в `permissions` имеет тип `Omit<Subject, 'pep'>`; `pep` не используется и в тело не попадает.
6. Объект клиента возвращается как литерал, удовлетворяющий `PlatformAuthzClient`. `raw` — `readonly`.

### Интерфейсы и контракты
- Сигнатуры — `PlatformAuthzClient` (Task 7, §5.1).
- Тело запроса `permissions` — только `sub`, `tenant`, `tenantId`, `act` и `minEpoch` (если задан). `pep`, `asid`, `wid` не передаются никогда (§3.2, D5, AC-6).

### Свидетельства требований
- §5.1 (клиент, `fresh`, `raw`, `clear`, логгер, метрики), §5.2 (шаги 1–6, «Приём ответа», объединение, `checkMany`), §5.3 (`onPolicyChanged`), D3–D7, NFR-2, NFR-3; комбинации — таблица в `index.md` → Requirements Reconciliation.

### Ошибки и логирование
- `debug`: `'snapshot cache miss'`, `'snapshot request'`, `'snapshot request joined'`, `'pep re-read failed, deciding by cached snapshot'`, `'agent decision'` (с `asid`, `wid`), `'platform.policy.changed'`, `'cache cleared'`.
- `warn`: `'STALE_SNAPSHOT'`, `'PEP_AHEAD'`, `'invalid platform.policy.changed envelope'` — без ограничения (NFR-3). `'PLATFORM_UNAVAILABLE'` пишет транспорт.
- `error`: `'PlatformContractError'` через `limiter.contractError` — не чаще раза в 60 с на код.
- Допустимые поля: `sub`, `tenantId`, `act`, `permission(s)`, `code`, `epoch`, `minEpoch`, `pep`, `asid`, `wid`. Запрещены токен, `Authorization`, `clientSecret`, тело ответа Platform целиком.

### Тесты
Task 26–28.

### Критерии приёмки
- `createPlatformAuthzClient({ baseUrl: 'platform:3000', tokenProvider })` → `TypeError` (AC-19).
- Сценарии AC-1–AC-8b, AC-18, AC-19 проходят (Task 26–28).

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/client.ts (CREATE). В сервисе оркестровка была бы `use-case`, но у библиотеки нет модулей, DI и транзакций: это фабрика публичного объекта.

## Task 25: Публичный контракт ядра (`src/core/index.ts`)

### Зачем
`exports["."]` отдаёт только перечисленное (ARCHITECTURE «Взаимодействие слоёв»). Внутренние модули (`schemas`, `cache`, `decide`, `transport`, `log-limiter`, `options`, `codes`) наружу не выходят.

### Шаги реализации
1. Заменить содержимое `src/core/index.ts`:
   ```ts
   // Точка входа "." @verdeect/platform-client (prd.md §5.1): публичный контракт ядра — явный список реэкспортов.
   export { createPlatformAuthzClient } from './client.js';
   export { PlatformContractError, PlatformUnavailableError, type UnavailableReason } from './errors.js';
   export { clientCredentials } from './token-provider.js';
   export type {
       Act,
       AllowedPermissions,
       ClientCredentialsOptions,
       Decision,
       DecisionCode,
       DeniedPermissions,
       GeneralDenyCode,
       MetricsEndpoint,
       MetricsRequestResult,
       ModuleState,
       PermissionDenyCode,
       PermissionsOptions,
       PermissionsResponse,
       PlatformAuthzClient,
       PlatformAuthzClientOptions,
       PlatformAuthzRaw,
       PlatformClientLogger,
       PlatformClientMetrics,
       Subject,
       TokenProvider,
   } from './types.js';
   ```

### Интерфейсы и контракты
- Значения: `createPlatformAuthzClient`, `clientCredentials`, `PlatformUnavailableError`, `PlatformContractError` (§5.1). Остальное — только типы.
- `DECISION_MESSAGES` и `PLATFORM_UNAVAILABLE_MESSAGE` не экспортируются: §5.1 их не перечисляет, а `src/nest` в E2 берёт их из `../core/codes.js` и `../core/errors.js` напрямую.

### Свидетельства требований
- §5.1 (публичный API), NFR-4 (схемы не экспортируются), D2.

### Ошибки и логирование
Не применимо.

### Тесты
Task 28 (`it('§5.1: публичные экспорты ядра')`).

### Критерии приёмки
- `Object.keys(await import('../../src/core/index.js')).sort()` = `['PlatformContractError', 'PlatformUnavailableError', 'clientCredentials', 'createPlatformAuthzClient']`.

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0; `pnpm build` → 0.

**Skill:** nestjs-code generic src/core/index.ts (MODIFY)

## Task 26: Тесты клиента — кэш, объединение, событие, LRU, `clear()` (AC-1–AC-4, AC-19)

### Шаги реализации
1. Создать `test/unit/support/test-client.ts`:
   ```ts
   export interface TestClient {
       readonly client: PlatformAuthzClient;
       readonly stub: FetchStub;
       readonly clock: TestClock;
       readonly log: RecordingLogger;
       readonly metrics: RecordingMetrics;
       readonly tokens: TokenStub;
       permissionsRequests(): RecordedRequest[];   // только /v1/authz/permissions
   }
   export function createTestClient(options?: { readonly handler?: StubHandler; readonly overrides?: Partial<PlatformAuthzClientOptions> }): TestClient;
   ```
   Значения по умолчанию: `baseUrl: 'http://platform:3000'`, `tokenProvider: tokens.provider`, `fetch: stub.fetch`, `clock: clock.now`, `logger: log.logger`, `metrics: metrics.metrics`. Обработчик по умолчанию: путь `/v1/authz/permissions` → `{ status: 200, json: allowedSnapshot() }`.
2. Создать `test/unit/client-cache.spec.ts` (первая строка — `// Клиент: кэш и объединение (prd.md §5.2, §5.3, D3, D4): AC-1, AC-2, AC-3, AC-4, AC-19 (LRU, clear).`).
   - `describe('AC-1: один запрос permissions на участника за TTL', …)`:
     - `it('AC-1: 100 вызовов check по 10 разным правам → 1 запрос; через 61 с → второй')`: снимок со всеми 10 правами `PERMS`, `check(HUMAN_A, PERMS[i % 10])` × 100 → `permissionsRequests().length === 1`; `clock.advance(61_000)`; `check` → 2.
   - `describe('AC-2: объединение одновременных запросов', …)`:
     - `it('AC-2: 50 одновременных check при пустом кэше → 1 запрос')`: обработчик ждёт `gate`.
     - `it('AC-2: ошибка этого запроса → все 50 получают PlatformUnavailableError')`: `gate.open({ status: 503 })`; `Promise.allSettled` — 50 отказов типа `PlatformUnavailableError`.
   - `describe('AC-3: общий отказ кэшируется denyTtl', …)`:
     - `it('AC-3: COMPANY_SUSPENDED — на 4-й секунде без запроса, на 6-й — новый запрос')`.
     - `it('AC-3: NOT_MEMBER с epoch: null при lastSeenEpoch = 8 → в кэше 5 с, без STALE_SNAPSHOT и PEP_AHEAD; на 4-й секунде без запроса')`: `lastSeenEpoch = 8` задаётся через `client.onPolicyChanged(policyEvent('cmp_1', 8))`; в `log.entries` нет `warn` с этими сообщениями.
   - `describe('AC-4: onPolicyChanged', …)` — помощник `policyEvent(tenantId, epoch, data?: Record<string, unknown>)` строит конверт как в Task 12:
     - `it('AC-4: subs: [A] удаляет снимок A и не трогает B той же компании')`: снимки A и B (эпоха 7), событие 8 → `check` A → запрос, `check` B → без запроса.
     - `it('AC-4: без subs — удаляются оба')`, `it('AC-4: subs: [] — оба')`.
     - `it('AC-4: эпоха события ≤ эпохи снимка — без удаления')` (событие 7 при снимке 7).
     - `it('AC-4: незнакомый reason и лишнее поле в data → сброс выполнен')`.
     - `it.each([...])('AC-4: %s → warn, без исключения, кэш цел', …)` — нет `data.tenantId`; `epoch: 0`; `null`; строка; не тот `type`. `expect(() => client.onPolicyChanged(env)).not.toThrow()`, `check` → без запроса, есть `warn 'invalid platform.policy.changed envelope'`.
     - `it('AC-4: maxEntries 100, события по 11 компаниям → в lastSeenEpoch 10, самая старая вытеснена; запрос по ней без minEpoch')`: `overrides: { maxEntries: 100 }`; события `cmp_1…cmp_11` эпохи 5; `check` по `cmp_1` → тело без `minEpoch`; по `cmp_11` → `minEpoch: 5`.
   - `describe('AC-19: LRU снимков', …)`:
     - `it('AC-19: maxEntries 100, снимки 101 участника → самый давний вытеснен (check → новый запрос), недавний — без запроса')`.
     - `it('AC-19: сброс компании после вытеснения — без ошибок, недавние сброшены')`: событие без `subs` → `check` недавнего → запрос.
   - `describe('AC-19: clear()', …)`:
     - `it('AC-19: после clear() check → новый запрос без minEpoch')`: до этого событие эпохи 8 → запрос с `minEpoch: 8`; `clear()`; `check` → тело без `minEpoch`.
     - `it('AC-19: запрос до clear() и завершённый после → возвращён вызывающему, следующий check — снова запрос')`.
     - `it('AC-19: токен после clear() повторно не запрашивается')`: клиент с `tokenProvider: clientCredentials({ tokenUrl: 'http://identity:3000/oidc/token', clientId: 'verdeect-files', clientSecret: CLIENT_SECRET, scope: 'platform:authz', resource: 'https://api.verdeect.ru', fetch: stub.fetch, clock: clock.now })`; обработчик ведёт `/oidc/token` (`TOKEN_1`, `expires_in: 300`) и `/v1/authz/permissions`. `check` → `clear()` → `check` (новый запрос к Platform) → запросов к `/oidc/token` ровно 1, оба запроса к Platform с `Bearer TOKEN_1`.
     - `it('AC-19: запрос по A идёт, clear(), новый check(A) → отдельный второй запрос; ответ первого — только первому вызывающему')`: два `gate`; первый ответ — снимок с `memberId: 'mem_old'`, второй — `'mem_new'`; каждый вызывающий получает решение со своим `memberId`.

### Свидетельства требований
- AC-1, AC-2, AC-3, AC-4, AC-19 (LRU, `clear()`), D3, D4, §5.3, UC-1 A1, UC-3 A2.

### Ошибки и логирование
Не применимо (тесты).

### Тесты
Эти файлы. Команда: `pnpm test`.

### Критерии приёмки
- Все кейсы зелёные.

### Проверка
- `pnpm test` → 0.

**Skill:** nestjs-code generic test/unit/support/test-client.ts (CREATE); nestjs-code test unit client-cache (CREATE)

## Task 27: Тесты клиента — свежесть и недоступность (AC-5, AC-6, AC-7)

### Шаги реализации
1. Создать `test/unit/client-freshness.spec.ts` (первая строка — `// Клиент: свежесть и fail-closed (prd.md §5.2, §5.3, D5, D6): AC-5, AC-6, AC-7.`).
   - `describe('AC-5: minEpoch и STALE_SNAPSHOT', …)`:
     - `it('AC-5: после события с эпохой 8 запрос permissions содержит minEpoch: 8')`.
     - `it('AC-5: ответ эпохи 7 на запрос, начатый до события 8 → возвращён вызывающему, в кэш не записан, warn STALE_SNAPSHOT, метрика stale')`: обработчик ждёт `gate`; во время ожидания `onPolicyChanged(8)`; `gate.open(epoch 7)`; решение получено; следующий `check` → новый запрос с `minEpoch: 8`.
   - **Правило подготовки снимка агента** (действует для всех кейсов ниже со словами «снимок … в кэше» у агента, а также для AC-8b, AC-18 «повторное чтение» и AC-19 «debug решения агента» в Task 28). Ключ кэша содержит `act` (`snapshotKey(tenantId, sub, act)`, Task 21; prd.md §5.3), поэтому снимок, полученный для `HUMAN_A`, агенту `agent(…)` с тем же `sub` не отдаётся. Снимок агента готовится так:
     1. `await client.check(agent(7), PERMS[0])` при ответе `allowedSnapshot({ epoch: 7 })`. При `pep = 7` и неизвестном `lastSeenEpoch` это ровно один запрос с `minEpoch: 7`; снимок кэшируется под ключом агента с `requestedMinEpoch = 7`.
     2. Счётчики (`permissionsRequests().length`, `metrics.calls`, `log.entries`) снимаются после подготовки, и проверяется только их прирост.
   - `describe('AC-6: pep агента (D5)', …)`:
     - `it('AC-6: pep < epoch → CONTEXT_REVOKED без запроса')`: подготовка `agent(7)` (снимок 7), затем `agent(6)` → `CONTEXT_REVOKED`, прирост запросов — 0.
     - `it('AC-6: пустой кэш, pep 9, lastSeenEpoch 8 → ровно один запрос с minEpoch: 9 и без pep, asid, wid')`.
     - `it('AC-6: снимок epoch 7 в кэше, pep 8 → один запрос с minEpoch 8; ответ epoch 8 → по праву; следующий вызов без запроса')`: подготовка `agent(7)`; прирост запросов после `agent(8)` — ровно 1.
     - `it('AC-6: ответ epoch < pep → warn PEP_AHEAD, решение по снимку, 4 с без запросов, на 6-й секунде ровно один запрос с minEpoch = pep')`.
     - `it('AC-6: 10 одновременных вызовов с pep 8 → один запрос')`.
     - `it('AC-6: идёт запрос с minEpoch 8, вызов с pep 9 → второй запрос с minEpoch 9; ответ первого (8) не затирает ответ второго (9)')`: второй отвечает первым (эпоха 9), затем первый (эпоха 8); следующий `check` с `pep = 9` → без запроса, решение по снимку 9.
     - `it('AC-6: pep = 0 → PlatformContractError VALIDATION_FAILED, запроса нет')`.
     - `it('AC-6: агент без pep → PlatformContractError PEP_REQUIRED, запроса нет')`.
     - `it('AC-6: пустой кэш, pep 9, lastSeenEpoch 8, ответ epoch 8 → по снимку, warn PEP_AHEAD, второго запроса нет; через 6 с — ровно один запрос')`.
     - `it('AC-6: lastSeenEpoch 8, ответ epoch 7 при pep 9 → STALE_SNAPSHOT, не PEP_AHEAD, в кэше пусто')`.
   - `describe('AC-7: Platform недоступен (D6)', …)`:
     - `it.each([['503', { status: 503 }], ['обрыв', 'network-error']])('AC-7: %s — снимок в пределах TTL → решение из него; снимок истёк → PlatformUnavailableError', …)`: снимок получен на `t = 0`; обработчик переключён на сбой; `t = 30 с` → решение без запроса; `t = 61 с` → отказ.
     - `it('AC-7: таймаут 2 с, снимка нет → PlatformUnavailableError')`: фейковые `setTimeout`/`clearTimeout`, ответ `'hang'`.
     - `it('AC-7: 401 → getToken({refresh: true}) ровно один раз, повтор с новым токеном; повтор 401 → PlatformUnavailableError, третьего запроса нет')`.
     - `it('AC-7: снимок epoch 7 со сроком ещё 55 с, агент pep 8, Platform 503 → решение по снимку, warn PLATFORM_UNAVAILABLE; 4 с без запросов; на 6-й секунде новая попытка, снова 503 → по снимку; на 54-й секунде — по снимку; на 56-й → PlatformUnavailableError')`: снимок получен на `t = 0` подготовкой `agent(7)` (TTL 60 с, ключ агента); начало сценария `T0 = 5000` мс; все отметки — от `T0`.
     - `it('AC-7: тот же сценарий, Platform поднялся на 6-й секунде → свежий снимок, решение по нему')`: ответ epoch 8 → по праву.
     - `it('AC-7: permissions({fresh: true}) при 503 → PlatformUnavailableError даже при годном снимке')`.
     - `it('AC-7: 100 вызовов за 5 с при 503 и пустом кэше → один warn; следующий — не раньше 10-й секунды с suppressed: 99; request(permissions, unavailable) на каждый запрос')`: 100 последовательных `check` на `t = 0, 50, …, 4950` мс → 100 запросов, ровно одна запись `warn 'PLATFORM_UNAVAILABLE'` (`suppressed: 0`); затем `clock.set(10_000)` и один `check` → вторая запись с `{ endpoint: 'permissions', suppressed: 99 }`. Промежуточных вызовов между 4950 и 10 000 мс нет: каждый из них увеличил бы `suppressed`. Метрика `request('permissions', 'unavailable', …)` вызвана 101 раз — по числу запросов.

### Свидетельства требований
- AC-5, AC-6, AC-7, D5, D6, UC-2 (основной, A1–A4), UC-1 A2, UC-3 A1, NFR-3.

### Ошибки и логирование
Не применимо (тесты).

### Тесты
Этот файл. Команда: `pnpm test`.

### Критерии приёмки
- Все кейсы зелёные.

### Проверка
- `pnpm test` → 0.

**Skill:** nestjs-code test unit client-freshness (CREATE)

## Task 28: Тесты клиента — контракт, `fresh`, `raw`, `checkMany`, метрики, логи (AC-7a, AC-7b, AC-8, AC-8b, AC-18, AC-19)

### Шаги реализации
1. Создать `test/unit/client-api.spec.ts` (первая строка — `// Клиент: ошибки контракта, fresh, raw, checkMany, метрики, логи (prd.md §5.1, §5.2): AC-7a, AC-7b, AC-8, AC-8b, AC-18, AC-19.`).
   - `describe('AC-7a: ошибки контракта Platform', …)`:
     - `it.each([[403, 'SCOPE_REQUIRED'], [404, 'HTTP_404'], [422, 'TENANT_MISMATCH']])('AC-7a: %s → PlatformContractError %s; кэш пуст; токен не перезапрашивался; второго запроса нет', …)`: для 404 обработчик отдаёт `text: 'Not Found'`. После ошибки: `tokens.calls` без `refresh`; следующий `check` снова делает запрос (кэш пуст).
     - `it('AC-7a: 10 повторов одного кода → один error-лог за 60 с')`: 10 × `check` с 422 → `log.messages('error').length === 1`.
   - `describe('AC-7b: fresh и raw', …)`:
     - `it('AC-7b: permissions({fresh: true}) при снимке в кэше → запрос с minEpoch, ответ в кэше; следующий check — без запроса')`: `minEpoch` равен эпохе первого ответа (`lastSeenEpoch`).
     - `it('AC-7b: 5 одновременных permissions({fresh: true}) одного участника → 1 запрос')`.
     - `it('AC-7b: raw.check — тот же токен; при 401 getToken({refresh: true}) и повтор')`.
     - `it('AC-7b: raw.check 422 → PlatformContractError')`.
     - `it('AC-7b: кэш после raw.* не изменился')`: снимок в кэше, затем `raw.permissions` с другим ответом → `check` решает по старому снимку, без запроса; `raw.batch` тело уходит как есть (без `minEpoch` даже при известной эпохе).
     - `it('AC-7b: raw.permissions с ответом не по схеме → PlatformContractError INVALID_RESPONSE')`.
     - `it('AC-7b: raw.check возвращает ответ без проверки (unknown)')`.
   - `describe('AC-8: решение и схема', …)`:
     - `it('AC-8: право, которого нет в снимке → PlatformContractError UNKNOWN_PERMISSION')`.
     - `it('AC-8: снимок COMPANY_SUSPENDED + неизвестное право → COMPANY_SUSPENDED')`.
     - `it('AC-8: ответ Platform не по схеме → PlatformContractError, в кэш не попал')`: второй `check` снова делает запрос.
     - `it('UC-1: право в denied FORBIDDEN → «Недостаточно прав.»')`.
   - `describe('AC-8b: checkMany', …)`:
     - `it('AC-8b: 3 права при пустом кэше → 1 запрос; ключи в порядке запроса')`.
     - `it('AC-8b: одно неизвестное из трёх → UNKNOWN_PERMISSION, details.permission — это право')`.
     - `it('AC-8b: снимок COMPANY_SUSPENDED → у всех трёх COMPANY_SUSPENDED')`.
     - `it('AC-8b: агент с pep < epoch → у всех CONTEXT_REVOKED')`: подготовка `agent(7)` по правилу Task 27, затем `checkMany(agent(6), …)`; прирост запросов — 0.
     - `it("AC-8b: [] → VALIDATION_FAILED без запроса; ['a', 'a'] → один ключ")` (для второго — `['chat.office', 'chat.office']`).
   - `describe('AC-18: метрики клиента', …)`:
     - `it('AC-18: попадание в кэш → cacheResult(hit)')`.
     - `it('AC-18: промах → miss и request(permissions, ok, s) с s > 0')`: обработчик делает `clock.advance(5)`.
     - `it('AC-18: повторное чтение по pep → miss')`: подготовка `agent(7)` по правилу Task 27, затем `agent(8)` → среди новых вызовов `cacheResult('miss')` и нет `hit`.
     - `it('AC-18: ответ старше lastSeenEpoch → stale')`.
     - `it('AC-18: 503 → request(permissions, unavailable, …); 422 → contract_error; 401 + повтор → два вызова request')`.
     - `it('AC-18: событие с новой эпохой → policyEvent(applied), повтор того же события → ignored, неверный конверт → invalid')`.
     - `it('AC-18: ни в одном вызове нет sub и tenantId')`: после всех сценариев `JSON.stringify(metrics.calls)` не содержит `usr_a`, `usr_b`, `cmp_1`.
     - `it('AC-18: без metrics — ошибок нет')`: `overrides: { metrics: undefined }` — промах, попадание, событие, 503.
     - `it('AC-18: клиент Platform не пишет request(token, …) — свой TokenProvider без метрик (prd.md v1.8)')`: `createTokenStub` как `tokenProvider`; промах, 401 + повтор, 503 → среди `metrics.requests()` нет записи с `endpoint === 'token'`.
   - `describe('AC-19: логи без секретов', …)`:
     - `it('AC-19: клиент с clientCredentials — сценарии 401+refresh, 503 Identity, 422 Platform, invalid_client → ни одна запись логгера не содержит токен и clientSecret')`: `tokenProvider: clientCredentials({ tokenUrl: 'http://identity:3000/oidc/token', clientId: 'verdeect-files', clientSecret: CLIENT_SECRET, …, fetch: stub.fetch, clock })`; обработчик ведёт `/oidc/token` (выдаёт `TOKEN_1`, затем `TOKEN_2`) и `/v1/authz/permissions`; явная проверка `SECRET_VALUES` по `log.entries` (в дополнение к `setup.ts`).
     - `it('AC-19: debug решения агента содержит asid и wid, запрос к Platform — нет')`.
   - `describe('§5.1: публичный API', …)`:
     - `it('§5.1: публичные экспорты ядра')` — проверка из Task 25.
     - `it('§5.1: createPlatformAuthzClient с неверными настройками → TypeError')`.

### Свидетельства требований
- AC-7a, AC-7b, AC-8, AC-8b, AC-18, AC-19, UC-1, UC-3, §5.1, NFR-2, NFR-3.

### Ошибки и логирование
Не применимо (тесты).

### Тесты
Этот файл. Команда: `pnpm test`.

### Критерии приёмки
- Все кейсы зелёные.

### Проверка
- `pnpm test` → 0; `pnpm typecheck` → 0; `pnpm lint` → 0; `pnpm format:check` → 0; `pnpm build` → 0.

**Skill:** nestjs-code test unit client-api (CREATE)

## Риски фазы и меры
- Риск: гонки в тестах объединения из-за микрозадач.
  Мера: ответы управляются `gate`; перед проверкой числа запросов — `await` нужного числа тиков через `await Promise.resolve()` в цикле или `vi.waitFor(() => expect(stub.requests.length).toBe(n))`.
- Риск: подсчёт `suppressed` в AC-7 зависит от того, был ли вызов между 5 и 10 с.
  Мера: сценарий Task 27 зафиксирован без промежуточного вызова.

## Чек-лист завершения фазы
- Задачи 24–28 удовлетворяют критериям приёмки.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` — код 0.
- Чекбоксы в `index.md` обновлены.
