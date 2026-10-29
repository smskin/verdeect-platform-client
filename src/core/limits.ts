// Копия verdeect-platform apps/platform/src/modules/catalog/domain/limits.ts @ 7adb423 (prd.md §3.2, AC-20).
// Не править вручную: только перекопировать из источника и обновить коммит в этой строке.
import { z } from 'zod';

const limit = z.number().int().positive().nullable();

/** Схема лимитов тарифа (prd.md §5.5): `null` — без лимита; лишний ключ — ошибка. */
export const LimitsSchema = z.strictObject({
    members: limit,
    storageMb: limit,
    fileSizeMb: limit,
    modelRequestsPerMonth: limit,
    modelRequestsPerMemberPerMonth: limit,
    concurrentChats: limit,
    assistants: limit,
});

export type Limits = z.infer<typeof LimitsSchema>;
