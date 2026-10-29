// Подделка Platform для тестов потребителя (prd.md §5.5, AC-8a, UC-3, UC-4): настоящий клиент ядра с транспортом в памяти.
import { decisionMessage } from '../core/codes.js';
import { LimitsSchema } from '../core/limits.js';
import {
    createPlatformAuthzClient,
    PlatformContractError,
    type GeneralDenyCode,
    type Limits,
    type ModuleState,
    type PermissionDenyCode,
    type PermissionsResponse,
    type PlatformAuthzClient,
} from '../core/index.js';
import {
    isModuleId,
    isPermissionKey,
    MODULE_CATALOG,
    moduleOfPermission,
    PERMISSION_KEYS,
    type ModuleId,
    type PermissionKey,
} from './catalog.js';

/** Состояние модуля компании в подделке: включён или недоступен с кодом причины. */
export type FakeModuleState = 'enabled' | 'PLAN_MODULE' | 'MODULE_DISABLED';

/** Участник компании, заведённый при создании подделки. */
export interface FakeMember {
    /** Идентификатор компании. */
    readonly tenantId: string;
    /** Идентификатор учётной записи (`sub` токена). */
    readonly sub: string;
    /** Выданные права; по умолчанию нет ни одного. */
    readonly permissions?: readonly string[];
    /** Идентификатор участника; по умолчанию `mem_` и `sub`. */
    readonly memberId?: string;
}

/** Компания, заведённая при создании подделки. */
export interface FakeCompany {
    /** Идентификатор компании. */
    readonly tenantId: string;
    /**
     * Slug компании по шаблону Platform `^_?[a-z0-9][a-z0-9-]{0,48}$`, иначе `TypeError` при создании
     * подделки. По умолчанию — slug из `tenantId`: строчные буквы, символ вне `[a-z0-9-]` → `-`,
     * не длиннее 49 символов (`org_acme` → `org-acme`). Если такой slug шаблону не отвечает (пустой
     * `tenantId`, первый символ вне `[a-z0-9]`), — `TypeError`: задайте `tenant` явно.
     */
    readonly tenant?: string;
    /** Эпоха политики, целое ≥ 1; по умолчанию 1. */
    readonly epoch?: number;
    /** Состояния модулей по идентификатору; по умолчанию все `enabled`. */
    readonly modules?: Readonly<Record<string, FakeModuleState>>;
    /**
     * Лимиты тарифа поверх умолчаний (семь ключей копии со значением `null`). Ключ вне копии или
     * значение не `null` и не целое ≥ 1 — `TypeError` при создании подделки.
     */
    readonly limits?: Partial<Limits>;
}

/** Начальное состояние подделки. */
export interface FakePlatformOptions {
    /** Участники компаний; повтор `(tenantId, sub)` — `TypeError`. */
    readonly members?: readonly FakeMember[];
    /** Компании с настройками, отличными от умолчаний. */
    readonly companies?: readonly FakeCompany[];
}

/** Запрос клиента к подделке. */
export interface FakeCall {
    /** Путь запроса, например `/v1/authz/permissions`. */
    readonly path: string;
    /** Разобранное JSON-тело запроса. */
    readonly body: unknown;
}

/**
 * Подделка Platform. Состояние меняется сразу, ответ строится в момент запроса. Снимок, уже
 * лежащий в кэше клиента, изменение не видит до `client.onPolicyChanged(policyChanged(...))`
 * или `client.clear()` — как в production.
 */
export interface FakePlatform {
    /** Клиент ядра с транспортом в памяти; неизвестное право в `check`/`checkMany` → `UNKNOWN_PERMISSION`. */
    readonly client: PlatformAuthzClient;
    /** Заменяет набор прав участника (заводит его при необходимости) и снимает общий отказ. */
    grant(tenantId: string, sub: string, permissions: readonly string[]): void;
    /** Ставит участнику общий отказ; принимает только коды общего отказа, иначе `TypeError`. */
    deny(tenantId: string, sub: string, code: GeneralDenyCode): void;
    /** Меняет состояние модуля компании. */
    setModule(tenantId: string, moduleId: string, state: FakeModuleState): void;
    /** Ставит эпоху политики компании, целое ≥ 1. */
    setEpoch(tenantId: string, epoch: number): void;
    /**
     * Сливает лимиты тарифа с текущими (заводит компанию при необходимости); `null` — без лимита.
     * Ключ вне копии или значение не `null` и не целое ≥ 1 — `TypeError`. Эпоху не меняет: смена
     * видна после TTL снимка или `client.clear()`.
     */
    setLimits(tenantId: string, limits: Partial<Limits>): void;
    /**
     * Поднимает эпоху компании на 1 и возвращает конверт `platform.policy.changed` по схеме Platform
     * для `client.onPolicyChanged`. С непустым `subs` — `reason: member_roles`, иначе `modules`.
     */
    policyChanged(tenantId: string, subs?: readonly string[]): unknown;
    /** Копия журнала запросов к подделке по порядку. */
    calls(): FakeCall[];
}

