// Внутренние zod-схемы (prd.md §3.2, §5.1, §5.3); наружу — только функции parse* без типов zod (NFR-4, AC-12).
import { z } from 'zod';
import type { PermissionsResponse } from './types.js';

const epoch = z.number().int().min(1);
const permissionDenyCode = z.enum(['FORBIDDEN', 'PLAN_MODULE', 'MODULE_DISABLED']);
const generalDenyCode = z.enum([
    'NOT_MEMBER',
    'COMPANY_SUSPENDED',
    'ACCOUNT_DISABLED',
    'SEATS_EXCEEDED',
    'CONTEXT_REVOKED',
]);

const allowedSchema = z.object({
    allow: z.literal(true),
    epoch,
    memberId: z.string().min(1),
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
    denied: z.record(z.string(), permissionDenyCode),
    modules: z.array(
        z.object({
            id: z.string().min(1),
            enabled: z.boolean(),
            code: z.enum(['PLAN_MODULE', 'MODULE_DISABLED']).optional(),
        }),
    ),
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

const permissionsResponseSchema = z.discriminatedUnion('allow', [
    allowedSchema,
    deniedSchema,
]) satisfies z.ZodType<PermissionsResponse>;

// Мягкая схема (§5.3): незнакомые поля и любой reason принимаются; subject, actor, tenant не проверяются.
const policyChangedSchema = z.looseObject({
    type: z.literal('platform.policy.changed'),
    id: z.string(),
    data: z.looseObject({
        tenantId: z.string().min(1),
        epoch,
        subs: z.array(z.string().min(1)).optional(),
    }),
});

const tokenResponseSchema = z.looseObject({
    access_token: z.string().min(1),
    expires_in: z.number().positive(),
});
const oauthErrorSchema = z.looseObject({ error: z.string().min(1) });
const platformErrorSchema = z.looseObject({
    error: z.looseObject({
        code: z.string().min(1),
        details: z.record(z.string(), z.unknown()).optional(),
    }),
});

/** Конверт platform.policy.changed в объёме, нужном для сброса (§5.3). */
export interface PolicyChangedEvent {
    /** Идентификатор события. */
    readonly id: string;
    /** Компания. */
    readonly tenantId: string;
    /** Новая эпоха политики. */
    readonly epoch: number;
    /** Затронутые участники; `undefined` — вся компания. */
    readonly subs: readonly string[] | undefined;
}

/** Ответ permissions по схеме §3.2 или `undefined`; лишние поля отбрасываются. */
export function parsePermissionsResponse(value: unknown): PermissionsResponse | undefined {
    const result = permissionsResponseSchema.safeParse(value);
    return result.success ? result.data : undefined;
}

/**
 * Конверт события по мягкой схеме §5.3. `subs: []` нормализуется в `undefined` (вся компания).
 * При неудаче — только пути полей, без значений (конверт недоверенный).
 */
export function parsePolicyChanged(
    value: unknown,
):
    | { readonly ok: true; readonly event: PolicyChangedEvent }
    | { readonly ok: false; readonly issues: readonly string[] } {
    const result = policyChangedSchema.safeParse(value);
    if (!result.success) {
        return {
            ok: false,
            issues: result.error.issues.map((issue) => issue.path.join('.') || '(root)'),
        };
    }
    const { id, data } = result.data;
    const subs = data.subs !== undefined && data.subs.length > 0 ? data.subs : undefined;
    return { ok: true, event: { id, tenantId: data.tenantId, epoch: data.epoch, subs } };
}

/** Ответ token endpoint Identity (§5.1) или `undefined`. */
export function parseTokenResponse(
    value: unknown,
): { readonly accessToken: string; readonly expiresInSec: number } | undefined {
    const result = tokenResponseSchema.safeParse(value);
    if (!result.success) {
        return undefined;
    }
    return { accessToken: result.data.access_token, expiresInSec: result.data.expires_in };
}

/** Поле `error` ответа OAuth или `undefined`. */
export function parseOAuthErrorCode(value: unknown): string | undefined {
    const result = oauthErrorSchema.safeParse(value);
    return result.success ? result.data.error : undefined;
}

/** Тело ошибки Platform `{error: {code, details}}` или `undefined`. */
export function parsePlatformError(
    value: unknown,
): { readonly code: string; readonly details: Readonly<Record<string, unknown>> } | undefined {
    const result = platformErrorSchema.safeParse(value);
    if (!result.success) {
        return undefined;
    }
    return { code: result.data.error.code, details: result.data.error.details ?? {} };
}
