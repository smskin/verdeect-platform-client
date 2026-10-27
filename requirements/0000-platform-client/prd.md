# PRD: `@verdeect/platform-client` — клиент авторизации Platform (Вердикт 2.0)

> Версия 1.8 от 27.10.2026 — по планированию E1: метрика `request('token', …)` пишется `clientCredentials` из необязательного `metrics` в его опциях, только на HTTP-запрос к Identity (§5.1, AC-18).
>
> Версия 1.7 от 27.10.2026 — по четвёртому `/prd-review`: в AC-7 время отсчитывается от начала сценария, проверка границы срока снимка с обеих сторон.
>
> Версия 1.6 от 27.10.2026 — по третьему `/prd-review`: при недоступном Platform откладывается только повторное чтение (`refreshAfter`), снимок живёт свой срок (D6, §5.2, AC-7); ответ с `epoch = null` в «Приёме ответа» (§5.2, AC-3); после `clear()` нет объединения со старыми запросами (§5.1, AC-19).
>
> Версия 1.5 от 27.10.2026 — по повторному `/prd-review` v1.4: единый «Приём ответа» `permissions` и запрошенный `minEpoch` снимка вместо отметки «перечитан», приоритет `STALE_SNAPSHOT` над `PEP_AHEAD` (§5.2, §5.3, D6, AC-6); с какими ответами `@verdeect/auth` сравниваются тексты guard (§5.4, AC-10); `@RequirePermission()` без прав — `TypeError` при объявлении (§5.4, AC-10); ограничение `warn` о недоступности (NFR-3, AC-7); `clear()` (§5.1, AC-19).
>
> Версия 1.4 от 27.10.2026 — по `/prd-review` v1.3: `TokenProvider.getToken({refresh})` (LE-1, §5.1, D8, AC-7, AC-9); `minEpoch = max(lastSeenEpoch, pep)` уже при промахе, объединение запросов по `(ключ, minEpoch)` (LE-2, §3.2, §5.2, D5, AC-6); Platform недоступен при повторном чтении — решение по годному снимку, `fresh` — ошибка (LE-3, D6, §5.2, AC-7); двойная проверка токена при guard'е выше на методе (CE-1, D11, §5.4, AC-10); каталог — в AC-8a (CE-2); `/ok` при `APP_GUARD` (CE-3); G2 (CE-4); NFR-1…NFR-6 (CE-5); `checkMany` (GAP-1, §5.2, §5.4, AC-8b); `asid`/`wid` не уходят в Platform (GAP-2); `clientCredentials` — `client_secret_basic`, ошибки Identity (GAP-3, AC-9); `fresh` и `raw` (GAP-4, AC-7b); LRU для `lastSeenEpoch` (GAP-5); структура UC-1…UC-4 (RD-1); `PlatformClientMetrics`, ограничения настроек, AC-17–19 (RD-2). Platform — `main` `7adb423` (v1.11, `minEpoch`).
>
> Версия 1.3 от 27.10.2026 — сверка с Platform v1.11 и реализованным `verdeect-platform`: guard на маршруте, сам вызывает `VerdeectAuthGuard` (D11); пакет не передаёт `pep`, свежесть — через `minEpoch`; граница отзыва (G3); слой C — локально, стенд описан (D10, §7); выпуск — GitHub Actions + Trusted Publishing (D1, AC-16); мягкая схема `onPolicyChanged`, AC-15 через копию JSON Schema; условие `development` — по умолчанию в Vitest; peer-зависимости с `^`, zod — внутренняя; копия каталога, `setModule`; логгер с `error`, тексты ответов guard.
>
> Версия 1.2 от 26.10.2026 — по повторному `/prd-review`: слой C — тестовый издатель с пробросом порта JWKS; AC-15 — токен без `platform:authz`; UC-3 — `tenant` в вызове.
>
> Версия 1.1 от 26.10.2026 — по `/prd-review`: поле `tenant` в запросе; порядок локального решения; 403/404/422 от Platform → `PlatformContractError`; `Principal` и guard — по `@verdeect/auth` 1.0.1.
>
> Версия 1.0 от 26.10.2026. Проработка в чате Platform-лайт (решение D14 `platform-lite/prd.md`: пакет, три потребителя с этапа 1). Отдельный репозиторий со своей инициализацией AI Factory и своим `/aif-prompts`.
>
> **Этот PRD самодостаточен**: контракт Platform, нужный пакету, повторён в §3. Источник истины контракта — `platform-lite/prd.md` **v1.11**: §5.6, §6.1 (примечание о требуемой эпохе), §7.1–7.3 (`minEpoch`), §9.2, §11, §15 «Отзыв»; код — `verdeect-platform` `main` (`7adb423` и новее). При расхождении правится там, затем здесь.
>
> Формат — для AI Factory. Идентификаторы: D, UC, AC, NFR. `[OPEN]`, `[ASSUMPTION]`.
>
> Образцы и источники (WSL: `/home/administrator/projects/verdeect2/…`): `verdeect-auth` — структура пакета, CI и выпуск (`.github/workflows/ci.yml`, `docs/releasing.md`), подпуть `testing` (`docs/testing.md`), guard (`src/nest`); `verdeect-platform` — источник копий: каталог прав и модулей (`apps/platform/src/modules/catalog/domain/`), коды (`decision-codes.ts`), схемы событий (`apps/platform/contracts/events/*.schema.json`), ответы `authz` (`apps/platform/src/modules/authz/http/`); `verdeect-identity` — способ аутентификации клиента на `token` (`apps/identity/src/modules/oidc/provider-service/domain/client-metadata.ts`).

---

## 0. Решения

| # | Решение | Основание |
|---|---|---|
| D1 | **Отдельный репозиторий, npm `@verdeect/platform-client`**, публичный, как `@verdeect/auth`: GitHub (`smskin/verdeect-platform-client`), локально — `verdeect2/verdeect-platform-client`. Semver; выпуск из GitHub Actions по тегу `v*` через npm Trusted Publishing (OIDC, без токенов, provenance); 1.0.0 — вручную мейнтейнером, затем `npm trust` и запрет публикации токенами. Потребители указывают версию точно (`01` решение 21) | D14 Platform-лайт; `verdeect-auth` `docs/releasing.md` |
| D2 | **Ядро без Nest** (чистый TypeScript, ESM, Node ≥ 22.12) + подпуть `@verdeect/platform-client/nest` (модуль, guard, декоратор) + подпуть `@verdeect/platform-client/testing` (подделка Platform). Nest и `@verdeect/auth` — необязательные `peerDependencies` (NFR-4) | как `@verdeect/auth` |
| D3 | **Решение по праву — локально из снимка `permissions`**: клиент кэширует ответ `POST /v1/authz/permissions` по `(tenantId, sub, act)` и отвечает на `check` из него. `POST /v1/authz/check` пакет не вызывает: один запрос к Platform на участника за TTL, а не на каждое действие | инвариант `check ≡ permissions` Platform (§3.3) |
| D4 | **Кэш**: позитивный снимок ≤ 60 с, общий отказ ≤ 5 с; сброс по `platform.policy.changed` (`subs` или вся компания; событие с эпохой ≤ эпохи снимка не сбрасывает). Одновременные запросы объединяются (§5.2). Каждый запрос передаёт `minEpoch` — наибольшую известную эпоху компании (§5.3) | D13 Platform-лайт; Platform §7.3 |
| D5 | **`pep` агента проверяется локально**: `pep < snapshot.epoch` → `CONTEXT_REVOKED`; `pep > snapshot.epoch` → снимок устарел: один запрос `permissions` с `minEpoch ≥ pep` (§5.2), Platform перечитывает БД мимо своего кэша. `pep` в Platform пакет не передаёт | Platform §6.1 шаг 7 и примечание, §7.3 |
| D6 | **Fail-closed**: Platform недоступен и годного снимка нет → `PlatformUnavailableError` (guard → 503 `PLATFORM_UNAVAILABLE`); снимок с истёкшим TTL **не используется**. Повторное чтение по `pep > epoch` (§5.2 шаг 5) при недоступном Platform — решение по годному снимку, `warn PLATFORM_UNAVAILABLE`, следующая попытка повторного чтения — не раньше чем через `denyTtlSec`. Снимок живёт свой срок; после его истечения — обычный промах (без снимка → `PlatformUnavailableError`). `permissions({fresh: true})` — ошибка передаётся вызывающему, кэш не подменяет ответ | `01` §4.3 |
| D7 | **Транспорт событий — у сервиса**: пакет не подключается к RabbitMQ; сервис передаёт конверт в `client.onPolicyChanged(envelope)`. Когда появится `@verdeect/kit`, подписка может переехать туда | `@verdeect/kit` ещё нет |
| D8 | **Сервисный токен — через `TokenProvider`**: в пакете реализация `clientCredentials(...)` (кэш до `exp − 30 с`, объединение одновременных запросов); сервис может передать свою реализацию с тем же контрактом `refresh` (§5.1) | у каждого сервиса свой клиент Identity |
| D9 | **Коды и сообщения — константы пакета**, совпадают дословно с Platform (§3.4) и с `@verdeect/auth` (§5.4); guard отвечает в формате `01` §8 | единые коды для SPA |
| D10 | **Совместимость — контрактные тесты (слой C) против настоящего Platform**, локально перед выпуском: `make test-contract` поднимает в Testcontainers PostgreSQL, RabbitMQ и образ `verdeect-platform` (по умолчанию собирается из `../verdeect-platform`, `docker build --target production`; либо `PLATFORM_IMAGE`). Коммит Platform попадает в отчёт прогона. В CI — только слой U. Версия пакета не выпускается без зелёного прогона C против текущего `main` Platform | CI Platform без Docker для Testcontainers; у Platform нет semver; P-тесты Platform идут так же |
| D11 | **Guard — на маршруте, не `APP_GUARD`**: `@RequirePermission` ставит `PermissionGuard` через `UseGuards`. Если `Principal` нет, guard сам вызывает `VerdeectAuthGuard` из DI. Порядок подключения `VerdeectAuthGuard` на ответы не влияет. Токен проверяется один раз, если `VerdeectAuthGuard` подключён глобально, на контроллере или на том же методе **ниже** `@RequirePermission` (декораторы применяются снизу вверх). Если на том же методе выше — проверок две (~0,45 мс), ответы те же. README показывает правильный порядок | Nest вызывает глобальные guard'ы раньше guard'ов маршрута; сервисы ставят `VerdeectAuthGuard` на маршрут (`verdeect-auth` `docs/nestjs.md`) |

