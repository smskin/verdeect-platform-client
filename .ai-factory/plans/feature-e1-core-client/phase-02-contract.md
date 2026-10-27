# Фаза 2: Контракт Platform — типы, коды, ошибки, схемы

Plan: [index.md](index.md)
Tasks: 7-12
Depends on: Phase 1

## Цель

В ядре появляются публичные типы контракта (prd.md §3.2, §5.1), копия кодов и текстов Platform (§3.4, D9), классы ошибок и внутренние zod-схемы с функциями разбора. Наружу схемы не выходят, поэтому в `.d.ts` нет `zod`. Копия JSON Schema событий лежит в `test/fixtures/`. Тесты AC-11 и AC-15 (U) зелёные.

## Свидетельства из текущего кода

| Путь | Символы / строки | Зачем |
|---|---|---|
| `/home/administrator/projects/verdeect2/verdeect-platform/apps/platform/src/modules/catalog/domain/decision-codes.ts` @ `7adb423` | `DECISION_MESSAGES`, `DecisionCode`, `decisionMessage` | Источник копии `src/core/codes.ts`. Тексты совпадают с prd.md §3.4 (сверено при планировании) |
| `/home/administrator/projects/verdeect2/verdeect-platform/apps/platform/contracts/events/platform-events.schema.json` @ `7adb423` | `$defs.policy_changed`, `$defs.policy_changed_data`, `$defs.envelope` | Источник копии фикстуры. draft 2020-12, `format: date-time`, 6 значений `reason`, `subs.minItems = 1` |
| `/home/administrator/projects/verdeect2/verdeect-platform/apps/platform/src/modules/authz/http/responses/rs-member-permissions.ts` | `RSMemberPermissions` | Форма ответа `permissions` совпадает с prd.md §3.2 |
| `/home/administrator/projects/verdeect2/verdeect-platform/apps/platform/src/modules/authz/http/requests/r-check-permission.ts` | `RAuthzSubjectSchema` | Ограничения полей запроса (`sub`/`tenant`/`tenantId` 1..64, `pep` int ≥ 1) |
| `/home/administrator/projects/verdeect2/verdeect-platform/apps/platform/drizzle/0000_tables.sql:29,37` | `policy_epoch bigint DEFAULT 1`, `CHECK policy_epoch >= 1` | Эпоха — целое ≥ 1, `null` только у общего отказа без компании |
| `/home/administrator/projects/verdeect2/verdeect-platform/apps/platform/src/modules/authz/domain/decision.ts` | `CommonDenialCode`, `PermissionDenialCode` | Разбиение кодов на общий отказ и отказ по праву |

Получение копий при реализации — без чтения рабочей копии, из коммита:
- `git -C /home/administrator/projects/verdeect2/verdeect-platform show 7adb423:apps/platform/src/modules/catalog/domain/decision-codes.ts`
- `git -C /home/administrator/projects/verdeect2/verdeect-platform show 7adb423:apps/platform/contracts/events/platform-events.schema.json`

## Файлы для изменения

| Путь | Действие | Что сделать |
|---|---|---|
| `src/core/types.ts` | create | Публичные интерфейсы и союзы (§3.2, §5.1) |
| `src/core/codes.ts` | create | Копия `decision-codes.ts` + шапка с источником и коммитом |
| `src/core/errors.ts` | create | `PlatformUnavailableError`, `PlatformContractError`, текст `PLATFORM_UNAVAILABLE` |
| `src/core/schemas.ts` | create | Внутренние zod-схемы и функции `parse*` |
| `test/fixtures/platform-events.schema.json` | create | Побайтная копия схемы событий Platform |
| `test/fixtures/SOURCES.md` | create | Источник и коммит копий из `test/fixtures/` |
| `test/unit/codes.spec.ts` | create | AC-11 |
| `test/unit/schemas.spec.ts` | create | AC-15 (U), схема ответа (часть AC-8) |

## Task 7: Публичные типы ядра (`src/core/types.ts`)

### Зачем
Единственный источник публичных типов. Их используют схемы (`satisfies`), транспорт, кэш, решение и клиент; позже — `nest` и `testing` (E2). По prd.md §5.1 «Типы» это интерфейсы TS без `z.infer`.

