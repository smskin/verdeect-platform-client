// Внутренние zod-схемы (prd.md §3.2, §5.1, §5.3); наружу — только функции parse* без типов zod (NFR-4, AC-12).
import { z } from 'zod';
import type { LimitsSchema } from './limits.js';
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

// limits (§3.2, AC-20): ключи — ровно ключи копии Limits Platform (проверка satisfies); известный
// ключ — number | null, иначе ответ не по схеме; незнакомые ключи разбирает parsePermissionsResponse.
const limitValue = z.number().nullable();
const limitsShape = {
    members: limitValue.optional(),
    storageMb: limitValue.optional(),
    fileSizeMb: limitValue,
    modelRequestsPerMonth: limitValue.optional(),
    modelRequestsPerMemberPerMonth: limitValue.optional(),
    concurrentChats: limitValue.optional(),
    assistants: limitValue.optional(),
} satisfies Record<keyof z.infer<typeof LimitsSchema>, z.ZodType>;
const limitsSchema = z.object(limitsShape).catchall(z.unknown());

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
    limits: limitsSchema,
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
    limits: limitsSchema,
});

const permissionsResponseSchema = z.discriminatedUnion('allow', [allowedSchema, deniedSchema]);

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

function isLimitValue(value: unknown): value is number | null {
    return value === null || (typeof value === 'number' && Number.isFinite(value));
}

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

/**
 * Ответ permissions по схеме §3.2 или `undefined`. Лишние поля верхнего уровня отбрасываются.
 * В `limits` незнакомые ключи со значением `number | null` сохраняются, прочие отбрасываются.
 *
 * @param onDroppedLimits - получает имена отброшенных ключей `limits` (без значений), если они есть.
 */
export function parsePermissionsResponse(
    value: unknown,
    onDroppedLimits?: (keys: readonly string[]) => void,
): PermissionsResponse | undefined {
    const result = permissionsResponseSchema.safeParse(value);
    if (!result.success) {
        return undefined;
    }
    const limits: Record<string, number | null> = {};
    const dropped: string[] = [];
    for (const [key, limit] of Object.entries(result.data.limits)) {
        if (isLimitValue(limit)) {
            limits[key] = limit;
            continue;
        }
        dropped.push(key);
    }
    if (dropped.length > 0) {
        onDroppedLimits?.(dropped);
    }
    const response = {
        ...result.data,
        limits: { ...limits, fileSizeMb: result.data.limits.fileSizeMb },
    };
    return response satisfies PermissionsResponse;
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