## 1. Цели

- G1. Сервису этапа 1 (Orchestrator, Files, Media) достаточно декоратора `@RequirePermission('chat.office')`, чтобы проверка шла по правилам Platform, с кэшем и единым ответом об отказе.
- G2. Нагрузка на Platform в установившемся режиме — не больше одного запроса `permissions` на `(участник, act)` за TTL на реплику сервиса. Сверх этого — только повторные чтения по событию, по `pep > epoch` и `fresh` (§5.2, §5.3), не больше одного на каждый такой повод (объединение запросов).
- G3. Отзыв прав доходит до кэша сервиса за время доставки события (доли секунды). Если событие потеряно только у сервиса — не позже 60 с (TTL пакета). Если потеряно и у реплики Platform (сбой брокера) — не позже 90 с (60 с пакета + 30 с Platform). Снятие общего отказа без события (`account:enable`) — не позже 10 с (5 с пакета + 5 с Platform). Совпадает с Platform §15 «Отзыв».
- G4. Потребители тестируют свои guard'ы без Platform (`testing`).

## 2. Не-цели

- N1. Проверка JWT — `@verdeect/auth`; пакет берёт готовый `Principal`.
- N2. Подписка на RabbitMQ, outbox/inbox — сервис (D7).
- N3. Объектные ACL (личное/корпоративное, `01` §6.3 последняя строка) — сервис-владелец данных.
- N4. Резерв лимитов `reserve/commit/release` — появится в Platform в техэтапе 6; в пакет добавляется тогда же (минорная версия).
- N5. Сборка набора инструментов агента и перевыпуск токенов — Orchestrator (пакет даёт только `permissions` и `onPolicyChanged`).
- N6. Тип `PermissionKey` для `@RequirePermission` (проверка опечаток при компиляции): каждое новое право Platform требовало бы выпуска пакета. Опечатки ловит подделка `testing`.

---

## 3. Контракт Platform (копия; источник — `platform-lite/prd.md` v1.11, код — `verdeect-platform` `main`)

### 3.1. Адрес и доступ

`POST {baseUrl}/v1/authz/permissions`, `/v1/authz/check`, `/v1/authz/batch`; `baseUrl` — из карты адресов сервиса (`http://platform:3000` в compose). Заголовки: `Authorization: Bearer <сервисный токен с областью platform:authz>`, `Content-Type: application/json`, `traceparent`. Ошибки — `{error: {code, message, details}}`. Проверка тела Platform: `sub`, `tenant`, `tenantId` — 1..64 символа; `asid`, `wid` — 1..128; `pep`, `minEpoch` — целые ≥ 1; иначе 422 `VALIDATION_FAILED`.

### 3.2. `permissions`

```ts
// запрос
{ sub: string, tenant: string /*slug*/, tenantId: string, act: 'human' | 'agent',
  pep?: number, asid?: string, wid?: string | null, minEpoch?: number /*int ≥ 1, Platform v1.10+*/ }
// 200
type PermissionsResponse =
  | { allow: true; epoch: number; memberId: string; roles: string[];
      permissions: string[];
      denied: Record<string, 'FORBIDDEN' | 'PLAN_MODULE' | 'MODULE_DISABLED'>;
      modules: { id: string; enabled: boolean; code?: 'PLAN_MODULE' | 'MODULE_DISABLED' }[];
      limits: { fileSizeMb: number | null } }
  | { allow: false; epoch: number | null; memberId?: string; code: GeneralDenyCode; message: string;
      roles: []; permissions: []; denied: {}; modules: []; limits: { fileSizeMb: null } };
type GeneralDenyCode = 'NOT_MEMBER' | 'COMPANY_SUSPENDED' | 'ACCOUNT_DISABLED' | 'SEATS_EXCEEDED' | 'CONTEXT_REVOKED';
```

`tenant` и `tenantId` — из одного `Principal`; несовпадение с компанией — 422 `TENANT_MISMATCH`. `permissions ∪ keys(denied)` = весь каталог прав Platform; `modules` — весь каталог модулей (без `title`). `minEpoch`: если эпоха снимка в кэше Platform меньше (или компании в снимке нет), Platform один раз перечитывает БД; на решение поле не влияет.

Пакет вызывает `permissions` **без `pep`**, поэтому `CONTEXT_REVOKED` от Platform не получает. `minEpoch` = `max(lastSeenEpoch[tenantId], pep агента)`; если ни то, ни другое не известно, поле не передаётся.

`asid` и `wid` в Platform не передаются: снимок общий для сессий участника, а журнал Platform показал бы сессию, которая первой промахнулась кэшем. Пакет пишет их в свой лог `debug` при решении для агента.

### 3.3. `check`, `batch`

Те же правила, что локальное решение пакета (§5.2). Пакет их не вызывает (D3); для сервисов, которым нужен прямой вызов, — `client.raw.check(...)`, `client.raw.batch(...)` (§5.1).

### 3.4. Коды и сообщения

| `code` | `message` |
|---|---|
| `NOT_MEMBER` | «Нет доступа к компании.» |
| `COMPANY_SUSPENDED` | «Компания приостановлена.» |
| `ACCOUNT_DISABLED` | «Учётная запись заблокирована.» |
| `SEATS_EXCEEDED` | «Превышено число мест по тарифу. Обратитесь к администратору.» |
| `CONTEXT_REVOKED` | «Контекст отозван. Нужен новый диалог.» |
| `FORBIDDEN` | «Недостаточно прав.» |
| `PLAN_MODULE` | «Возможность не входит в тариф компании.» |
| `MODULE_DISABLED` | «Раздел отключён. Данные сохранены.» |
| `PLATFORM_UNAVAILABLE` (пакет) | «Сервис прав временно недоступен. Повторите позже» |

Источник — `verdeect-platform` `catalog/domain/decision-codes.ts`; копия — `src/core/codes.ts` (источник и коммит в шапке).

### 3.5. Событие `platform.policy.changed`

Конверт `01` §7.1 (`subject` — `{kind: 'company', id}`, `tenant` — slug), `data: {tenantId: string, epoch: number, reason: string, subs?: string[]}`. JSON Schema Platform (`platform-events.schema.json`) строже: `reason` — перечень из 6 значений, `subs` — не меньше одного элемента, лишние поля запрещены. Пакет намеренно мягче (§5.3).

---

## 4. Репозиторий

