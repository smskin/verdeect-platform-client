// Подделанный TokenProvider слоя U: TOKEN_1 до первого refresh, затем TOKEN_2; fail() — отказ.
import type { TokenProvider } from '../../../src/core/types.js';
import { TOKEN_1, TOKEN_2 } from './secrets.js';

export interface TokenStub {
    readonly provider: TokenProvider;
    readonly calls: Array<{ readonly refresh: boolean }>;
    fail(error: Error | undefined): void;
}

export function createTokenStub(): TokenStub {
    const calls: Array<{ readonly refresh: boolean }> = [];
    let refreshed = false;
    let failure: Error | undefined;
    return {
        provider: {
            getToken(options) {
                const refresh = options?.refresh === true;
                calls.push({ refresh });
                if (failure !== undefined) {
                    return Promise.reject(failure);
                }
                if (refresh) {
                    refreshed = true;
                }
                return Promise.resolve(refreshed ? TOKEN_2 : TOKEN_1);
            },
        },
        calls,
        fail(error) {
            failure = error;
        },
    };
}
