// NFR-3 (AC-7, AC-7a): частота warn о недоступности и error контракта.
import { describe, expect, it } from 'vitest';
import { createLogLimiter } from '../../src/core/log-limiter.js';
import { createClock } from './support/clock.js';
import { createRecordingLogger } from './support/recording.js';

function setup() {
    const clock = createClock(0);
    const rec = createRecordingLogger();
    return { clock, rec, limiter: createLogLimiter(rec.logger, clock.now) };
}

describe('NFR-3: ограничение частоты логов', () => {
    it('NFR-3: warn о недоступности — один за 10 с на endpoint, затем suppressed: 99', () => {
        const { clock, rec, limiter } = setup();
        for (let i = 0; i < 100; i += 1) {
            clock.set(i * 50);
            limiter.unavailable('permissions', { reason: 'http_5xx' });
        }
        expect(rec.entries).toHaveLength(1);
        expect(rec.entries[0]?.obj).toMatchObject({ endpoint: 'permissions', suppressed: 0 });
        clock.set(10_000);
        limiter.unavailable('permissions', { reason: 'http_5xx' });
        expect(rec.entries).toHaveLength(2);
        expect(rec.entries[1]).toMatchObject({
            level: 'warn',
            msg: 'PLATFORM_UNAVAILABLE',
            obj: { endpoint: 'permissions', suppressed: 99 },
        });
    });

    it('NFR-3: на 9 999 мс — ещё без записи', () => {
        const { clock, rec, limiter } = setup();
        limiter.unavailable('permissions', {});
        clock.set(9_999);
        limiter.unavailable('permissions', {});
        expect(rec.entries).toHaveLength(1);
    });

    it('NFR-3: endpoint ограничиваются независимо', () => {
        const { rec, limiter } = setup();
        limiter.unavailable('permissions', {});
        limiter.unavailable('token', {});
        expect(rec.entries).toHaveLength(2);
    });

    it('NFR-3: error контракта — один за 60 с на код, коды независимы', () => {
        const { clock, rec, limiter } = setup();
        for (let i = 0; i < 10; i += 1) {
            limiter.contractError('TENANT_MISMATCH', {});
        }
        limiter.contractError('SCOPE_REQUIRED', {});
        expect(rec.entries).toHaveLength(2);
        clock.set(60_000);
        limiter.contractError('TENANT_MISMATCH', {});
        expect(rec.entries[2]).toMatchObject({
            level: 'error',
            msg: 'PlatformContractError',
            obj: { code: 'TENANT_MISMATCH', suppressed: 9 },
        });
    });

    it('NFR-3: поля endpoint и code не подменяются вызывающим', () => {
        const { rec, limiter } = setup();
        limiter.unavailable('token', { endpoint: 'check' });
        limiter.contractError('X', { code: 'Y' });
        expect(rec.entries[0]?.obj).toMatchObject({ endpoint: 'token' });
        expect(rec.entries[1]?.obj).toMatchObject({ code: 'X' });
    });

    it('NFR-3: без logger — без ошибок', () => {
        const limiter = createLogLimiter(undefined, () => 0);
        expect(() => {
            limiter.unavailable('permissions', {});
            limiter.contractError('X', {});
        }).not.toThrow();
    });
});
