// Копия verdeect-platform apps/platform/src/modules/catalog/domain/permissions.ts и apps/platform/src/modules/catalog/domain/modules.ts @ 7adb423 (prd.md §5.5, AC-8a).
// Не править вручную: только перекопировать из источника и обновить коммит в этой строке.
/** Права компании (prd.md §5.1); порядок — как в PRD. Право вне списка — ошибка вызывающего `UNKNOWN_PERMISSION`. */
export const PERMISSION_KEYS = [
    'chat.use',
    'chat.messengers',
    'chat.web',
    'chat.office',
    'chat.images',
    'native.files.read',
    'native.files.write',
    'native.models.manage',
    'kanban.use',
    'calendar.use',
    'dashboard.read',
    'knowledge.read',
    'knowledge.manage',
    'members.manage',
    'roles.manage',
    'modules.manage',
    'modules.permissions',
    'agents.manage',
    'audit.read',
    'integrations.manage',
    'billing.read',
    'billing.manage',
    'partners.manage',
    'partner.self',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
    return (PERMISSION_KEYS as readonly string[]).includes(value);
}

/** Права ядра (prd.md §5.4): модуля нет, решает только роль. */
export const CORE_PERMISSIONS = [
    'chat.use',
    'native.models.manage',
    'members.manage',
    'roles.manage',
    'modules.manage',
    'modules.permissions',
    'audit.read',
    'integrations.manage',
    'billing.read',
    'billing.manage',
    'partners.manage',
    'partner.self',
] as const satisfies readonly PermissionKey[];

/** Идентификаторы модулей каталога (prd.md §5.4); порядок — как в таблице §5.4. */
export const MODULE_IDS = [
    'files',
    'knowledge',
    'web',
    'office',
    'images',
    'kanban',
    'calendar',
    'workers',
    'agents',
    'dashboard',
    'reports',
    'connections',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export function isModuleId(value: string): value is ModuleId {
    return (MODULE_IDS as readonly string[]).includes(value);
}

export interface ModuleDefinition {
    readonly id: ModuleId;
    readonly title: string;
    readonly permissions: readonly PermissionKey[];
    /** Справочно; в решении не проверяется (D8). */
    readonly dependsOn: readonly ModuleId[];
}

/** Каталог модулей (prd.md §5.4); тексты `title` — дословно из PRD. */
export const MODULE_CATALOG: readonly ModuleDefinition[] = [
    {
        id: 'files',
        title: 'Файлы',
        permissions: ['native.files.read', 'native.files.write'],
        dependsOn: [],
    },
    {
        id: 'knowledge',
        title: 'Поиск по файлам',
        permissions: ['knowledge.read', 'knowledge.manage'],
        dependsOn: ['files'],
    },
    { id: 'web', title: 'Интернет и браузер', permissions: ['chat.web'], dependsOn: [] },
    { id: 'office', title: 'Офисные документы', permissions: ['chat.office'], dependsOn: [] },
    { id: 'images', title: 'Изображения', permissions: ['chat.images'], dependsOn: [] },
    { id: 'kanban', title: 'Канбан', permissions: ['kanban.use'], dependsOn: [] },
    { id: 'calendar', title: 'Календарь', permissions: ['calendar.use'], dependsOn: [] },
    { id: 'workers', title: 'Нейросотрудники', permissions: [], dependsOn: [] },
    { id: 'agents', title: 'Настройка помощников', permissions: ['agents.manage'], dependsOn: [] },
    { id: 'dashboard', title: 'Дашборд', permissions: ['dashboard.read'], dependsOn: [] },
    { id: 'reports', title: 'Сборщик отчётов', permissions: [], dependsOn: ['files', 'kanban'] },
    {
        id: 'connections',
        title: 'Подключения мессенджеров',
        permissions: ['chat.messengers'],
        dependsOn: [],
    },
];

const MODULE_BY_PERMISSION: ReadonlyMap<PermissionKey, ModuleId> = new Map(
    MODULE_CATALOG.flatMap((module) =>
        module.permissions.map((permission) => [permission, module.id] as const),
    ),
);

/** Модуль права или `null` для права ядра (§5.4). */
export function moduleOfPermission(permission: PermissionKey): ModuleId | null {
    return MODULE_BY_PERMISSION.get(permission) ?? null;
}
