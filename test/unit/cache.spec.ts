// Кэш снимков (prd.md §5.2 «Приём ответа», «Объединение запросов», §5.3): AC-3, AC-4, AC-5, AC-6, AC-19 — на уровне модуля.
import { describe, expect, it } from 'vitest';
import { SnapshotCache, snapshotKey, type AcceptInput } from '../../src/core/cache.js';
import type { PermissionsResponse } from '../../src/core/types.js';
import { allowedSnapshot, generalDeny } from './support/snapshots.js';

const KEY_A = snapshotKey('cmp_1', 'usr_a', 'human');
const KEY_A_AGENT = snapshotKey('cmp_1', 'usr_a', 'agent');
const KEY_B = snapshotKey('cmp_1', 'usr_b', 'human');
const KEY_OTHER = snapshotKey('cmp_2', 'usr_a', 'human');

function newCache(): SnapshotCache {
    return new SnapshotCache({
        maxEntries: 100,
        lastSeenMaxEntries: 10,
        cacheTtlMs: 60_000,
        denyTtlMs: 5_000,
    });
}

function input(
    cache: SnapshotCache,
    snapshot: PermissionsResponse,
    o: Partial<AcceptInput> = {},
): AcceptInput {
    return {
        key: KEY_A,
        tenantId: 'cmp_1',
        snapshot,
        requestedMinEpoch: undefined,
        generation: cache.generation,
        now: 0,
        ...o,
    };
}

describe('§5.3: TTL и LRU', () => {
    it('D4: позитивный снимок живёт cacheTtl — на 59 999 мс есть, на 60 000 мс нет', () => {
        const cache = newCache();
        cache.accept(input(cache, allowedSnapshot()));
        expect(cache.get(KEY_A, 59_999)).toBeDefined();
        expect(cache.get(KEY_A, 60_000)).toBeUndefined();
    });

    it('AC-3: общий отказ живёт denyTtl — на 4 с есть, на 5 с нет', () => {
        const cache = newCache();
        cache.accept(input(cache, generalDeny('COMPANY_SUSPENDED')));
        expect(cache.get(KEY_A, 4_000)).toBeDefined();
        expect(cache.get(KEY_A, 5_000)).toBeUndefined();
    });

    it('AC-19: maxEntries 100, 101 запись → самая давняя вытеснена, недавняя на месте, индекс компании без вытесненной', () => {
        const cache = newCache();
        const keys = Array.from({ length: 101 }, (_, i) =>
            snapshotKey('cmp_1', `usr_${i}`, 'human'),
        );
        for (const key of keys) {
            cache.accept(input(cache, allowedSnapshot(), { key }));
        }
        expect(cache.size()).toBe(100);
        expect(cache.get(keys[0] ?? '', 0)).toBeUndefined();
        expect(cache.get(keys[100] ?? '', 0)).toBeDefined();
        expect(cache.tenantKeys('cmp_1')).toHaveLength(100);
        expect(cache.tenantKeys('cmp_1')).not.toContain(keys[0]);
    });

    it('AC-19: get касается записи — она не вытесняется следующей', () => {
        const cache = newCache();
        const keys = Array.from({ length: 100 }, (_, i) =>
            snapshotKey('cmp_1', `usr_${i}`, 'human'),
        );
        for (const key of keys) {
            cache.accept(input(cache, allowedSnapshot(), { key }));
        }
        expect(cache.get(keys[0] ?? '', 0)).toBeDefined();
        cache.accept(input(cache, allowedSnapshot(), { key: 'extra' }));
        expect(cache.get(keys[0] ?? '', 0)).toBeDefined();
        expect(cache.get(keys[1] ?? '', 0)).toBeUndefined();
    });
});

