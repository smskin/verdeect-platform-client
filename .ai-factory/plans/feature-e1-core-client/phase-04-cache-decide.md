# Фаза 4: Кэш снимков и локальное решение

Plan: [index.md](index.md)
Tasks: 21-23
Depends on: Phase 2 (типы, коды, ошибки); Phase 3 не требуется

## Цель

Готовы два чистых по зависимостям модуля ядра:
- `cache.ts` хранит состояние: снимки с LRU и индексом по `tenantId`, `lastSeenEpoch` с LRU, запросы в полёте для объединения по `(ключ, minEpoch)`, поколение для `clear()`, «Приём ответа» (§5.2), сброс по событию (§5.3);
- `decide.ts` — чистые функции решения: шаги 1, 3–6 §5.2, `checkMany`.

Ввода-вывода в обоих модулях нет. Время передаётся параметром `now`, логи и метрики пишет клиент (Phase 5) по возвращаемым результатам. Модульные тесты зелёные.

## Свидетельства из текущего кода

| Путь | Символы / строки | Зачем |
|---|---|---|
| `src/core/types.ts` (Task 7) | `PermissionsResponse`, `Decision`, `Subject`, `Act` | Вход и выход модулей |
| `src/core/codes.ts` (Task 8) | `DECISION_MESSAGES`, `decisionMessage` | Тексты шагов 5 и 6 |
| `src/core/errors.ts` (Task 9) | `PlatformContractError` | `PEP_REQUIRED`, `VALIDATION_FAILED`, `UNKNOWN_PERMISSION` |
| `src/core/options.ts` (Task 13) | `ResolvedClientOptions.cacheTtlMs/denyTtlMs/maxEntries/lastSeenMaxEntries` | Параметры конструктора кэша |
| `/home/administrator/projects/verdeect2/verdeect-platform/apps/platform/src/modules/authz/domain/decision.ts` | `decide`, `decideBatch`, `evaluatePermission` | Эталон порядка шагов Platform. Пакет повторяет шаги 3–6 по снимку (`check ≡ permissions`, §3.3) |

## Файлы для изменения

| Путь | Действие | Что сделать |
|---|---|---|
| `src/core/cache.ts` | create | `snapshotKey`, класс `SnapshotCache` |
| `src/core/decide.ts` | create | `assertDecidableSubject`, `normalizePermissions`, `needsPepReread`, `decideMany` |
| `test/unit/cache.spec.ts` | create | LRU, TTL, «Приём ответа», `lastSeenEpoch`, сброс, объединение, поколение |
| `test/unit/decide.spec.ts` | create | Шаги §5.2, AC-8, AC-8b, AC-6 (A3, A4) — на чистых функциях |

## Task 21: Кэш снимков (`src/core/cache.ts`)

### Зачем
D3, D4, §5.3: один снимок на `(tenantId, sub, act)` за TTL, общий отказ — на `denyTtlSec`, сброс по событию, монотонная свежесть (`lastSeenEpoch`), объединение запросов и «поколение» для `clear()` (§5.1). Всё состояние клиента собрано в одном классе: инварианты проверяются в одном месте.