### Шаги реализации
1. Создать `src/core/types.ts`. Первая строка — `// Публичные типы контракта Platform и API пакета (prd.md §3.2, §5.1); без zod — схемы в schemas.ts.`
2. Объявить (у каждого объявления и каждого поля интерфейса — TSDoc на русском, поля `readonly`):
   ```ts
   import type { DecisionCode } from './codes.js';

   export type { DecisionCode };
   export type Act = 'human' | 'agent';
   export type GeneralDenyCode = 'NOT_MEMBER' | 'COMPANY_SUSPENDED' | 'ACCOUNT_DISABLED' | 'SEATS_EXCEEDED' | 'CONTEXT_REVOKED';
   export type PermissionDenyCode = 'FORBIDDEN' | 'PLAN_MODULE' | 'MODULE_DISABLED';

   export interface Subject {
       readonly sub: string;
       readonly tenant: string;      // slug компании
       readonly tenantId: string;
       readonly act: Act;
       readonly pep?: number;        // только агент; в Platform не передаётся (D5)
       readonly asid?: string;       // только лог debug (§3.2)
       readonly wid?: string | null; // только лог debug (§3.2)
   }

   export interface ModuleState {
       readonly id: string;
       readonly enabled: boolean;
       readonly code?: 'PLAN_MODULE' | 'MODULE_DISABLED';
   }

   export interface AllowedPermissions {
       readonly allow: true;
       readonly epoch: number;
       readonly memberId: string;
       readonly roles: readonly string[];
       readonly permissions: readonly string[];
       readonly denied: Readonly<Record<string, PermissionDenyCode>>;
       readonly modules: readonly ModuleState[];
       readonly limits: { readonly fileSizeMb: number | null };
   }

   export interface DeniedPermissions {
       readonly allow: false;
       readonly epoch: number | null;
       readonly memberId?: string;
       readonly code: GeneralDenyCode;
       readonly message: string;
       readonly roles: readonly [];
       readonly permissions: readonly [];
       readonly denied: Readonly<Record<string, never>>;
       readonly modules: readonly [];
       readonly limits: { readonly fileSizeMb: null };
   }

   export type PermissionsResponse = AllowedPermissions | DeniedPermissions;

   export type Decision =
       | { readonly allow: true; readonly epoch: number; readonly memberId: string }
       | { readonly allow: false; readonly epoch: number | null; readonly memberId?: string; readonly code: DecisionCode; readonly message: string };

   export interface TokenProvider {
       getToken(options?: { readonly refresh?: boolean }): Promise<string>;
   }

   export interface PlatformClientLogger {
       debug(obj: object, msg?: string): void;
       warn(obj: object, msg?: string): void;
       error(obj: object, msg?: string): void;
   }

   export type MetricsEndpoint = 'permissions' | 'check' | 'batch' | 'token';
   export type MetricsRequestResult = 'ok' | 'unavailable' | 'contract_error';

   export interface PlatformClientMetrics {
       cacheResult(result: 'hit' | 'miss' | 'stale'): void;
       request(endpoint: MetricsEndpoint, result: MetricsRequestResult, seconds: number): void;
       policyEvent(result: 'applied' | 'ignored' | 'invalid'): void;
   }

   export interface PlatformAuthzClientOptions {
       readonly baseUrl: string;
       readonly tokenProvider: TokenProvider;
       readonly cacheTtlSec?: number;
       readonly denyTtlSec?: number;
       readonly maxEntries?: number;
       readonly requestTimeoutMs?: number;
       readonly fetch?: typeof fetch;
       readonly clock?: () => number;   // миллисекунды, по умолчанию Date.now
       readonly traceparent?: () => string | undefined;
       readonly logger?: PlatformClientLogger;
       readonly metrics?: PlatformClientMetrics;
   }

   export interface PermissionsOptions { readonly fresh?: boolean }

   export interface PlatformAuthzRaw {
       check(body: object): Promise<unknown>;
       batch(body: object): Promise<unknown>;
       permissions(body: object): Promise<PermissionsResponse>;
   }

   export interface PlatformAuthzClient {
       check(subject: Subject, permission: string): Promise<Decision>;
       checkMany(subject: Subject, permissions: readonly string[]): Promise<Record<string, Decision>>;
       permissions(subject: Omit<Subject, 'pep'>, options?: PermissionsOptions): Promise<PermissionsResponse>;
       onPolicyChanged(envelope: unknown): void;
       clear(): void;
       readonly raw: PlatformAuthzRaw;
   }

   export interface ClientCredentialsOptions {
       readonly tokenUrl: string;
       readonly clientId: string;
       readonly clientSecret: string;
       readonly scope: string;
       readonly resource: string;
       readonly fetch?: typeof fetch;
       readonly clock?: () => number;
       readonly requestTimeoutMs?: number;
       readonly metrics?: Pick<PlatformClientMetrics, 'request'>;  // prd.md v1.8 §5.1
   }
   ```