describe('§5.2: Приём ответа', () => {
    it('AC-3: epoch: null → в кэш на denyTtl, lastSeenEpoch не меняется, не stale и не pep_ahead', () => {
        const cache = newCache();
        cache.applyPolicyChange('cmp_1', 8, undefined);
        const result = cache.accept(
            input(cache, generalDeny('NOT_MEMBER', null), { requestedMinEpoch: 9 }),
        );
        expect(result).toEqual({ kind: 'cached' });
        expect(cache.lastSeen('cmp_1')).toBe(8);
        expect(cache.get(KEY_A, 4_000)).toBeDefined();
        expect(cache.get(KEY_A, 5_000)).toBeUndefined();
    });

    it('AC-5: epoch < lastSeenEpoch → stale, в кэш не записан', () => {
        const cache = newCache();
        cache.applyPolicyChange('cmp_1', 8, undefined);
        expect(cache.accept(input(cache, allowedSnapshot({ epoch: 7 })))).toEqual({
            kind: 'stale',
            lastSeenEpoch: 8,
        });
        expect(cache.get(KEY_A, 0)).toBeUndefined();
    });

    it('AC-6: epoch < запрошенного minEpoch → pep_ahead, в кэше на denyTtl с requestedMinEpoch', () => {
        const cache = newCache();
        const result = cache.accept(
            input(cache, allowedSnapshot({ epoch: 7 }), { requestedMinEpoch: 9 }),
        );
        expect(result).toEqual({ kind: 'pep_ahead' });
        expect(cache.get(KEY_A, 0)?.requestedMinEpoch).toBe(9);
        expect(cache.get(KEY_A, 4_999)).toBeDefined();
        expect(cache.get(KEY_A, 5_000)).toBeUndefined();
        expect(cache.lastSeen('cmp_1')).toBe(7);
    });

    it('AC-6: lastSeenEpoch 8, ответ 7 при minEpoch 9 → stale, не pep_ahead, в кэше пусто', () => {
        const cache = newCache();
        cache.applyPolicyChange('cmp_1', 8, undefined);
        const result = cache.accept(
            input(cache, allowedSnapshot({ epoch: 7 }), { requestedMinEpoch: 9 }),
        );
        expect(result.kind).toBe('stale');
        expect(cache.get(KEY_A, 0)).toBeUndefined();
    });

    it('AC-6: ответ с эпохой 8 не затирает живой снимок с эпохой 9 (kept_newer); равная эпоха заменяет', () => {
        const cache = newCache();
        // Ответ ниже живого снимка: null (п. 0 минует проверку lastSeen) — ниже любой эпохи.
        cache.accept(input(cache, allowedSnapshot({ epoch: 9 })));
        expect(cache.accept(input(cache, generalDeny('NOT_MEMBER', null)))).toEqual({
            kind: 'kept_newer',
        });
        expect(cache.get(KEY_A, 0)?.snapshot.epoch).toBe(9);
        const equal = cache.accept(
            input(cache, allowedSnapshot({ epoch: 9 }), { requestedMinEpoch: 9 }),
        );
        expect(equal).toEqual({ kind: 'cached' });
        expect(cache.get(KEY_A, 0)?.requestedMinEpoch).toBe(9);
    });

    it('AC-6: ответ 8 при снимке 9 в кэше и lastSeen, вытесненном LRU, → kept_newer', () => {
        const cache = new SnapshotCache({
            maxEntries: 100,
            lastSeenMaxEntries: 1,
            cacheTtlMs: 60_000,
            denyTtlMs: 5_000,
        });
        cache.accept(input(cache, allowedSnapshot({ epoch: 9 })));
        cache.applyPolicyChange('cmp_9', 1, undefined);
        expect(cache.lastSeen('cmp_1')).toBeUndefined();
        expect(cache.accept(input(cache, allowedSnapshot({ epoch: 8 })))).toEqual({
            kind: 'kept_newer',
        });
        expect(cache.get(KEY_A, 0)?.snapshot.epoch).toBe(9);
    });

    it('§5.3: lastSeenEpoch — наибольшая эпоха ответов', () => {
        const cache = newCache();
        cache.accept(input(cache, allowedSnapshot({ epoch: 7 })));
        cache.accept(input(cache, allowedSnapshot({ epoch: 9 }), { key: KEY_B }));
        expect(cache.lastSeen('cmp_1')).toBe(9);
    });

    it('AC-19: ответ запроса прошлого поколения → cleared, ни кэш, ни lastSeenEpoch', () => {
        const cache = newCache();
        const generation = cache.generation;
        cache.clear();
        expect(cache.accept(input(cache, allowedSnapshot(), { generation }))).toEqual({
            kind: 'cleared',
        });
        expect(cache.get(KEY_A, 0)).toBeUndefined();
        expect(cache.lastSeen('cmp_1')).toBeUndefined();
    });

    it('D6: deferRefresh не меняет expiresAt и requestedMinEpoch', () => {
        const cache = newCache();
        cache.accept(input(cache, allowedSnapshot({ epoch: 9 }), { requestedMinEpoch: 8 }));
        cache.deferRefresh(KEY_A, 5_000);
        const entry = cache.get(KEY_A, 0);
        expect(entry).toMatchObject({
            expiresAt: 60_000,
            requestedMinEpoch: 8,
            refreshAfter: 5_000,
        });
    });
});