### Шаги реализации
1. Создать `src/core/cache.ts`. Первая строка: `// Кэш снимков (prd.md §5.2 «Приём ответа», «Объединение запросов», §5.3, D4): LRU, индекс по tenantId, lastSeenEpoch, поколение clear().`
2. Экспорт:
   ```ts
   export type SnapshotKey = string;

   /** Ключ tenantId \0 sub \0 act (§5.3). */
   export function snapshotKey(tenantId: string, sub: string, act: Act): SnapshotKey {
       return `${tenantId}\u0000${sub}\u0000${act}`;
   }

   export interface CachedSnapshot {
       readonly snapshot: PermissionsResponse;
       readonly tenantId: string;
       readonly expiresAt: number;                       // мс
       readonly requestedMinEpoch: number | undefined;   // minEpoch запроса, давшего снимок (§5.2)
       refreshAfter: number | undefined;                 // мс; до этого момента повторного чтения по pep нет (D6)
   }

   export type AcceptResult =
       | { readonly kind: 'cached' }
       | { readonly kind: 'kept_newer' }                       // в кэше живой снимок с большей эпохой — не затираем
       | { readonly kind: 'stale'; readonly lastSeenEpoch: number }
       | { readonly kind: 'pep_ahead' }                        // записан на denyTtl
       | { readonly kind: 'cleared' };                         // запрос начат до clear() — не пишем

   export interface SnapshotCacheConfig {
       readonly maxEntries: number;
       readonly lastSeenMaxEntries: number;
       readonly cacheTtlMs: number;
       readonly denyTtlMs: number;
   }

   export class SnapshotCache {
       constructor(config: SnapshotCacheConfig);
       get generation(): number;
       get(key: SnapshotKey, now: number): CachedSnapshot | undefined;
       accept(input: { readonly key: SnapshotKey; readonly tenantId: string; readonly snapshot: PermissionsResponse; readonly requestedMinEpoch: number | undefined; readonly generation: number; readonly now: number }): AcceptResult;
       deferRefresh(key: SnapshotKey, until: number): void;
       lastSeen(tenantId: string): number | undefined;
       applyPolicyChange(tenantId: string, epoch: number, subs: readonly string[] | undefined): { readonly raised: boolean; readonly deleted: number };
       joinInflight(key: SnapshotKey, minEpoch: number | undefined): Promise<PermissionsResponse> | undefined;
       trackInflight(key: SnapshotKey, minEpoch: number | undefined, promise: Promise<PermissionsResponse>): void;
       clear(): void;
       /** Для тестов (AC-4, AC-19): число снимков, ключи индекса компании, число компаний в lastSeenEpoch. */
       size(): number;
       tenantKeys(tenantId: string): readonly SnapshotKey[];
       lastSeenSize(): number;
   }
   ```
3. Приватное состояние:
   - `#entries = new Map<SnapshotKey, CachedSnapshot>()` — порядок вставки задаёт LRU: самый давний первый;
   - `#byTenant = new Map<string, Set<SnapshotKey>>()`;
   - `#lastSeen = new Map<string, number>()` — тоже LRU по порядку вставки;
   - `#inflight = new Map<SnapshotKey, Array<{ minEpoch: number | undefined; generation: number; promise: Promise<PermissionsResponse> }>>()`;
   - `#generation = 0`.