```
verdeect-platform-client/
├── src/core/        client.ts (PlatformAuthzClient), cache.ts, decide.ts, token-provider.ts, errors.ts,
│                    codes.ts (копия decision-codes.ts), types.ts (интерфейсы TS), schemas.ts (zod, внутренние)
├── src/nest/        platform-authz.module.ts, require-permission.decorator.ts, permission.guard.ts
├── src/testing/     fake-platform.ts (createFakePlatform), catalog.ts (копия каталога прав и модулей Platform)
├── test/unit/       U
├── test/perf/       U — производительность и память (AC-17)
├── test/contract/   C — локально против образа verdeect-platform (D10); support/platform-stand.ts
├── test/fixtures/   platform-events.schema.json, identity-events.schema.json (копии из verdeect-platform, источник и коммит)
├── test/consumer/   проект-потребитель — ставит упакованный архив, проверяет README (AC-12)
├── docs/            getting-started.md, nestjs.md, testing.md, errors.md, releasing.md (как verdeect-auth)
├── scripts/publish.mjs · vitest.config.ts · vitest.perf.config.ts · vitest.package.config.ts · tsconfig*.json
├── package.json · CHANGELOG.md · README.md · Makefile
├── .github/workflows/ci.yml · rules/ · requirements/ · .ai-factory/ · AGENTS.md
```

`exports`: `"."` — ядро; `"./nest"` — подпуть Nest; `"./testing"` — `{types, development}` без `default`, как `@verdeect/auth/testing`: типы видны всегда, код — только с условием `development`; в production импорт падает (`ERR_PACKAGE_PATH_NOT_EXPORTED`).

---

## 5. API пакета

### 5.1. Ядро

```ts
export function createPlatformAuthzClient(options: PlatformAuthzClientOptions): PlatformAuthzClient;

interface PlatformAuthzClientOptions {
  baseUrl: string;                       // абсолютный http(s) URL без завершающего '/', напр. http://platform:3000
  tokenProvider: TokenProvider;          // D8
  cacheTtlSec?: number;                  // целое 1…60, по умолчанию 60
  denyTtlSec?: number;                   // целое 1…5, по умолчанию 5
  maxEntries?: number;                   // целое ≥ 100, по умолчанию 50 000, LRU
  requestTimeoutMs?: number;             // целое ≥ 100, по умолчанию 2000
  fetch?: typeof fetch; clock?: () => number;
  traceparent?: () => string | undefined;
  logger?: { debug(o: object, m?: string): void; warn(o: object, m?: string): void; error(o: object, m?: string): void };
  metrics?: PlatformClientMetrics;
}

interface Subject { sub: string; tenant: string; tenantId: string; act: 'human' | 'agent'; pep?: number; asid?: string; wid?: string | null }

interface PlatformAuthzClient {
  check(subject: Subject, permission: string): Promise<Decision>;                       // §5.2
  checkMany(subject: Subject, permissions: string[]): Promise<Record<string, Decision>>; // §5.2
  permissions(subject: Omit<Subject, 'pep'>, opts?: { fresh?: boolean }): Promise<PermissionsResponse>;  // снимок (кэш); fresh — мимо кэша пакета
  onPolicyChanged(envelope: unknown): void;                                              // §5.3; неверный конверт — warn, без исключения
  clear(): void;
  raw: { check(body: object): Promise<unknown>; batch(body: object): Promise<unknown>; permissions(body: object): Promise<PermissionsResponse> };
}

type Decision =
  | { allow: true; epoch: number; memberId: string }
  | { allow: false; epoch: number | null; memberId?: string; code: DecisionCode; message: string };

interface TokenProvider { getToken(options?: { refresh?: boolean }): Promise<string> }
export function clientCredentials(o: { tokenUrl: string; clientId: string; clientSecret: string;
  scope: string /* 'platform:authz …' */; resource: string /* https://api.verdeect.ru */;
  fetch?: typeof fetch; clock?: () => number; requestTimeoutMs?: number;
  metrics?: Pick<PlatformClientMetrics, 'request'> }): TokenProvider;

interface PlatformClientMetrics {
  cacheResult(result: 'hit' | 'miss' | 'stale'): void;
  request(endpoint: 'permissions' | 'check' | 'batch' | 'token',
          result: 'ok' | 'unavailable' | 'contract_error', seconds: number): void;
  policyEvent(result: 'applied' | 'ignored' | 'invalid'): void;
}

class PlatformUnavailableError extends Error { code = 'PLATFORM_UNAVAILABLE' }   // сеть, таймаут, 5xx, 401 после одного перезапроса токена; Identity: сеть, таймаут, 5xx, 429
class PlatformContractError extends Error { code: string }   // 403, 404, 422 и прочие 4xx кроме 401; ответы не по схеме; UNKNOWN_PERMISSION, PEP_REQUIRED, VALIDATION_FAILED — локально; Identity: 4xx кроме 429 (code — поле error ответа OAuth)
```

**Настройки.** Нарушение ограничений в комментариях `PlatformAuthzClientOptions` → `TypeError` из `createPlatformAuthzClient` с именами неверных параметров, без их значений.

**`logger`** — сигнатура как у pino (`nestjs-pino` подходит напрямую). Без `logger` ядро ничего не пишет; `PlatformAuthzModule` без явного `logger` берёт обёртку над `Logger('PlatformAuthz')` из `@nestjs/common`.

**Типы.** Публичные типы (§3.2, §5.1) — интерфейсы TypeScript без `z.infer`; zod-схемы внутренние, соответствие схем типам проверяет `tsc` (`satisfies`).

**`TokenProvider`.** `getToken({refresh: true})` — токен, выданный после вызова: кэш провайдера сбрасывается. Пакет вызывает так только при ответе 401 от Platform, один раз на запрос. Своя реализация сервиса (D8) обязана учитывать `refresh`.

**`clientCredentials`.** Запрос: `POST tokenUrl`, `Content-Type: application/x-www-form-urlencoded`, тело `grant_type=client_credentials&scope=…&resource=…`; секрет — только `client_secret_basic` (`Authorization: Basic base64(urlencode(clientId):urlencode(clientSecret))`, RFC 6749 §2.3.1): другого Identity для конфиденциальных клиентов не принимает (`verdeect-identity` `client-metadata.ts`). Срок токена — из `expires_in`; кэш до `exp − 30 с`; одновременные `getToken` (в том числе с `refresh`) — один запрос. Ошибки: сеть, таймаут (`requestTimeoutMs`, по умолчанию 2000), 5xx, 429 → `PlatformUnavailableError`; прочие 4xx → `PlatformContractError` с полем `error` ответа OAuth в `code`; ответ не по схеме (`access_token`, `expires_in`) → `PlatformContractError`. Неудача не кэшируется.

**`permissions({fresh: true})`** — запрос мимо кэша пакета с `minEpoch` по §3.2; ответ кладётся в кэш по общим правилам (§5.3: TTL, `lastSeenEpoch`, более высокая эпоха не затирается более низкой). Ошибка не подменяется кэшем (D6). Объединение запросов (§5.2) действует и для `fresh`.

**`raw.*`** — прямой вызов Platform для сервисов, которым нужен `check`/`batch` без кэша: тот же `TokenProvider`, повтор при 401, ошибки по правилам ниже, `traceparent`. Тело уходит как есть: `minEpoch` не подставляется, кэш не читается и не пишется. `raw.permissions` проверяет ответ zod-схемой; `raw.check` и `raw.batch` возвращают `unknown` без проверки (ответы — Platform §7.1–7.2).

**`clear()`** — удаляет все снимки, индекс по `tenantId` и `lastSeenEpoch`. Ответы запросов, начатых до `clear()`, вызывающим отдаются, но в кэш и `lastSeenEpoch` не пишутся. Новые вызовы после `clear()` не присоединяются к запросам, начатым до него (объединение — только в пределах одного «поколения» кэша). Ожидания `clientCredentials` не трогает.

**Ответы Platform:** 200 — по схеме §3.2; 401 — `getToken({refresh: true})` и один повтор, снова 401 → `PlatformUnavailableError`; 403 (`SCOPE_REQUIRED`, `FORBIDDEN` — ошибка конфигурации сервиса), 404 (неверный `baseUrl`), 422 (`VALIDATION_FAILED`, `TENANT_MISMATCH`) и прочие 4xx → `PlatformContractError` с кодом Platform в `code`: без повтора, в кэш не пишется, лог `error`, не чаще раза в 60 с на код; 5xx, таймаут, обрыв → `PlatformUnavailableError`.

