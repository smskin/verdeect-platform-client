# Фаза 3: Настройки, ограничение логов, `clientCredentials`, транспорт

Plan: [index.md](index.md)
Tasks: 13-20
Depends on: Phase 2

## Цель

Готовы все компоненты ввода-вывода ядра:
- проверка настроек клиента (AC-19 «Настройки»);
- ограничитель частоты `warn`/`error` (NFR-3);
- `clientCredentials` с `client_secret_basic`, кэшем, объединением запросов, `refresh` и метрикой `token` (D8, AC-9, AC-18, prd.md v1.8);
- HTTP-транспорт к Platform: заголовки, таймаут, один повтор при 401, классификация ответов, метрики (§5.1, AC-7, AC-7a, AC-19 «Транспорт»).

Сюда же входит тестовая инфраструктура слоя U: подделанные `fetch` и часы, записывающие `logger` и `metrics`, проверка логов на секреты после каждого теста (AC-19 «Логи»). Клиента ещё нет. Транспорт и провайдер тестируются напрямую.

## Свидетельства из текущего кода

| Путь | Символы / строки | Зачем |
|---|---|---|
| `src/core/types.ts` (Task 7) | `PlatformAuthzClientOptions`, `ClientCredentialsOptions`, `TokenProvider`, `PlatformClientLogger`, `PlatformClientMetrics`, `MetricsEndpoint` | Входные и выходные типы этой фазы |
| `src/core/errors.ts` (Task 9) | `PlatformUnavailableError(endpoint, reason)`, `PlatformContractError(code, details)` | Классификация ответов |
| `src/core/schemas.ts` (Task 10) | `parseTokenResponse`, `parseOAuthErrorCode`, `parsePlatformError` | Разбор ответов Identity и ошибок Platform |
| `/home/administrator/projects/verdeect2/verdeect-identity/apps/identity/src/modules/oidc/provider-service/domain/client-metadata.ts` | метод аутентификации | prd.md §5.1: Identity принимает от конфиденциальных клиентов только `client_secret_basic` |
| `/home/administrator/projects/verdeect2/verdeect-platform/apps/platform/src/shared/http/app-exception-filter.ts` | формат `{error:{code,message,details}}` | Тело ошибок Platform |
| `vitest.config.ts` (Task 4) | `test.include` | Добавить `setupFiles` |

Решения этой фазы (зафиксированы в `index.md` → «Архитектура и решения»):
- Длительность запроса для метрик меряется внедрённым `clock`: детерминизм в тестах, одна шкала времени.
- Первый ответ 401 пишется в метрику как `unavailable`, повтор — отдельным вызовом.
- Таймаут — `setTimeout` + `AbortController`, это единственный таймер ядра.

## Файлы для изменения

| Путь | Действие | Что сделать |
|---|---|---|
| `src/core/options.ts` | create | `resolveOptions` → `ResolvedClientOptions` или `TypeError` |
| `src/core/log-limiter.ts` | create | `createLogLimiter`: `warn` о недоступности по `endpoint` (10 с, `suppressed`), `error` по коду (60 с) |
| `src/core/token-provider.ts` | create | `clientCredentials(options)` |
| `src/core/transport.ts` | create | `sendRequest` (таймаут), `createTransport` (`post` к Platform) |
| `test/unit/support/clock.ts` | create | Подделанные часы |
| `test/unit/support/fetch-stub.ts` | create | Подделанный `fetch` с записью запросов |
| `test/unit/support/recording.ts` | create | Записывающие `logger` и `metrics` (с реестром для проверки секретов) |
| `test/unit/support/secrets.ts` | create | Значения токенов и секрета из фикстур |
| `test/unit/support/token-stub.ts` | create | Подделанный `TokenProvider` |
| `test/unit/support/setup.ts` | create | `afterEach`: ни один лог не содержит секретов (AC-19) |
| `vitest.config.ts` | modify | `setupFiles: ['test/unit/support/setup.ts']` |
| `test/unit/options.spec.ts` | create | AC-19 «Настройки» |
| `test/unit/log-limiter.spec.ts` | create | NFR-3 |
| `test/unit/token-provider.spec.ts` | create | AC-9, AC-18 (`token`) |
| `test/unit/transport.spec.ts` | create | AC-7 (401, 503, таймаут, обрыв), AC-7a, AC-18 (`request`), AC-19 «Транспорт» |

## Task 13: Проверка настроек клиента (`src/core/options.ts`)

### Зачем
§5.1 «Настройки»: нарушение ограничений → `TypeError` из `createPlatformAuthzClient` с именами неверных параметров, без значений. Модуль также вычисляет значения по умолчанию в одном месте.

### Шаги реализации
1. Создать `src/core/options.ts`. Первая строка: `// Проверка и значения по умолчанию PlatformAuthzClientOptions (prd.md §5.1 «Настройки», AC-19); TypeError — только имена параметров.`
2. Объявить и экспортировать:
   ```ts
   export const DEFAULT_CACHE_TTL_SEC = 60;
   export const DEFAULT_DENY_TTL_SEC = 5;
   export const DEFAULT_MAX_ENTRIES = 50_000;
   export const DEFAULT_REQUEST_TIMEOUT_MS = 2000;

   export interface ResolvedClientOptions {
       readonly baseUrl: string;
       readonly tokenProvider: TokenProvider;
       readonly cacheTtlMs: number;
       readonly denyTtlMs: number;
       readonly maxEntries: number;
       readonly lastSeenMaxEntries: number;   // Math.floor(maxEntries / 10) — §5.3
       readonly requestTimeoutMs: number;
       readonly fetch: typeof fetch;
       readonly clock: () => number;
       readonly traceparent: (() => string | undefined) | undefined;
       readonly logger: PlatformClientLogger | undefined;
       readonly metrics: PlatformClientMetrics | undefined;
   }

   export function resolveOptions(options: PlatformAuthzClientOptions): ResolvedClientOptions;
   ```