4. Алгоритмы.
   - **`get(key, now)`**: `entry = #entries.get(key)`. Если нет → `undefined`. Если `now >= entry.expiresAt` → `#remove(key)`, `undefined` (истёкший снимок не отдаётся, D6). Иначе — LRU-касание: `#entries.delete(key)`, `#entries.set(key, entry)` — и вернуть `entry`.
   - **`#remove(key)`**: удалить из `#entries` и из `#byTenant.get(entry.tenantId)`; пустой `Set` удалить из `#byTenant`.
   - **`#store(key, tenantId, entry)`**: `#remove(key)` (если был), `#entries.set`, добавить в индекс. Пока `#entries.size > maxEntries`: взять первый ключ `#entries.keys().next().value` и `#remove` его. Вытесненный ключ уходит и из индекса (AC-19).
   - **`#touchLastSeen(tenantId)`**: если есть — переставить в конец (`delete` + `set`).
   - **`lastSeen(tenantId)`**: `#touchLastSeen` и вернуть значение (обращение при запросе, §5.3).
   - **`#raiseLastSeen(tenantId, epoch): boolean`**: `current = #lastSeen.get(tenantId)`. Если `current !== undefined && epoch <= current` → только касание, `false`. Иначе `delete` + `set(tenantId, epoch)`, затем вытеснение: пока `#lastSeen.size > lastSeenMaxEntries` — удалить первый ключ. Вернуть `true`.
   - **`accept(input)`** — «Приём ответа» §5.2; сравнения с `lastSeenEpoch` делаются до его обновления:
     ```
     if input.generation !== #generation → return { kind: 'cleared' }          // §5.1 clear(): ни кэш, ни lastSeenEpoch
     const { snapshot } = input; const last = #lastSeen.get(tenantId); #touchLastSeen(tenantId)
     // п. 0
     if snapshot.epoch === null → #write(input, denyTtlMs) → return result of #write (cached | kept_newer); lastSeenEpoch не меняется
     // п. 1
     if last !== undefined && snapshot.epoch < last → return { kind: 'stale', lastSeenEpoch: last }
     // п. 2
     if requestedMinEpoch !== undefined && snapshot.epoch < requestedMinEpoch → #raiseLastSeen(tenantId, snapshot.epoch); #write(input, denyTtlMs); return { kind: 'pep_ahead' }
     // п. 3
     #raiseLastSeen(tenantId, snapshot.epoch)
     return #write(input, snapshot.allow ? cacheTtlMs : denyTtlMs)
     ```
   - **`#write(input, ttlMs)`** — «ответ с более высокой эпохой заменяет в кэше более низкую, но не наоборот» (§5.2):
     ```
     existing = #entries.get(key); live = existing !== undefined && now < existing.expiresAt
     if live && existing.snapshot.epoch !== null && (snapshot.epoch === null || snapshot.epoch < existing.snapshot.epoch) → return { kind: 'kept_newer' }
     #store(key, tenantId, { snapshot, tenantId, expiresAt: now + ttlMs, requestedMinEpoch, refreshAfter: undefined })
     return { kind: 'cached' }
     ```
     Равная эпоха заменяет запись: так сохраняется более поздний `requestedMinEpoch` (AC-6, `PEP_AHEAD`). `null` считается ниже любой эпохи.
   - **`deferRefresh(key, until)`**: если запись есть — `entry.refreshAfter = until`. Срок жизни и `requestedMinEpoch` не меняются (D6, §5.2 шаг 5).
   - **`applyPolicyChange(tenantId, epoch, subs)`** — §5.3:
     ```
     raised = #raiseLastSeen(tenantId, epoch)
     keys = subs !== undefined && subs.length > 0
         ? subs.flatMap(sub => [snapshotKey(tenantId, sub, 'human'), snapshotKey(tenantId, sub, 'agent')]).filter(k => #byTenant.get(tenantId)?.has(k))
         : [...(#byTenant.get(tenantId) ?? [])]
     deleted = 0
     for key of keys: entry = #entries.get(key); if entry && (entry.snapshot.epoch === null || entry.snapshot.epoch < epoch) → #remove(key); deleted++
     return { raised, deleted }
     ```
     Сброс по `subs` затрагивает обе записи участника, `human` и `agent`: событие касается участника, а не вида токена. Снимок с эпохой ≥ эпохи события не удаляется (D4).
   - **`joinInflight(key, minEpoch)`**: из списка `#inflight.get(key)` найти первый элемент с `generation === #generation` и `(item.minEpoch ?? 0) >= (minEpoch ?? 0)` и вернуть его `promise`, иначе `undefined`. Объединение — только в пределах поколения и только с запросом, у которого `minEpoch` не меньше нужного (§5.2).
   - **`trackInflight(key, minEpoch, promise)`**: добавить `{minEpoch, generation: #generation, promise}`; на `promise.then(cleanup, cleanup)` удалить именно этот элемент, пустой список удалить. Подписка `then(cleanup, cleanup)` не должна порождать необработанный отказ: отказ обрабатывает вызывающий через исходный `promise`.
   - **`clear()`**: `#generation += 1`, очистить `#entries`, `#byTenant`, `#lastSeen`, `#inflight` (§5.1 `clear()`).
5. TSDoc у класса, его публичных методов и у экспортов.

