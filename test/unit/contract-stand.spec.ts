// prd.md §7 п. 4: разбор вывода разовых команд стенда слоя C без Docker — итог команд verdeect-kit
// (код 0 и нет поля error в JSON-строках stdout) и выбор формы подготовки БД (db mode) по коду проверки;
// §7 п. 5: текст ошибки готовности — заданный предел и остаток.
import { describe, expect, it } from 'vitest';
import { dbModeOf, kitOutputOk, notReadyMessage } from '../contract/support/platform-stand.js';

describe('§7 п. 4: разовые команды стенда слоя C', () => {
    it('§7 п. 4: kitOutputOk — код 0 и пустой stdout → true', () => {
        expect(kitOutputOk(0, '')).toBe(true);
    });

    it('§7 п. 4: kitOutputOk — код ≠ 0 → false', () => {
        expect(kitOutputOk(1, '')).toBe(false);
        expect(kitOutputOk(124, '{"applied":3}\n')).toBe(false);
    });

    it('§7 п. 4: kitOutputOk — строка {"error":…} среди строк лога → false', () => {
        const stdout = 'подготовка БД\n{"error":{"code":"DB_PREPARE_FAILED"}}\n';
        expect(kitOutputOk(0, stdout)).toBe(false);
    });

    it('§7 п. 4: kitOutputOk — не-JSON строки и JSON без error игнорируются → true', () => {
        const stdout = 'начало\n{не JSON\n{"service":"platform","roles":3}\n  \n';
        expect(kitOutputOk(0, stdout)).toBe(true);
    });

    it('§7 п. 4: dbModeOf — 0 → kit, 1 → legacy, 2 → ошибка', () => {
        expect(dbModeOf(0)).toBe('kit');
        expect(dbModeOf(1)).toBe('legacy');
        expect(() => dbModeOf(2)).toThrow(/неожиданный код 2/);
    });
});

describe('§7 п. 5: ошибка готовности Platform', () => {
    it('§7 п. 5: notReadyMessage — заданный предел, остаток, число опросов и состояние', () => {
        expect(notReadyMessage(120_000, 95_000, 7, 'GET /health → 503')).toBe(
            'Platform не готов: предел PLATFORM_READY_TIMEOUT_MS=120000 мс, остаток 95000 мс истёк, опросов 7: GET /health → 503',
        );
    });

    it('§7 п. 5: notReadyMessage — без опросов → предел исчерпан на старте контейнера', () => {
        expect(notReadyMessage(120_000, 0, 0, 'не опрошен')).toBe(
            'Platform не готов: предел PLATFORM_READY_TIMEOUT_MS=120000 мс исчерпан на старте контейнера',
        );
    });
});
