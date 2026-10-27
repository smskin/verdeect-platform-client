# Архитектура: Layered Architecture (библиотека «ядро + адаптеры»)

## Обзор

`@verdeect/platform-client` — библиотека с одним ограниченным контекстом: решение по праву участника из снимка Platform. Модулей, БД, транзакций и HTTP-сервера в ней нет. Поэтому выбран самый простой паттерн — **слоистая архитектура**, как в `verdeect-auth`. Слои совпадают с тремя точками входа пакета (`exports`). Внизу ядро `src/core`, над ним адаптер NestJS `src/nest` и подделка Platform `src/testing`. Зависимости направлены только вниз, к ядру.

Внутри ядра есть короткая цепочка обязанностей: клиент → решение → кэш → транспорт. Это файлы одного слоя, а не отдельные слои: портов и абстракций с единственной реализацией нет. Исключение — `TokenProvider`: это контракт, у которого с первого дня две реализации — `clientCredentials` и реализация сервиса (D8).

Из `nestjs-specialist` действуют общие правила:
- TypeScript `strict` и `noUncheckedIndexedAccess`;
- ESM с суффиксом `.js`;
- именование (§10);
- стиль, Prettier и ESLint;
- Vitest;
- ID критериев в именах тестов;
- формат ошибок API `{error: {code, message, details}}`;
- работа с внешними пакетами через обёртку.

**Не действуют** слои сервиса: `modules/`, `use-cases/`, `actions/`, `repositories/`, `schema/`, outbox, inbox, RLS, `RequestContext`, `nestjs-pino`, `@nestjs/config`, Drizzle, Docker, GlitchTip, `prom-client`, i18n. Тексты отказов в библиотеке — константы, дословно совпадающие с Platform и `@verdeect/auth` (D9). Это исключение из запрета «отображаемый текст в коде». Компоненты создаются через `nestjs-code generic <path>` с обоснованием «компонент библиотеки, не сервиса».

## Обоснование выбора

- **Тип проекта:** публичная npm-библиотека. Её потребители — Orchestrator, Files и Media. Контракт задан PRD `requirements/0000-platform-client/prd.md` (§3 — Platform, §5 — API пакета).
- **Стек:** TypeScript (ESM, Node ≥ 22.12), `zod` 4.6.7. NestJS 12 и `@verdeect/auth` ^1.0.1 — необязательные peer-зависимости. Vitest, Testcontainers (только слой C), pnpm.
- **Ключевой фактор:** граница между слоями — это граница установки и загрузки, а не только кода:
  - ядро работает без `@nestjs/*` и `@verdeect/auth` (D2, NFR-4);
  - `testing` не попадает в production (`ERR_PACKAGE_PATH_NOT_EXPORTED`, §4);
  - `nest` берёт `VerdeectAuthGuard` из копии `@verdeect/auth` сервиса, поэтому она peer, а не `dependencies`.

  Нужна жёсткая однонаправленность импортов, а не богатая доменная модель.
- **Отвергнуто:** Structured Modules и Explicit Architecture. Один контекст из ~12 файлов, порты для кэша и транспорта добавили бы только церемонии. Отдельный пакет для подделки тоже отвергнут — подпуть `testing` устроен как в `@verdeect/auth`.

## Структура каталогов

