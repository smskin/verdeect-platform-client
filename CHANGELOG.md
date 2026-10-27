# Changelog

Все заметные изменения `@verdeect/platform-client`. Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [Semantic Versioning](https://semver.org/lang/ru/). У мажорной версии есть раздел «Как обновиться».

## [Unreleased]

## [1.0.0] - 2026-10-28

Первый выпуск: ядро (E1), адаптер NestJS и подделка Platform (E2), контрактные тесты и выпуск через CI (E3). Контракт Platform `v1` (PRD Platform v1.11); слой C пройден на `verdeect-platform` `7adb423`.

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
- `./nest`: `PlatformAuthzModule` — глобальный модуль `forRoot`/`forRootAsync`: клиент из настроек или готовый; без `logger` — обёртка над `Logger('PlatformAuthz')`.
- `./nest`: `PLATFORM_AUTHZ_CLIENT` — токен DI клиента.
- `./nest`: `RequirePermission` — декоратор прав маршрута (`SetMetadata` + `UseGuards(PermissionGuard)`); без прав или с пустой строкой — `TypeError` при объявлении.
- `./nest`: `PermissionGuard` — guard маршрута: `Principal` (или вызов `VerdeectAuthGuard` из DI) → `Subject`, один `checkMany`, ответы 403/409/500/503 по prd.md §5.4, `request.platformDecision`.
- `./nest`: тип `PlatformAuthzModuleOptions` — параметры `forRoot`.
- `./nest`: тип `PlatformAuthzModuleAsyncOptions` — параметры `forRootAsync` (`imports`, `inject`, `useFactory`).
- `./nest`: тип `PlatformDecision` — `{memberId, epoch}` в `request.platformDecision`.
- `./testing`: `createFakePlatform` — подделка Platform: настоящий клиент ядра с транспортом в памяти, `grant`, `deny`, `setModule`, `setEpoch`, `policyChanged`, `calls`.
- `./testing`: тип `FakePlatform` — подделка и её клиент.
- `./testing`: тип `FakePlatformOptions` — начальные компании и участники; повтор `(tenantId, sub)` в `members` — `TypeError`.
- `./testing`: тип `FakeMember` — участник компании подделки.
- `./testing`: тип `FakeCompany` — компания подделки: `tenant`, `epoch`, состояния модулей. `tenant` по умолчанию — slug из `tenantId`; `tenant` вне шаблона slug Platform (явный или выведенный) — `TypeError` при создании подделки.
- `./testing`: тип `FakeModuleState` — `enabled`, `PLAN_MODULE` или `MODULE_DISABLED`.
- `./testing`: тип `FakeCall` — запрос клиента к подделке (`path`, `body`).
- Подпуть `./testing` грузится только с условием экспорта `development` (Vitest ставит его сам); без него импорт падает с `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- TSDoc у каждого публичного экспорта.
- README и `docs/` — подключение ядра и NestJS, тесты потребителя, ошибки, выпуск; таблица совместимости с контрактом Platform.