### Интерфейсы и контракты
- Модуль внутренний и в `index.ts` не экспортируется.
- Время — только параметр `now` (мс), часов внутри нет.
- Решение по размеру снимка: хранится объект ответа как есть. Память проверяет AC-17 (Task 29). Там же задан запасной план, если бюджет 2 КБ превышен.

### Свидетельства требований
- §5.2 «Приём ответа» (п. 0–3), «Объединение запросов», `refreshAfter`; §5.3 (ключ, TTL, сброс, индекс, `lastSeenEpoch` LRU на `maxEntries / 10`); §5.1 `clear()`; D4, D6.
- Комбинации: см. `index.md` → Requirements Reconciliation, таблица «Приём ответа».

### Ошибки и логирование
- Модуль не логирует и не бросает. Результат `accept` (`stale`, `pep_ahead`) клиент превращает в `warn` и метрику (Task 24).

### Тесты
Task 23 (`test/unit/cache.spec.ts`).

### Критерии приёмки
- `maxEntries: 100`, 101 запись → `size() === 100`, первая вытеснена, `tenantKeys` её не содержит.

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/cache.ts (CREATE). В сервисе подобное состояние жило бы в `repositories/`, но здесь хранилище в памяти без БД (ARCHITECTURE «Не действуют слои сервиса»).

## Task 22: Локальное решение (`src/core/decide.ts`)

### Зачем
§5.2: решение по снимку без обращения к Platform, по тем же правилам, что `check` Platform (`check ≡ permissions`, §3.3, D3). Чистые функции легко проверить исчерпывающе и быстро выполнить (NFR-1).

### Шаги реализации
1. Создать `src/core/decide.ts`. Первая строка: `// Локальное решение по снимку (prd.md §5.2 шаги 1, 3–6; checkMany): чистые функции, без ввода-вывода (D3, D5).`
2. Экспорт:
   ```ts
   /** Шаг 1: агент без pep → PEP_REQUIRED; pep не целое ≥ 1 → VALIDATION_FAILED (details.field = 'pep'). Человек — без проверок. */
   export function assertDecidableSubject(subject: Subject): void;

   /** checkMany: [] → VALIDATION_FAILED (details.field = 'permissions'); повторы схлопываются, порядок первого вхождения сохраняется. */
   export function normalizePermissions(permissions: readonly string[]): readonly string[];

   /** Шаг 5, ветка pep > epoch: агент, снимок-разрешение, pep больше эпохи снимка. */
   export function needsPepReread(snapshot: PermissionsResponse, subject: Subject): boolean;

   /** Шаги 3–6 для списка прав (уже нормализованного): Record с ключами в порядке списка. */
   export function decideMany(snapshot: PermissionsResponse, subject: Subject, permissions: readonly string[]): Record<string, Decision>;
   ```
3. `assertDecidableSubject`:
   ```
   if subject.act !== 'agent' → return
   if subject.pep === undefined → throw new PlatformContractError('PEP_REQUIRED')
   if !Number.isInteger(subject.pep) || subject.pep < 1 → throw new PlatformContractError('VALIDATION_FAILED', { field: 'pep' })
   ```
