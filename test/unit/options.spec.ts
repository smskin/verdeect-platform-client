// AC-19 «Настройки» (prd.md §5.1): неверные параметры → TypeError с именем, без значения.
import { describe, expect, it } from 'vitest';
import { resolveOptions } from '../../src/core/options.js';
import type { PlatformAuthzClientOptions } from '../../src/core/types.js';
import { createTokenStub } from './support/token-stub.js';

function base(): PlatformAuthzClientOptions {
    return { baseUrl: 'http://platform:3000', tokenProvider: createTokenStub().provider };
}

function errorOf(options: unknown): TypeError {
    try {
        resolveOptions(options as PlatformAuthzClientOptions);
    } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        return error as TypeError;
    }
    throw new Error('resolveOptions не бросил TypeError');
}

describe('AC-19: проверка настроек', () => {
    it.each([
        ['cacheTtlSec', { cacheTtlSec: 61 }],
        ['cacheTtlSec', { cacheTtlSec: 0 }],
        ['denyTtlSec', { denyTtlSec: 6 }],
        ['maxEntries', { maxEntries: 10 }],
        ['baseUrl', { baseUrl: 'platform:3000' }],
    ])('AC-19: %s неверен → TypeError с именем параметра', (name, patch) => {
        expect(errorOf({ ...base(), ...patch }).message).toContain(name);
    });

    it('AC-19: значение параметра не попадает в сообщение', () => {
        const error = errorOf({ ...base(), baseUrl: 'platform:3000' });
        expect(error.message).not.toContain('platform:3000');
    });

    it('AC-19: несколько неверных — все имена в одном TypeError', () => {
        const error = errorOf({ ...base(), cacheTtlSec: 0, denyTtlSec: 9 });
        expect(error.message).toContain('cacheTtlSec');
        expect(error.message).toContain('denyTtlSec');
    });

    it.each(['http://platform:3000/', 'ftp://platform', ''])(
        'AC-19: baseUrl %j → TypeError',
        (baseUrl) => {
            expect(errorOf({ ...base(), baseUrl }).message).toContain('baseUrl');
        },
    );

    it('AC-19: нецелые значения отклоняются', () => {
        const error = errorOf({ ...base(), cacheTtlSec: 1.5, requestTimeoutMs: 99.5 });
        expect(error.message).toContain('cacheTtlSec');
        expect(error.message).toContain('requestTimeoutMs');
    });

    it('AC-19: без tokenProvider — TypeError tokenProvider', () => {
        expect(errorOf({ baseUrl: 'http://platform:3000' }).message).toContain('tokenProvider');
    });

    it('AC-19: границы допустимы — cacheTtlSec 1 и 60, denyTtlSec 1 и 5, maxEntries 100, requestTimeoutMs 100', () => {
        expect(() =>
            resolveOptions({ ...base(), cacheTtlSec: 1, denyTtlSec: 1, maxEntries: 100 }),
        ).not.toThrow();
        expect(() =>
            resolveOptions({ ...base(), cacheTtlSec: 60, denyTtlSec: 5, requestTimeoutMs: 100 }),
        ).not.toThrow();
    });

    it('§5.1: значения по умолчанию', () => {
        expect(resolveOptions(base())).toMatchObject({
            cacheTtlMs: 60_000,
            denyTtlMs: 5000,
            maxEntries: 50_000,
            lastSeenMaxEntries: 5000,
            requestTimeoutMs: 2000,
        });
    });
});
