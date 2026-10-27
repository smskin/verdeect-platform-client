# Источники копий в test/fixtures

Файлы — побайтные копии из `verdeect-platform`. Не править вручную: только перекопировать командой ниже и обновить коммит.

| Файл | Источник | Коммит |
|---|---|---|
| `platform-events.schema.json` | `apps/platform/contracts/events/platform-events.schema.json` | `7adb423` |

Перекопировать: `git -C ../verdeect-platform show <commit>:apps/platform/contracts/events/platform-events.schema.json > test/fixtures/platform-events.schema.json`.

`identity-events.schema.json` (слой C, prd.md §7 п. 7) добавляется на этапе E3.
