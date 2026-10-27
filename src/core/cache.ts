// Кэш снимков (prd.md §5.2 «Приём ответа», «Объединение запросов», §5.3, D4): LRU, индекс по tenantId, lastSeenEpoch, поколение clear().
import type { Act, AllowedPermissions, ModuleState, PermissionsResponse } from './types.js';

const STRING_POOL_MAX = 10_000;

/** Ключ снимка в кэше. */
export type SnapshotKey = string;

/** Ключ tenantId \0 sub \0 act (§5.3). */
export function snapshotKey(tenantId: string, sub: string, act: Act): SnapshotKey {
    return `${tenantId}\u0000${sub}\u0000${act}`;
}

/** Запись кэша. */
export interface CachedSnapshot {
    /** Снимок Platform. */
    readonly snapshot: PermissionsResponse;
    /** Компания снимка. */
    readonly tenantId: string;
    /** Момент истечения, мс. */
    readonly expiresAt: number;
    /** minEpoch запроса, давшего снимок (§5.2). */
    readonly requestedMinEpoch: number | undefined;
    /** До этого момента (мс) повторного чтения по pep нет (D6). */
    refreshAfter: number | undefined;
}

/** Итог «Приёма ответа» (§5.2). */
export type AcceptResult =
    | { readonly kind: 'cached' }
    // В кэше живой снимок с большей эпохой — не затираем.
    | { readonly kind: 'kept_newer' }
    | { readonly kind: 'stale'; readonly lastSeenEpoch: number }
    // Записан на denyTtl.
    | { readonly kind: 'pep_ahead' }
    // Запрос начат до clear() — не пишем.
    | { readonly kind: 'cleared' };

/** Параметры кэша. */
export interface SnapshotCacheConfig {
    /** Предел числа снимков. */
    readonly maxEntries: number;
    /** Предел числа компаний в lastSeenEpoch. */
    readonly lastSeenMaxEntries: number;
    /** TTL снимка-разрешения, мс. */
    readonly cacheTtlMs: number;
    /** TTL общего отказа и ответа PEP_AHEAD, мс. */
    readonly denyTtlMs: number;
}

/** Вход «Приёма ответа». */
export interface AcceptInput {
    /** Ключ снимка. */
    readonly key: SnapshotKey;
    /** Компания. */
    readonly tenantId: string;
    /** Ответ Platform. */
    readonly snapshot: PermissionsResponse;
    /** minEpoch запроса. */
    readonly requestedMinEpoch: number | undefined;
    /** Поколение кэша на момент начала запроса. */
    readonly generation: number;
    /** Текущее время, мс. */
    readonly now: number;
}

interface InflightRequest {
    readonly minEpoch: number | undefined;
    readonly generation: number;
    readonly promise: Promise<PermissionsResponse>;
}

/** Состояние клиента: снимки, lastSeenEpoch, запросы в полёте, поколение. Время — только параметр `now`. */
export class SnapshotCache {
    // Порядок вставки Map задаёт LRU: самый давний первый.
    private readonly entries = new Map<SnapshotKey, CachedSnapshot>();
    private readonly byTenant = new Map<string, Set<SnapshotKey>>();
    private readonly lastSeenEpochs = new Map<string, number>();
    private readonly inflight = new Map<SnapshotKey, InflightRequest[]>();
    private currentGeneration = 0;
    // Словарь каталога, а не данные участников: clear() его не очищает.
    private readonly strings = new Map<string, string>();
    private readonly modules = new Map<string, ModuleState>();

    /** @param config Параметры кэша. */
    constructor(private readonly config: SnapshotCacheConfig) {}

    /** Поколение: растёт на каждый `clear()`. */
    get generation(): number {
        return this.currentGeneration;
    }

    /** Живой снимок с LRU-касанием; истёкший удаляется и не отдаётся (D6). */
    get(key: SnapshotKey, now: number): CachedSnapshot | undefined {
        const entry = this.entries.get(key);
        if (entry === undefined) {
            return undefined;
        }
        if (now >= entry.expiresAt) {
            this.remove(key);
            return undefined;
        }
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry;
    }