```
verdeect-platform-client/
├── src/
│   ├── core/                          # "."  — ядро; только zod и node:*
│   │   ├── index.ts                   #   явный список реэкспортов ядра
│   │   ├── types.ts                   #   публичные интерфейсы: Subject, Decision, PermissionsResponse,
│   │   │                              #   PlatformAuthzClientOptions, PlatformClientMetrics, TokenProvider
│   │   ├── schemas.ts                 #   zod-схемы (не экспортируются) и функции parse*: в .d.ts нет zod (AC-12)
│   │   ├── codes.ts                   #   копия decision-codes.ts Platform: коды и тексты (источник + коммит)
│   │   ├── errors.ts                  #   PlatformUnavailableError, PlatformContractError
│   │   ├── options.ts                 #   проверка настроек → TypeError с именами параметров
│   │   ├── transport.ts               #   HTTP к Platform: fetch, таймаут, traceparent, 401 → refresh, классификация ошибок
│   │   ├── cache.ts                   #   снимки (LRU, индекс по tenantId), lastSeenEpoch (LRU), объединение запросов, поколение, «Приём ответа»
│   │   ├── decide.ts                  #   чистое локальное решение §5.2 по снимку (шаги 1, 3–6), без ввода-вывода
│   │   ├── token-provider.ts          #   clientCredentials: client_secret_basic, кэш до exp − 30 с
│   │   ├── log-limiter.ts             #   ограничение частоты error/warn (NFR-3)
│   │   └── client.ts                  #   createPlatformAuthzClient: сборка, onPolicyChanged, clear, raw
│   ├── nest/                          # "./nest" — адаптер NestJS
│   │   ├── index.ts
│   │   ├── platform-authz.module.ts   #   PlatformAuthzModule.forRoot/forRootAsync, PLATFORM_AUTHZ_CLIENT
│   │   ├── require-permission.decorator.ts  # SetMetadata + UseGuards(PermissionGuard), TypeError при пустом списке
│   │   ├── permission.guard.ts        #   Principal → Subject, вызов VerdeectAuthGuard (D11), ответы §5.4
│   │   └── responses.ts               #   тела и тексты ответов guard (совпадают с @verdeect/auth — AC-10)
│   └── testing/                       # "./testing" — только условие development
│       ├── index.ts
│       ├── fake-platform.ts           #   createFakePlatform: тот же клиент, транспорт в памяти
│       └── catalog.ts                 #   копия PERMISSION_KEYS и каталога модулей (источник + коммит)
├── test/
│   ├── unit/                          # слой U: ядро, nest (@nestjs/testing), testing
│   ├── perf/                          # слой U: p99 check, память на снимок (--expose-gc, AC-17)
│   ├── contract/                      # слой C: локально, Testcontainers + образ verdeect-platform (D10)
│   │   └── support/platform-stand.ts
│   ├── fixtures/                      # копии platform-events.schema.json, identity-events.schema.json
│   ├── package/                       # проверки архива: состав, exports, publint, attw
│   └── consumer/                      # проект-потребитель упакованного архива (AC-12)
├── docs/                              # getting-started, nestjs, testing, errors, releasing
├── scripts/publish.mjs                # публикация из CI: тег = version, версии нет в npm
├── .github/workflows/ci.yml           # lint → test (Node 22, 24) → build + pack:check → publish (тег v*)
├── package.json                       # exports, files, peer-зависимости optional
├── tsconfig.json / tsconfig.build.json
├── vitest.config.ts / vitest.perf.config.ts / vitest.package.config.ts / vitest.contract.config.ts
├── eslint.config.js / .prettierrc.json
├── Makefile                           # install, lint, analyse, test, test-perf, test-contract, build, pack-check, ci
├── README.md / CHANGELOG.md
└── requirements/ · .ai-factory/ · AGENTS.md
```

Здесь раскладка PRD §4 уточнена. `options.ts`, `transport.ts`, `log-limiter.ts` (ядро) и `responses.ts` (nest) выделены, чтобы `client.ts` и `permission.guard.ts` не разрастались. Если файл получается меньше ~30 строк, его содержимое остаётся в соседнем. Каталоги и файлы создаются на своём этапе (E1–E3), пустые заранее не заводятся.

## Правила зависимостей

```
     ┌───────────────────────────────┐      ┌──────────────────────────┐
     │ ./nest                        │      │ ./testing                │
     │ @nestjs/common, @nestjs/core  │      │ node:*                   │
     │ @verdeect/auth/nest           │      │                          │
     └───────────────┬───────────────┘      └────────────┬─────────────┘
                     │ значения и типы ядра              │ значения и типы ядра
                     ▼                                   ▼
     ┌──────────────────────────────────────────────────────────────────┐
     │ "." ядро src/core — только zod и node:*                           │
     └──────────────────────────────────────────────────────────────────┘
```