3. Алгоритм `resolveOptions`:
   - Если `options` не объект или `null` → `throw new TypeError('platform-client: options must be an object')`.
   - Собрать массив `invalid: string[]`, проверяя по порядку:
     - `baseUrl`: строка, `URL.canParse(baseUrl)`, `new URL(baseUrl).protocol` ∈ `{'http:', 'https:'}`, `!baseUrl.endsWith('/')`. Иначе `'baseUrl'`. Для `'platform:3000'` протокол `platform:` → неверно.
     - `tokenProvider`: объект и `typeof tokenProvider.getToken === 'function'`.
     - `cacheTtlSec`: `undefined` или `Number.isInteger(v) && v >= 1 && v <= 60`.
     - `denyTtlSec`: `undefined` или целое 1…5.
     - `maxEntries`: `undefined` или `Number.isSafeInteger(v) && v >= 100`.
     - `requestTimeoutMs`: `undefined` или `Number.isSafeInteger(v) && v >= 100`.
     - `fetch`, `clock`, `traceparent`: `undefined` или функция.
     - `logger`: `undefined` или объект с функциями `debug`, `warn`, `error`.
     - `metrics`: `undefined` или объект с функциями `cacheResult`, `request`, `policyEvent`.
   - Если `invalid.length > 0` → `throw new TypeError(`platform-client: invalid options: ${invalid.join(', ')}`)`.
   - Вернуть объект:
     - `cacheTtlMs = (cacheTtlSec ?? 60) * 1000`, `denyTtlMs = (denyTtlSec ?? 5) * 1000`;
     - `lastSeenMaxEntries = Math.floor(maxEntries / 10)`;
     - `fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))`;
     - `clock = options.clock ?? Date.now`.
4. TSDoc у каждого экспорта. Модуль внутренний и в `index.ts` не попадает.

### Интерфейсы и контракты
- Вход — `PlatformAuthzClientOptions` (Task 7), но проверяется как недоверенный: JS-вызывающий может передать что угодно.
- Ограничения дословно из §5.1: `cacheTtlSec` 1…60 (60), `denyTtlSec` 1…5 (5), `maxEntries` ≥ 100 (50 000), `requestTimeoutMs` ≥ 100 (2000), `baseUrl` — абсолютный http(s) без завершающего `/`.

### Свидетельства требований
- prd.md §5.1 («Настройки»), §5.3 (`lastSeenEpoch` — LRU на `maxEntries / 10`), AC-19 «Настройки».

### Ошибки и логирование
- Только `TypeError` с префиксом `platform-client:` и именами параметров. Значения в сообщение не попадают.
- Модуль не логирует: логгер ещё не проверен.

### Тесты
Task 18 (`test/unit/options.spec.ts`).

### Критерии приёмки
- `resolveOptions({ baseUrl: 'platform:3000', tokenProvider })` бросает `TypeError`. В сообщении есть `baseUrl`, нет `platform:3000`.

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/options.ts (CREATE). Тип `config-key` описывает переменные окружения сервиса (`env.schema.ts`), а у библиотеки окружения нет: настройки передаёт потребитель.

## Task 14: Ограничитель частоты логов (`src/core/log-limiter.ts`)

### Зачем
NFR-3 задаёт ограничения:
- `warn` о `PlatformUnavailableError` и о `PLATFORM_UNAVAILABLE` при повторном чтении — не чаще раза в 10 с на `endpoint`, с числом пропущенных в `suppressed`;
- `error` о `PlatformContractError` — не чаще раза в 60 с на код.

При лежащем Platform без ограничителя каждый `check` писал бы `warn` (AC-7: 100 вызовов → один `warn`).

### Шаги реализации
1. Создать `src/core/log-limiter.ts`. Первая строка: `// Ограничение частоты логов (prd.md NFR-3, AC-7, AC-7a): warn о недоступности — 10 с на endpoint, error контракта — 60 с на код.`
2. Экспорт:
   ```ts
   export const UNAVAILABLE_WARN_WINDOW_MS = 10_000;
   export const CONTRACT_ERROR_WINDOW_MS = 60_000;

   export interface LogLimiter {
       /** warn 'PLATFORM_UNAVAILABLE' не чаще раза в 10 с на endpoint; поле suppressed — пропущенные с прошлой записи. */
       unavailable(endpoint: MetricsEndpoint, fields: Readonly<Record<string, unknown>>): void;
       /** error 'PlatformContractError' не чаще раза в 60 с на код. */
       contractError(code: string, fields: Readonly<Record<string, unknown>>): void;
   }

   export function createLogLimiter(logger: PlatformClientLogger | undefined, clock: () => number): LogLimiter;
   ```
3. Реализация: два `Map<string, { lastLoggedAt: number; suppressed: number }>`, отдельно для warn и error. Общая внутренняя функция `limited(map, key, windowMs, now): number | undefined` возвращает число пропущенных, если писать можно, иначе `undefined` и увеличивает счётчик:
   ```
   state = map.get(key)
   if state === undefined || now - state.lastLoggedAt >= windowMs:
       suppressed = state?.suppressed ?? 0
       map.set(key, { lastLoggedAt: now, suppressed: 0 })
       return suppressed
   state.suppressed += 1
   return undefined
   ```
   - `unavailable`: при `logger === undefined` — сразу `return`. Если `limited` вернул число → `logger.warn({ ...fields, endpoint, suppressed }, 'PLATFORM_UNAVAILABLE')`.
   - `contractError`: аналогично → `logger.error({ ...fields, code, suppressed }, 'PlatformContractError')`.
   - Ключи `endpoint` и `code` ставятся после `...fields`, чтобы вызывающий не мог их подменить.