interface CompanyState {
    tenant: string;
    epoch: number;
    readonly modules: Map<ModuleId, FakeModuleState>;
    readonly limits: Record<string, number | null>;
}

interface MemberState {
    readonly memberId: string;
    permissions: ReadonlySet<PermissionKey>;
    denyCode: GeneralDenyCode | undefined;
}

const BASE_URL = 'http://fake-platform.invalid';
const PERMISSIONS_PATH = '/v1/authz/permissions';
const GENERAL_DENY_CODES: readonly string[] = [
    'NOT_MEMBER',
    'COMPANY_SUSPENDED',
    'ACCOUNT_DISABLED',
    'SEATS_EXCEEDED',
    'CONTEXT_REVOKED',
] satisfies readonly GeneralDenyCode[];
const MODULE_STATES: readonly string[] = [
    'enabled',
    'PLAN_MODULE',
    'MODULE_DISABLED',
] satisfies readonly FakeModuleState[];
// Шаблон slug Platform (platform-events.schema.json $defs.slug); §5.5 v1.10.
const SLUG = /^_?[a-z0-9][a-z0-9-]{0,48}$/;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// Ключи копии схемы Limits Platform (§5.5): по умолчанию у компании все null.
const LIMIT_KEYS = Object.keys(LimitsSchema.shape);
const PARTIAL_LIMITS = LimitsSchema.partial();

function defaultLimits(): Record<string, number | null> {
    return Object.fromEntries(LIMIT_KEYS.map((key) => [key, null]));
}

// tenant по умолчанию (§5.5 v1.10): конверт policyChanged проходит схему Platform.
function slugOf(tenantId: string): string {
    return tenantId
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .slice(0, 49);
}

// slug молча не исправляется (§5.5 v1.11): неподходящий — TypeError с подсказкой.
function defaultTenant(tenantId: string): string {
    const slug = slugOf(tenantId);
    if (!SLUG.test(slug)) {
        throw new TypeError(
            `platform-client/testing: slug from tenantId ${JSON.stringify(tenantId)} does not match ` +
                '^_?[a-z0-9][a-z0-9-]{0,48}$; ' +
                'set companies[].tenant explicitly',
        );
    }
    return slug;
}

function assertSlug(field: string, value: unknown): void {
    if (typeof value !== 'string' || !SLUG.test(value)) {
        throw new TypeError(
            `platform-client/testing: ${field} must match ^_?[a-z0-9][a-z0-9-]{0,48}$`,
        );
    }
}

function memberKey(tenantId: string, sub: string): string {
    return `${tenantId}\u0000${sub}`;
}

function assertEpoch(method: string, epoch: unknown): asserts epoch is number {
    if (typeof epoch !== 'number' || !Number.isInteger(epoch) || epoch < 1) {
        throw new TypeError(`platform-client/testing: ${method}: epoch must be an integer >= 1`);
    }
}

// §5.5: ключ вне копии или значение не null и не целое ≥ 1 → TypeError с именами ключей.
function parseLimits(method: string, limits: unknown): Record<string, number | null> {
    const result = PARTIAL_LIMITS.safeParse(limits);
    if (result.success) {
        return Object.fromEntries(
            Object.entries(result.data).filter(([, value]) => value !== undefined),
        ) as Record<string, number | null>;
    }
    const keys = result.error.issues.flatMap((issue) =>
        issue.code === 'unrecognized_keys' ? issue.keys : [issue.path.join('.') || '(root)'],
    );
    throw new TypeError(
        `platform-client/testing: ${method}: limits must have keys of Limits with null or ` +
            `an integer >= 1; invalid: ${keys.join(', ')}`,
    );
}

function assertModuleState(method: string, state: unknown): asserts state is FakeModuleState {
    if (typeof state !== 'string' || !MODULE_STATES.includes(state)) {
        throw new TypeError(
            `platform-client/testing: ${method}: state must be enabled, PLAN_MODULE or MODULE_DISABLED`,
        );
    }
}

function toPermissionKeys(method: string, permissions: readonly string[]): Set<PermissionKey> {
    const keys = new Set<PermissionKey>();
    for (const permission of permissions) {
        if (!isPermissionKey(permission)) {
            throw new TypeError(
                `platform-client/testing: ${method}: unknown permission ${permission}`,
            );
        }
        keys.add(permission);
    }
    return keys;
}

