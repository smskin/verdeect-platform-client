// PermissionGuard (prd.md §5.4, D11, UC-1, UC-2): Principal → Subject, один checkMany, ответы по таблице §5.4.
import {
    Inject,
    Injectable,
    Logger,
    Optional,
    type CanActivate,
    type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { principalOf, VerdeectAuthGuard, type PrincipalCarrier } from '@verdeect/auth/nest';
import {
    PlatformContractError,
    PlatformUnavailableError,
    type PlatformAuthzClient,
    type Subject,
} from '../core/index.js';
import { PLATFORM_AUTHZ_CLIENT } from './platform-authz.module.js';
import {
    decisionDenied,
    internalError,
    platformUnavailable,
    serviceForbidden,
    tenantRequired,
} from './responses.js';

/** Ключ метаданных прав `@RequirePermission` (внутренний, наружу не экспортируется). */
export const REQUIRED_PERMISSIONS = 'verdeect-platform-client:required-permissions';

/** Результат проверки прав в `request.platformDecision` — для обработчика сервиса. */
export interface PlatformDecision {
    /** Идентификатор участника компании. */
    readonly memberId: string;
    /** Эпоха политики снимка, по которому принято решение. */
    readonly epoch: number;
}

interface GuardedRequest extends PrincipalCarrier {
    platformDecision?: PlatformDecision;
}

/**
 * Guard маршрута с `@RequirePermission`: берёт `Principal` (при отсутствии — вызывает
 * `VerdeectAuthGuard` из DI), строит `Subject`, одним `checkMany` проверяет все права и кладёт
 * `{memberId, epoch}` в `request.platformDecision`. Глобально не регистрируется (D11).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
    private readonly logger = new Logger('PlatformAuthz');

    constructor(
        @Inject(PLATFORM_AUTHZ_CLIENT) private readonly client: PlatformAuthzClient,
        private readonly reflector: Reflector,
        @Optional() private readonly authGuard?: VerdeectAuthGuard,
    ) {}

    /**
     * Решение по правам маршрута.
     * @param context Контекст выполнения Nest.
     * @returns `true`, если все права разрешены; иначе `HttpException` по таблице §5.4.
     */
    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Шаг 1: права класса, затем метода, без повторов; пусто — маршрут не наш.
        const permissions = [
            ...new Set(
                this.reflector.getAllAndMerge<string[]>(REQUIRED_PERMISSIONS, [
                    context.getClass(),
                    context.getHandler(),
                ]),
            ),
        ];
        if (permissions.length === 0) {
            return true;
        }
        const request = context.switchToHttp().getRequest<GuardedRequest>();
        // Шаги 2–3.
        const subject = await this.subjectOf(context, request);
        // Шаг 4: один checkMany.
        let decisions;
        try {
            decisions = await this.client.checkMany(subject, permissions);
        } catch (error) {
            if (error instanceof PlatformUnavailableError) {
                throw platformUnavailable();
            }
            if (error instanceof PlatformContractError) {
                // error уже записало ядро (с ограничением частоты, NFR-3).
                throw internalError();
            }
            throw error;
        }
        // Шаг 5: первый отказ в порядке прав.
        for (const permission of permissions) {
            const decision = decisions[permission];
            if (decision !== undefined && !decision.allow) {
                throw decisionDenied(decision.code, decision.message);
            }
        }
        // Шаг 6.
        const first = decisions[permissions[0] ?? ''];
        if (first === undefined || !first.allow) {
            // Недостижимо: checkMany возвращает решение по каждому праву.
            throw internalError();
        }
        request.platformDecision = { memberId: first.memberId, epoch: first.epoch };
        return true;
    }

    // Шаг 2: Principal или вызов VerdeectAuthGuard (D11); шаг 3: сопоставление с Subject.
    private async subjectOf(context: ExecutionContext, request: GuardedRequest): Promise<Subject> {
        let principal = principalOf(request);
        if (principal === null) {
            // Класс и обработчик, а не URL: query-строка может нести данные запроса.
            const handler = `${context.getClass().name}.${context.getHandler().name}`;
            if (this.authGuard === undefined) {
                this.logger.error(
                    { handler },
                    'VerdeectAuthGuard не найден в DI, подключите VerdeectAuthModule',
                );
                throw internalError();
            }
            this.logger.debug({ handler }, 'no Principal, calling VerdeectAuthGuard');
            // Отказ 401/403/409 VerdeectAuthGuard уходит без изменений.
            await this.authGuard.canActivate(context);
            principal = principalOf(request);
            if (principal === null) {
                throw internalError();
            }
        }
        const { sub } = principal;
        if (principal.kind === 'service') {
            this.logger.debug({ sub, kind: 'service' }, 'service token denied');
            throw serviceForbidden();
        }
        const { tenant, tenantId } = principal;
        if (tenant === null || tenantId === null) {
            this.logger.debug({ sub, kind: 'user' }, 'user token without tenant');
            throw tenantRequired();
        }
        if (principal.kind === 'user') {
            return { sub, tenant, tenantId, act: 'human' };
        }
        // prof в лайте не передаётся (§5.4).
        const { pep, asid, wid } = principal;
        return { sub, tenant, tenantId, act: 'agent', pep, asid, wid };
    }
}