### Интерфейсы и контракты
- Набор ключей ограничен: `endpoint` — 4 значения; `code` — коды Platform, OAuth, локальные и `HTTP_<status>`. Источник кодов доверенный, лимит размера `Map` не нужен.

### Свидетельства требований
- NFR-3; AC-7 («100 последовательных вызовов за 5 с при 503 и пустом кэше → один `warn`; следующий — не раньше 10-й секунды с `suppressed: 99`»); AC-7a («при 10 повторах одного кода — один `error`-лог за 60 с»).

### Ошибки и логирование
- Модуль и есть логирование. Поля приходят от вызывающих, у которых есть свои правила (без токенов).

### Тесты
Task 18 (`test/unit/log-limiter.spec.ts`).

### Критерии приёмки
- 100 вызовов `unavailable('permissions', …)` на `t ∈ [0, 4950]` мс → 1 запись `warn`; вызов на `t = 10_000` → 2-я запись с `suppressed: 99`.

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/log-limiter.ts (CREATE) — вспомогательный модуль библиотеки. Логи сервиса (`nestjs-pino`) здесь не применяются: ядро пишет только во внедрённый `logger`.

## Task 15: HTTP-транспорт к Platform (`src/core/transport.ts`)

### Зачем
Единственное место, где ядро ходит в Platform. Здесь реализованы:
- заголовки `Authorization: Bearer`, `Content-Type`, `traceparent`;
- таймаут;
- один повтор с `getToken({refresh: true})` при 401;
- классификация 200, 401, 4xx, 5xx, сети и таймаута;
- проверка ответа схемой до метрики `ok`;
- метрика на каждую попытку;
- `warn` о недоступности через ограничитель.

Через транспорт идут `permissions` (кэш), `fresh` и `raw.*` (§5.1 «Ответы Platform», «`raw.*`»).

### Шаги реализации
1. Создать `src/core/transport.ts`. Первая строка: `// HTTP к Platform (prd.md §3.1, §5.1 «Ответы Platform»): заголовки, таймаут, повтор при 401, классификация, метрики (AC-7, AC-7a, AC-19).`
2. Общие помощники (используются и в Task 16):
   ```ts
   export type SendResult =
       | { readonly ok: true; readonly status: number; readonly bodyText: string }
       | { readonly ok: false; readonly reason: 'timeout' | 'network'; readonly cause: unknown };

   /** fetch с таймаутом: AbortController + setTimeout, таймер снимается в finally; тело читается под тем же таймаутом. */
   export async function sendRequest(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<SendResult> {
       const controller = new AbortController();
       let timedOut = false;
       const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
       try {
           const response = await fetchFn(url, { ...init, signal: controller.signal });
           const bodyText = await response.text();
           return { ok: true, status: response.status, bodyText };
       } catch (cause) {
           return { ok: false, reason: timedOut ? 'timeout' : 'network', cause };
       } finally {
           clearTimeout(timer);
       }
   }

   /** JSON.parse без исключения: undefined для пустого или невалидного текста. */
   export function parseJsonText(text: string): unknown;
   ```
3. Транспорт:
   ```ts
   export type PlatformEndpoint = 'permissions' | 'check' | 'batch';

   export interface Transport {
       /** POST {baseUrl}/v1/authz/{endpoint}; parse === undefined → INVALID_RESPONSE. */
       post<T>(endpoint: PlatformEndpoint, body: object, parse: (json: unknown) => T | undefined): Promise<T>;
   }

   export interface TransportDeps {
       readonly baseUrl: string;
       readonly tokenProvider: TokenProvider;
       readonly fetch: typeof fetch;
       readonly clock: () => number;
       readonly requestTimeoutMs: number;
       readonly traceparent: (() => string | undefined) | undefined;
       readonly logger: PlatformClientLogger | undefined;
       readonly metrics: PlatformClientMetrics | undefined;
       readonly limiter: LogLimiter;
   }

   export function createTransport(deps: TransportDeps): Transport;
   ```
