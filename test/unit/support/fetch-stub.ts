// Подделанный fetch слоя U (prd.md §7): записывает запросы, отвечает обработчиком теста; без сети.

export interface RecordedRequest {
    readonly url: string;
    readonly path: string;
    readonly method: string;
    readonly headers: Headers;
    readonly bodyText: string;
    readonly signal: AbortSignal | undefined;
    json(): unknown;
    form(): URLSearchParams;
}

export type StubReply =
    | { readonly status: number; readonly json?: unknown; readonly text?: string }
    | 'network-error'
    | 'hang';

export type StubHandler = (request: RecordedRequest) => StubReply | Promise<StubReply>;

export interface FetchStub {
    readonly fetch: typeof fetch;
    readonly requests: RecordedRequest[];
    reply(handler: StubHandler): void;
    countTo(path: string): number;
}

export interface Gate<T> {
    readonly promise: Promise<T>;
    open(value: T): void;
}

export function createGate<T>(): Gate<T> {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, open: (value) => resolve(value) };
}

function bodyToText(body: RequestInit['body']): string {
    if (body === undefined || body === null) {
        return '';
    }
    if (typeof body === 'string') {
        return body;
    }
    if (body instanceof URLSearchParams) {
        return body.toString();
    }
    throw new TypeError('fetch-stub: unsupported body');
}

function hang(signal: AbortSignal | undefined): Promise<Response> {
    return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
        });
    });
}

export function createFetchStub(handler?: StubHandler): FetchStub {
    let current: StubHandler = handler ?? (() => ({ status: 500 }));
    const requests: RecordedRequest[] = [];

    const fetchFn = async (
        input: string | URL | Request,
        init?: RequestInit,
    ): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        const bodyText = bodyToText(init?.body);
        const request: RecordedRequest = {
            url,
            path: new URL(url).pathname,
            method: init?.method ?? 'GET',
            headers: new Headers(init?.headers),
            bodyText,
            signal: init?.signal ?? undefined,
            json: () => JSON.parse(bodyText) as unknown,
            form: () => new URLSearchParams(bodyText),
        };
        requests.push(request);
        const reply = await current(request);
        if (reply === 'network-error') {
            throw new TypeError('fetch failed');
        }
        if (reply === 'hang') {
            return hang(request.signal);
        }
        return new Response(reply.text ?? JSON.stringify(reply.json ?? {}), {
            status: reply.status,
            headers: { 'content-type': 'application/json' },
        });
    };

    return {
        fetch: fetchFn as typeof fetch,
        requests,
        reply(next) {
            current = next;
        },
        countTo(path) {
            return requests.filter((r) => r.path === path).length;
        },
    };
}