**Метрики.** `cacheResult` — `hit` (решение из кэша без запроса), `miss` (запрос: снимка нет, повторное чтение по `pep`, `fresh`), `stale` (ответ старше `lastSeenEpoch`, в кэш не записан). `request` — на каждый HTTP-запрос к Platform (`raw.*` — по своему `endpoint`) и к Identity (`token`); `request('token', …)` пишет `clientCredentials` из своего необязательного `metrics` (сервис передаёт тот же объект, что клиенту): только на HTTP-запрос к Identity, выдача токена из кэша провайдера — не запрос; клиент Platform метрику `token` не пишет — своя реализация `TokenProvider` (D8) считает её сама или не считает; `ok` — 200, `unavailable` — `PlatformUnavailableError`, `contract_error` — `PlatformContractError`; повтор после 401 — отдельный вызов. `policyEvent` — `applied` (эпоха события выше `lastSeenEpoch` компании), `ignored` (не выше: повтор или старое событие), `invalid` (конверт не прошёл схему). Без `metrics` пакет ничего не считает. Пакет не зависит от `prom-client`; README — пример адаптера для `prom-client` с именами `platform_client_cache_total{result}`, `platform_client_requests_total{endpoint, result}`, `platform_client_request_duration_seconds{endpoint}`, `platform_client_policy_events_total{result}`.

### 5.2. Локальное решение (`check`)

1. `act = agent`: `pep` не задан → `PlatformContractError` (`PEP_REQUIRED`); `pep` не целое ≥ 1 → `PlatformContractError` (`VALIDATION_FAILED`). Без запроса.
2. Снимок `(tenantId, sub, act)`: из кэша, иначе `permissions` с `minEpoch` = `max(lastSeenEpoch[tenantId], pep)` (`pep` — только агент).
3. Снимок — общий отказ → `{allow: false, code, message}` снимка; право не проверяется (как шаги 2–7 Platform).
4. Право не входит в `permissions ∪ keys(denied)` → `PlatformContractError` (`UNKNOWN_PERMISSION`).
5. `act = agent`:
   - `pep < epoch` → `CONTEXT_REVOKED` (без запроса).
   - `pep > epoch`, снимок запрошен с `minEpoch < pep` и `refreshAfter` не задан или прошёл → `permissions` с `minEpoch = max(lastSeenEpoch[tenantId], pep)`, ответ — по «Приёму ответа», повтор с шага 3; если и после этого `pep > epoch` → решение по снимку. Ошибка запроса (`PlatformUnavailableError`) → решение по снимку, `warn PLATFORM_UNAVAILABLE`; снимку записывается `refreshAfter = now + denyTtlSec` — до этого момента повторное чтение не делается. Срок жизни снимка и его запрошенный `minEpoch` не меняются. `PlatformContractError` → передаётся вызывающему.
6. `permission ∈ permissions` → `allow: true`; иначе `denied[permission]` с сообщением §3.4.

**Приём ответа** `permissions` (шаг 2, шаг 5, `fresh`) — по порядку, сравнение с `lastSeenEpoch` до его обновления этим ответом:
0. `epoch = null` (компании в Platform нет) → п. 1 и п. 2 не применяются: снимок в кэш на `denyTtlSec`, `lastSeenEpoch` не меняется.
1. `epoch < lastSeenEpoch[tenantId]` → `STALE_SNAPSHOT`: снимок отдаётся вызывающему, в кэш не пишется, `warn STALE_SNAPSHOT`, метрика `stale`.
2. `epoch <` запрошенного `minEpoch` (выше `lastSeenEpoch` его может поднять только `pep`) → в кэш на `denyTtlSec`, `warn PEP_AHEAD`.
3. Иначе → в кэш на `cacheTtlSec` (общий отказ — на `denyTtlSec`).

Снимок в кэше хранит запрошенный `minEpoch` и `refreshAfter` (по умолчанию не задан).

**Объединение запросов:** по `(ключ, minEpoch)`, в том числе для `fresh`. Вызывающий присоединяется к уже идущему запросу, только если у того `minEpoch` не меньше нужного ему, иначе делает свой. Ответ с более высокой эпохой заменяет в кэше более низкую, но не наоборот.

**`checkMany`** — шаги 1–3 и 5 один раз на вызов (один снимок, не больше одного запроса); шаги 4 и 6 — для каждого права. При снимке-разрешении любое неизвестное право → `PlatformContractError` `UNKNOWN_PERMISSION` на весь вызов, в `details.permission` — первое неизвестное (как `batch` Platform). Общий отказ и `CONTEXT_REVOKED` — один и тот же `Decision` для всех прав (неизвестное право при снимке-отказе не ловится, как в `check`). Результат — `Record` с ключами в порядке запроса. Пустой список → `PlatformContractError` `VALIDATION_FAILED`; повторы прав схлопываются.

Опечатка в праве при снимке-отказе не ловится (ответ — код отказа); её ловят тесты потребителя: подделка `testing` знает каталог и отвечает `UNKNOWN_PERMISSION` при любом состоянии.

Ответ Platform проверяется zod-схемой; не по схеме → `PlatformContractError`, в кэш не пишется.

### 5.3. Кэш и `onPolicyChanged`

- Ключ `tenantId \0 sub \0 act`. Позитивный снимок живёт `cacheTtlSec`, общий отказ — `denyTtlSec`. Истёкший снимок не отдаётся (D6).
- `onPolicyChanged(env)`: zod проверяет только то, что нужно для сброса: `type = 'platform.policy.changed'`, `id` — строка, `data.tenantId` — непустая строка, `data.epoch` — целое ≥ 1, `data.subs` — необязательный массив непустых строк. Незнакомые поля и любой `reason` принимаются (новые поля — не повод пропустить сброс). `subject`, `actor`, `tenant` не проверяются. `subs: []` — как без `subs`: сброс всей компании.
- Сброс: для каждого затронутого снимка (`subs` → только эти `sub` компании, без `subs` → все записи `tenantId`) — если `snapshot.epoch < data.epoch` (или `snapshot.epoch = null`), удалить. Индекс записей по `tenantId` — для сброса компании без перебора всего кэша.
- `lastSeenEpoch[tenantId]` — наибольшая эпоха из событий и ответов Platform. Каждый запрос `permissions` передаёт её в `minEpoch` (§3.2), поэтому Platform не отдаёт снимок старше уже известной эпохи. Если ответ всё же старше (запрос начат до события) — см. «Приём ответа» (§5.2). `lastSeenEpoch` — LRU на `maxEntries / 10` компаний (по умолчанию 5000); обращение — при событии, ответе и запросе. Вытесненная компания — как неизвестная: запрос без `minEpoch` (граница отзыва — G3).

### 5.4. Nest (`@verdeect/platform-client/nest`)

```ts
PlatformAuthzModule.forRoot({ client: PlatformAuthzClientOptions | PlatformAuthzClient })   // глобальный; поставляет клиента и guard
PlatformAuthzModule.forRootAsync({ useFactory, inject })

@RequirePermission('native.files.read')                 // на методе или классе; несколько — все обязательны
@RequirePermission('chat.office', 'chat.images')
```

`@RequirePermission` = `SetMetadata` + `UseGuards(PermissionGuard)` (D11); глобально guard не регистрируется. Маршрут без `@RequirePermission` пакет не трогает. `@RequirePermission()` без прав или с пустой строкой → `TypeError` в момент объявления (загрузка модуля), а не при запросе.

- **`Principal`:** `principalOf(request)` из `@verdeect/auth/nest`. Если его нет (`VerdeectAuthGuard` не стоит глобально и не сработал раньше на контроллере или маршруте), guard сам вызывает `VerdeectAuthGuard` (из DI `VerdeectAuthModule`, `@Optional()`); его отказ (401/403/409) возвращается без изменений, правила `@RequireUser`/`@RequireTenant`/`@RequireScope` маршрута действуют. `VerdeectAuthGuard` в DI нет → 500 `INTERNAL_ERROR`, лог `error`.
- Если `Principal` уже есть, `VerdeectAuthGuard` повторно не вызывается. Исключение — `@UseGuards(VerdeectAuthGuard)` на том же методе выше `@RequirePermission`: тогда он сработает после `PermissionGuard` и проверит токен второй раз (D11).
- Сопоставление полей `@verdeect/auth` 1.x: `UserPrincipal {sub, tenant, tenantId}` → `{sub, tenant, tenantId, act: 'human'}`, при `tenant = null` → 409 `TENANT_REQUIRED`; `AgentPrincipal {sub, tenant, tenantId, asid, wid, pep}` → `{…, act: 'agent', pep, asid, wid}`; `ServicePrincipal` → 403 `FORBIDDEN` (сервис от своего имени прав участника не имеет). `prof` в лайте не передаётся (позже — необязательное `profileId`).
- Несколько прав в декораторе — один вызов `checkMany`; ответ — код первого запрещённого в порядке декоратора.
- Результат кладётся в `request.platformDecision` (`memberId`, `epoch`) для сервиса.

