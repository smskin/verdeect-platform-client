// Точка входа "./nest" (prd.md §5.4, D2, D11): модуль клиента, @RequirePermission, PermissionGuard. Требует @nestjs/* и @verdeect/auth.
export { PermissionGuard, type PlatformDecision } from './permission.guard.js';
export {
    PLATFORM_AUTHZ_CLIENT,
    PlatformAuthzModule,
    type PlatformAuthzModuleAsyncOptions,
    type PlatformAuthzModuleOptions,
} from './platform-authz.module.js';
export { RequirePermission } from './require-permission.decorator.js';
