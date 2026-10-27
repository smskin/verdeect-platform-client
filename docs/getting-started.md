# Ядро: клиент Platform

[← README](../README.md)

Ядро (`@verdeect/platform-client`) решает, есть ли у участника право, локально из кэша снимка `POST /v1/authz/permissions` Platform. `POST /v1/authz/check` на каждое действие не вызывается (D3). Ядро не зависит от NestJS. Подключение к NestJS — [nestjs.md](nestjs.md).

## 1. Установка

Версия указывается точно (D1):

```bash
pnpm add @verdeect/platform-client@1.0.0
```

Ядру нужен только `zod` — он приходит вместе с пакетом. Peer-зависимости (`@nestjs/*`, `@verdeect/auth`, `reflect-metadata`, `rxjs`) нужны только подпути `nest`.

## 2. Клиент

```ts
import { clientCredentials, createPlatformAuthzClient } from '@verdeect/platform-client';

const client = createPlatformAuthzClient({
  baseUrl: 'http://platform:3000',
  tokenProvider: clientCredentials({
    tokenUrl: process.env.IDENTITY_TOKEN_URL ?? '', // token endpoint Identity
    clientId: 'verdeect-files',
    clientSecret: process.env.PLATFORM_CLIENT_SECRET ?? '',
    scope: 'platform:authz',
    resource: 'https://api.verdeect.ru',
  }),
});
```

### Настройки `createPlatformAuthzClient`

| Параметр           | Значение                                                      | По умолчанию |
| ------------------ | ------------------------------------------------------------- | ------------ |
| `baseUrl`          | абсолютный `http(s)` URL без завершающего `/`                 | —            |
| `tokenProvider`    | `TokenProvider` (D8)                                          | —            |
| `cacheTtlSec`      | целое 1…60 — срок позитивного снимка                          | 60           |
| `denyTtlSec`       | целое 1…5 — срок общего отказа                                | 5            |
| `maxEntries`       | целое ≥ 100 — размер LRU снимков                              | 50 000       |
| `requestTimeoutMs` | целое ≥ 100 — таймаут запроса к Platform                      | 2000         |
| `fetch`, `clock`   | внедрение для тестов                                          | глобальные   |
| `traceparent`      | `() => string \| undefined` — заголовок `traceparent` запроса | нет          |
| `logger`           | `{debug, warn, error}` с сигнатурой pino                      | нет — тишина |
| `metrics`          | `PlatformClientMetrics`                                       | нет          |

Нарушение ограничений → `TypeError` из `createPlatformAuthzClient` с именами неверных параметров, без их значений.

## 3. Сервисный токен: `clientCredentials`

`clientCredentials` получает токен у Identity: `POST tokenUrl`, `grant_type=client_credentials&scope=…&resource=…`, секрет — только `client_secret_basic` (`Authorization: Basic`). Токен кэшируется до `exp − 30 с`, одновременные `getToken` — один запрос. Область токена должна включать `platform:authz`.

Своя реализация `TokenProvider` допустима (D8): `getToken({refresh: true})` обязан вернуть токен, выданный после вызова. Пакет вызывает его так только при ответе 401 от Platform, один раз на запрос.

## 4. Решение по праву

```ts
const subject = { sub: 'acc_1', tenant: 'acme', tenantId: 'org_acme', act: 'human' } as const;

const decision = await client.check(subject, 'native.files.read');
if (!decision.allow) {
  // decision.code — код отказа, decision.message — текст для пользователя (errors.md)
}

const many = await client.checkMany(subject, ['chat.office', 'chat.images']); // один снимок
const snapshot = await client.permissions(subject); // снимок целиком (кэш)
const fresh = await client.permissions(subject, { fresh: true }); // мимо кэша пакета
```

| Метод                           | Что делает                                                                 |
| ------------------------------- | -------------------------------------------------------------------------- |
| `check(subject, p)`             | решение по снимку (§5.2); отказ — значение `Decision`, не исключение       |
| `checkMany(subject, ps)`        | один снимок на вызов; ключи результата — в порядке запроса                 |
| `permissions(subject, {fresh})` | снимок; `fresh: true` — запрос мимо кэша, ошибка не подменяется кэшем (D6) |
| `raw.check/batch/permissions`   | прямой вызов Platform без кэша; `raw.permissions` проверяет ответ схемой   |
| `onPolicyChanged(envelope)`     | сброс снимков по событию (ниже)                                            |
| `clear()`                       | удаляет все снимки и `lastSeenEpoch`                                       |

Агенту (`act: 'agent'`) нужен `pep` из токена: без него — `PlatformContractError` `PEP_REQUIRED`. `pep` в Platform не передаётся: `pep < epoch` снимка → `CONTEXT_REVOKED`, `pep > epoch` → один запрос `permissions` с `minEpoch` (D5).

## 5. Событие `platform.policy.changed`

Пакет к RabbitMQ не подключается (D7). Сервис подписан на `platform.policy.changed` сам и передаёт конверт:

```ts
channel.consume(queue, (message) => {
  if (message !== null) {
    client.onPolicyChanged(JSON.parse(message.content.toString()));
    channel.ack(message);
  }
});
```

`onPolicyChanged` исключений не бросает: неверный конверт — `warn` и метрика `invalid`. Сбрасываются снимки компании (или только `subs`) с эпохой ниже эпохи события.

## 6. Кэш и свежесть

- Позитивный снимок живёт `cacheTtlSec`, общий отказ — `denyTtlSec`. Истёкший снимок не отдаётся (D6).
- Каждый запрос `permissions` передаёт `minEpoch` — наибольшую известную эпоху компании (`lastSeenEpoch` из событий и ответов). Platform не отдаёт снимок старше неё.
- Одновременные запросы одного участника объединяются.
- Граница отзыва (G3): событие доходит до кэша за доли секунды; если событие потеряно только у сервиса — не позже 60 с, если и у реплики Platform — не позже 90 с.

## 7. Логи и метрики

`logger` — сигнатура pino, `nestjs-pino` подходит напрямую. В лог попадают `sub`, `tenantId`, `permission`, `code`, `endpoint`; токены и секреты — никогда (NFR-3).

`metrics` — приёмник событий; пакет не зависит от `prom-client`. Адаптер:

```ts
import { Counter, Histogram } from 'prom-client';
import type { PlatformClientMetrics } from '@verdeect/platform-client';

const cache = new Counter({
  name: 'platform_client_cache_total',
  help: 'Кэш снимков',
  labelNames: ['result'],
});
const requests = new Counter({
  name: 'platform_client_requests_total',
  help: 'Запросы к Platform и Identity',
  labelNames: ['endpoint', 'result'],
});
const duration = new Histogram({
  name: 'platform_client_request_duration_seconds',
  help: 'Длительность запросов',
  labelNames: ['endpoint'],
});
const events = new Counter({
  name: 'platform_client_policy_events_total',
  help: 'События platform.policy.changed',
  labelNames: ['result'],
});

export const metrics: PlatformClientMetrics = {
  cacheResult: (result) => cache.inc({ result }),
  request: (endpoint, result, seconds) => {
    requests.inc({ endpoint, result });
    duration.observe({ endpoint }, seconds);
  },
  policyEvent: (result) => events.inc({ result }),
};
```

Тот же объект передаётся `clientCredentials({…, metrics})` — тогда считаются и запросы `token` к Identity.

## Дальше

- [nestjs.md](nestjs.md) — модуль, `@RequirePermission`, ответы guard.
- [errors.md](errors.md) — ошибки и коды отказов.
- [testing.md](testing.md) — подделка Platform для тестов сервиса.