Ответы guard (тело `{error: {code, message, details: {}}}`, `01` §8):

| Случай | HTTP | `code` | `message` |
|---|---|---|---|
| отказ по решению | 403 | код Platform | текст §3.4 |
| сервисный токен | 403 | `FORBIDDEN` | «Доступ запрещён» (текст `FORBIDDEN` `@verdeect/auth` — ответ `@RequireService` на токен не сервиса) |
| токен пользователя без `tenant` | 409 | `TENANT_REQUIRED` | «Не выбрана компания» (как `@verdeect/auth`) |
| `PlatformUnavailableError` | 503 | `PLATFORM_UNAVAILABLE` | «Сервис прав временно недоступен. Повторите позже» |
| `PlatformContractError`; нет `Principal` и `VerdeectAuthGuard` | 500 | `INTERNAL_ERROR` | «Внутренняя ошибка сервиса» (как Platform) |

Тексты, совпадающие с `@verdeect/auth`, — константы пакета; совпадение проверяет тест (AC-10).

README, раздел «Подключение» — варианты (`VerdeectAuthGuard` через `APP_GUARD`, на контроллере, на методе ниже `@RequirePermission`, без него) с примерами и предупреждением о порядке декораторов на одном методе (D11); порядок подключения модулей не важен.

### 5.5. `testing`

```ts
createFakePlatform(options?: { members?: FakeMember[]; companies?: FakeCompany[] }): {
  client: PlatformAuthzClient;                 // тот же класс, транспорт — в памяти
  grant(tenantId, sub, permissions: string[]): void; deny(tenantId, sub, code: DecisionCode): void;
  setModule(tenantId, moduleId, state: 'enabled' | 'PLAN_MODULE' | 'MODULE_DISABLED'): void;   // по умолчанию все enabled
  setEpoch(tenantId, epoch): void; policyChanged(tenantId, subs?): unknown;   // возвращает конверт для onPolicyChanged
  calls(): { path: string; body: unknown }[];
}
```

Подделка строит ответ `permissions` по тем же правилам, что Platform (§6.1 шаги 8–10 Platform): право не выдано → `FORBIDDEN`; выдано, но его модуль не `enabled` → код модуля; `modules` — весь каталог по порядку. Каталог — `src/testing/catalog.ts`: копия `PERMISSION_KEYS` и каталога модулей (id, права, порядок) из `verdeect-platform` `apps/platform/src/modules/catalog/domain/`, источник и коммит в шапке. Неизвестное право → `PlatformContractError` (`UNKNOWN_PERMISSION`) при любом состоянии.

Подпуть грузится только с условием экспорта `development`. Vitest ставит его по умолчанию — потребителю ничего настраивать не нужно. В Node — `node --conditions=development`. В сборке и рантайме сервиса условия нет, поэтому импорт `testing` из рабочего кода падает при старте (`ERR_PACKAGE_PATH_NOT_EXPORTED`). README, раздел «Тесты потребителя» — таблица как в `@verdeect/auth` `docs/testing.md` и пример теста контроллера с `createFakePlatform`.

---

## 6. Сценарии

**UC-1. Сервис проверяет право человека.**
**Актор:** сервис (Files). **Предусловие:** маршрут с `@RequirePermission('native.files.write')`; запрос с токеном пользователя с компанией; снимка в кэше нет.
1. Guard берёт `Principal` (или вызывает `VerdeectAuthGuard`, D11) и строит `Subject` (`act: human`).
2. Снимка нет → один запрос `permissions` (с `minEpoch`, если эпоха компании известна).
3. Права нет в снимке → 403 `FORBIDDEN` «Недостаточно прав.».

**A1.** 50 одновременных запросов того же участника → один запрос к Platform.
**A2.** Platform недоступен, снимка нет → 503 `PLATFORM_UNAVAILABLE`.
**A3.** Токен пользователя без компании → 409 `TENANT_REQUIRED` «Не выбрана компания», Platform не вызывается.
**A4.** Сервисный токен → 403 `FORBIDDEN` «Доступ запрещён», Platform не вызывается.
**A5.** Право есть → решение `allow`, в `request.platformDecision` — `memberId` и `epoch`, обработчик маршрута выполняется.
**Результат:** решение по правилам Platform; Platform вызван не больше одного раза.

**UC-2. Вызов инструмента агентом.**
**Актор:** сервис (Media). **Предусловие:** маршрут с `@RequirePermission('chat.office')`; токен агента с `pep = 7`; в кэше снимок с `epoch = 7`.
1. `check` → `pep = epoch` → решение по праву.
2. Приходит `policy.changed {epoch: 8, subs: [sub]}` → снимок удалён, `lastSeenEpoch = 8`.
3. Следующий вызов с `pep = 7` → `permissions` с `minEpoch: 8` → снимок `epoch = 8` → 403 `CONTEXT_REVOKED` «Контекст отозван. Нужен новый диалог.».

**A1.** Токен уже перевыпущен (`pep = 8`), а событие не дошло, в кэше снимок `epoch = 7` → `permissions` с `minEpoch: 8` → Platform перечитывает БД → снимок `8` → по праву.
**A2.** То же, но Platform недоступен → решение по снимку `7`, `warn PLATFORM_UNAVAILABLE` (D6).
**A3.** Токен агента с `pep = 0` (V-7 `@verdeect/auth` пропускает любое целое) → `PlatformContractError` `VALIDATION_FAILED` → 500 `INTERNAL_ERROR`, Platform не вызывается.
**A4.** Код сервиса вызывает `client.check` для агента без `pep` → `PlatformContractError` `PEP_REQUIRED` (ошибка программиста; через guard недостижимо — V-7 отклоняет такой токен с 401).
**Результат:** отзыв прав без ожидания TTL ни пакета, ни Platform.

**UC-3. Orchestrator пересобирает набор инструментов.**
**Актор:** Orchestrator. **Предусловие:** у компании есть активные сессии агентов; Orchestrator сам подписан на `platform.policy.changed` (D7).
1. Событие `{tenantId, epoch: 8, subs?}` → `onPolicyChanged(env)`: снимки сброшены, `lastSeenEpoch = 8`.
2. Для каждой сессии компании (участники из `subs`, без `subs` — все) — `permissions({sub, tenant, tenantId, act: 'agent'}, {fresh: true})` → запрос с `minEpoch: 8` → ответ с `epoch ≥ 8`, снимок в кэше.
3. Сравнение набора, перевыпуск токена с новым `pep` или блокировка сессии — код Orchestrator (приложение C Platform).

**A1.** Platform недоступен → `PlatformUnavailableError`; Orchestrator сохраняет прежние токены и повторяет по своему расписанию.
**A2.** Конверт не по схеме → `onPolicyChanged` пишет `warn`, исключения нет, кэш цел; Orchestrator обрабатывает событие по-своему (пакет ему не мешает).
**A3.** Несколько сессий одного участника → `fresh` для каждой; одновременные вызовы с тем же `minEpoch` — один запрос к Platform (§5.2).
**Результат:** Orchestrator получает свежий набор прав и эпоху; следующие `check` агентов этой компании идут из кэша без запроса.

**UC-4. Тест потребителя.**
**Актор:** разработчик сервиса (тест Vitest). **Предусловие:** `@verdeect/platform-client/testing` подключён; условие `development` Vitest ставит сам; `PlatformAuthzModule.forRoot({client: fake.client})`, токены — `@verdeect/auth/testing`.
1. `fake.grant(t, s, ['native.files.read'])` → маршрут с `@RequirePermission('native.files.read')` → 200.
2. `fake.deny(t, s, 'COMPANY_SUSPENDED')` → 403 `COMPANY_SUSPENDED`.
3. `fake.setModule(t, 'knowledge', 'MODULE_DISABLED')` + `grant(t, s, ['knowledge.read'])` → маршрут с `knowledge.read` → 403 `MODULE_DISABLED`.

