// AC-19 (NFR-3): ни один подделанный logger набора U не получил токен или clientSecret — проверка после каждого теста.
import { afterEach, expect } from 'vitest';
import { recordedLogEntries, resetRecordedLogs } from './recording.js';
import { SECRET_VALUES } from './secrets.js';

afterEach(() => {
    for (const entries of recordedLogEntries()) {
        for (const entry of entries) {
            const text = `${entry.msg ?? ''} ${JSON.stringify(entry.obj)}`;
            for (const secret of SECRET_VALUES) {
                expect(text, 'AC-19: лог содержит секрет').not.toContain(secret);
            }
        }
    }
    resetRecordedLogs();
});