3. TSDoc обязателен: поля `cacheTtlSec`, `denyTtlSec`, `maxEntries`, `requestTimeoutMs` описывают ограничения и значения по умолчанию из §5.1 (`1…60, 60`; `1…5, 5`; `≥ 100, 50 000`; `≥ 100, 2000`). `clock` — миллисекунды. `TokenProvider.getToken` — семантика `refresh` из §5.1 («токен, выданный после вызова: кэш провайдера сбрасывается»). `ClientCredentialsOptions.metrics` — «пишет `request('token', …)` только на HTTP-запрос к Identity» (prd.md v1.8).

### Интерфейсы и контракты
- `checkMany` принимает `readonly string[]` — расширение `string[]` из §5.1, совместимое для вызывающего.
- `Decision` при `allow: false` содержит `code: DecisionCode` — 8 кодов §3.4 без `PLATFORM_UNAVAILABLE` (это ошибка, не решение).
- В файле нет импорта `zod` (AC-12, E2).

### Свидетельства требований
- prd.md §3.2 (тип ответа), §5.1 (опции, клиент, `TokenProvider`, метрики, `clientCredentials` с `metrics` — v1.8).

### Ошибки и логирование
Не применимо (только типы).

### Тесты
Проверяются компиляцией (`pnpm typecheck`) и через `satisfies` в Task 10.

### Критерии приёмки
- `pnpm typecheck` и `pnpm lint` (TSDoc) проходят.

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/types.ts (CREATE) — публичные типы библиотеки; в сервисе им соответствовали бы `http/requests|responses`, но здесь нет HTTP-слоя.

## Task 8: Копия кодов Platform (`src/core/codes.ts`)

### Зачем
D9: коды и тексты — константы пакета, дословно как в Platform. Решение по снимку (шаг 6 §5.2) берёт текст отказа отсюда, а guard в E2 — тексты.

### Шаги реализации
1. Получить содержимое: `git -C /home/administrator/projects/verdeect2/verdeect-platform show 7adb423:apps/platform/src/modules/catalog/domain/decision-codes.ts`.
2. Создать `src/core/codes.ts`: две строки шапки, затем тело источника **без изменений**, байт в байт:
   ```ts
   // Копия verdeect-platform apps/platform/src/modules/catalog/domain/decision-codes.ts @ 7adb423 (prd.md §3.4, D9, AC-11).
   // Не править вручную: только перекопировать из источника и обновить коммит в этой строке.
   ```
   (Далее — строки источника, начиная с `/** Коды и сообщения решений (prd.md §5.6) — тексты дословно. */`.)
3. Убедиться, что файл в `.prettierignore` и в override ESLint `jsdoc/require-jsdoc: off` (Task 3).

### Интерфейсы и контракты
- Экспорты: `DECISION_MESSAGES` (8 кодов), `DecisionCode`, `decisionMessage(code)`.
- Наружу из `src/core/index.ts` не экспортируются (§5.1 их не перечисляет). `src/nest` в E2 импортирует `../core/codes.js` напрямую — ARCHITECTURE это разрешает.

### Свидетельства требований
- prd.md §3.4 (таблица кодов), D9, AC-11; skill-context «Library Package Scope» (копии с источником и коммитом, не правятся).

### Ошибки и логирование
Не применимо.

### Тесты
Task 12 (`test/unit/codes.spec.ts`).

### Критерии приёмки
- Тело файла после двух строк шапки совпадает с выводом `git show` из шага 1.