4. `normalizePermissions`: `if (permissions.length === 0) throw new PlatformContractError('VALIDATION_FAILED', { field: 'permissions' })`; вернуть `[...new Set(permissions)]`.
5. `needsPepReread`: `subject.act === 'agent' && subject.pep !== undefined && snapshot.allow && subject.pep > snapshot.epoch`.
6. `decideMany` — порядок строго по §5.2:
   ```
   // шаг 3: общий отказ — одно решение на все права, право не проверяется (и неизвестное не ловится)
   if !snapshot.allow:
       d = snapshot.memberId === undefined
           ? { allow: false, epoch: snapshot.epoch, code: snapshot.code, message: snapshot.message }
           : { allow: false, epoch: snapshot.epoch, memberId: snapshot.memberId, code: snapshot.code, message: snapshot.message }
       return Object.fromEntries(permissions.map(p => [p, d]))
   // шаг 4: неизвестное право — первое по порядку, на весь вызов
   known = (p) => snapshot.permissions.includes(p) || Object.hasOwn(snapshot.denied, p)
   unknown = permissions.find(p => !known(p)); if unknown !== undefined → throw new PlatformContractError('UNKNOWN_PERMISSION', { permission: unknown })
   // шаг 5, pep < epoch: CONTEXT_REVOKED для всех (pep > epoch → решение по снимку, повторное чтение — у клиента)
   if subject.act === 'agent' && subject.pep !== undefined && subject.pep < snapshot.epoch:
       d = { allow: false, epoch: snapshot.epoch, memberId: snapshot.memberId, code: 'CONTEXT_REVOKED', message: DECISION_MESSAGES.CONTEXT_REVOKED }
       return Object.fromEntries(permissions.map(p => [p, d]))
   // шаг 6
   return Object.fromEntries(permissions.map(p => {
       if snapshot.permissions.includes(p) → [p, { allow: true, epoch: snapshot.epoch, memberId: snapshot.memberId }]
       code = snapshot.denied[p]   // гарантированно есть после шага 4
       return [p, { allow: false, epoch: snapshot.epoch, memberId: snapshot.memberId, code, message: decisionMessage(code) }]
   }))
   ```
   - `Object.hasOwn` вместо `in`: ключ `toString` из прототипа не должен считаться известным правом.
   - Для общего отказа берётся `message` снимка (Platform отдаёт текст §3.4), для кодов шагов 5–6 — текст из копии кодов.
   - С `noUncheckedIndexedAccess` выражение `snapshot.denied[p]` имеет тип `… | undefined`. После шага 4 значение есть, но проверка нужна для `tsc`: если `code === undefined`, бросить `PlatformContractError('UNKNOWN_PERMISSION', { permission: p })`. Ветка недостижима, зато даёт корректный тип без `!`.

### Интерфейсы и контракты
- Выход `Decision` (Task 7). `Object.fromEntries` сохраняет порядок вставки, то есть порядок запроса (AC-8b).
- Функции не знают о кэше, сети и логах.

### Свидетельства требований
- §5.2 шаги 1, 3–6, абзац `checkMany`; AC-6 (`pep = 0` → `VALIDATION_FAILED`, без `pep` → `PEP_REQUIRED`); AC-8; AC-8b; D5.

### Ошибки и логирование
- Бросаются только `PlatformContractError` с кодами `PEP_REQUIRED`, `VALIDATION_FAILED`, `UNKNOWN_PERMISSION`. Логирование — у клиента (`error` с ограничением частоты, Task 24).

### Тесты
Task 23 (`test/unit/decide.spec.ts`).

### Критерии приёмки
- `decideMany(suspended, human, ['unknown.perm'])` → `COMPANY_SUSPENDED`, без исключения (AC-8).

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/decide.ts (CREATE). В сервисе это был бы `domain/` (чистые правила), но у библиотеки нет модулей; ближайший аналог — компонент `domain` без привязки к модулю.

## Task 23: Тесты кэша и решения