    /** «Приём ответа» §5.2, п. 0–3; сравнения с lastSeenEpoch — до его обновления. */
    accept(input: AcceptInput): AcceptResult {
        // §5.1 clear(): ответ прошлого поколения не трогает ни кэш, ни lastSeenEpoch.
        if (input.generation !== this.currentGeneration) {
            return { kind: 'cleared' };
        }
        const { snapshot, tenantId, requestedMinEpoch } = input;
        const last = this.lastSeenEpochs.get(tenantId);
        this.touchLastSeen(tenantId);
        // п. 0: компании нет — на denyTtl, lastSeenEpoch не меняется.
        if (snapshot.epoch === null) {
            return this.write(input, this.config.denyTtlMs);
        }
        // п. 1: ответ старее уже виденной эпохи.
        if (last !== undefined && snapshot.epoch < last) {
            return { kind: 'stale', lastSeenEpoch: last };
        }
        // п. 2: Platform ещё не догнал minEpoch.
        if (requestedMinEpoch !== undefined && snapshot.epoch < requestedMinEpoch) {
            this.raiseLastSeen(tenantId, snapshot.epoch);
            this.write(input, this.config.denyTtlMs);
            return { kind: 'pep_ahead' };
        }
        // п. 3.
        this.raiseLastSeen(tenantId, snapshot.epoch);
        return this.write(input, snapshot.allow ? this.config.cacheTtlMs : this.config.denyTtlMs);
    }

    /** Откладывает повторное чтение по pep; срок жизни и requestedMinEpoch не меняются (D6). */
    deferRefresh(key: SnapshotKey, until: number): void {
        const entry = this.entries.get(key);
        if (entry !== undefined) {
            entry.refreshAfter = until;
        }
    }

    /** lastSeenEpoch компании с LRU-касанием (§5.3). */
    lastSeen(tenantId: string): number | undefined {
        this.touchLastSeen(tenantId);
        return this.lastSeenEpochs.get(tenantId);
    }

    /**
     * Сброс по событию (§5.3, D4): `subs` — снимки этих участников (human и agent), иначе вся
     * компания; удаляются только снимки с эпохой ниже эпохи события или `null`.
     */
    applyPolicyChange(
        tenantId: string,
        epoch: number,
        subs: readonly string[] | undefined,
    ): { readonly raised: boolean; readonly deleted: number } {
        const raised = this.raiseLastSeen(tenantId, epoch);
        const tenantKeys = this.byTenant.get(tenantId);
        const keys =
            subs !== undefined && subs.length > 0
                ? subs
                      .flatMap((sub) => [
                          snapshotKey(tenantId, sub, 'human'),
                          snapshotKey(tenantId, sub, 'agent'),
                      ])
                      .filter((key) => tenantKeys?.has(key) === true)
                : [...(tenantKeys ?? [])];
        let deleted = 0;
        for (const key of keys) {
            const entry = this.entries.get(key);
            if (
                entry !== undefined &&
                (entry.snapshot.epoch === null || entry.snapshot.epoch < epoch)
            ) {
                this.remove(key);
                deleted += 1;
            }
        }
        return { raised, deleted };
    }

    /** Запрос в полёте того же поколения с minEpoch не меньше нужного (§5.2). */
    joinInflight(
        key: SnapshotKey,
        minEpoch: number | undefined,
    ): Promise<PermissionsResponse> | undefined {
        const found = this.inflight
            .get(key)
            ?.find(
                (item) =>
                    item.generation === this.currentGeneration &&
                    (item.minEpoch ?? 0) >= (minEpoch ?? 0),
            );
        return found?.promise;
    }

    /** Регистрирует запрос в полёте; удаляется по завершении. Отказ обрабатывает вызывающий. */
    trackInflight(
        key: SnapshotKey,
        minEpoch: number | undefined,
        promise: Promise<PermissionsResponse>,
    ): void {
        const item: InflightRequest = { minEpoch, generation: this.currentGeneration, promise };
        const list = this.inflight.get(key) ?? [];
        list.push(item);
        this.inflight.set(key, list);
        const cleanup = (): void => {
            const current = this.inflight.get(key);
            if (current === undefined) {
                return;
            }
            const index = current.indexOf(item);
            if (index >= 0) {
                current.splice(index, 1);
            }
            if (current.length === 0) {
                this.inflight.delete(key);
            }
        };
        promise.then(cleanup, cleanup);
    }

    /** Сбрасывает снимки, lastSeenEpoch и запросы в полёте; новое поколение (§5.1). */
    clear(): void {
        this.currentGeneration += 1;
        this.entries.clear();
        this.byTenant.clear();
        this.lastSeenEpochs.clear();
        this.inflight.clear();
    }

    /** Для тестов: число снимков. */
    size(): number {
        return this.entries.size;
    }