### Проверка
- `tail -n +3 src/core/codes.ts | diff - <(git -C /home/administrator/projects/verdeect2/verdeect-platform show 7adb423:apps/platform/src/modules/catalog/domain/decision-codes.ts)` — пустой вывод. Если shell не поддерживает `<(…)`, сравнивает тест AC-11 из Task 12.

**Skill:** none — копия файла из `verdeect-platform` (не генерируется и не правится).

## Task 9: Классы ошибок (`src/core/errors.ts`)

### Зачем
Два вида исключений ядра (§5.1, D6): недоступность (fail-closed, guard → 503) и нарушение контракта или конфигурации (guard → 500). Отказ по праву — значение `Decision`, а не ошибка (ARCHITECTURE «Ключевые принципы» п. 4).

### Шаги реализации
1. Создать `src/core/errors.ts`. Первая строка: `// Ошибки ядра (prd.md §5.1, D6): недоступность Platform/Identity и нарушение контракта; тексты без секретов (AC-19).`
2. Содержимое:
   ```ts
   import type { MetricsEndpoint } from './types.js';

   /** Текст ответа guard при недоступности (prd.md §3.4, пакетный код PLATFORM_UNAVAILABLE). */
   export const PLATFORM_UNAVAILABLE_MESSAGE = 'Сервис прав временно недоступен. Повторите позже';

   /** Причина недоступности: сеть, таймаут, 5xx, 429 Identity, повторный 401 Platform. */
   export type UnavailableReason = 'network' | 'timeout' | 'http_5xx' | 'http_429' | 'unauthorized';

   export class PlatformUnavailableError extends Error {
       readonly code = 'PLATFORM_UNAVAILABLE' as const;
       constructor(readonly endpoint: MetricsEndpoint, readonly reason: UnavailableReason, options?: { readonly cause?: unknown }) {
           super(`platform-client: ${endpoint} unavailable (${reason})`, options);
           this.name = 'PlatformUnavailableError';
       }
   }

   export class PlatformContractError extends Error {
       constructor(readonly code: string, readonly details: Readonly<Record<string, unknown>> = {}) {
           super(`platform-client: contract error ${code}`);
           this.name = 'PlatformContractError';
       }
   }
   ```
3. TSDoc у класса, конструктора и каждого публичного поля. Перечислить, когда бросается каждая ошибка (дословно из §5.1).
4. Набор кодов `PlatformContractError.code` (в TSDoc класса):
   - код Platform из тела `{error: {code}}`: `SCOPE_REQUIRED`, `FORBIDDEN`, `VALIDATION_FAILED`, `TENANT_MISMATCH` и т. д.;
   - поле `error` ответа OAuth Identity (`invalid_client`, …);
   - локальные: `UNKNOWN_PERMISSION` (`details.permission`), `PEP_REQUIRED`, `VALIDATION_FAILED` (`details.field`);
   - `INVALID_RESPONSE` (`details.endpoint`) — ответ не по схеме или не JSON;
   - `HTTP_<status>` — статус без тела ошибки в формате Platform или OAuth (например, 404 при неверном `baseUrl`).

### Интерфейсы и контракты
- `PlatformUnavailableError.code === 'PLATFORM_UNAVAILABLE'` (§5.1). Поля `endpoint` и `reason` добавлены: они нужны логам `warn` по `endpoint` (NFR-3). В сообщении нет токена, URL с секретом и тела ответа.
- `PlatformContractError.message` содержит только код.

### Свидетельства требований
- prd.md §5.1 (классы ошибок и классификация ответов), D6, NFR-3, AC-19.

### Ошибки и логирование
Сам файл не логирует.

### Тесты
Классы проверяются в тестах транспорта и клиента (Task 18–28). Текст `PLATFORM_UNAVAILABLE_MESSAGE` — в AC-11 (Task 12).

### Критерии приёмки
- `new PlatformContractError('X') instanceof Error`; `code`, `details`, `name` выставлены.

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/errors.ts (CREATE) — ошибки библиотеки. Тип `domain-error` описывает `errors/{name}.error.ts` модуля сервиса с i18n-текстом, в библиотеке его нет.

## Task 10: Внутренние схемы и функции разбора (`src/core/schemas.ts`)