- ✅ `src/nest/**` → `src/core/index.js` (и внутренние файлы ядра), `@nestjs/common`, `@nestjs/core`, `@verdeect/auth/nest`.
- ✅ `src/testing/**` → ядро, `node:*`. Подделка подменяет транспорт через внутреннюю точку расширения клиента, а не через `fetch`-заглушку в коде сервиса.
- ✅ Ядро → `zod`, `node:*` и другие файлы ядра.
- ❌ Ядро → `@nestjs/*`, `rxjs`, `reflect-metadata`, `@verdeect/auth`, `src/nest/`, `src/testing/`. `import type` тоже запрещён: он ломает `.d.ts` у потребителя без Nest.
- ❌ `src/nest/` ↔ `src/testing/` в любую сторону.
- ❌ Импорт по имени собственного пакета (`@verdeect/platform-client/...`) внутри `src/` — только относительные пути с `.js`.
- ❌ Новые записи в `dependencies`. Потребитель получает от пакета только `zod`. `@verdeect/auth` — только peer (NFR-4).
- ❌ Экспорт zod-схем или `z.infer` в публичных типах.
- ✅ Тесты могут импортировать любой слой, включая `testing`.

Правила проверяет `test/package`: в `dist/core/**` и `dist/nest/**` нет импорта `testing`, ядро грузится без peer-зависимостей, `./testing` без условия `development` падает.

## Взаимодействие слоёв

- **Публичная поверхность** каждого слоя — его `index.ts` с явным `export { … }` / `export type`. Всего, чего нет в `index.ts`, наружу нет: схемы, кэш, транспорт, `decide`, ограничитель логов.
- **Потребитель → ядро:** `createPlatformAuthzClient(options)` возвращает `PlatformAuthzClient`. Отказ по праву — значение `Decision` с `allow: false`, а не исключение. Исключения бывают только двух видов: `PlatformUnavailableError` (инфраструктура) и `PlatformContractError` (конфигурация или контракт).
- **Внутри ядра:**
  - `client` собирает `transport`, `cache`, `decide` и `tokenProvider`;
  - `decide` получает снимок через `cache`, который при промахе вызывает `transport`;
  - объединение запросов и «поколение» для `clear()` живут в `cache`;
  - время берётся только из внедрённого `clock`, сеть — только из внедрённого `fetch`.
- **Сервис → ядро (события):** сервис сам получает `platform.policy.changed` из RabbitMQ и передаёт конверт в `client.onPolicyChanged(envelope)` (D7). Ядро к брокеру не подключается.
- **Ядро → наблюдаемость:**
  - логи — только через внедрённый `logger`; без него ядро молчит;
  - метрики — только через внедрённый `PlatformClientMetrics`; без них ничего не считается;
  - метки — только значения из типа.
- **NestJS-адаптер → ядро:**
  - модуль создаёт клиента (или принимает готового) и кладёт его в DI под `PLATFORM_AUTHZ_CLIENT`. Без явного `logger` модуль передаёт обёртку над `Logger('PlatformAuthz')`;
  - `PermissionGuard` берёт `Principal` через `principalOf(request)`. Если его нет, вызывает `VerdeectAuthGuard` из DI (`@Optional()`);
  - guard сопоставляет `Principal` с `Subject`, вызывает `checkMany` и переводит `Decision` и ошибки в `HttpException` по таблице §5.4;
  - декоратор общается с guard'ом только через метаданные `Reflector`.
- **Testing → ядро:** `createFakePlatform` строит настоящий `PlatformAuthzClient`, но с транспортом в памяти. Ответы этого транспорта собираются по правилам Platform из копии каталога. Поэтому кэш, `minEpoch` и `onPolicyChanged` в тестах потребителя работают так же, как в production.
- **Сборка и загрузка:**
  - `exports`: `"."` → `dist/core/index.*`, `"./nest"` → `dist/nest/index.*` (`types` + `default`);
  - `"./testing"` — `types` + `development`, без `default`.

## Ключевые принципы