// evt_ + 26 символов Crockford base32 из счётчика: детерминированно и по шаблону схемы Platform.
function eventId(seq: number): string {
    let id = '';
    let rest = seq;
    for (let i = 0; i < 26; i += 1) {
        id = CROCKFORD.charAt(rest % 32) + id;
        rest = Math.floor(rest / 32);
    }
    return `evt_${id}`;
}

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function errorResponse(status: number, code: string, message: string): Response {
    return jsonResponse(status, { error: { code, message, details: {} } });
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
    if (typeof input === 'string' || input instanceof URL) {
        return new URL(input);
    }
    return new URL(input.url);
}

function parseBody(body: unknown): unknown {
    if (typeof body !== 'string') {
        return undefined;
    }
    try {
        return JSON.parse(body) as unknown;
    } catch {
        return undefined;
    }
}

function assertKnownPermissions(permissions: readonly string[]): void {
    // §5.5: неизвестное право — до ядра, при любом состоянии подделки.
    const unknown = permissions.find((permission) => !isPermissionKey(permission));
    if (unknown !== undefined) {
        throw new PlatformContractError('UNKNOWN_PERMISSION', { permission: unknown });
    }
}

/**
 * Создаёт подделку Platform для тестов потребителя (prd.md §5.5). Клиент — настоящий клиент
 * ядра: кэш, `minEpoch` и `onPolicyChanged` работают как в production. Ответ `permissions`
 * строится по правилам Platform из копии каталога. Неизвестный участник — `NOT_MEMBER`.
 * @param options Начальные компании и участники.
 */
