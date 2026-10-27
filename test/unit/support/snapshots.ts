// Фикстуры снимков §3.2 и участников для тестов слоя U (AC-1–AC-8b).
import { DECISION_MESSAGES } from '../../../src/core/codes.js';
import type {
    AllowedPermissions,
    DeniedPermissions,
    GeneralDenyCode,
    PermissionDenyCode,
    Subject,
} from '../../../src/core/types.js';

// 10 прав каталога Platform (AC-1).
export const PERMS = [
    'native.files.read',
    'native.files.write',
    'chat.office',
    'chat.images',
    'knowledge.read',
    'kanban.use',
    'calendar.use',
    'dashboard.read',
    'members.manage',
    'billing.read',
] as const;

export const HUMAN_A: Subject = { sub: 'usr_a', tenant: 'acme', tenantId: 'cmp_1', act: 'human' };
export const HUMAN_B: Subject = { sub: 'usr_b', tenant: 'acme', tenantId: 'cmp_1', act: 'human' };

export function agent(pep: number | undefined, extra: Partial<Subject> = {}): Subject {
    return {
        sub: 'usr_a',
        tenant: 'acme',
        tenantId: 'cmp_1',
        act: 'agent',
        asid: 'as_1',
        wid: 'w_1',
        ...(pep === undefined ? {} : { pep }),
        ...extra,
    };
}

export function allowedSnapshot(
    o: {
        epoch?: number;
        memberId?: string;
        permissions?: readonly string[];
        denied?: Record<string, PermissionDenyCode>;
    } = {},
): AllowedPermissions {
    return {
        allow: true,
        epoch: o.epoch ?? 7,
        memberId: o.memberId ?? 'mem_a',
        roles: ['member'],
        permissions: o.permissions ?? PERMS.slice(0, 8),
        denied: o.denied ?? { 'members.manage': 'FORBIDDEN', 'billing.read': 'PLAN_MODULE' },
        modules: [
            { id: 'files', enabled: true },
            { id: 'knowledge', enabled: true },
            { id: 'office', enabled: true },
        ],
        limits: { fileSizeMb: 50 },
    };
}

export function generalDeny(
    code: GeneralDenyCode,
    epoch: number | null = 7,
    memberId?: string,
): DeniedPermissions {
    return {
        allow: false,
        epoch,
        ...(memberId === undefined ? {} : { memberId }),
        code,
        message: DECISION_MESSAGES[code],
        roles: [],
        permissions: [],
        denied: {},
        modules: [],
        limits: { fileSizeMb: null },
    };
}