### Зачем
Каждый ответ Platform проверяется zod-схемой (§5.2: «не по схеме → `PlatformContractError`, в кэш не пишется»). Конверт события проверяется мягкой схемой (§5.3). Ответ Identity — схемой токена (§5.1). Наружу выходят только функции `parse*` с нашими типами, поэтому в `.d.ts` нет импорта `zod` (NFR-4: схемы не экспортируются; AC-12).

### Шаги реализации
1. Создать `src/core/schemas.ts`. Первая строка: `// Внутренние zod-схемы (prd.md §3.2, §5.1, §5.3); наружу — только функции parse* без типов zod (NFR-4, AC-12).`
2. Импорты: `import { z } from 'zod';`, `import type { PermissionsResponse } from './types.js';`.
3. Неэкспортируемые схемы:
   ```ts
   const epoch = z.number().int().min(1);
   const permissionDenyCode = z.enum(['FORBIDDEN', 'PLAN_MODULE', 'MODULE_DISABLED']);
   const generalDenyCode = z.enum(['NOT_MEMBER', 'COMPANY_SUSPENDED', 'ACCOUNT_DISABLED', 'SEATS_EXCEEDED', 'CONTEXT_REVOKED']);
   const allowedSchema = z.object({
       allow: z.literal(true),
       epoch,
       memberId: z.string().min(1),
       roles: z.array(z.string()),
       permissions: z.array(z.string()),
       denied: z.record(z.string(), permissionDenyCode),
       modules: z.array(z.object({ id: z.string().min(1), enabled: z.boolean(), code: z.enum(['PLAN_MODULE', 'MODULE_DISABLED']).optional() })),
       limits: z.object({ fileSizeMb: z.number().nullable() }),
   });
   const deniedSchema = z.object({
       allow: z.literal(false),
       epoch: epoch.nullable(),
       memberId: z.string().min(1).optional(),
       code: generalDenyCode,
       message: z.string(),
       roles: z.tuple([]),
       permissions: z.tuple([]),
       denied: z.strictObject({}),
       modules: z.tuple([]),
       limits: z.object({ fileSizeMb: z.null() }),
   });
   const permissionsResponseSchema = z.discriminatedUnion('allow', [allowedSchema, deniedSchema]) satisfies z.ZodType<PermissionsResponse>;

   const policyChangedSchema = z.looseObject({
       type: z.literal('platform.policy.changed'),
       id: z.string(),
       data: z.looseObject({
           tenantId: z.string().min(1),
           epoch,
           subs: z.array(z.string().min(1)).optional(),
       }),
   });

   const tokenResponseSchema = z.looseObject({ access_token: z.string().min(1), expires_in: z.number().positive() });
   const oauthErrorSchema = z.looseObject({ error: z.string().min(1) });
   const platformErrorSchema = z.looseObject({
       error: z.looseObject({ code: z.string().min(1), details: z.record(z.string(), z.unknown()).optional() }),
   });
   ```
   Незнакомые поля ответа `permissions` отбрасываются (`z.object` по умолчанию срезает лишние ключи) и не ломают разбор. В конверте события незнакомые поля и любой `reason` принимаются (`looseObject`; §5.3 «Незнакомые поля и любой `reason` принимаются»). `subject`, `actor`, `tenant` конверта не проверяются (§5.3).
   Если `satisfies z.ZodType<PermissionsResponse>` не компилируется из-за `z.strictObject({})` против `Record<string, never>`, заменить `denied` в `DeniedPermissions` (Task 7) на `Readonly<Record<string, never>>`-совместимый вывод: `z.record(z.string(), z.never())`. Это единственная допустимая замена. Цель — `tsc` без `as`.
4. Экспортируемые функции (TSDoc у каждой):
   ```ts
   /** Конверт platform.policy.changed в объёме, нужном для сброса (§5.3). */
   export interface PolicyChangedEvent { readonly id: string; readonly tenantId: string; readonly epoch: number; readonly subs: readonly string[] | undefined }

   export function parsePermissionsResponse(value: unknown): PermissionsResponse | undefined;
   export function parsePolicyChanged(value: unknown): { readonly ok: true; readonly event: PolicyChangedEvent } | { readonly ok: false; readonly issues: readonly string[] };
   export function parseTokenResponse(value: unknown): { readonly accessToken: string; readonly expiresInSec: number } | undefined;
   export function parseOAuthErrorCode(value: unknown): string | undefined;
   export function parsePlatformError(value: unknown): { readonly code: string; readonly details: Readonly<Record<string, unknown>> } | undefined;
   ```
   - `parsePolicyChanged` при неудаче возвращает `issues` — только пути (`issue.path.join('.') || '(root)'`), без значений: конверт недоверенный, значения в лог не идут.
   - `parsePolicyChanged` нормализует `subs: []` в `undefined`: пустой список = вся компания (§5.3).
   - Все функции используют `safeParse` и никогда не бросают.

