# Changelog

Все заметные изменения `@verdeect/platform-client`. Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [Semantic Versioning](https://semver.org/lang/ru/). У мажорной версии есть раздел «Как обновиться».

## [Unreleased]

Ядро клиента (этап E1). Раздел станет выпуском `1.0.0` на этапе E3 (prd.md §9).

### Added

- `createPlatformAuthzClient` — создаёт клиента: решение по праву из кэша снимка `POST /v1/authz/permissions`, свежесть через `minEpoch`, сброс по `platform.policy.changed`.
- `clientCredentials` — `TokenProvider` по OAuth 2.0 client credentials (`client_secret_basic`) с кэшем до `exp − 30 с` и `refresh`.
- `PlatformUnavailableError` — Platform или Identity недоступны (сеть, таймаут, 5xx, 429 Identity, повторный 401); решение не принимается (fail-closed).
- `PlatformContractError` — нарушение контракта или конфигурации: код Platform, код OAuth или локальный код (`UNKNOWN_PERMISSION`, `PEP_REQUIRED`, `VALIDATION_FAILED`, `INVALID_RESPONSE`, `HTTP_<status>`).
- Тип `UnavailableReason` — причина недоступности в `PlatformUnavailableError.reason`.
- Тип `Act` — вид участника: `human` или `agent`.
- Тип `Subject` — участник, для которого принимается решение.
- Тип `AllowedPermissions` — снимок-разрешение с выданными правами, отказами по праву, модулями и лимитами.
- Тип `DeniedPermissions` — снимок с общим отказом для всех прав.
- Тип `PermissionsResponse` — ответ `permissions`: разрешение или общий отказ.
- Тип `ModuleState` — состояние модуля компании в снимке.
- Тип `Decision` — решение по одному праву; отказ — значение, а не исключение.
- Тип `DecisionCode` — код отказа в `Decision`, дословно как у Platform.
- Тип `GeneralDenyCode` — код общего отказа снимка.
- Тип `PermissionDenyCode` — код отказа по конкретному праву.
- Тип `PlatformAuthzClient` — клиент: `check`, `checkMany`, `permissions`, `onPolicyChanged`, `clear`, `raw`.
- Тип `PlatformAuthzClientOptions` — настройки клиента; неверные значения дают `TypeError` с именами параметров.
- Тип `PermissionsOptions` — параметры чтения снимка (`fresh`).
- Тип `PlatformAuthzRaw` — прямые вызовы `check`, `batch`, `permissions` без кэша.
- Тип `TokenProvider` — источник access-токена для Platform.
- Тип `ClientCredentialsOptions` — настройки `clientCredentials`.
- Тип `PlatformClientLogger` — внедряемый логгер с сигнатурой pino.
- Тип `PlatformClientMetrics` — внедряемый приёмник метрик кэша, запросов и событий.
- Тип `MetricsEndpoint` — метка конечной точки в метриках.
- Тип `MetricsRequestResult` — итог запроса в метриках.
- TSDoc у каждого публичного экспорта.