    /** Для тестов: ключи индекса компании. */
    tenantKeys(tenantId: string): readonly SnapshotKey[] {
        return [...(this.byTenant.get(tenantId) ?? [])];
    }

    /** Для тестов: число компаний в lastSeenEpoch. */
    lastSeenSize(): number {
        return this.lastSeenEpochs.size;
    }

    // «Ответ с более высокой эпохой заменяет в кэше более низкую, но не наоборот» (§5.2); null ниже любой.
    private write(input: AcceptInput, ttlMs: number): AcceptResult {
        const { key, tenantId, snapshot, requestedMinEpoch, now } = input;
        const existing = this.entries.get(key);
        if (
            existing !== undefined &&
            now < existing.expiresAt &&
            existing.snapshot.epoch !== null &&
            (snapshot.epoch === null || snapshot.epoch < existing.snapshot.epoch)
        ) {
            return { kind: 'kept_newer' };
        }
        this.store(key, {
            snapshot: snapshot.allow ? this.compact(snapshot) : snapshot,
            tenantId,
            expiresAt: now + ttlMs,
            requestedMinEpoch,
            refreshAfter: undefined,
        });
        return { kind: 'cached' };
    }

    // AC-17: строки каталога и модули делятся между снимками; memberId, epoch, limits — как есть.
    private compact(snapshot: AllowedPermissions): AllowedPermissions {
        return {
            allow: true,
            epoch: snapshot.epoch,
            memberId: snapshot.memberId,
            roles: snapshot.roles.map((s) => this.intern(s)),
            permissions: snapshot.permissions.map((s) => this.intern(s)),
            denied: Object.fromEntries(
                Object.entries(snapshot.denied).map(([p, code]) => [this.intern(p), code]),
            ),
            modules: snapshot.modules.map((m) => this.sharedModule(m)),
            limits: snapshot.limits,
        };
    }

    // ponytail: пул строк до 10 000 записей; при большем каталоге интернирование прекращается (память растёт линейно), поднимать предел только по замеру AC-17.
    private intern(value: string): string {
        const pooled = this.strings.get(value);
        if (pooled !== undefined) {
            return pooled;
        }
        if (this.strings.size < STRING_POOL_MAX) {
            this.strings.set(value, value);
        }
        return value;
    }

    private sharedModule(module: ModuleState): ModuleState {
        const key = `${module.id}|${module.enabled}|${module.code ?? ''}`;
        const pooled = this.modules.get(key);
        if (pooled !== undefined) {
            return pooled;
        }
        const shared = Object.freeze({ ...module, id: this.intern(module.id) });
        if (this.modules.size < STRING_POOL_MAX) {
            this.modules.set(key, shared);
        }
        return shared;
    }

    private store(key: SnapshotKey, entry: CachedSnapshot): void {
        this.remove(key);
        this.entries.set(key, entry);
        const keys = this.byTenant.get(entry.tenantId) ?? new Set<SnapshotKey>();
        keys.add(key);
        this.byTenant.set(entry.tenantId, keys);
        while (this.entries.size > this.config.maxEntries) {
            const oldest = this.entries.keys().next();
            if (oldest.done === true) {
                break;
            }
            this.remove(oldest.value);
        }
    }

    private remove(key: SnapshotKey): void {
        const entry = this.entries.get(key);
        if (entry === undefined) {
            return;
        }
        this.entries.delete(key);
        const keys = this.byTenant.get(entry.tenantId);
        keys?.delete(key);
        if (keys?.size === 0) {
            this.byTenant.delete(entry.tenantId);
        }
    }

    private touchLastSeen(tenantId: string): void {
        const value = this.lastSeenEpochs.get(tenantId);
        if (value !== undefined) {
            this.lastSeenEpochs.delete(tenantId);
            this.lastSeenEpochs.set(tenantId, value);
        }
    }

    private raiseLastSeen(tenantId: string, epoch: number): boolean {
        const current = this.lastSeenEpochs.get(tenantId);
        if (current !== undefined && epoch <= current) {
            this.touchLastSeen(tenantId);
            return false;
        }
        this.lastSeenEpochs.delete(tenantId);
        this.lastSeenEpochs.set(tenantId, epoch);
        while (this.lastSeenEpochs.size > this.config.lastSeenMaxEntries) {
            const oldest = this.lastSeenEpochs.keys().next();
            if (oldest.done === true) {
                break;
            }
            this.lastSeenEpochs.delete(oldest.value);
        }
        return true;
    }
}
