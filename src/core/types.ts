// Публичные типы контракта Platform и API пакета (prd.md §3.2, §5.1); без zod — схемы в schemas.ts.
import type { DecisionCode } from './codes.js';

export type { DecisionCode };

/** Тип участника: человек или агент. */
export type Act = 'human' | 'agent';

/** Код общего отказа снимка: относится ко всем правам сразу (prd.md §3.2). */
export type GeneralDenyCode =
    'NOT_MEMBER' | 'COMPANY_SUSPENDED' | 'ACCOUNT_DISABLED' | 'SEATS_EXCEEDED' | 'CONTEXT_REVOKED';

/** Код отказа по конкретному праву из `denied` снимка (prd.md §3.2). */
export type PermissionDenyCode = 'FORBIDDEN' | 'PLAN_MODULE' | 'MODULE_DISABLED';

/** Участник, для которого принимается решение. */
export interface Subject {
    /** Идентификатор учётной записи (`sub` токена). */
    readonly sub: string;
    /** Slug компании. */
    readonly tenant: string;
    /** Идентификатор компании. */
    readonly tenantId: string;
    /** Тип участника. */
    readonly act: Act;
    /** Эпоха политики контекста агента: только для агента, в Platform не передаётся (D5). */
    readonly pep?: number;
    /** Сессия агента: только для лога `debug` (prd.md §3.2). */
    readonly asid?: string;
    /** Рабочее пространство агента: только для лога `debug` (prd.md §3.2). */
    readonly wid?: string | null;
}

/** Состояние модуля компании в снимке. */
export interface ModuleState {
    /** Идентификатор модуля. */
    readonly id: string;
    /** Модуль включён. */
    readonly enabled: boolean;
    /** Причина, по которой модуль недоступен. */
    readonly code?: 'PLAN_MODULE' | 'MODULE_DISABLED';
}

/** Снимок-разрешение: участник активен, права перечислены (prd.md §3.2). */
export interface AllowedPermissions {
    /** Признак разрешения. */
    readonly allow: true;
    /** Эпоха политики компании, целое ≥ 1. */
    readonly epoch: number;
    /** Идентификатор участника компании. */
    readonly memberId: string;
    /** Роли участника. */
    readonly roles: readonly string[];
    /** Выданные права. */
    readonly permissions: readonly string[];
    /** Права каталога, которые не выданы, с кодом причины. */
    readonly denied: Readonly<Record<string, PermissionDenyCode>>;
    /** Модули компании. */
    readonly modules: readonly ModuleState[];
    /** Лимиты тарифа. */
    readonly limits: {
        /** Максимальный размер файла в МБ или `null` — без ограничения. */
        readonly fileSizeMb: number | null;
    };
}

/** Снимок с общим отказом: решение одно для всех прав (prd.md §3.2). */
export interface DeniedPermissions {
    /** Признак отказа. */
    readonly allow: false;
    /** Эпоха политики компании или `null`, если компании нет. */
    readonly epoch: number | null;
    /** Идентификатор участника, если он известен. */
    readonly memberId?: string;
    /** Код общего отказа. */
    readonly code: GeneralDenyCode;
    /** Текст отказа. */
    readonly message: string;
    /** Всегда пусто. */
    readonly roles: readonly [];
    /** Всегда пусто. */
    readonly permissions: readonly [];
    /** Всегда пусто. */
    readonly denied: Readonly<Record<string, never>>;
    /** Всегда пусто. */
    readonly modules: readonly [];
    /** Лимитов нет. */
    readonly limits: {
        /** Всегда `null`. */
        readonly fileSizeMb: null;
    };
}

/** Ответ `POST /v1/authz/permissions` — снимок прав участника (prd.md §3.2). */
export type PermissionsResponse = AllowedPermissions | DeniedPermissions;

/** Решение по одному праву. Отказ — значение, а не исключение. */
export type Decision =
    | { readonly allow: true; readonly epoch: number; readonly memberId: string }
    | {
          readonly allow: false;
          readonly epoch: number | null;
          readonly memberId?: string;
          readonly code: DecisionCode;
          readonly message: string;
      };

/** Источник access-токена для Platform (D8). */
export interface TokenProvider {
    /**
     * Возвращает токен. При `refresh: true` — токен, выданный после вызова: кэш провайдера
     * сбрасывается (prd.md §5.1).
     */
    getToken(options?: { readonly refresh?: boolean }): Promise<string>;
}

/** Логгер с сигнатурой pino. Без логгера ядро молчит. */
export interface PlatformClientLogger {
    /** Подробные события. */
    debug(obj: object, msg?: string): void;
    /** Предупреждения. */
    warn(obj: object, msg?: string): void;
    /** Ошибки. */
    error(obj: object, msg?: string): void;
}