### Интерфейсы и контракты
- Тип возврата ни одной экспортируемой функции не ссылается на zod, поэтому `dist/core/schemas.d.ts` не импортирует `zod`. Проверка — в Task 30.
- `parsePermissionsResponse` используют транспорт (Task 15) и `raw.permissions` (Task 24).

### Свидетельства требований
- prd.md §3.2 (форма ответа), §3.5 и §5.3 (мягкая схема конверта), §5.1 (`access_token`, `expires_in`, поле `error` OAuth), NFR-4, §5.1 «Типы» (`satisfies`).
- Platform `rs-member-permissions.ts` подтверждает форму ответа (сверено, совпадает).

### Ошибки и логирование
Функции не логируют и не бросают. Решение о логе принимает вызывающий.

### Тесты
Task 12 (`test/unit/schemas.spec.ts`).

### Критерии приёмки
- `pnpm typecheck` проходит без `as` и `any` в файле.

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0.

**Skill:** nestjs-code generic src/core/schemas.ts (CREATE) — внутренние схемы библиотеки. Тип `http-request/http-response` предполагает HTTP-слой сервиса, а здесь схемы проверяют ответы чужого сервиса.

## Task 11: Копия JSON Schema событий Platform (`test/fixtures/`)

### Зачем
AC-15 (U): образцовые события проверяются ajv по настоящей схеме Platform и затем zod пакета. Копия должна совпадать побайтно, поэтому источник и коммит записаны рядом, а не внутри JSON (в JSON нет комментариев, а поле `$comment` было бы правкой копии).

### Шаги реализации
1. `git -C /home/administrator/projects/verdeect2/verdeect-platform show 7adb423:apps/platform/contracts/events/platform-events.schema.json > test/fixtures/platform-events.schema.json` (каталог `test/fixtures/` создать заранее).
2. Создать `test/fixtures/SOURCES.md`:
   ```markdown
   # Источники копий в test/fixtures

   Файлы — побайтные копии из `verdeect-platform`. Не править вручную: только перекопировать командой ниже и обновить коммит.

   | Файл | Источник | Коммит |
   |---|---|---|
   | `platform-events.schema.json` | `apps/platform/contracts/events/platform-events.schema.json` | `7adb423` |

   Перекопировать: `git -C ../verdeect-platform show <commit>:apps/platform/contracts/events/platform-events.schema.json > test/fixtures/platform-events.schema.json`.

   `identity-events.schema.json` (слой C, prd.md §7 п. 7) добавляется на этапе E3.
   ```

### Интерфейсы и контракты
- Файл в `.prettierignore` (Task 3).

### Свидетельства требований
- prd.md §4 (`test/fixtures/` — копии из verdeect-platform, источник и коммит); AC-15 (U); исходный запрос (копия `platform-events.schema.json` → `test/fixtures/`).

### Ошибки и логирование
Не применимо.

### Тесты
Task 12.

### Критерии приёмки
- `git -C /home/administrator/projects/verdeect2/verdeect-platform show 7adb423:apps/platform/contracts/events/platform-events.schema.json | cmp - test/fixtures/platform-events.schema.json` → без вывода, код 0.

### Проверка
- Команда из критериев приёмки.

**Skill:** none — копия файла-фикстуры и markdown-описание источника.

## Task 12: Тесты AC-11 и AC-15 (U), схема ответа `permissions`

### Зачем
AC-11 фиксирует дословные тексты и совпадение копии с источником. AC-15 (U) доказывает, что мягкая zod-схема пакета принимает всё, что принимает строгая схема Platform. Проверка схемы ответа (часть AC-8: «ответ Platform не по схеме → `PlatformContractError`») начинается с функции разбора; поведение клиента — в Task 28.

