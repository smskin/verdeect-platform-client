// Копия verdeect-platform apps/platform/src/modules/catalog/domain/decision-codes.ts @ 7adb423 (prd.md §3.4, D9, AC-11).
// Не править вручную: только перекопировать из источника и обновить коммит в этой строке.
/** Коды и сообщения решений (prd.md §5.6) — тексты дословно. */
export const DECISION_MESSAGES = {
    NOT_MEMBER: 'Нет доступа к компании.',
    COMPANY_SUSPENDED: 'Компания приостановлена.',
    ACCOUNT_DISABLED: 'Учётная запись заблокирована.',
    SEATS_EXCEEDED: 'Превышено число мест по тарифу. Обратитесь к администратору.',
    CONTEXT_REVOKED: 'Контекст отозван. Нужен новый диалог.',
    FORBIDDEN: 'Недостаточно прав.',
    PLAN_MODULE: 'Возможность не входит в тариф компании.',
    MODULE_DISABLED: 'Раздел отключён. Данные сохранены.',
} as const satisfies Record<string, string>;

export type DecisionCode = keyof typeof DECISION_MESSAGES;

export function decisionMessage(code: DecisionCode): string {
    return DECISION_MESSAGES[code];
}
