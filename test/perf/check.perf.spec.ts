// AC-17 (NFR-1): check из кэша p99 < 0,2 мс; память ≤ 2 КБ на снимок (полный каталог: 24 права, 12 модулей).
import { describe, expect, it } from 'vitest';
import { createPlatformAuthzClient } from '../../src/core/client.js';
import type { PermissionDenyCode, Subject, TokenProvider } from '../../src/core/types.js';

// 20 прав Platform @ 513886e + 4 для полного объёма (24).
const PERMISSIONS = [
    'chat.use',
    'chat.web',
    'chat.office',
    'chat.images',
    'chat.messengers',
    'kanban.use',
    'calendar.use',
    'native.files.read',
    'knowledge.read',
    'dashboard.read',
    'native.files.write',
    'knowledge.manage',
    'native.models.manage',
    'agents.manage',
    'members.manage',
    'roles.manage',
    'modules.manage',
    'audit.read',
    'integrations.manage',
    'billing.read',
    'workers.use',
    'agents.use',
    'reports.read',
    'connections.manage',
] as const;
// Каталог модулей Platform.
const MODULES = [
    'files',
    'knowledge',
    'web',
    'office',
    'images',
    'kanban',
    'calendar',
    'workers',
    'agents',
    'dashboard',
    'reports',
    'connections',
] as const;
const DENY_CODES: readonly PermissionDenyCode[] = ['FORBIDDEN', 'PLAN_MODULE', 'MODULE_DISABLED'];
const TTL_GUARD_MS = 50_000;

function snapshotFor(sub: string): object {
    return {
        allow: true,
        epoch: 7,
        memberId: `mem_${sub}`,
        roles: ['admin'],
        permissions: PERMISSIONS.slice(0, 12),
        denied: Object.fromEntries(
            PERMISSIONS.slice(12).map((p, i) => [p, DENY_CODES[i % DENY_CODES.length]]),
        ),
        modules: MODULES.map((id, i) =>
            i % 3 === 2 ? { id, enabled: false, code: 'MODULE_DISABLED' } : { id, enabled: true },
        ),
        // После E4: limits — семь ключей копии (форма 1.1.0).
        limits: {
            members: 25,
            storageMb: 10240,
            fileSizeMb: 50,
            modelRequestsPerMonth: 100000,
            modelRequestsPerMemberPerMonth: null,
            concurrentChats: 5,
            assistants: null,
        },
    };
}

// Без записи запросов: запись исказила бы замер памяти. JSON → JSON.parse в клиенте, как в production.
const perfFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { sub: string };
    return new Response(JSON.stringify(snapshotFor(body.sub)), { status: 200 });
}) as typeof fetch;

const tokenProvider: TokenProvider = { getToken: async () => 'perf-token' };
const BASE_URL = 'http://platform:3000';

describe('AC-17: производительность check (NFR-1) (после E4: limits — семь ключей)', () => {
    it('AC-17: check из кэша — p99 < 0,2 мс (10 000 прогрев + 100 000 замеров по 10 правам)', async () => {
        const client = createPlatformAuthzClient({
            baseUrl: BASE_URL,
            tokenProvider,
            fetch: perfFetch,
        });
        const subject: Subject = {
            sub: 'usr_perf',
            tenant: 'acme',
            tenantId: 'cmp_perf',
            act: 'human',
        };
        const started = Date.now();
        await client.check(subject, PERMISSIONS[0]);
        for (let i = 0; i < 10_000; i += 1) {
            await client.check(subject, PERMISSIONS[i % 10] ?? PERMISSIONS[0]);
        }
        const samples = new Float64Array(100_000);
        for (let i = 0; i < 100_000; i += 1) {
            const t = performance.now();
            await client.check(subject, PERMISSIONS[i % 10] ?? PERMISSIONS[0]);
            samples[i] = performance.now() - t;
        }
        expect(Date.now() - started, 'замер дольше TTL').toBeLessThan(TTL_GUARD_MS);
        samples.sort();
        const p50 = samples[50_000] ?? Number.NaN;
        const p99 = samples[99_000] ?? Number.NaN;
        console.log(`AC-17 time: p50=${p50.toFixed(4)} ms p99=${p99.toFixed(4)} ms`);
        expect(p99).toBeLessThan(0.2);
    });

    it('AC-17: память — ≤ 20 МБ на 10 000 снимков (≤ 2 КБ на снимок)', async () => {
        const gc = (globalThis as { gc?: () => void }).gc;
        expect(gc, 'запускать через pnpm test:perf (--expose-gc)').toBeTypeOf('function');
        if (gc === undefined) {
            return;
        }
        const client = createPlatformAuthzClient({
            baseUrl: BASE_URL,
            tokenProvider,
            fetch: perfFetch,
            maxEntries: 20_000,
        });
        const subjectOf = (i: number) => ({
            sub: `usr_${i}`,
            tenant: 'acme',
            tenantId: 'cmp_perf',
            act: 'human' as const,
        });
        gc();
        const before = process.memoryUsage().heapUsed;
        for (let i = 0; i < 10_000; i += 1) {
            await client.permissions(subjectOf(i));
        }
        gc();
        const after = process.memoryUsage().heapUsed;
        const bytes = after - before;
        console.log(
            `AC-17 memory: ${bytes} B total, ${(bytes / 10_000).toFixed(0)} B per snapshot`,
        );
        // Клиент жив после второго gc → снимки не собраны.
        expect(await client.permissions(subjectOf(0))).toBeDefined();
        expect(bytes).toBeLessThanOrEqual(20 * 1024 * 1024);
    });
});
