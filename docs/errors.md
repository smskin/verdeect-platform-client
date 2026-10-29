# Ошибки и отказы

[← README](../README.md)

Отказ по праву — значение `Decision` с `allow: false`, а не исключение. Исключений два вида: `PlatformUnavailableError` (инфраструктура) и `PlatformContractError` (конфигурация или контракт). Неудачи не кэшируются.

## Коды решений

| `code`                 | `message`                                                      |
| ---------------------- | -------------------------------------------------------------- |
| `NOT_MEMBER`           | «Нет доступа к компании.»                                      |
| `COMPANY_SUSPENDED`    | «Компания приостановлена.»                                     |
| `ACCOUNT_DISABLED`     | «Учётная запись заблокирована.»                                |
| `SEATS_EXCEEDED`       | «Превышено число мест по тарифу. Обратитесь к администратору.» |
| `CONTEXT_REVOKED`      | «Контекст отозван. Нужен новый диалог.»                        |
| `FORBIDDEN`            | «Недостаточно прав.»                                           |
| `PLAN_MODULE`          | «Возможность не входит в тариф компании.»                      |
| `MODULE_DISABLED`      | «Раздел отключён. Данные сохранены.»                           |
| `PLATFORM_UNAVAILABLE` | «Сервис прав временно недоступен. Повторите позже»             |

Тексты совпадают с Platform дословно (D9). `NOT_MEMBER`, `COMPANY_SUSPENDED`, `ACCOUNT_DISABLED`, `SEATS_EXCEEDED`, `CONTEXT_REVOKED` — общий отказ (`GeneralDenyCode`): право не проверяется. `FORBIDDEN`, `PLAN_MODULE`, `MODULE_DISABLED` — отказ по конкретному праву. `PLATFORM_UNAVAILABLE` — код пакета, не Platform.

## `PlatformUnavailableError`

`code = 'PLATFORM_UNAVAILABLE'`. Когда возникает:

- Platform: сеть, таймаут (`requestTimeoutMs`), 5xx, 401 после одного перезапроса токена;
- Identity (`clientCredentials`): сеть, таймаут, 5xx, 429.

## `PlatformContractError`

`code` — код Platform, код OAuth или локальный код:

| `code`                                         | Когда                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `SCOPE_REQUIRED`, `FORBIDDEN` (403)            | у сервисного токена нет `platform:authz` или это не сервисный токен                                           |
| `HTTP_404` и прочие `HTTP_<status>`            | 4xx без кода Platform, например неверный `baseUrl`                                                            |
| `VALIDATION_FAILED`, `TENANT_MISMATCH` (422)   | Platform отклонил тело запроса                                                                                |
| `INVALID_RESPONSE`                             | ответ Platform или Identity не по схеме или не JSON (в том числе известный ключ `limits` не `number \| null`) |
| `UNKNOWN_PERMISSION`                           | локально: права нет в каталоге снимка (`details.permission`)                                                  |
| `PEP_REQUIRED`                                 | локально: агент без `pep`                                                                                     |
| `VALIDATION_FAILED`                            | локально: `pep` не целое ≥ 1, пустой список `checkMany`                                                       |
| поле `error` ответа OAuth (`invalid_client` …) | Identity: 4xx кроме 429                                                                                       |

Ошибка контракта — без повтора, в кэш не пишется, лог `error` не чаще раза в 60 с на код.

## Fail-closed (D6)

- Platform недоступен и годного снимка нет → `PlatformUnavailableError`. Снимок с истёкшим сроком не используется.
- Снимок ещё годен → решение из него.
- Повторное чтение по `pep > epoch` при недоступном Platform → решение по годному снимку, `warn PLATFORM_UNAVAILABLE`; следующая попытка — не раньше чем через `denyTtlSec`.
- `permissions({fresh: true})` и `raw.*` — ошибка передаётся вызывающему, кэш не подменяет ответ.

## Что делает guard

| Ошибка / решение            | Ответ guard                                      |
| --------------------------- | ------------------------------------------------ |
| `Decision` с `allow: false` | 403 с кодом и текстом решения                    |
| `PlatformUnavailableError`  | 503 `PLATFORM_UNAVAILABLE`                       |
| `PlatformContractError`     | 500 `INTERNAL_ERROR` «Внутренняя ошибка сервиса» |

Внутренняя причина клиенту не раскрывается. Полная таблица ответов — [nestjs.md](nestjs.md#ответы-guard).

## Неверные настройки

`createPlatformAuthzClient` с параметром вне ограничений ([getting-started.md](getting-started.md)) → `TypeError` с именами параметров, без значений. `@RequirePermission()` без прав → `TypeError` при объявлении.

## `onPolicyChanged`

Не бросает исключений: неверный конверт → `warn` и метрика `invalid`, кэш цел.
