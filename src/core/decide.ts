// Локальное решение по снимку (prd.md §5.2 шаги 1, 3–6; checkMany): чистые функции, без ввода-вывода (D3, D5).
import { DECISION_MESSAGES, decisionMessage } from './codes.js';
import { PlatformContractError } from './errors.js';
import type { Decision, PermissionsResponse, Subject } from './types.js';

/** Шаг 1: агент без pep → PEP_REQUIRED; pep не целое ≥ 1 → VALIDATION_FAILED (details.field = 'pep'). Человек — без проверок. */
export function assertDecidableSubject(subject: Subject): void {
    if (subject.act !== 'agent') {
        return;
    }
    if (subject.pep === undefined) {
        throw new PlatformContractError('PEP_REQUIRED');
    }
    if (!Number.isInteger(subject.pep) || subject.pep < 1) {
        throw new PlatformContractError('VALIDATION_FAILED', { field: 'pep' });
    }
}

/** checkMany: [] → VALIDATION_FAILED (details.field = 'permissions'); повторы схлопываются, порядок первого вхождения сохраняется. */
export function normalizePermissions(permissions: readonly string[]): readonly string[] {
    if (permissions.length === 0) {
        throw new PlatformContractError('VALIDATION_FAILED', { field: 'permissions' });
    }
    return [...new Set(permissions)];
}

/** Шаг 5, ветка pep > epoch: агент, снимок-разрешение, pep больше эпохи снимка. */
export function needsPepReread(snapshot: PermissionsResponse, subject: Subject): boolean {
    return (
        subject.act === 'agent' &&
        subject.pep !== undefined &&
        snapshot.allow &&
        subject.pep > snapshot.epoch
    );
}

function sameForAll(permissions: readonly string[], decision: Decision): Record<string, Decision> {
    return Object.fromEntries(permissions.map((p) => [p, decision]));
}

/** Шаги 3–6 для списка прав (уже нормализованного): Record с ключами в порядке списка. */
export function decideMany(
    snapshot: PermissionsResponse,
    subject: Subject,
    permissions: readonly string[],
): Record<string, Decision> {
    // Шаг 3: общий отказ — одно решение на все права, право не проверяется.
    if (!snapshot.allow) {
        const decision: Decision =
            snapshot.memberId === undefined
                ? {
                      allow: false,
                      epoch: snapshot.epoch,
                      code: snapshot.code,
                      message: snapshot.message,
                  }
                : {
                      allow: false,
                      epoch: snapshot.epoch,
                      memberId: snapshot.memberId,
                      code: snapshot.code,
                      message: snapshot.message,
                  };
        return sameForAll(permissions, decision);
    }
    // Шаг 4: неизвестное право — первое по порядку, на весь вызов.
    const unknown = permissions.find(
        (p) => !snapshot.permissions.includes(p) && !Object.hasOwn(snapshot.denied, p),
    );
    if (unknown !== undefined) {
        throw new PlatformContractError('UNKNOWN_PERMISSION', { permission: unknown });
    }
    const { epoch, memberId } = snapshot;
    // Шаг 5, pep < epoch: контекст агента отозван; pep > epoch — решение по снимку, перечитывает клиент.
    if (subject.act === 'agent' && subject.pep !== undefined && subject.pep < epoch) {
        return sameForAll(permissions, {
            allow: false,
            epoch,
            memberId,
            code: 'CONTEXT_REVOKED',
            message: DECISION_MESSAGES.CONTEXT_REVOKED,
        });
    }
    // Шаг 6.
    return Object.fromEntries(
        permissions.map((p): [string, Decision] => {
            if (snapshot.permissions.includes(p)) {
                return [p, { allow: true, epoch, memberId }];
            }
            const code = snapshot.denied[p];
            if (code === undefined) {
                // Недостижимо после шага 4; ветка нужна для типа без `!`.
                throw new PlatformContractError('UNKNOWN_PERMISSION', { permission: p });
            }
            return [p, { allow: false, epoch, memberId, code, message: decisionMessage(code) }];
        }),
    );
}
