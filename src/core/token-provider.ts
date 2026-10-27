// clientCredentials (prd.md §5.1, D8, AC-9, AC-18 v1.8): client_secret_basic, кэш до exp − 30 с, объединение запросов, refresh.
import { PlatformContractError, PlatformUnavailableError } from './errors.js';
import { isHttpUrl } from './options.js';
import { parseOAuthErrorCode, parseTokenResponse } from './schemas.js';
import { parseJsonText, sendRequest } from './transport.js';
import type { ClientCredentialsOptions, TokenProvider } from './types.js';

/** Токен обновляется за 30 с до истечения. */
export const TOKEN_EXPIRY_SKEW_MS = 30_000;

const DEFAULT_TOKEN_TIMEOUT_MS = 2000;

interface IssuedToken {
    readonly token: string;
    readonly expiresInSec: number;
    readonly receivedAt: number;
}

function isNonEmptyString(value: unknown): boolean {
    return typeof value === 'string' && value !== '';
}

function validate(options: ClientCredentialsOptions): void {
    const raw: unknown = options;
    if (typeof raw !== 'object' || raw === null) {
        throw new TypeError('platform-client: clientCredentials options must be an object');
    }
    const o = raw as Record<string, unknown>;
    const isFn = (v: unknown): boolean => v === undefined || typeof v === 'function';
    const checks: ReadonlyArray<readonly [string, boolean]> = [
        ['tokenUrl', isHttpUrl(o.tokenUrl, false)],
        ['clientId', isNonEmptyString(o.clientId)],
        ['clientSecret', isNonEmptyString(o.clientSecret)],
        ['scope', isNonEmptyString(o.scope)],
        ['resource', isNonEmptyString(o.resource)],
        [
            'requestTimeoutMs',
            o.requestTimeoutMs === undefined ||
                (typeof o.requestTimeoutMs === 'number' &&
                    Number.isSafeInteger(o.requestTimeoutMs) &&
                    o.requestTimeoutMs >= 100),
        ],
        ['fetch', isFn(o.fetch)],
        ['clock', isFn(o.clock)],
        [
            'metrics',
            o.metrics === undefined ||
                (typeof o.metrics === 'object' &&
                    o.metrics !== null &&
                    typeof (o.metrics as Record<string, unknown>).request === 'function'),
        ],
    ];
    const invalid = checks.filter(([, valid]) => !valid).map(([name]) => name);
    if (invalid.length > 0) {
        throw new TypeError(
            `platform-client: invalid clientCredentials options: ${invalid.join(', ')}`,
        );
    }
}

// RFC 6749 §2.3.1 + Appendix B: application/x-www-form-urlencoded для client_id и client_secret.
function formEncode(value: string): string {
    return new URLSearchParams([['', value]]).toString().slice(1);
}

/**
 * `TokenProvider` по OAuth 2.0 client credentials (`client_secret_basic`). Токен кэшируется до
 * `exp − 30 с`, одновременные запросы объединяются, неудача не кэшируется. Ошибки —
 * `PlatformUnavailableError('token', …)` (сеть, таймаут, 5xx, 429) и `PlatformContractError`
 * (прочие 4xx — поле `error` OAuth или `HTTP_<status>`; ответ не по схеме — `INVALID_RESPONSE`).
 */
export function clientCredentials(options: ClientCredentialsOptions): TokenProvider {
    validate(options);
    const fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const clock = options.clock ?? Date.now;
    const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TOKEN_TIMEOUT_MS;
    const { metrics, tokenUrl } = options;
    const credentials = `${formEncode(options.clientId)}:${formEncode(options.clientSecret)}`;
    const authorization = `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
    const requestBody = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: options.scope,
        resource: options.resource,
    }).toString();

    let cached: { readonly token: string; readonly refreshAt: number } | undefined;
    let inflight:
        | { readonly promise: Promise<string>; readonly forRefresh: boolean; readonly seq: number }
        | undefined;
    let seq = 0;
    // Ответы запросов, начатых до последнего refresh, в кэш не пишутся.
    let cacheFloor = 0;

    async function requestToken(): Promise<IssuedToken> {
        const started = clock();
        const result = await sendRequest(
            fetchFn,
            tokenUrl,
            {
                method: 'POST',
                headers: {
                    authorization,
                    'content-type': 'application/x-www-form-urlencoded',
                    accept: 'application/json',
                },
                body: requestBody,
            },
            timeoutMs,
        );
        const seconds = (clock() - started) / 1000;
        if (!result.ok) {
            metrics?.request('token', 'unavailable', seconds);
            throw new PlatformUnavailableError('token', result.reason, { cause: result.cause });
        }
        const { status } = result;
        const json = parseJsonText(result.bodyText);
        if (status === 200) {
            const parsed = parseTokenResponse(json);
            if (parsed === undefined) {
                metrics?.request('token', 'contract_error', seconds);
                throw new PlatformContractError('INVALID_RESPONSE', { endpoint: 'token' });
            }
            metrics?.request('token', 'ok', seconds);
            return {
                token: parsed.accessToken,
                expiresInSec: parsed.expiresInSec,
                receivedAt: clock(),
            };
        }
        if (status >= 500) {
            metrics?.request('token', 'unavailable', seconds);
            throw new PlatformUnavailableError('token', 'http_5xx');
        }
        if (status === 429) {
            metrics?.request('token', 'unavailable', seconds);
            throw new PlatformUnavailableError('token', 'http_429');
        }
        metrics?.request('token', 'contract_error', seconds);
        throw new PlatformContractError(parseOAuthErrorCode(json) ?? `HTTP_${status}`);
    }

    function start(forRefresh: boolean): Promise<string> {
        seq += 1;
        const mySeq = seq;
        if (forRefresh) {
            cacheFloor = mySeq;
        }
        const promise = requestToken()
            .then(({ token, expiresInSec, receivedAt }) => {
                if (mySeq >= cacheFloor) {
                    cached = {
                        token,
                        refreshAt: receivedAt + expiresInSec * 1000 - TOKEN_EXPIRY_SKEW_MS,
                    };
                }
                return token;
            })
            .finally(() => {
                if (inflight?.seq === mySeq) {
                    inflight = undefined;
                }
            });
        inflight = { promise, forRefresh, seq: mySeq };
        return promise;
    }

    return {
        getToken(getOptions) {
            if (getOptions?.refresh === true) {
                cached = undefined;
                // Одновременные refresh объединяются в один запрос.
                if (inflight?.forRefresh === true) {
                    return inflight.promise;
                }
                return start(true);
            }
            if (cached !== undefined && clock() < cached.refreshAt) {
                return Promise.resolve(cached.token);
            }
            // Обычный getToken во время refresh получает новый токен.
            if (inflight !== undefined) {
                return inflight.promise;
            }
            return start(false);
        },
    };
}