**A1.** Опечатка в праве декоратора → `PlatformContractError` `UNKNOWN_PERMISSION` → 500 при любом состоянии подделки; тест потребителя падает.
**A2.** Отзыв у агента: `fake.setEpoch(t, 8)`, `client.onPolicyChanged(fake.policyChanged(t, [s]))` → запрос агента с `pep = 7` → 403 `CONTEXT_REVOKED`.
**A3.** Импорт `testing` из рабочего кода сервиса → `ERR_PACKAGE_PATH_NOT_EXPORTED` при старте (в production условия `development` нет).
**Результат:** guard'ы и обработка отказов сервиса проверены без Platform.

---

## 7. Критерии приёмки

Слои: **U** (без сети, подделанный `fetch` и часы; в CI), **C** (контракт; локально, D10): Platform `main` `7adb423`+ в Testcontainers по описанию ниже. Имя теста = id AC.

**Стенд слоя C** (`test/contract/support/platform-stand.ts`, в `globalSetup`):
1. Сеть Testcontainers; `postgres:17.11-alpine3.24` и `rabbitmq:4.3.6-management-alpine` (те же образы, что в CI Platform) с алиасами `postgres`, `rabbitmq`.
2. Тест объявляет topic exchange `verdeect.events` (durable) — Platform его только проверяет (`checkExchange`), в продакшене его объявляет Identity.
3. Тестовый издатель `createTestSigner({iss: 'https://test-identity.verdeect.invalid', kinds: ['service']})` из `@verdeect/auth/testing`; порт JWKS пробрасывается в сеть контейнеров через `TestContainers.exposeHostPorts(port)` (§10 п. 3).
4. Образ Platform (D10) запускается разовыми контейнерами: `node dist/cli.js db:prepare` (`DATABASE_ADMIN_URL` суперпользователя, `PLATFORM_OWNER_PASSWORD`, `PLATFORM_APP_PASSWORD`) → `migrate` (`DATABASE_MIGRATOR_URL`) → `plan:apply --file seed/plans.json`. Каждый — код возврата 0 и `{"ok":true…}` в stdout.
5. Сервис Platform: `DATABASE_URL` (`platform_app`), `DATABASE_MIGRATOR_URL`, `RABBITMQ_URL`, `AUTH_ISSUERS=[{iss: 'https://test-identity.verdeect.invalid', jwksUri: 'http://host.testcontainers.internal:<port>/jwks', kinds: ['service']}]`, `AUTH_RESOURCE=https://api.verdeect.ru`, `MODULES_READY=files,web,office,images`, `NODE_ENV=test`, `REPLICA_ID=contract`, `RABBITMQ_RETRY_SECONDS=1`. Готовность — `GET /ok` = 200 и `checkQueue('platform')` в брокере.
6. Тест привязывает свою эксклюзивную очередь к `platform.policy.changed` до первого действия.
7. Данные: тест публикует в `verdeect.events` `identity.organization.created`, `identity.account.created`, `identity.membership.added` (и `identity.organization.disabled` для AC-13). Конверты проходят `test/fixtures/identity-events.schema.json` (копия из `verdeect-platform`, источник и коммит; U-тест проверяет образцы по ней). Роли — CLI `member:grant|revoke` через `exec` в контейнере сервиса. Каждое действие ждёт результата не дольше 5 с (событие в своей очереди или ответ `permissions`).
8. Сервисный токен: `sub = 'verdeect-files'`, `scope = 'platform:authz'`, `aud = https://api.verdeect.ru`; для AC-15 — тот же издатель без области. `tokenProvider` в слое C — обёртка над издателем; `clientCredentials` проверяется в слое U (AC-9).
9. Падение любого шага → тест падает с выводом stdout и stderr контейнера, а не по таймауту.