4. Алгоритм `post` (повтор — цикл не больше двух попыток):
   ```
   let token = await obtainToken(false)
   for attempt of [1, 2]:
       headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
       tp = deps.traceparent?.(); if (typeof tp === 'string' && tp !== '') headers.traceparent = tp
       started = clock()
       result = await sendRequest(fetch, `${baseUrl}/v1/authz/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) }, requestTimeoutMs)
       seconds = (clock() − started) / 1000
       if !result.ok:
           metrics?.request(endpoint, 'unavailable', seconds)
           throw unavailable(endpoint, result.reason, undefined, result.cause)
       logger?.debug({ endpoint, status: result.status, attempt, durationMs: clock() − started }, 'platform request')
       if result.status === 401:
           metrics?.request(endpoint, 'unavailable', seconds)
           if attempt === 2: throw unavailable(endpoint, 'unauthorized', 401)
           token = await obtainToken(true); continue
       if result.status >= 500:
           metrics?.request(endpoint, 'unavailable', seconds); throw unavailable(endpoint, 'http_5xx', result.status)
       json = parseJsonText(result.bodyText)
       if result.status === 200:
           parsed = parse(json)
           if parsed === undefined: metrics?.request(endpoint, 'contract_error', seconds); throw new PlatformContractError('INVALID_RESPONSE', { endpoint })
           metrics?.request(endpoint, 'ok', seconds); return parsed
       platformError = parsePlatformError(json)
       metrics?.request(endpoint, 'contract_error', seconds)
       throw new PlatformContractError(platformError?.code ?? `HTTP_${result.status}`, platformError?.details ?? {})
   ```
   - `unavailable(endpoint, reason, status?, cause?)` вызывает `limiter.unavailable(endpoint, status === undefined ? { reason } : { reason, status })` и возвращает `new PlatformUnavailableError(endpoint, reason, cause === undefined ? undefined : { cause })`.
   - `obtainToken(refresh)`: `try { return await tokenProvider.getToken(refresh ? { refresh: true } : undefined) } catch (error) { if (error instanceof PlatformUnavailableError) limiter.unavailable('token', { reason: error.reason }); throw error; }`. Ошибки своей реализации `TokenProvider` (D8) пробрасываются как есть.
   - 403/404/422/429/прочие 4xx и не-200 2xx/3xx → `PlatformContractError` без повтора и без перезапроса токена (§5.1, AC-7a).
   - Тело уходит как есть: транспорт не добавляет и не убирает поля. Подстановку `minEpoch` делает клиент, `raw.*` отправляет тело вызывающего (§5.1).

### Интерфейсы и контракты
- URL: `${baseUrl}/v1/authz/permissions|check|batch` (§3.1).
- Заголовки (имена в нижнем регистре; `Headers` нечувствительны к регистру): `authorization`, `content-type: application/json`, `traceparent` — только если функция вернула непустую строку (AC-19).
- Метрика `request` — на каждую попытку (AC-18: «401 + повтор → два вызова `request`»).

### Свидетельства требований
- prd.md §3.1, §5.1 («Ответы Platform», «`raw.*`», «Метрики»), AC-7 (401, 503, таймаут, обрыв), AC-7a, AC-19 «Транспорт», NFR-3.

### Ошибки и логирование
- `debug 'platform request'` — `{endpoint, status, attempt, durationMs}` на каждый полученный HTTP-ответ.
- `warn 'PLATFORM_UNAVAILABLE'` — через ограничитель, `{reason, status?, endpoint, suppressed}`.
- `error` о контракте здесь не пишется: его пишет клиент один раз на вызывающего (Task 24), чтобы покрыть и локальные коды.
- Запрещено логировать токен, заголовки, тело запроса и ответа.

### Тесты
Task 20 (`test/unit/transport.spec.ts`).

### Критерии приёмки
- При 401, затем 200: `getToken` вызван дважды (`undefined`, затем `{refresh: true}`), второй запрос ушёл с новым токеном.

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/transport.ts (CREATE) — HTTP-клиент библиотеки. Тип `shared http` создаёт HTTP-инфраструктуру сервиса (Fastify), а не клиент.

## Task 16: `clientCredentials` (`src/core/token-provider.ts`)

### Зачем
D8: реализация `TokenProvider`, которой сервис получает токен с областью `platform:authz`. Правила из §5.1:
- `client_secret_basic`;
- кэш до `exp − 30 с`;
- объединение одновременных запросов, в том числе с `refresh`;
- классификация ошибок Identity;
- неудача не кэшируется.

Метрика `request('token', …)` пишется из `options.metrics`, только на HTTP-запрос (prd.md v1.8).

### Шаги реализации
1. Создать `src/core/token-provider.ts`. Первая строка: `// clientCredentials (prd.md §5.1, D8, AC-9, AC-18 v1.8): client_secret_basic, кэш до exp − 30 с, объединение запросов, refresh.`
2. Экспорт:
   ```ts
   export const TOKEN_EXPIRY_SKEW_MS = 30_000;
   export function clientCredentials(options: ClientCredentialsOptions): TokenProvider;
   ```
3. Проверка опций (вызов бросает сразу):
   - `tokenUrl`: строка, `URL.canParse`, протокол `http:`/`https:`;
   - `clientId`, `clientSecret`, `scope`, `resource`: непустые строки;
   - `requestTimeoutMs`: `undefined` или безопасное целое ≥ 100;
   - `fetch`, `clock`: `undefined` или функция;
   - `metrics`: `undefined` или объект с функцией `request`.

   Нарушения → `TypeError('platform-client: invalid clientCredentials options: <имена через ", ">')`, без значений. `clientSecret` никогда не попадает в сообщение.
4. Значения по умолчанию: `fetch = (i, n) => globalThis.fetch(i, n)`, `clock = Date.now`, `requestTimeoutMs = 2000`.
5. Заголовок авторизации вычисляется один раз:
   ```ts
   function formEncode(value: string): string {
       return new URLSearchParams([['', value]]).toString().slice(1); // RFC 6749 §2.3.1 + Appendix B
   }
   const authorization = `Basic ${Buffer.from(`${formEncode(clientId)}:${formEncode(clientSecret)}`, 'utf8').toString('base64')}`;
   const requestBody = new URLSearchParams({ grant_type: 'client_credentials', scope, resource }).toString();
   ```
   `client_secret` и `client_id` в тело не попадают (AC-9).
6. Состояние и алгоритм:
   ```ts
   let cached: { token: string; refreshAt: number } | undefined;   // refreshAt = receivedAt + expiresInSec*1000 − 30 000
   let inflight: { promise: Promise<string>; forRefresh: boolean; seq: number } | undefined;
   let seq = 0;
   let cacheFloor = 0;   // ответы запросов с seq < cacheFloor (начатых до последнего refresh) в кэш не пишутся

   getToken(o) {
       if (o?.refresh === true) {
           cached = undefined;
           if (inflight?.forRefresh) return inflight.promise;   // 5 одновременных refresh → 1 запрос
           return start(true);
       }
       if (cached !== undefined && clock() < cached.refreshAt) return Promise.resolve(cached.token);
       if (inflight !== undefined) return inflight.promise;     // обычный getToken во время refresh получает новый токен
       return start(false);
   }

   start(forRefresh) {
       const mySeq = ++seq;
       if (forRefresh) cacheFloor = mySeq;
       const promise = requestToken().then(({ token, expiresInSec, receivedAt }) => {
           if (mySeq >= cacheFloor) cached = { token, refreshAt: receivedAt + expiresInSec * 1000 - TOKEN_EXPIRY_SKEW_MS };
           return token;
       }).finally(() => { if (inflight?.seq === mySeq) inflight = undefined; });
       inflight = { promise, forRefresh, seq: mySeq };
       return promise;
   }
   ```
   Ошибка не кэшируется: `cached` не меняется, `inflight` очищается в `finally`, следующий `getToken` делает новый запрос (AC-9).