### Шаги реализации
1. `test/unit/cache.spec.ts` (первая строка — `// Кэш снимков (prd.md §5.2 «Приём ответа», «Объединение запросов», §5.3): AC-3, AC-4, AC-5, AC-6, AC-19 — на уровне модуля.`). Фабрика — `new SnapshotCache({ maxEntries: 100, lastSeenMaxEntries: 10, cacheTtlMs: 60_000, denyTtlMs: 5_000 })`; снимки — из `test/unit/support/snapshots.ts` (создать в этой задаче, см. шаг 3).
   - `describe('§5.3: TTL и LRU', …)`:
     - `it('D4: позитивный снимок живёт cacheTtl — на 59 999 мс есть, на 60 000 мс нет')`.
     - `it('AC-3: общий отказ живёт denyTtl — на 4 с есть, на 5 с нет')`.
     - `it('AC-19: maxEntries 100, 101 запись → самая давняя вытеснена, недавняя на месте, индекс компании без вытесненной')`: 101 ключ одной компании; `get` первого → `undefined`; `tenantKeys('cmp_1').length === 100`, первого ключа нет.
     - `it('AC-19: get касается записи — она не вытесняется следующей')`.
   - `describe('§5.2: Приём ответа', …)`:
     - `it('AC-3: epoch: null → в кэш на denyTtl, lastSeenEpoch не меняется, не stale и не pep_ahead')`: `lastSeen` 8 (через `applyPolicyChange`) → `accept` NOT_MEMBER `epoch: null` → `{kind:'cached'}`; `lastSeen === 8`; на 4 с есть, на 5 с нет.
     - `it('AC-5: epoch < lastSeenEpoch → stale, в кэш не записан')`.
     - `it('AC-6: epoch < запрошенного minEpoch → pep_ahead, в кэше на denyTtl с requestedMinEpoch')`.
     - `it('AC-6: lastSeenEpoch 8, ответ 7 при minEpoch 9 → stale, не pep_ahead, в кэше пусто')`.
     - `it('AC-6: ответ с эпохой 8 не затирает живой снимок с эпохой 9 (kept_newer); равная эпоха заменяет')`.
     - `it('§5.3: lastSeenEpoch — наибольшая эпоха ответов')`.
     - `it('AC-19: ответ запроса прошлого поколения → cleared, ни кэш, ни lastSeenEpoch')`.
     - `it('D6: deferRefresh не меняет expiresAt и requestedMinEpoch')`.
   - `describe('AC-4: applyPolicyChange', …)`:
     - `it('AC-4: subs: [A] удаляет снимки A (human и agent), B той же компании цел')`.
     - `it('AC-4: без subs — все снимки компании; другая компания цела')`.
     - `it('AC-4: эпоха события ≤ эпохи снимка — без удаления')`.
     - `it('AC-4: снимок с epoch: null удаляется любым событием')`.
     - `it('AC-4: raised — true для новой эпохи, false для повтора и старой')`.
     - `it('AC-4: lastSeenEpoch — LRU на lastSeenMaxEntries: 11 компаний → 10 записей, первая вытеснена')` → `lastSeenSize() === 10`, `lastSeen('cmp_1') === undefined`.
   - `describe('§5.2: объединение запросов', …)`:
     - `it('AC-2: joinInflight находит запрос с тем же ключом и minEpoch')`.
     - `it('AC-6: запрос с minEpoch 8 не годится вызывающему с minEpoch 9; с 9 годится для 8 и для undefined')`.
     - `it('AC-19: после clear() новые вызовы не присоединяются к старым запросам')`.
     - `it('§5.2: запрос удаляется из полёта после завершения и после отказа (без unhandled rejection)')`.
2. `test/unit/decide.spec.ts` (первая строка — `// Локальное решение (prd.md §5.2): шаги 1, 3–6, checkMany — AC-6 (A3, A4), AC-8, AC-8b на чистых функциях.`):
   - `describe('§5.2 шаг 1', …)`:
     - `it('AC-6: агент без pep → PlatformContractError PEP_REQUIRED')`.
     - `it.each([0, -1, 1.5, Number.NaN])('AC-6: pep = %s → PlatformContractError VALIDATION_FAILED', …)`.
     - `it('§5.2: человеку pep не нужен')`.
   - `describe('§5.2 шаги 3–6', …)`:
     - `it('AC-8: право есть в permissions → allow с epoch и memberId')`.
     - `it('AC-8: право в denied → код снимка и текст §3.4')` — для `FORBIDDEN`, `PLAN_MODULE`, `MODULE_DISABLED`.
     - `it('AC-8: право вне permissions ∪ denied → UNKNOWN_PERMISSION, details.permission')`.
     - `it("AC-8: ключ прототипа ('toString') — неизвестное право")`.
     - `it('AC-8: снимок COMPANY_SUSPENDED + неизвестное право → COMPANY_SUSPENDED')`.
     - `it('AC-6: pep < epoch → CONTEXT_REVOKED с текстом §3.4')`.
     - `it('AC-6: pep = epoch → по праву; pep > epoch → по праву (решение по снимку)')`.
     - `it('§5.2: needsPepReread — только агент, только разрешение, только pep > epoch')`.
   - `describe('AC-8b: checkMany', …)`:
     - `it('AC-8b: ключи результата в порядке запроса')`.
     - `it('AC-8b: одно неизвестное из трёх → UNKNOWN_PERMISSION, details.permission — это право')`.
     - `it('AC-8b: снимок COMPANY_SUSPENDED → у всех трёх COMPANY_SUSPENDED')`.
     - `it('AC-8b: агент pep < epoch → у всех CONTEXT_REVOKED')`.
     - `it("AC-8b: [] → VALIDATION_FAILED; ['a', 'a'] → один ключ")`.