- AC-1 (U, UC-1, D3) 100 вызовов `check` по 10 разным правам одного участника за TTL → 1 запрос `permissions`; через 61 с → второй.
- AC-2 (U, UC-1 A1, D4) 50 одновременных `check` при пустом кэше → 1 запрос (объединение); ошибка этого запроса → все 50 получают `PlatformUnavailableError`.
- AC-3 (U, D4) Общий отказ (`COMPANY_SUSPENDED`) кэшируется 5 с: на 4-й секунде без запроса, на 6-й — новый запрос. `NOT_MEMBER` с `epoch: null` при `lastSeenEpoch = 8` → в кэше 5 с, без `STALE_SNAPSHOT` и `PEP_AHEAD`; на 4-й секунде — без запроса.
- AC-4 (U, UC-3 A2, D4, §5.3) `onPolicyChanged {subs: [A]}` удаляет снимок A и не трогает B той же компании; без `subs` — оба; `subs: []` — оба; эпоха события ≤ эпохи снимка — без удаления; событие с незнакомым `reason` и лишним полем в `data` → сброс выполнен; нет `data.tenantId`, `epoch: 0` или неверный конверт → `warn`, без исключения, кэш цел. При `maxEntries = 100` события по 11 компаниям → в `lastSeenEpoch` 10 записей, самая старая вытеснена; запрос по ней уходит без `minEpoch`.
- AC-5 (U, UC-2, §5.3) После события с эпохой 8 запрос `permissions` содержит `minEpoch: 8`. Запрос начат при эпохе 7 без `minEpoch`, событие с эпохой 8 пришло во время запроса, ответ с эпохой 7 → возвращён вызывающему, в кэш не записан, `warn STALE_SNAPSHOT`, метрика `stale`.
- AC-6 (U, UC-2, UC-2 A3–A4, D5) `pep < epoch` → `CONTEXT_REVOKED` без запроса. Пустой кэш, агент с `pep = 9`, `lastSeenEpoch = 8` → ровно один запрос с `minEpoch: 9` и без `pep`. Снимок в кэше с `epoch = 7`, `pep = 8` → ровно один запрос с `minEpoch: 8`; ответ с `epoch = 8` → по праву, следующий вызов без запроса. Ответ с `epoch < pep` → `warn PEP_AHEAD`, решение по снимку, 4 с без запросов, на 6-й секунде — ровно один запрос с `minEpoch = pep`. 10 одновременных вызовов с `pep = 8` → один запрос. Идёт запрос с `minEpoch: 8`, приходит вызов с `pep = 9` → второй запрос с `minEpoch: 9`; ответ первого с эпохой 8 не затирает в кэше ответ второго с эпохой 9. `pep = 0` → `PlatformContractError` `VALIDATION_FAILED`. Агент без `pep` → `PlatformContractError` `PEP_REQUIRED`. Пустой кэш, `pep = 9`, `lastSeenEpoch = 8` → один запрос с `minEpoch: 9`; ответ с `epoch = 8` → решение по снимку, `warn PEP_AHEAD`, второго запроса нет; через 6 с — ровно один запрос. `lastSeenEpoch = 8`, ответ с `epoch = 7` при `pep = 9` → `STALE_SNAPSHOT`, не `PEP_AHEAD`, в кэше пусто.
- AC-7 (U, UC-1 A2, UC-2 A2, UC-3 A1, D6) Platform отвечает 503/таймаут 2 с/обрыв: снимок в пределах TTL → решение из него; снимок истёк → `PlatformUnavailableError`. 401 → `getToken({refresh: true})` вызван ровно один раз, повторный запрос ушёл с новым токеном; повтор 401 → `PlatformUnavailableError`, третьего запроса нет. Снимок с `epoch = 7` и сроком ещё 55 с, агент с `pep = 8`, Platform отвечает 503 → решение по снимку, `warn PLATFORM_UNAVAILABLE`, следующие 4 с запросов нет; на 6-й секунде — новая попытка, Platform снова 503 → снова решение по снимку; Platform поднялся → свежий снимок; через 56 с от начала сценария (срок снимка истёк) при лежащем Platform → `PlatformUnavailableError`; на 54-й секунде от начала сценария — ещё решение по снимку. `permissions({fresh: true})` при 503 → `PlatformUnavailableError` даже при годном снимке в кэше. 100 последовательных вызовов за 5 с при 503 и пустом кэше → один `warn` о недоступности; следующий — не раньше 10-й секунды с `suppressed: 99`; метрика `request('permissions', 'unavailable', …)` вызвана на каждый запрос.
- AC-7a (U, §5.1, NFR-3) Platform отвечает 403 `SCOPE_REQUIRED`, 404, 422 `TENANT_MISMATCH` → `PlatformContractError` с этим кодом; кэш пуст; токен не перезапрашивался; второго запроса нет; guard в каждом случае → 500 `INTERNAL_ERROR`; при 10 повторах одного кода — один `error`-лог за 60 с.
- AC-7b (U, UC-3, §5.1) `permissions({fresh: true})` при снимке в кэше → запрос с `minEpoch`, ответ в кэше; следующий `check` — без запроса. 5 одновременных `permissions({fresh: true})` одного участника → 1 запрос. `raw.check` → тот же токен, при 401 — `getToken({refresh: true})` и повтор; 422 → `PlatformContractError`; кэш после `raw.*` не изменился; `raw.permissions` с ответом не по схеме → `PlatformContractError`.
- AC-8 (U, §5.2) Право, которого нет в снимке → `PlatformContractError` `UNKNOWN_PERMISSION`; снимок `COMPANY_SUSPENDED` + неизвестное право → `COMPANY_SUSPENDED`; ответ Platform не по схеме → `PlatformContractError`, в кэш не попал.
- AC-8a (U, UC-4, §5.5) Каталог `src/testing/catalog.ts`: каждое право — либо право ядра, либо право ровно одного модуля; источник и коммит в шапке. В подделке `testing` неизвестное право → `PlatformContractError` `UNKNOWN_PERMISSION` при любом состоянии (в том числе после `deny(..., 'COMPANY_SUSPENDED')`); `setModule(t, 'knowledge', 'MODULE_DISABLED')` + `grant(t, s, ['knowledge.read'])` → `check` → `MODULE_DISABLED` с текстом §3.4; `setModule(t, 'office', 'PLAN_MODULE')` → `chat.office` → `PLAN_MODULE`; `modules` ответа — весь каталог копии по порядку. `setEpoch(t, 8)` + `onPolicyChanged(policyChanged(t, [s]))` → снимок `s` сброшен, агент с `pep = 7` → `CONTEXT_REVOKED`; конверт `policyChanged` проходит zod пакета и ajv по копии схемы Platform.
- AC-8b (U, §5.2) `checkMany` по 3 правам при пустом кэше → 1 запрос; ключи результата в порядке запроса. Снимок-разрешение, одно неизвестное из трёх → `PlatformContractError` `UNKNOWN_PERMISSION`, `details.permission` — это право. Снимок `COMPANY_SUSPENDED` → у всех трёх `COMPANY_SUSPENDED`. Агент с `pep < epoch` → у всех `CONTEXT_REVOKED`. `[]` → `VALIDATION_FAILED`; `['a', 'a']` → один ключ.
- AC-9 (U, D8) `clientCredentials`: 20 одновременных `getToken` → 1 запрос к Identity; запрос — `grant_type=client_credentials`, `scope`, `resource` в теле и `Authorization: Basic` с закодированными `clientId:clientSecret` (секрет со спецсимволами `:`, `%`, `+` кодируется по RFC 6749 §2.3.1); `client_secret` в теле нет. Токен с `expires_in: 40` → обновляется на 11-й секунде (порог 30 с). `getToken({refresh: true})` при живом токене → новый запрос; 5 одновременных `refresh` → 1 запрос; обычные `getToken()` во время `refresh` получают новый токен. Identity 503, таймаут, 429 → `PlatformUnavailableError`; 401 `invalid_client` → `PlatformContractError` с `code: 'invalid_client'`; после ошибки следующий `getToken` делает новый запрос.
- AC-10 (U, UC-1, UC-2, §5.4, D11) Guard на настоящем `VerdeectAuthGuard` `@verdeect/auth` 1.0.1 с токенами `@verdeect/auth/testing` всех трёх видов. Подключение `VerdeectAuthGuard` в четырёх вариантах — `APP_GUARD`, `@UseGuards` на контроллере, `@UseGuards` на методе ниже `@RequirePermission`, без него — даёт одинаковые ответы, токен проверяется ровно один раз (счётчик вызовов верификатора). `@UseGuards` на методе выше `@RequirePermission` — те же ответы, проверок две. `user` без права → 403 `{error: {code: 'FORBIDDEN', message: 'Недостаточно прав.', details: {}}}`; `user` с правом → обработчик выполнен, `request.platformDecision = {memberId, epoch}` снимка; `service` → 403 `FORBIDDEN` «Доступ запрещён» — текст совпадает с ответом `VerdeectAuthGuard` на токен пользователя при `@RequireService`; без `tenant` → 409 `TENANT_REQUIRED` «Не выбрана компания» — текст совпадает с ответом `VerdeectAuthGuard` при `@RequireTenant` (сравнение с его настоящими ответами); `@RequirePermission()` и `@RequirePermission('')` → `TypeError` при объявлении класса, Platform не вызывается; `agent` → в теле запроса к Platform нет `pep`, `asid`, `wid`; решение учитывает `pep` (`pep < epoch` → 403 `CONTEXT_REVOKED`); в логе `debug` решения — `asid` и `wid` из токена; агент с `pep = 0` → 500 `INTERNAL_ERROR`, Platform не вызывался; два права в декораторе, одно запрещено → 403 с кодом запрещённого, к Platform — один запрос; маршрут с `@RequirePermission` без токена → 401 `UNAUTHENTICATED` от `VerdeectAuthGuard`; без `VerdeectAuthModule` → 500 `INTERNAL_ERROR`; маршрут без `@RequirePermission` — `PermissionGuard` не срабатывает, Platform не вызывается; в вариантах без глобального `VerdeectAuthGuard` такой маршрут доступен без токена (пакет его не требует), с `APP_GUARD` токен требует `VerdeectAuthGuard`, не пакет; в запрос к Platform ушли `tenant` и `tenantId` из `Principal`; тексты всех ответов — дословно по таблице §5.4.
- AC-11 (U, D9) Каждый код §3.4 — дословный текст; коды и тексты `src/core/codes.ts` совпадают с копией `decision-codes.ts` (источник и коммит в шапке).
- AC-12 (U, UC-4 A3, D2, NFR-4) Ядро не импортирует `@nestjs/*` (граф импортов `dist/index.js`); в `.d.ts` пакета нет импортов из `zod`. Проект `test/consumer/` ставит упакованный архив (`pnpm pack`): Vitest без настройки условий импортирует `@verdeect/platform-client/testing` и проходит пример из README; `node` без условия → `ERR_PACKAGE_PATH_NOT_EXPORTED`; `node --conditions=development` → импорт работает; `tsc --noEmit` видит типы `testing` без условия. Проект без `@nestjs/*` и `@verdeect/auth` импортирует ядро и вызывает `check` с подделанным `fetch`; импорт `@verdeect/platform-client/nest` без `@verdeect/auth` → ошибка разрешения модуля при старте.
- AC-13 (C, UC-1, D10) Участник `viewer` → `check('native.files.read')` allow, `check('native.files.write')` `FORBIDDEN`, `check('knowledge.read')` `MODULE_DISABLED`; после `identity.organization.disabled` и `onPolicyChanged` с настоящим событием из очереди теста → `COMPANY_SUSPENDED`; для каждого права каталога решение пакета совпадает с `POST /v1/authz/check` Platform (по `raw.check`). Для `admin` при `MODULES_READY = files,web,office,images`: `permissions ∪ keys(denied)` настоящего Platform = права каталога копии; `modules[].id` = модули копии в том же порядке; набор прав с `MODULE_DISABLED` = права модулей копии вне `MODULES_READY`. Расхождение — Platform изменил каталог, копию нужно обновить.
- AC-14 (C, UC-2) Участник `viewer`; `member:grant --role operator` → снимок пакета с эпохой `E`. `member:revoke --role operator` → событие `platform.policy.changed {epoch: E+1, subs: [sub]}` из очереди теста → `onPolicyChanged` → `check` с `pep = E` → `CONTEXT_REVOKED`; в запросе `permissions` — `minEpoch: E+1`. Без `onPolicyChanged` (событие «потеряно» для пакета), но с токеном `pep = E+1` → пакет перечитывает снимок с `minEpoch = E+1` и получает эпоху `E+1` без ожидания TTL Platform. (Роль `operator` — потому что снять последнего `admin` нельзя: `LAST_ADMIN`.)
- AC-15 (U + C, §3.2, §5.3) **U:** каждое образцовое `platform.policy.changed` (с `subs`, без `subs`, все 6 `reason`), проходящее ajv по `test/fixtures/platform-events.schema.json`, проходит и zod пакета. **C:** каждое настоящее `platform.policy.changed` из очереди теста проходит ajv по копии (расхождение — Platform изменил схему, нужно обновить копию) и zod пакета; каждый ответ `permissions` настоящего Platform проходит zod-схему ответа; вызов с токеном того же издателя без `platform:authz` → `PlatformContractError` с кодом `SCOPE_REQUIRED`.
- AC-16 (U, D1, NFR-6) `pack:check` проходит: `publint --strict` без ошибок, `attw --profile esm-only` без проблем, тест упакованного архива импортирует `.`, `./nest`, а `./testing` — только с условием `development`. `scripts/publish.mjs` при теге ≠ `version` или уже опубликованной версии — код возврата 1.
- AC-17 (U, NFR-1) Отдельный набор `test/perf` (`vitest.perf.config.ts`, Node с `--expose-gc`; в CI — тот же job `test`). **Время:** снимок в кэше, 10 000 прогревочных и 100 000 замеряемых `check` по 10 правам → p99 < 0,2 мс (`performance.now()` на вызов). **Память:** `gc()` → `heapUsed` → 10 000 разных снимков с полным каталогом (24 права, 12 модулей) → `gc()` → `heapUsed`; прирост ≤ 20 МБ (2 КБ на снимок). Отчёт (p50, p99, байт на снимок) — в выводе теста.
- AC-18 (U, NFR-2) Подделанный `metrics` записывает вызовы. Попадание в кэш → `cacheResult('hit')`; промах → `miss` и `request('permissions', 'ok', s)` с `s > 0`; повторное чтение по `pep` → `miss`; ответ старше `lastSeenEpoch` → `stale`; 503 → `request('permissions', 'unavailable', …)`; 422 → `contract_error`; 401 + повтор → два вызова `request`. `clientCredentials` с подделанным `metrics`: запрос к Identity → `request('token', 'ok', s)`; повторный `getToken()` из кэша провайдера — без вызова; Identity 503 → `request('token', 'unavailable', …)`; 401 `invalid_client` → `request('token', 'contract_error', …)`; без `metrics` у `clientCredentials` — ошибок нет. Событие с новой эпохой → `policyEvent('applied')`, повтор того же события → `ignored`, неверный конверт → `invalid`. Ни в одном вызове нет `sub` и `tenantId`. Без `metrics` — ошибок нет.
- AC-19 (U, §5.1, NFR-3) **Настройки:** `cacheTtlSec: 61`, `cacheTtlSec: 0`, `denyTtlSec: 6`, `maxEntries: 10`, `baseUrl: 'platform:3000'` → `TypeError`, в сообщении — имя параметра. **LRU:** `maxEntries: 100`, снимки 101 участника → самый давний вытеснен, `check` по нему → новый запрос; по недавнему — без запроса; при сбросе компании (`onPolicyChanged` без `subs`) индекс по `tenantId` не содержит вытесненных. **Транспорт:** `traceparent: () => '00-…-01'` → заголовок `traceparent` в запросе; `undefined` → заголовка нет; `Authorization: Bearer <токен>`; `Content-Type: application/json`. **Логи:** подделанный `logger` за весь набор U-тестов не получил строку, содержащую токен или `clientSecret` (поиск по значениям из фикстур). **`clear()`:** после него `check` → новый запрос без `minEpoch`; запрос, начатый до `clear()` и завершившийся после, возвращён вызывающему, следующий `check` — снова запрос (кэш пуст); токен повторно не запрашивается; запрос по участнику A идёт, `clear()`, новый `check(A)` → отдельный второй запрос, ответ первого — только первому вызывающему.