export function createFakePlatform(options: FakePlatformOptions = {}): FakePlatform {
    const companies = new Map<string, CompanyState>();
    const members = new Map<string, MemberState>();
    const log: FakeCall[] = [];
    let eventSeq = 0;

    // Компания заводится по первому упоминанию со значениями по умолчанию (§5.5).
    // Явный tenant из companies проверяется до вывода slug из tenantId.
    function company(tenantId: string, tenant?: string): CompanyState {
        let state = companies.get(tenantId);
        if (state === undefined) {
            state = {
                tenant: tenant ?? defaultTenant(tenantId),
                epoch: 1,
                modules: new Map(),
                limits: defaultLimits(),
            };
            companies.set(tenantId, state);
        }
        return state;
    }

    function member(tenantId: string, sub: string, memberId?: string): MemberState {
        company(tenantId);
        const key = memberKey(tenantId, sub);
        let state = members.get(key);
        if (state === undefined) {
            state = {
                memberId: memberId ?? `mem_${sub}`,
                permissions: new Set(),
                denyCode: undefined,
            };
            members.set(key, state);
        }
        return state;
    }

    function setModule(tenantId: string, moduleId: string, state: FakeModuleState): void {
        if (!isModuleId(moduleId)) {
            throw new TypeError(`platform-client/testing: setModule: unknown module ${moduleId}`);
        }
        assertModuleState('setModule', state);
        company(tenantId).modules.set(moduleId, state);
    }

    for (const c of options.companies ?? []) {
        if (c.tenant !== undefined) {
            assertSlug('companies.tenant', c.tenant);
        }
        const state = company(c.tenantId, c.tenant);
        if (c.tenant !== undefined) {
            state.tenant = c.tenant;
        }
        if (c.epoch !== undefined) {
            assertEpoch('companies', c.epoch);
            state.epoch = c.epoch;
        }
        for (const [moduleId, moduleState] of Object.entries(c.modules ?? {})) {
            setModule(c.tenantId, moduleId, moduleState);
        }
        if (c.limits !== undefined) {
            Object.assign(state.limits, parseLimits('companies', c.limits));
        }
    }
    const declared = new Set<string>();
    for (const m of options.members ?? []) {
        const key = memberKey(m.tenantId, m.sub);
        if (declared.has(key)) {
            throw new TypeError(
                `platform-client/testing: members: duplicate (tenantId, sub) ${m.tenantId}/${m.sub}`,
            );
        }
        declared.add(key);
        member(m.tenantId, m.sub, m.memberId).permissions = toPermissionKeys(
            'members',
            m.permissions ?? [],
        );
    }

    // Ответ permissions по правилам Platform (§5.5; Platform evaluatePermission).
    function snapshotFor(tenantId: string, sub: string): PermissionsResponse {
        const companyState = companies.get(tenantId);
        const memberState = members.get(memberKey(tenantId, sub));
        // §5.5: разрешение и общий отказ несут лимиты компании; без компании — семь null.
        const limits = { fileSizeMb: null, ...(companyState?.limits ?? defaultLimits()) };
        const empty = {
            roles: [],
            permissions: [],
            denied: {},
            modules: [],
            limits,
        } as const;
        if (companyState === undefined || memberState === undefined) {
            const code = 'NOT_MEMBER';
            return {
                allow: false,
                epoch: companyState?.epoch ?? null,
                code,
                message: decisionMessage(code),
                ...empty,
            };
        }
        const { epoch } = companyState;
        const { memberId, denyCode } = memberState;
        if (denyCode !== undefined) {
            return {
                allow: false,
                epoch,
                memberId,
                code: denyCode,
                message: decisionMessage(denyCode),
                ...empty,
            };
        }
        const moduleState = (id: ModuleId): FakeModuleState =>
            companyState.modules.get(id) ?? 'enabled';
        const permissions: string[] = [];
        const denied: Record<string, PermissionDenyCode> = {};
        for (const permission of PERMISSION_KEYS) {
            const moduleId = moduleOfPermission(permission);
            const state = moduleId === null ? 'enabled' : moduleState(moduleId);
            if (!memberState.permissions.has(permission)) {
                denied[permission] = 'FORBIDDEN';
            } else if (state !== 'enabled') {
                denied[permission] = state;
            } else {
                permissions.push(permission);
            }
        }
        const modules: ModuleState[] = MODULE_CATALOG.map(({ id }) => {
            const state = moduleState(id);
            return state === 'enabled'
                ? { id, enabled: true }
                : { id, enabled: false, code: state };
        });
        return {
            allow: true,
            epoch,
            memberId,
            roles: [],
            permissions,
            denied,
            modules,
            limits,
        };
    }

    // Транспорт в памяти: только permissions; check, batch и прочее — 404 (→ PlatformContractError).
    async function fakeFetch(
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
    ): Promise<Response> {
        const { pathname } = requestUrl(input);
        const body = parseBody(init?.body);
        log.push({ path: pathname, body });
        if (pathname !== PERMISSIONS_PATH) {
            return errorResponse(404, 'NOT_FOUND', 'Not found');
        }
        const { sub, tenantId } = (body ?? {}) as { sub?: unknown; tenantId?: unknown };
        if (typeof sub !== 'string' || typeof tenantId !== 'string') {
            return errorResponse(422, 'VALIDATION_FAILED', 'Validation failed');
        }
        // minEpoch не нужен: подделка всегда отвечает текущей эпохой, как Platform после перечитывания.
        return jsonResponse(200, snapshotFor(tenantId, sub));
    }

    const core = createPlatformAuthzClient({
        baseUrl: BASE_URL,
        tokenProvider: { getToken: async () => 'fake-platform-token' },
        fetch: fakeFetch,
    });

    const client: PlatformAuthzClient = {
        async check(subject, permission) {
            assertKnownPermissions([permission]);
            return core.check(subject, permission);
        },
        async checkMany(subject, permissions) {
            assertKnownPermissions(permissions);
            return core.checkMany(subject, permissions);
        },
        permissions: (subject, permissionsOptions) => core.permissions(subject, permissionsOptions),
        onPolicyChanged: (envelope) => core.onPolicyChanged(envelope),
        clear: () => core.clear(),
        raw: core.raw,
    };

    return {
        client,
        grant(tenantId, sub, permissions) {
            const keys = toPermissionKeys('grant', permissions);
            const state = member(tenantId, sub);
            state.permissions = keys;
            state.denyCode = undefined;
        },
        deny(tenantId, sub, code) {
            if (!GENERAL_DENY_CODES.includes(code)) {
                throw new TypeError(
                    `platform-client/testing: deny: code must be a GeneralDenyCode; ` +
                        'FORBIDDEN is grant without the permission, PLAN_MODULE and MODULE_DISABLED are setModule',
                );
            }
            member(tenantId, sub).denyCode = code;
        },
        setModule,
        setEpoch(tenantId, epoch) {
            assertEpoch('setEpoch', epoch);
            company(tenantId).epoch = epoch;
        },
        setLimits(tenantId, limits) {
            const parsed = parseLimits('setLimits', limits);
            Object.assign(company(tenantId).limits, parsed);
        },
        policyChanged(tenantId, subs) {
            const state = company(tenantId);
            state.epoch += 1;
            eventSeq += 1;
            const uniqueSubs = [...new Set(subs ?? [])];
            const data =
                uniqueSubs.length > 0
                    ? { tenantId, epoch: state.epoch, reason: 'member_roles', subs: uniqueSubs }
                    : { tenantId, epoch: state.epoch, reason: 'modules' };
            return {
                id: eventId(eventSeq),
                type: 'platform.policy.changed',
                version: 1,
                occurredAt: new Date().toISOString(),
                tenant: state.tenant,
                actor: { clientId: 'verdeect-platform', accountId: null, channel: 'system' },
                subject: { kind: 'company', id: tenantId },
                data,
                traceId: null,
            };
        },
        calls() {
            return log.map((call) => ({ path: call.path, body: structuredClone(call.body) }));
        },
    };
}
