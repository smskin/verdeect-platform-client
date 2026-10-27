# Источники копий в test/fixtures

Файлы — побайтные копии из `verdeect-platform`. Не править вручную: только перекопировать командой ниже и обновить коммит.

| Файл | Источник | Коммит |
|---|---|---|
| `platform-events.schema.json` | `apps/platform/contracts/events/platform-events.schema.json` | `7adb423` |
| `identity-events.schema.json` | `apps/platform/contracts/events/identity-events.schema.json` | `7adb423` |

Перекопировать (`<file>` — имя файла из таблицы):

```bash
git -C ../verdeect-platform show <commit>:apps/platform/contracts/events/<file> > test/fixtures/<file>
```

`identity-events.schema.json` — для конвертов `identity.*`, которые публикует слой C (prd.md §7 п. 7).