describe('AC-4: applyPolicyChange', () => {
    it('AC-4: subs: [A] удаляет снимки A (human и agent), B той же компании цел', () => {
        const cache = newCache();
        for (const key of [KEY_A, KEY_A_AGENT, KEY_B]) {
            cache.accept(input(cache, allowedSnapshot(), { key }));
        }
        expect(cache.applyPolicyChange('cmp_1', 8, ['usr_a'])).toEqual({
            raised: true,
            deleted: 2,
        });
        expect(cache.get(KEY_A, 0)).toBeUndefined();
        expect(cache.get(KEY_A_AGENT, 0)).toBeUndefined();
        expect(cache.get(KEY_B, 0)).toBeDefined();
    });

    it('AC-4: без subs — все снимки компании; другая компания цела', () => {
        const cache = newCache();
        cache.accept(input(cache, allowedSnapshot(), { key: KEY_A }));
        cache.accept(input(cache, allowedSnapshot(), { key: KEY_B }));
        cache.accept(input(cache, allowedSnapshot(), { key: KEY_OTHER, tenantId: 'cmp_2' }));
        expect(cache.applyPolicyChange('cmp_1', 8, undefined).deleted).toBe(2);
        expect(cache.get(KEY_OTHER, 0)).toBeDefined();
        expect(cache.tenantKeys('cmp_1')).toEqual([]);
    });

    it('AC-4: эпоха события ≤ эпохи снимка — без удаления', () => {
        const cache = newCache();
        cache.accept(input(cache, allowedSnapshot({ epoch: 8 })));
        expect(cache.applyPolicyChange('cmp_1', 8, undefined).deleted).toBe(0);
        expect(cache.applyPolicyChange('cmp_1', 7, undefined).deleted).toBe(0);
        expect(cache.get(KEY_A, 0)).toBeDefined();
    });

    it('AC-4: снимок с epoch: null удаляется любым событием', () => {
        const cache = newCache();
        cache.accept(input(cache, generalDeny('NOT_MEMBER', null)));
        expect(cache.applyPolicyChange('cmp_1', 1, undefined).deleted).toBe(1);
    });

    it('AC-4: raised — true для новой эпохи, false для повтора и старой', () => {
        const cache = newCache();
        expect(cache.applyPolicyChange('cmp_1', 8, undefined).raised).toBe(true);
        expect(cache.applyPolicyChange('cmp_1', 8, undefined).raised).toBe(false);
        expect(cache.applyPolicyChange('cmp_1', 7, undefined).raised).toBe(false);
        expect(cache.applyPolicyChange('cmp_1', 9, undefined).raised).toBe(true);
    });

    it('AC-4: lastSeenEpoch — LRU на lastSeenMaxEntries: 11 компаний → 10 записей, первая вытеснена', () => {
        const cache = newCache();
        for (let i = 1; i <= 11; i += 1) {
            cache.applyPolicyChange(`cmp_${i}`, 5, undefined);
        }
        expect(cache.lastSeenSize()).toBe(10);
        expect(cache.lastSeen('cmp_1')).toBeUndefined();
        expect(cache.lastSeen('cmp_11')).toBe(5);
    });
});

describe('§5.2: объединение запросов', () => {
    const SNAP = Promise.resolve<PermissionsResponse>(allowedSnapshot());

    it('AC-2: joinInflight находит запрос с тем же ключом и minEpoch', () => {
        const cache = newCache();
        cache.trackInflight(KEY_A, undefined, SNAP);
        expect(cache.joinInflight(KEY_A, undefined)).toBe(SNAP);
        expect(cache.joinInflight(KEY_B, undefined)).toBeUndefined();
    });

    it('AC-6: запрос с minEpoch 8 не годится вызывающему с minEpoch 9; с 9 годится для 8 и для undefined', () => {
        const cache = newCache();
        const p8 = Promise.resolve<PermissionsResponse>(allowedSnapshot({ epoch: 8 }));
        const p9 = Promise.resolve<PermissionsResponse>(allowedSnapshot({ epoch: 9 }));
        cache.trackInflight(KEY_A, 8, p8);
        expect(cache.joinInflight(KEY_A, 9)).toBeUndefined();
        cache.trackInflight(KEY_A, 9, p9);
        expect(cache.joinInflight(KEY_A, 9)).toBe(p9);
        expect(cache.joinInflight(KEY_A, 8)).toBe(p8);
        expect(cache.joinInflight(KEY_A, undefined)).toBe(p8);
    });

    it('AC-19: после clear() новые вызовы не присоединяются к старым запросам', () => {
        const cache = newCache();
        cache.trackInflight(KEY_A, undefined, new Promise(() => undefined));
        cache.clear();
        expect(cache.joinInflight(KEY_A, undefined)).toBeUndefined();
    });

    it('§5.2: запрос удаляется из полёта после завершения и после отказа (без unhandled rejection)', async () => {
        const cache = newCache();
        const ok = Promise.resolve<PermissionsResponse>(allowedSnapshot());
        const failed = Promise.reject<PermissionsResponse>(new Error('boom'));
        cache.trackInflight(KEY_A, undefined, ok);
        cache.trackInflight(KEY_B, undefined, failed);
        await ok;
        await failed.catch(() => undefined);
        await Promise.resolve();
        expect(cache.joinInflight(KEY_A, undefined)).toBeUndefined();
        expect(cache.joinInflight(KEY_B, undefined)).toBeUndefined();
    });
});