/** Метка конечной точки в метриках. */
export type MetricsEndpoint = 'permissions' | 'check' | 'batch' | 'token';

/** Итог запроса в метриках. */
export type MetricsRequestResult = 'ok' | 'unavailable' | 'contract_error';

/** Приёмник метрик клиента; метки — только значения из типа. */
export interface PlatformClientMetrics {
    /** Результат обращения к кэшу снимков. */
    cacheResult(result: 'hit' | 'miss' | 'stale'): void;
    /** HTTP-запрос: конечная точка, итог и длительность в секундах. */
    request(endpoint: MetricsEndpoint, result: MetricsRequestResult, seconds: number): void;
    /** Обработка события `platform.policy.changed`. */
    policyEvent(result: 'applied' | 'ignored' | 'invalid'): void;
}

/** Настройки `createPlatformAuthzClient` (prd.md §5.1). */
export interface PlatformAuthzClientOptions {
    /** Базовый URL Platform. */
    readonly baseUrl: string;
    /** Источник токена. */
    readonly tokenProvider: TokenProvider;
    /** TTL снимка-разрешения, секунды: 1…60, по умолчанию 60. */
    readonly cacheTtlSec?: number;
    /** TTL общего отказа и окно повторного чтения, секунды: 1…5, по умолчанию 5. */
    readonly denyTtlSec?: number;
    /** Предел числа снимков в кэше: ≥ 100, по умолчанию 50 000. */
    readonly maxEntries?: number;
    /** Таймаут HTTP-запроса, мс: ≥ 100, по умолчанию 2000. */
    readonly requestTimeoutMs?: number;
    /** Реализация `fetch`, по умолчанию глобальная. */
    readonly fetch?: typeof fetch;
    /** Часы в миллисекундах, по умолчанию `Date.now`. */
    readonly clock?: () => number;
    /** Источник заголовка `traceparent` для исходящих запросов. */
    readonly traceparent?: () => string | undefined;
    /** Логгер; без него ядро не пишет логов. */
    readonly logger?: PlatformClientLogger;
    /** Метрики; без них ничего не считается. */
    readonly metrics?: PlatformClientMetrics;
}

/** Параметры чтения снимка. */
export interface PermissionsOptions {
    /** Прочитать мимо кэша; ошибка уходит вызывающему (D6). */
    readonly fresh?: boolean;
}

/** Прямые вызовы Platform: тело как есть, кэш не трогается. */
export interface PlatformAuthzRaw {
    /** `POST /v1/authz/check`. */
    check(body: object): Promise<unknown>;
    /** `POST /v1/authz/batch`. */
    batch(body: object): Promise<unknown>;
    /** `POST /v1/authz/permissions`, ответ проверяется схемой. */
    permissions(body: object): Promise<PermissionsResponse>;
}

/** Клиент авторизации Platform (prd.md §5.1). */
export interface PlatformAuthzClient {
    /** Решение по одному праву из кэша снимка. */
    check(subject: Subject, permission: string): Promise<Decision>;
    /** Решения по нескольким правам из одного снимка. */
    checkMany(subject: Subject, permissions: readonly string[]): Promise<Record<string, Decision>>;
    /** Снимок прав участника. */
    permissions(
        subject: Omit<Subject, 'pep'>,
        options?: PermissionsOptions,
    ): Promise<PermissionsResponse>;
    /** Принимает конверт `platform.policy.changed` и сбрасывает затронутые снимки; не бросает. */
    onPolicyChanged(envelope: unknown): void;
    /** Сбрасывает кэш снимков и `lastSeenEpoch`. */
    clear(): void;
    /** Прямые вызовы Platform. */
    readonly raw: PlatformAuthzRaw;
}

/** Настройки `clientCredentials` (prd.md §5.1). */
export interface ClientCredentialsOptions {
    /** URL token endpoint Identity. */
    readonly tokenUrl: string;
    /** Идентификатор клиента. */
    readonly clientId: string;
    /** Секрет клиента (`client_secret_basic`). */
    readonly clientSecret: string;
    /** Запрашиваемый scope. */
    readonly scope: string;
    /** Ресурс (audience) токена. */
    readonly resource: string;
    /** Реализация `fetch`, по умолчанию глобальная. */
    readonly fetch?: typeof fetch;
    /** Часы в миллисекундах, по умолчанию `Date.now`. */
    readonly clock?: () => number;
    /** Таймаут запроса, мс: ≥ 100, по умолчанию 2000. */
    readonly requestTimeoutMs?: number;
    /** Пишет `request('token', …)` только на HTTP-запрос к Identity (prd.md v1.8 §5.1). */
    readonly metrics?: Pick<PlatformClientMetrics, 'request'>;
}
