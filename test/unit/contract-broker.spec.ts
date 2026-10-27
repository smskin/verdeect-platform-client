// AC-15 (C) (prd.md §7 п. 6, п. 9): разбор сообщения platform.policy.changed очереди слоя C без Docker —
// нечитаемое сообщение попадает в received с ошибками, исключение из consume-колбэка не выходит.
import { describe, expect, it } from 'vitest';
import { inspectPolicyChanged } from '../contract/support/broker.js';

describe('AC-15 (C): разбор platform.policy.changed очереди теста', () => {
    it('AC-15 (C): тело не JSON → запись с ajvErrors «не JSON: …» и zodValid false, без исключения', () => {
        const received = inspectPolicyChanged('{not json');

        expect(received.ajvErrors).toHaveLength(1);
        expect(received.ajvErrors[0]).toMatch(/^не JSON: /);
        expect(received.zodValid).toBe(false);
    });

    it('AC-15 (C): конверт без data → запись с ошибками ajv и zodValid false, без исключения', () => {
        const received = inspectPolicyChanged(
            JSON.stringify({
                id: 'evt_01M5ZS6D4KEKGMGXM5G8T785NS',
                type: 'platform.policy.changed',
            }),
        );

        expect(received.ajvErrors).not.toEqual([]);
        expect(received.zodValid).toBe(false);
        expect(received.envelope.data).toBeUndefined();
    });
});