## 8. Нефункциональные требования

| # | Область | Требование |
|---|---|---|
| NFR-1 | Производительность | `check` из кэша p99 < 0,2 мс; память ≤ 2 КБ на снимок (AC-17) |
| NFR-2 | Метрики | `PlatformClientMetrics` (§5.1); метки — только значения из типа, без `sub`/`tenantId` (AC-18) |
| NFR-3 | Логи | Без токенов и секретов; `sub`, `tenantId`, `permission`, `code` — допустимы. Уровни: `error` — `PlatformContractError` (не чаще раза в 60 с на код), 500 в guard (нет `Principal` и `VerdeectAuthGuard`); `warn` — `PlatformUnavailableError` и `PLATFORM_UNAVAILABLE` при повторном чтении — не чаще раза в 10 с на `endpoint` (с числом пропущенных в поле `suppressed`); `PEP_AHEAD`, `STALE_SNAPSHOT`, неверный конверт `onPolicyChanged` — без ограничения; `debug` — промахи кэша, запросы к Platform, сброс по событию, решения для агента с `asid`, `wid` (AC-7a, AC-19) |
| NFR-4 | Совместимость | ESM, Node ≥ 22.12 (CI — Node 22 и 24). `dependencies` — только `zod 4.6.7` (как Platform); zod-схемы внутренние, не экспортируются. `peerDependencies` (все `optional` — ядро без Nest): `@nestjs/common ^12.1.3`, `@nestjs/core ^12.1.3`, `reflect-metadata ^0.2.2`, `rxjs ^7.8.2`, `@verdeect/auth ^1.0.1`. Подпуть `nest` берёт `VerdeectAuthGuard` и `principalOf` из той же копии `@verdeect/auth`, что и сервис, поэтому `@verdeect/auth` нельзя указывать в `dependencies`. `devDependencies` — точные версии (`@nestjs/* 12.1.3`, `@verdeect/auth 1.0.1`, `ajv 8.20.0`, `ajv-formats 3.0.1`, `testcontainers` как в Platform); `minimumReleaseAge` (`rules/base.md`) (AC-12) |
| NFR-5 | Версии | Контракт Platform `v1` ↔ пакет `1.x`; ломающее изменение контракта — мажор пакета. README — таблица совместимости: версия пакета ↔ контракт `v1` ↔ версия PRD Platform и коммит, на котором пройден слой C ↔ диапазон `@verdeect/auth` |
| NFR-6 | Публикация | GitHub Actions (как `verdeect-auth` `ci.yml`): lint → test (Node 22 и 24) → build + `pack:check` (`publint --strict`, `attw --profile esm-only`, тест упакованного пакета) → publish на тег `v<major>.<minor>.<patch>` (`scripts/publish.mjs`: тег = `version`, версии ещё нет в npm). Слой C — локально до тега (D10), пункт чек-листа `docs/releasing.md`. 1.0.0 — вручную (D1) (AC-16) |

## 9. Этапы

| Этап | Содержание | AC |
|---|---|---|
| E1. Ядро | репозиторий по образцу `verdeect-auth` (CI — GitHub Actions, генерирует `/aif-ci` по образцу `verdeect-auth`), типы и схемы §3, копия кодов, кэш, объединение запросов, `minEpoch`, `lastSeenEpoch`, локальное решение, `checkMany`, `fresh`, `raw`, `onPolicyChanged`, `clientCredentials` с `refresh`, ошибки, логгер, метрики, проверка настроек, `test/perf` | AC-1–7, 7a, 7b, 8, 8b, 9, 11, 15 (U), 17, 18, 19 |
| E2. Nest и `testing` | модуль, декоратор, guard (D11), `createFakePlatform` с `setModule`, копия каталога, условие `development`, проект-потребитель | AC-8a, 10, 12 |
| E3. Контракт и публикация | стенд и контрактные тесты (локально, D10) против Platform `main` `7adb423`+, `ci.yml` с publish, `scripts/publish.mjs`, `docs/` (в том числе `releasing.md`), README, CHANGELOG, ручной выпуск `1.0.0`, `npm trust` | AC-13–14, 15 (C), 16 |

**Зависимость:** E1–E3 — без внешних блокировок: `minEpoch` слит в `verdeect-platform` `main` `7adb423` (Platform v1.11). E2 — после E1, E3 — после E2.

## 10. Открытые вопросы

1. `[OPEN]` Перенос подписки на `platform.policy.changed` в `@verdeect/kit` — при выносе kit в полном этапе Platform.
2. `[OPEN]` `reserve/commit/release` (техэтап 6) — минорная версия пакета вместе с Platform.
3. `[ASSUMPTION]` `exposeHostPorts` Testcontainers работает с Docker в WSL — проверка первой задачей E3. Если нет — тест поднимает на `0.0.0.0` прокси `/jwks` к `createTestSigner` (сам издатель слушает только `127.0.0.1`), `jwksUri` — адрес шлюза Docker.