7. `requestToken()`:
   ```
   started = clock()
   result = await sendRequest(fetch, tokenUrl, { method: 'POST', headers: { authorization, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: requestBody }, requestTimeoutMs)   // sendRequest — из transport.ts (Task 15)
   seconds = (clock() − started) / 1000
   if !result.ok → metrics?.request('token', 'unavailable', seconds); throw new PlatformUnavailableError('token', result.reason, { cause: result.cause })
   json = parseJsonText(result.bodyText)        // из transport.ts; undefined при невалидном JSON
   if status === 200:
       parsed = parseTokenResponse(json)
       if parsed === undefined → metrics?.request('token', 'contract_error', seconds); throw new PlatformContractError('INVALID_RESPONSE', { endpoint: 'token' })
       metrics?.request('token', 'ok', seconds); return { token: parsed.accessToken, expiresInSec: parsed.expiresInSec, receivedAt: clock() }
   if status >= 500 → unavailable 'http_5xx' (метрика 'unavailable')
   if status === 429 → unavailable 'http_429' (метрика 'unavailable')
   иначе → metrics?.request('token', 'contract_error', seconds); throw new PlatformContractError(parseOAuthErrorCode(json) ?? `HTTP_${status}`)
   ```
   Зависит от `sendRequest` и `parseJsonText` из Task 15.

### Интерфейсы и контракты
- Возвращаемый объект реализует `TokenProvider` (Task 7).
- Ошибки — только `PlatformUnavailableError('token', …)` и `PlatformContractError`. В сообщениях и `details` нет токена и секрета.
- Метрика — только при наличии `options.metrics` и только на HTTP-запрос. Выдача из кэша её не вызывает (AC-18 v1.8).

### Свидетельства требований
- prd.md §5.1 («`clientCredentials`», «`TokenProvider`»), D8, AC-9, AC-18 (v1.8: `request('token','ok',s)`, без вызова при кэше, 503 → `unavailable`, 401 `invalid_client` → `contract_error`, без `metrics` — без ошибок).

### Ошибки и логирование
- Провайдер не логирует: у него нет логгера (§5.1). `warn` о недоступности `token` пишет транспорт (Task 15), `error` о контракте — клиент (Task 24).
- Тело ответа Identity нигде не сохраняется и не логируется.

### Тесты
Task 19 (`test/unit/token-provider.spec.ts`).

### Критерии приёмки
- 20 одновременных `getToken()` → 1 запрос (AC-9).

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/token-provider.ts (CREATE) — компонент библиотеки. В сервисе это был бы провайдер `shared/auth`, но здесь нет DI.

## Task 17: Инфраструктура тестов слоя U (`test/unit/support/`)

### Зачем
Все тесты U работают без сети, на подделанных `fetch` и часах (prd.md §7). Проверка «логгер за весь набор U-тестов не получил строку, содержащую токен или `clientSecret`» (AC-19) делается один раз, в `afterEach` подготовительного файла: её получают все тесты, создающие логгер.

### Шаги реализации
1. `test/unit/support/clock.ts`:
   ```ts
   export interface TestClock { readonly now: () => number; advance(ms: number): void; set(ms: number): void }
   export function createClock(startMs = 0): TestClock;
   ```
2. `test/unit/support/secrets.ts`:
   ```ts
   export const TOKEN_1 = 'tok-SECRET-0001-aaaaaaaaaaaaaaaa';
   export const TOKEN_2 = 'tok-SECRET-0002-bbbbbbbbbbbbbbbb';
   export const CLIENT_SECRET = 's3cr:et%+SECRET/=';
   export const SECRET_VALUES: readonly string[] = [TOKEN_1, TOKEN_2, CLIENT_SECRET];
   ```
3. `test/unit/support/fetch-stub.ts`:
   ```ts
   export interface RecordedRequest {
       readonly url: string;
       readonly path: string;          // new URL(url).pathname
       readonly method: string;
       readonly headers: Headers;      // new Headers(init.headers)
       readonly bodyText: string;
       readonly signal: AbortSignal | undefined;
       json(): unknown;                // JSON.parse(bodyText)
       form(): URLSearchParams;        // new URLSearchParams(bodyText)
   }
   export type StubReply = { readonly status: number; readonly json?: unknown; readonly text?: string } | 'network-error' | 'hang';
   export type StubHandler = (request: RecordedRequest) => StubReply | Promise<StubReply>;
   export interface FetchStub {
       readonly fetch: typeof fetch;
       readonly requests: RecordedRequest[];
       reply(handler: StubHandler): void;                 // заменить обработчик
       countTo(path: string): number;                     // число запросов к пути
   }
   export function createFetchStub(handler?: StubHandler): FetchStub;
   export interface Gate<T> { readonly promise: Promise<T>; open(value: T): void }
   export function createGate<T>(): Gate<T>;
   ```
   - `fetch(input, init)`: записать запрос (тело — строка из `init.body`, `URLSearchParams` → `toString()`); получить ответ от обработчика; `'network-error'` → `throw new TypeError('fetch failed')`; `'hang'` → вернуть промис, который отклоняется `new DOMException('aborted', 'AbortError')` по событию `abort` сигнала (и никогда не разрешается без него); иначе `new Response(reply.text ?? JSON.stringify(reply.json ?? {}), { status: reply.status, headers: { 'content-type': 'application/json' } })`.
   - Обработчик по умолчанию — `{ status: 500 }`: тест, забывший задать ответ, падает явно.