3. `test/unit/support/snapshots.ts` — общие фикстуры (используются и в Phase 5):
   ```ts
   export const PERMS = ['native.files.read', 'native.files.write', 'chat.office', 'chat.images', 'knowledge.read', 'kanban.use', 'calendar.use', 'dashboard.read', 'members.manage', 'billing.read'] as const; // 10 прав каталога Platform (AC-1)
   export const HUMAN_A: Subject = { sub: 'usr_a', tenant: 'acme', tenantId: 'cmp_1', act: 'human' };
   export const HUMAN_B: Subject = { sub: 'usr_b', tenant: 'acme', tenantId: 'cmp_1', act: 'human' };
   export function agent(pep: number | undefined, extra?: Partial<Subject>): Subject;   // sub 'usr_a', act 'agent', asid 'as_1', wid 'w_1'
   export function allowedSnapshot(o?: { epoch?: number; memberId?: string; permissions?: readonly string[]; denied?: Record<string, PermissionDenyCode> }): AllowedPermissions;
   // по умолчанию: epoch 7, memberId 'mem_a', permissions = PERMS[0..7], denied = { 'members.manage': 'FORBIDDEN', 'billing.read': 'PLAN_MODULE' }, modules: files/knowledge/office, limits { fileSizeMb: 50 }
   export function generalDeny(code: GeneralDenyCode, epoch?: number | null, memberId?: string): DeniedPermissions;  // message = DECISION_MESSAGES[code]
   ```

### Свидетельства требований
- AC-3, AC-4, AC-5, AC-6 (уровень модуля), AC-8, AC-8b, AC-19 (LRU, индекс, `clear()`), D4, D6, §5.2, §5.3.

### Ошибки и логирование
Не применимо (тесты).

### Тесты
Эти файлы. Команда: `pnpm test`.

### Критерии приёмки
- Все кейсы зелёные. Замена условия `epoch < last` на `<=` делает кейс «равная эпоха» или AC-5 красным.

### Проверка
- `pnpm test` → 0; `pnpm typecheck` → 0; `pnpm lint` → 0; `pnpm format:check` → 0.

**Skill:** nestjs-code test unit cache (CREATE); nestjs-code test unit decide (CREATE); nestjs-code generic test/unit/support/snapshots.ts (CREATE)

## Риски фазы и меры
- Риск: отказ `promise` в `trackInflight` при подписке `then(cleanup, cleanup)` порождает необработанный отказ.
  Мера: подписка обрабатывает оба исхода. Тест «после отказа — без unhandled rejection» запускается при включённом по умолчанию в Vitest контроле необработанных отказов.
- Риск: тип `denied[p]` при `noUncheckedIndexedAccess`.
  Мера: ветка `code === undefined` (Task 22, шаг 6), без `!`.

## Чек-лист завершения фазы
- Задачи 21–23 удовлетворяют критериям приёмки.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` — код 0.
- Чекбоксы в `index.md` обновлены.
