// Точка входа "." @verdeect/platform-client (prd.md §5.1): публичный контракт ядра — явный список реэкспортов.
export { createPlatformAuthzClient } from './client.js';
export {
    PlatformContractError,
    PlatformUnavailableError,
    type UnavailableReason,
} from './errors.js';
export { clientCredentials } from './token-provider.js';
export type {
    Act,
    AllowedPermissions,
    ClientCredentialsOptions,
    Decision,
    DecisionCode,
    DeniedPermissions,
    GeneralDenyCode,
    Limits,
    MetricsEndpoint,
    MetricsRequestResult,
    ModuleState,
    PermissionDenyCode,
    PermissionsOptions,
    PermissionsResponse,
    PlatformAuthzClient,
    PlatformAuthzClientOptions,
    PlatformAuthzRaw,
    PlatformClientLogger,
    PlatformClientMetrics,
    Subject,
    TokenProvider,
} from './types.js';