4. `test/unit/support/recording.ts`:
   ```ts
   export interface LogEntry { readonly level: 'debug' | 'warn' | 'error'; readonly obj: object; readonly msg: string | undefined }
   export interface RecordingLogger { readonly logger: PlatformClientLogger; readonly entries: LogEntry[]; messages(level: LogEntry['level']): string[] }
   export function createRecordingLogger(): RecordingLogger;   // регистрирует entries в recordedLogEntries()
   export function recordedLogEntries(): LogEntry[][];
   export function resetRecordedLogs(): void;
   export interface MetricCall { readonly method: 'cacheResult' | 'request' | 'policyEvent'; readonly args: readonly unknown[] }
   export interface RecordingMetrics { readonly metrics: PlatformClientMetrics; readonly calls: MetricCall[]; requests(): Array<readonly [string, string, number]> }
   export function createRecordingMetrics(): RecordingMetrics;
   ```
5. `test/unit/support/token-stub.ts`:
   ```ts
   export interface TokenStub { readonly provider: TokenProvider; readonly calls: Array<{ readonly refresh: boolean }>; fail(error: Error | undefined): void }
   export function createTokenStub(): TokenStub;
   ```
   Возвращает `TOKEN_1` до первого `{refresh: true}`, после — `TOKEN_2`. `fail(err)` заставляет следующие вызовы отклоняться с `err`.
6. `test/unit/support/setup.ts`:
   ```ts
   // AC-19 (NFR-3): ни один подделанный logger набора U не получил токен или clientSecret — проверка после каждого теста.
   import { afterEach, expect } from 'vitest';
   import { recordedLogEntries, resetRecordedLogs } from './recording.js';
   import { SECRET_VALUES } from './secrets.js';

   afterEach(() => {
       for (const entries of recordedLogEntries()) {
           for (const entry of entries) {
               const text = `${entry.msg ?? ''} ${JSON.stringify(entry.obj)}`;
               for (const secret of SECRET_VALUES) {
                   expect(text, 'AC-19: лог содержит секрет').not.toContain(secret);
               }
           }
       }
       resetRecordedLogs();
   });
   ```
7. В `vitest.config.ts` добавить `setupFiles: ['test/unit/support/setup.ts']`. Комментарий в шапке дополнить: `; setup — AC-19 (логи без секретов)`.

### Интерфейсы и контракты
- Файлы поддержки импортируют типы из `../../../src/core/types.js`. Это не spec-файлы: Vitest их не собирает, `include` — только `*.spec.ts`.

### Свидетельства требований
- prd.md §7 (слой U), AC-19 «Логи».

### Ошибки и логирование
Не применимо.

### Тесты
Инфраструктура используется тестами Task 18–20, 23, 26–29.

### Критерии приёмки
- `pnpm test` зелёный (существующие тесты не сломаны подключённым `setupFiles`).

### Проверка
- `pnpm test` → 0; `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic test/unit/support/*.ts (CREATE) — тестовые помощники. Тип `test` создаёт spec-файлы, а это поддержка набора.

## Task 18: Тесты настроек и ограничителя логов (AC-19 «Настройки», NFR-3)

### Шаги реализации
1. `test/unit/options.spec.ts` (первая строка — `// AC-19 «Настройки» (prd.md §5.1): неверные параметры → TypeError с именем, без значения.`):
   - `describe('AC-19: проверка настроек', …)`:
     - `it.each([['cacheTtlSec', { cacheTtlSec: 61 }], ['cacheTtlSec', { cacheTtlSec: 0 }], ['denyTtlSec', { denyTtlSec: 6 }], ['maxEntries', { maxEntries: 10 }], ['baseUrl', { baseUrl: 'platform:3000' }]])('AC-19: %s неверен → TypeError с именем параметра', …)`: база — `{ baseUrl: 'http://platform:3000', tokenProvider: createTokenStub().provider }`; `expect(() => resolveOptions(...)).toThrow(TypeError)`; сообщение содержит имя.
     - `it('AC-19: значение параметра не попадает в сообщение')` — `baseUrl: 'platform:3000'` → сообщение не содержит `platform:3000`.
     - `it('AC-19: несколько неверных — все имена в одном TypeError')` — `cacheTtlSec: 0, denyTtlSec: 9`.
     - `it.each` по `baseUrl`: `'http://platform:3000/'`, `'ftp://platform'`, `''` → `TypeError`.
     - `it('AC-19: нецелые значения отклоняются')` — `cacheTtlSec: 1.5`, `requestTimeoutMs: 99.5`.
     - `it('AC-19: без tokenProvider — TypeError tokenProvider')`.
     - `it('AC-19: границы допустимы — cacheTtlSec 1 и 60, denyTtlSec 1 и 5, maxEntries 100, requestTimeoutMs 100')`.
     - `it('§5.1: значения по умолчанию')` → `cacheTtlMs 60000, denyTtlMs 5000, maxEntries 50000, lastSeenMaxEntries 5000, requestTimeoutMs 2000`.