1. **Решение — локально, Platform — источник снимка.** `check` и `checkMany` не вызывают `/v1/authz/check`. Нагрузка — один `permissions` на `(участник, act)` за TTL. Сверх этого — только повторные чтения по событию, по `pep > epoch` и по `fresh` (D3, G2).
2. **Fail-closed.** Истёкший снимок не отдаётся. Если годного снимка нет, ошибка недоступности уходит вызывающему, а guard отвечает 503. Отказ по праву никогда не превращается в разрешение из-за сбоя (D6).
3. **Свежесть монотонна.** `lastSeenEpoch` только растёт. Снимок с более высокой эпохой не затирается более низкой. Каждый запрос несёт `minEpoch`. Шаги §5.2 и «Приёма ответа» в коде идут в порядке PRD, номера шагов указаны в комментариях.
4. **Сбой инфраструктуры ≠ ошибка контракта ≠ отказ.** `PlatformUnavailableError` — сеть, таймаут, 5xx, повторный 401. `PlatformContractError` — 4xx, ответ не по схеме, локальные `UNKNOWN_PERMISSION`, `PEP_REQUIRED`, `VALIDATION_FAILED`. Отказ — `Decision`. Ошибки не кэшируются.
5. **Ошибка конфигурации — громко и рано.** Неверные настройки дают `TypeError` при создании клиента, `@RequirePermission()` без прав — `TypeError` при объявлении. Значения параметров в сообщение не попадают.
6. **Детерминизм для тестов.** `fetch`, `clock`, `traceparent`, `logger` и `metrics` внедряются. В ядре нет глобального состояния, таймеров и `Date.now()` напрямую.
7. **Копии — только синхронизацией.** `codes.ts`, `catalog.ts` и `test/fixtures/*.schema.json` повторяют `verdeect-platform`, в шапке указаны источник и коммит. При расхождении правится источник, затем PRD, затем копия.
8. **Без секретов и окружений.** `baseUrl`, `tokenUrl`, `clientId` и `clientSecret` передаёт сервис. Токен, `Authorization` и секрет не попадают ни в лог, ни в текст ошибки (AC-19).
9. **Контракт стабилен.** Контракт Platform `v1` соответствует пакету `1.x`. Сигнатуры экспортов, коды, тексты и статусы guard меняются только мажорной версией (NFR-5).
10. **TSDoc у каждого публичного экспорта** — это документация для IDE потребителя через `.d.ts`.

## Организация кода

- **Новый код** следует этому документу. Сейчас репозиторий пуст: код появляется с E1.
- **Порядок создания на E1:**
  1. `types` → `codes` → `errors` → `schemas`;
  2. `options` → `transport` → `token-provider`;
  3. `cache` → `decide` → `client` → `index`;
  4. тесты U рядом по ходу, perf — в конце.
- **E2:** `responses` → `require-permission.decorator` → `permission.guard` → `platform-authz.module`, затем `catalog` → `fake-platform`, затем проект-потребитель.
- **Компоненты** создаются через `nestjs-code generic <path>`.

## Примеры кода

### Ядро: только zod, отказ — значение, сбой — исключение

```ts
// src/core/decide.ts — локальное решение по снимку (prd.md §5.2, D5)
import { messageOf } from './codes.js';
import { PlatformContractError } from './errors.js';
import type { Decision, DecisionCode, PermissionsResponse, Subject } from './types.js';

function deny(snapshot: PermissionsResponse, code: DecisionCode): Decision {
    return { allow: false, epoch: snapshot.epoch, memberId: snapshot.memberId, code, message: messageOf(code) };
}

/** Шаги 3–6 §5.2 для одного права по готовому снимку. */
export function decideOne(
    snapshot: PermissionsResponse,
    subject: Subject,
    permission: string,
): Decision {
    // Шаг 3: общий отказ — право не проверяется.
    if (!snapshot.allow) {
        return { allow: false, epoch: snapshot.epoch, memberId: snapshot.memberId, code: snapshot.code, message: snapshot.message };
    }
    // Шаг 4: право вне каталога.
    if (!snapshot.permissions.includes(permission) && !(permission in snapshot.denied)) {
        throw new PlatformContractError('UNKNOWN_PERMISSION', { permission });
    }
    // Шаг 5 (pep < epoch): контекст агента отозван.
    if (subject.act === 'agent' && subject.pep !== undefined && subject.pep < snapshot.epoch) {
        return deny(snapshot, 'CONTEXT_REVOKED');
    }
    // Шаг 6.
    if (snapshot.permissions.includes(permission)) {
        return { allow: true, epoch: snapshot.epoch, memberId: snapshot.memberId };
    }
    return deny(snapshot, snapshot.denied[permission] ?? 'FORBIDDEN');
}
```

### Схемы внутренние, публичные типы — интерфейсы