### Шаги реализации
1. Создать `test/unit/codes.spec.ts` (первая строка — `// AC-11 (prd.md §3.4, D9): коды и тексты — дословно; копия decision-codes.ts совпадает с источником.`):
   - `describe('AC-11: коды и тексты §3.4', …)`:
     - `it('AC-11: каждый код §3.4 — дословный текст')`: `expect(DECISION_MESSAGES).toStrictEqual({ NOT_MEMBER: 'Нет доступа к компании.', COMPANY_SUSPENDED: 'Компания приостановлена.', ACCOUNT_DISABLED: 'Учётная запись заблокирована.', SEATS_EXCEEDED: 'Превышено число мест по тарифу. Обратитесь к администратору.', CONTEXT_REVOKED: 'Контекст отозван. Нужен новый диалог.', FORBIDDEN: 'Недостаточно прав.', PLAN_MODULE: 'Возможность не входит в тариф компании.', MODULE_DISABLED: 'Раздел отключён. Данные сохранены.' })`.
     - `it('AC-11: PLATFORM_UNAVAILABLE — «Сервис прав временно недоступен. Повторите позже»')` → `PLATFORM_UNAVAILABLE_MESSAGE`.
     - `it('AC-11: decisionMessage возвращает текст по коду')` — для каждого ключа.
     - `it('AC-11: шапка копии содержит путь источника и коммит')`: прочитать `src/core/codes.ts`; первая строка содержит `apps/platform/src/modules/catalog/domain/decision-codes.ts` и `@ 7adb423`.
     - `it.runIf(existsSync(PLATFORM_GIT))('AC-11: тело копии совпадает с decision-codes.ts в коммите шапки')`: в начале файла объявить `const PLATFORM_DIR = fileURLToPath(new URL('../../../verdeect-platform', import.meta.url))` и `const PLATFORM_GIT = join(PLATFORM_DIR, '.git')`, где `test/unit` → корень репозитория → соседний каталог. Абсолютный путь пользователя не используется ни в условии, ни в вызове. Взять коммит из шапки regex-ом `/@ ([0-9a-f]{7,40})/`, получить источник через `execFileSync('git', ['-C', PLATFORM_DIR, 'show', `${commit}:apps/platform/src/modules/catalog/domain/decision-codes.ts`], { encoding: 'utf8' })`, сравнить с файлом без первых двух строк. Без соседнего репозитория (CI) кейс пропускается.