2. `test/unit/log-limiter.spec.ts` (первая строка — `// NFR-3 (AC-7, AC-7a): частота warn о недоступности и error контракта.`):
   - `it('NFR-3: warn о недоступности — один за 10 с на endpoint, затем suppressed: 99')`: 100 вызовов с шагом 50 мс от 0 → `entries.length === 1`, `suppressed: 0`; `clock.set(10_000)` → вызов → вторая запись `{ endpoint: 'permissions', suppressed: 99 }`, сообщение `'PLATFORM_UNAVAILABLE'`.
   - `it('NFR-3: на 9 999 мс — ещё без записи')`.
   - `it('NFR-3: endpoint ограничиваются независимо')` — `permissions` и `token` в один момент → 2 записи.
   - `it('NFR-3: error контракта — один за 60 с на код, коды независимы')` — 10 × `TENANT_MISMATCH` → 1 запись; `SCOPE_REQUIRED` → ещё 1; на 60 000 мс `TENANT_MISMATCH` → запись с `suppressed: 9`.
   - `it('NFR-3: поля endpoint и code не подменяются вызывающим')`.
   - `it('NFR-3: без logger — без ошибок')`.

### Свидетельства требований
- AC-19 «Настройки», NFR-3, AC-7 (частота `warn`), AC-7a (частота `error`).

### Ошибки и логирование
Не применимо (тесты).

### Тесты
Эти файлы. Команда: `pnpm test`.

### Критерии приёмки
- Все кейсы зелёные; изменение окна на 9 999 мс делает тест NFR-3 красным.

### Проверка
- `pnpm test` → 0.

**Skill:** nestjs-code test unit options (CREATE); nestjs-code test unit log-limiter (CREATE)

## Task 19: Тесты `clientCredentials` (AC-9, AC-18 `token`)

### Шаги реализации
1. `test/unit/token-provider.spec.ts` (первая строка — `// AC-9, AC-18 (prd.md §5.1 v1.8, D8): clientCredentials — client_secret_basic, кэш, объединение, refresh, ошибки Identity, метрика token.`).
   Общая настройка:
   - `createFetchStub`, `createClock(0)`, `createRecordingMetrics()`;
   - опции `{ tokenUrl: 'http://identity:3000/oidc/token', clientId: 'verdeect:files', clientSecret: CLIENT_SECRET, scope: 'platform:authz', resource: 'https://api.verdeect.ru', fetch, clock: clock.now, metrics }`;
   - ответ Identity по умолчанию — `{ status: 200, json: { access_token: TOKEN_1, expires_in: 40, token_type: 'Bearer' } }`.
2. `describe('AC-9: clientCredentials', …)`:
   - `it('AC-9: 20 одновременных getToken → 1 запрос к Identity')`: обработчик ждёт `gate`; 20 вызовов; `gate.open`; все получили `TOKEN_1`; `requests.length === 1`.
   - `it('AC-9: запрос — client_credentials, scope, resource в теле, Authorization: Basic, client_secret нет в теле')`:
     - `method === 'POST'`, `content-type === 'application/x-www-form-urlencoded'`;
     - `form()` — `grant_type=client_credentials`, `scope=platform:authz`, `resource=https://api.verdeect.ru`, нет ключей `client_secret` и `client_id`;
     - `authorization === 'Basic ' + Buffer.from('verdeect%3Afiles:s3cr%3Aet%25%2BSECRET%2F%3D').toString('base64')`, то есть `:`, `%`, `+`, `/`, `=` закодированы по RFC 6749 §2.3.1.
   - `it('AC-9: expires_in: 40 → на 9-й секунде из кэша, на 11-й — новый запрос')`.
   - `it('AC-9: getToken({refresh: true}) при живом токене → новый запрос')`: второй ответ — `TOKEN_2`.
   - `it('AC-9: 5 одновременных refresh → 1 запрос')`.
   - `it('AC-9: getToken() во время refresh получает новый токен')`: `refresh` (ожидает `gate`), затем `getToken()` → после открытия оба — `TOKEN_2`.
   - `it('AC-9: ответ запроса, начатого до refresh, не попадает в кэш')`: обычный `getToken()` ждёт `gate1` (ответит `TOKEN_1`), `refresh` ждёт `gate2` (ответит `TOKEN_2`); `gate1` открыт первым → `getToken()` после него ещё ждёт refresh и получает `TOKEN_2`.
   - `it.each([[503], [429]])('AC-9: Identity %s → PlatformUnavailableError', …)` — `endpoint === 'token'`.
   - `it('AC-9: таймаут → PlatformUnavailableError (timeout)')`: `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`, ответ `'hang'`, `requestTimeoutMs: 2000`, `await vi.advanceTimersByTimeAsync(2000)`, `reason === 'timeout'`; в `afterEach` — `vi.useRealTimers()`.
   - `it('AC-9: обрыв соединения → PlatformUnavailableError (network)')`.
   - `it('AC-9: 401 invalid_client → PlatformContractError с code invalid_client')`.
   - `it('AC-9: 400 без поля error → PlatformContractError HTTP_400')`.
   - `it('AC-9: ответ не по схеме (нет expires_in) → PlatformContractError INVALID_RESPONSE')`.
   - `it('AC-9: после ошибки следующий getToken делает новый запрос')`.
   - `it('AC-9: неверные опции → TypeError с именами, без значения секрета')` — `clientSecret: ''`, `tokenUrl: 'identity'` → сообщение содержит `clientSecret`, `tokenUrl`, не содержит `CLIENT_SECRET`.
3. `describe('AC-18: метрика token (prd.md v1.8)', …)`:
   - `it('AC-18: запрос к Identity → request(token, ok, s), s > 0')`: обработчик делает `clock.advance(7)` перед ответом → `[['token', 'ok', 0.007]]`.
   - `it('AC-18: повторный getToken() из кэша провайдера — без вызова request')`.
   - `it('AC-18: Identity 503 → request(token, unavailable, …)')`.
   - `it('AC-18: 401 invalid_client → request(token, contract_error, …)')`.
   - `it('AC-18: без metrics у clientCredentials — ошибок нет')`.

