// Клиент с подделками слоя U (prd.md §7): fetch, часы, logger, metrics, TokenProvider; конверт platform.policy.changed.
import { createPlatformAuthzClient } from '../../../src/core/client.js';
import type { PlatformAuthzClient, PlatformAuthzClientOptions } from '../../../src/core/types.js';
import { createClock, type TestClock } from './clock.js';
import {
    createFetchStub,
    type FetchStub,
    type RecordedRequest,
    type StubHandler,
} from './fetch-stub.js';
import {
    createRecordingLogger,
    createRecordingMetrics,
    type RecordingLogger,
    type RecordingMetrics,
} from './recording.js';
import { allowedSnapshot } from './snapshots.js';
import { createTokenStub, type TokenStub } from './token-stub.js';

export const PERMISSIONS_PATH = '/v1/authz/permissions';

export interface TestClient {
    readonly client: PlatformAuthzClient;
    readonly stub: FetchStub;
    readonly clock: TestClock;
    readonly log: RecordingLogger;
    readonly metrics: RecordingMetrics;
    readonly tokens: TokenStub;
    permissionsRequests(): RecordedRequest[];
}

export function createTestClient(
    options: {
        readonly handler?: StubHandler;
        readonly overrides?: Partial<PlatformAuthzClientOptions>;
    } = {},
): TestClient {
    const stub = createFetchStub(
        options.handler ??
            ((request) =>
                request.path === PERMISSIONS_PATH
                    ? { status: 200, json: allowedSnapshot() }
                    : { status: 500 }),
    );
    const clock = createClock(0);
    const log = createRecordingLogger();
    const metrics = createRecordingMetrics();
    const tokens = createTokenStub();
    const client = createPlatformAuthzClient({
        baseUrl: 'http://platform:3000',
        tokenProvider: tokens.provider,
        fetch: stub.fetch,
        clock: clock.now,
        logger: log.logger,
        metrics: metrics.metrics,
        ...options.overrides,
    });
    return {
        client,
        stub,
        clock,
        log,
        metrics,
        tokens,
        permissionsRequests: () => stub.requests.filter((r) => r.path === PERMISSIONS_PATH),
    };
}

/** Конверт platform.policy.changed по схеме Platform (как в schemas.spec.ts). */
export function policyEvent(
    tenantId: string,
    epoch: number,
    data: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        id: 'evt_01JABCDEFGHJKMNPQRSTVWXYZ0',
        type: 'platform.policy.changed',
        version: 1,
        occurredAt: '2026-10-27T10:00:00.000Z',
        tenant: 'acme',
        actor: { clientId: 'verdeect-platform', accountId: null, channel: 'system' },
        subject: { kind: 'company', id: tenantId },
        data: { tenantId, epoch, reason: 'member_roles', ...data },
        traceId: null,
    };
}

/** Даёт отработать цепочкам промисов. */
export async function flush(times = 10): Promise<void> {
    for (let i = 0; i < times; i += 1) {
        await Promise.resolve();
    }
}