2. Создать `test/unit/schemas.spec.ts` (первая строка — `// AC-15 (U, §3.5, §5.3): образцовые platform.policy.changed по схеме Platform проходят zod пакета; схема ответа permissions (§3.2).`):
   - Подготовка ajv. Оба пакета — CommonJS: при `module: NodeNext` default-импорт CJS-модуля типизируется как весь `module.exports` и не вызывается. Оба выставляют `exports.default` в рантайме, поэтому обращаться к ним нужно через `.default`:
     ```ts
     // ajv и ajv-formats — CJS: в NodeNext default-импорт = module.exports; функции/классы берём из .default (выставлен в рантайме).
     import Ajv2020Module from 'ajv/dist/2020.js';
     import addFormatsModule from 'ajv-formats';

     const ajv = new Ajv2020Module.default({ strict: false });
     addFormatsModule.default(ajv);
     const validate = ajv.compile(schemaJson);
     ```
     `schemaJson` читается из `test/fixtures/platform-events.schema.json`. `strict: false` нужен из-за ключей `title`/`description` в `$defs` (ajv strict по умолчанию ругается на неизвестные слова). Без `any` и без `m.default ?? m`: тип этого выражения — объединение с невызываемым namespace.
   - Фабрика образца:
     ```ts
     function policyChanged(data: Record<string, unknown>): Record<string, unknown> {
         return {
             id: 'evt_01JABCDEFGHJKMNPQRSTVWXYZ0', type: 'platform.policy.changed', version: 1,
             occurredAt: '2026-10-27T10:00:00.000Z', tenant: 'acme',
             actor: { clientId: 'verdeect-platform', accountId: null, channel: 'system' },
             subject: { kind: 'company', id: 'cmp_1' }, data, traceId: null,
         };
     }
     ```
     `id` должен соответствовать `^evt_[0-9A-HJKMNP-TV-Z]{26}$`: 26 символов Crockford base32, без I, L, O, U. При реализации проверить длину.
   - `describe('AC-15: platform.policy.changed — ajv по копии схемы Platform и zod пакета', …)`:
     - `it.each(['member_roles', 'member_removed', 'account_disabled', 'company_suspended', 'modules', 'role_catalog'])('AC-15: reason %s без subs проходит ajv и zod', …)`: `validate(env) === true`, иначе вывести `validate.errors`; `parsePolicyChanged(env).ok === true`.
     - То же `it.each` с `subs: ['usr_1', 'usr_2']` — `'AC-15: reason %s с subs проходит ajv и zod'`; `event.subs` равен `['usr_1', 'usr_2']`.
     - `it('AC-15: zod мягче — незнакомый reason и лишнее поле data принимаются')`: ajv `false`, zod `ok: true`.
     - `it('AC-15: subs: [] — сброс всей компании (subs = undefined)')`.
     - `it('AC-15: нет data.tenantId, epoch: 0, не тот type — zod отклоняет без исключения')`: `ok: false`, `issues` непустой, в `issues` нет значений (`JSON.stringify(issues)` не содержит `'acme'`).
   - `describe('AC-8: схема ответа permissions (§3.2)', …)`:
     - `it('AC-8: разрешение по §3.2 разбирается')` — полный пример: 3 права в `permissions`, 2 в `denied` (`FORBIDDEN`, `MODULE_DISABLED`), 2 модуля, `limits.fileSizeMb: 50`.
     - `it('AC-8: общий отказ и NOT_MEMBER с epoch: null разбираются')`.
     - `it.each([...])('AC-8: ответ не по схеме → undefined (%s)', …)`: `epoch: 0`; `epoch: '7'`; неизвестный код `denied`; `allow: false` с непустым `permissions`; нет `memberId` при `allow: true`; `null`; строка.
   - `describe('§5.1: ответы Identity', …)`: `parseTokenResponse({access_token:'t', expires_in: 40, token_type: 'Bearer'})` → `{accessToken:'t', expiresInSec:40}`; без `expires_in` → `undefined`; `parseOAuthErrorCode({error:'invalid_client'})` → `'invalid_client'`; `parsePlatformError({error:{code:'TENANT_MISMATCH', message:'…', details:{}}})` → `{code:'TENANT_MISMATCH', details:{}}`.

### Интерфейсы и контракты
- Тесты импортируют внутренние модули из `../../src/core/*.js`.

### Свидетельства требований
- AC-11, AC-15 (U), AC-8 (часть «ответ не по схеме»), prd.md §3.4, §3.5, §5.3.

### Ошибки и логирование
Не применимо.

### Тесты
Файлы выше. Команда: `pnpm test`.

### Критерии приёмки
- Все кейсы зелёные. Порча текста в `DECISION_MESSAGES` или схемы `policyChangedSchema` (например, `subs.min(1)`) делает AC-11 или AC-15 красным.

### Проверка
- `pnpm test` → все тесты зелёные; `pnpm typecheck` → 0; `pnpm lint` → 0; `pnpm format:check` → 0.

**Skill:** nestjs-code test unit codes (CREATE); nestjs-code test unit schemas (CREATE)

## Риски фазы и меры
- Риск: в NodeNext default-импорт CJS-пакетов `ajv/dist/2020.js` и `ajv-formats` типизируется как весь `module.exports` и не вызывается; запасной вариант `m.default ?? m` не помогает, его тип — объединение с невызываемым namespace.
  Мера: обращение через `.default` (`Ajv2020Module.default`, `addFormatsModule.default`). Оба пакета выставляют `exports.default` в рантайме (Task 12), `any` не нужен.
- Риск: `satisfies` не сходится на `readonly []` и `strictObject({})`.
  Мера: допустимая замена в Task 10, шаг 3. Типы меняются только в сторону совместимости с §3.2.

## Чек-лист завершения фазы
- Задачи 7–12 удовлетворяют критериям приёмки.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` — код 0.
- Чекбоксы в `index.md` обновлены.
