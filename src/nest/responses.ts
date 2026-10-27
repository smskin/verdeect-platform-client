// Ответы PermissionGuard (prd.md §5.4, D9, AC-10): тело {error: {code, message, details: {}}}, тексты дословно как @verdeect/auth и Platform.
import { HttpException, HttpStatus } from '@nestjs/common';
import { PLATFORM_UNAVAILABLE_MESSAGE } from '../core/errors.js';
import type { DecisionCode } from '../core/index.js';

/** Текст `FORBIDDEN` `@verdeect/auth` — ответ `@RequireService` на токен не сервиса. */
export const SERVICE_FORBIDDEN_MESSAGE = 'Доступ запрещён';

/** Текст `TENANT_REQUIRED` `@verdeect/auth`. */
export const TENANT_REQUIRED_MESSAGE = 'Не выбрана компания';

/** Текст `INTERNAL_ERROR` Platform. */
export const INTERNAL_ERROR_MESSAGE = 'Внутренняя ошибка сервиса';

function failure(status: HttpStatus, code: string, message: string): HttpException {
    return new HttpException({ error: { code, message, details: {} } }, status);
}

/**
 * 403 по отказу решения: код и текст `Decision`.
 * @param code Код отказа.
 * @param message Текст отказа §3.4.
 */
export function decisionDenied(code: DecisionCode, message: string): HttpException {
    return failure(HttpStatus.FORBIDDEN, code, message);
}

/** 403 `FORBIDDEN`: сервис от своего имени прав участника не имеет. */
export function serviceForbidden(): HttpException {
    return failure(HttpStatus.FORBIDDEN, 'FORBIDDEN', SERVICE_FORBIDDEN_MESSAGE);
}

/** 409 `TENANT_REQUIRED`: токен пользователя без компании. */
export function tenantRequired(): HttpException {
    return failure(HttpStatus.CONFLICT, 'TENANT_REQUIRED', TENANT_REQUIRED_MESSAGE);
}

/** 503 `PLATFORM_UNAVAILABLE`: Platform недоступен, годного снимка нет (D6). */
export function platformUnavailable(): HttpException {
    return failure(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PLATFORM_UNAVAILABLE',
        PLATFORM_UNAVAILABLE_MESSAGE,
    );
}

/** 500 `INTERNAL_ERROR`: нарушение контракта или конфигурации; причина клиенту не раскрывается. */
export function internalError(): HttpException {
    return failure(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE);
}