### Свидетельства требований
- AC-9, AC-18 (v1.8), prd.md §5.1, D8.

### Ошибки и логирование
Не применимо (тесты).

### Тесты
Этот файл. Команда: `pnpm test`.

### Критерии приёмки
- Все кейсы зелёные. Порог 30 с, изменённый на 0, делает кейс «11-я секунда» красным.

### Проверка
- `pnpm test` → 0.

**Skill:** nestjs-code test unit token-provider (CREATE)

## Task 20: Тесты транспорта (AC-7, AC-7a, AC-18, AC-19 «Транспорт»)

### Шаги реализации
1. `test/unit/transport.spec.ts` (первая строка — `// Транспорт к Platform (prd.md §5.1 «Ответы Platform»): AC-7 (401, 503, таймаут, обрыв), AC-7a, AC-18 (request), AC-19 «Транспорт».`).
   Фабрика `makeTransport(overrides)`:
   - `createTransport({ baseUrl: 'http://platform:3000', tokenProvider: tokens.provider, fetch: stub.fetch, clock: clock.now, requestTimeoutMs: 2000, traceparent: undefined, logger: rec.logger, metrics: m.metrics, limiter: createLogLimiter(rec.logger, clock.now) })`;
   - `parse = parsePermissionsResponse`, тело — `{ sub: 'usr_a', tenant: 'acme', tenantId: 'cmp_1', act: 'human' }`.
2. `describe('AC-19: транспорт', …)`:
   - `it('AC-19: Authorization: Bearer <токен>, Content-Type: application/json, URL /v1/authz/permissions, тело как есть')`.
   - `it("AC-19: traceparent: () => '00-…-01' → заголовок traceparent")` — значение `'00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'`.
   - `it('AC-19: traceparent → undefined — заголовка нет')`.
3. `describe('AC-7: недоступность и 401', …)`:
   - `it.each([[503], [500]])('AC-7: Platform %s → PlatformUnavailableError, один запрос', …)`.
   - `it('AC-7: таймаут 2 с → PlatformUnavailableError (timeout)')` — фейковые таймеры, как в Task 19.
   - `it('AC-7: обрыв соединения → PlatformUnavailableError (network)')`.
   - `it('AC-7: 401 → getToken({refresh: true}) ровно один раз, повтор ушёл с новым токеном')`: первый ответ 401, второй 200; `tokens.calls` — `[{refresh:false},{refresh:true}]`; заголовки — `Bearer TOKEN_1`, затем `Bearer TOKEN_2`.
   - `it('AC-7: повтор 401 → PlatformUnavailableError (unauthorized), третьего запроса нет')`.
   - `it('AC-7: getToken недоступен → ошибка как есть, warn PLATFORM_UNAVAILABLE с endpoint token, запроса к Platform нет')`.
4. `describe('AC-7a: ошибки контракта', …)`:
   - `it.each([[403, 'SCOPE_REQUIRED'], [422, 'TENANT_MISMATCH'], [422, 'VALIDATION_FAILED']])('AC-7a: %s %s → PlatformContractError с этим кодом, без повтора и без перезапроса токена', …)`: ответ `{ error: { code, message: '…', details: {} } }`; `requests.length === 1`; `tokens.calls.length === 1`.
   - `it('AC-7a: 404 без тела Platform → PlatformContractError HTTP_404')`.
   - `it('AC-7a: 200 не по схеме → PlatformContractError INVALID_RESPONSE')`.
   - `it('AC-7a: 200 с невалидным JSON → PlatformContractError INVALID_RESPONSE')`.
5. `describe('AC-18: метрика request', …)`:
   - `it('AC-18: 200 → request(permissions, ok, s), s > 0')` — обработчик делает `clock.advance(5)`.
   - `it('AC-18: 503 → request(permissions, unavailable, …)')`.
   - `it('AC-18: 422 → request(permissions, contract_error, …)')`.
   - `it('AC-18: 401 + повтор → два вызова request')`: `[['permissions','unavailable',…],['permissions','ok',…]]`.
   - `it('AC-18: в вызовах нет sub и tenantId')`: `JSON.stringify(m.calls)` не содержит `usr_a` и `cmp_1`.
6. `describe('NFR-3: логи транспорта', …)`:
   - `it('NFR-3: debug platform request без токена и тела')`: запись `debug` с `{endpoint, status, attempt, durationMs}`; проверку секретов дополнительно делает `setup.ts`.

### Свидетельства требований
- AC-7 (части про 401, 503, таймаут, обрыв), AC-7a, AC-18, AC-19 «Транспорт», NFR-3.

### Ошибки и логирование
Не применимо (тесты).

### Тесты
Этот файл. Команда: `pnpm test`.

### Критерии приёмки
- Все кейсы зелёные. Удаление условия `attempt === 2` (бесконечный повтор) делает кейс «третьего запроса нет» красным.

### Проверка
- `pnpm test` → 0; `pnpm typecheck` → 0; `pnpm lint` → 0; `pnpm format:check` → 0.

**Skill:** nestjs-code test unit transport (CREATE)

## Риски фазы и меры
- Риск: `vi.useFakeTimers` подменяет больше нужного, и `fetch`-заглушка на промисах зависает.
  Мера: подменять только `['setTimeout', 'clearTimeout']`, двигать время `advanceTimersByTimeAsync`.
- Риск: `Response` со статусом 401/404 и пустым телом.
  Мера: заглушка всегда отдаёт строку (`text ?? JSON.stringify(json ?? {})`). Для «без тела Platform» передавать `text: 'Not Found'`.

## Чек-лист завершения фазы
- Задачи 13–20 удовлетворяют критериям приёмки.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` — код 0.
- Чекбоксы в `index.md` обновлены.