```ts
// src/core/schemas.ts — zod-схемы ответа permissions (prd.md §3.2); не экспортируются из index.ts
import { z } from 'zod';
import type { PermissionsResponse } from './types.js';

const permissionsResponseSchema = z.discriminatedUnion('allow', [
    allowedSnapshotSchema,
    deniedSnapshotSchema,
]) satisfies z.ZodType<PermissionsResponse>;

/** Ответ permissions по схеме §3.2 или `undefined`; наружу — только наши типы, в .d.ts нет zod. */
export function parsePermissionsResponse(value: unknown): PermissionsResponse | undefined {
    const result = permissionsResponseSchema.safeParse(value);
    return result.success ? result.data : undefined;
}
```

### Адаптер NestJS зависит от ядра и `@verdeect/auth`, а не наоборот

```ts
// src/nest/permission.guard.ts — PermissionGuard (prd.md §5.4, D11)
import { Inject, Injectable, Optional, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { principalOf, VerdeectAuthGuard } from '@verdeect/auth/nest'; // ✅ peer, та же копия, что у сервиса
import { PlatformUnavailableError, type PlatformAuthzClient } from '../core/index.js'; // ✅ nest → ядро
// import { createFakePlatform } from '../testing/index.js';            // ❌ testing в production-графе
import { PLATFORM_AUTHZ_CLIENT } from './platform-authz.module.js';

@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(
        @Inject(PLATFORM_AUTHZ_CLIENT) private readonly client: PlatformAuthzClient,
        private readonly reflector: Reflector,
        @Optional() private readonly authGuard?: VerdeectAuthGuard,
    ) {}
    // ...
}
```

### Ядро не знает о Nest

```ts
// src/core/client.ts
import { z } from 'zod';                                   // ✅
// import { Logger } from '@nestjs/common';                 // ❌ ядро без Nest — logger внедряется
// import type { Principal } from '@verdeect/auth';         // ❌ ядро принимает Subject, сопоставление — в nest
```

### `testing` закрыт для production

```json
"exports": {
    ".":         { "types": "./dist/core/index.d.ts",    "default": "./dist/core/index.js" },
    "./nest":    { "types": "./dist/nest/index.d.ts",    "default": "./dist/nest/index.js" },
    "./testing": { "types": "./dist/testing/index.d.ts", "development": "./dist/testing/index.js" },
    "./package.json": "./package.json"
}
```

## Антипаттерны

- ❌ Импорт `@nestjs/*`, `rxjs`, `reflect-metadata` или `@verdeect/auth` в `src/core`, даже `import type`.
- ❌ Импорт `testing` из ядра или `nest`. `default` у `./testing` в `exports`.
- ❌ `console.*`, `Logger` Nest, HTTP-статусы или `HttpException` в ядре.
- ❌ Вызов `POST /v1/authz/check` из `check`. Передача `pep`, `asid` или `wid` в Platform.
- ❌ Отдача снимка с истёкшим сроком при недоступном Platform. Подмена ошибки `fresh` или `raw.*` кэшем (D6).
- ❌ Кэширование неудач: токена, ответа не по схеме, `PlatformContractError`.
- ❌ Затирание снимка или `lastSeenEpoch` более низкой эпохой. Объединение запроса с другим запросом, у которого меньший `minEpoch` или прошлое «поколение» `clear()`.
- ❌ Исключение из `onPolicyChanged` на неверном конверте. Строгая схема события, которая пропустит сброс из-за нового поля или `reason`.
- ❌ `Date.now()` или глобальный `fetch` в ядре в обход внедрённых `clock` и `fetch`. Таймеры — только таймаут HTTP-запроса (`setTimeout` + `AbortController`, `clearTimeout` в `finally`).
- ❌ `sub`, `tenantId` или текст ошибки в метках метрик. Токен, `Authorization` или `clientSecret` в логе.
- ❌ Регистрация `PermissionGuard` через `APP_GUARD` (D11). Решение по праву на маршруте без `@RequirePermission`.
- ❌ Ручная правка копий `codes.ts` и `catalog.ts`, перевод или перефразирование текстов отказов.
- ❌ Тип `PermissionKey` или перечень прав в публичном API (N6).
- ❌ Публичный экспорт без TSDoc, без записи в README и CHANGELOG.
- ❌ Слои сервиса из `nestjs-specialist` (`modules/`, `use-cases/`, `repositories/`, `shared/`), `@nestjs/config`, `nestjs-pino`, `prom-client`, Docker в пакете.
- ❌ Testcontainers в слое U и в CI (D10).
- ❌ Jest, CommonJS, `require()`, source map в архиве.
