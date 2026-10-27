# Фаза 6: Производительность и завершение этапа

Plan: [index.md](index.md)
Tasks: 29-30
Depends on: Phase 5

## Цель

- Отдельный набор `test/perf` (`vitest.perf.config.ts`, Node с `--expose-gc`) подтверждает NFR-1: `check` из кэша p99 < 0,2 мс, не больше 2 КБ на снимок (AC-17).
- Сборка проверена на отсутствие `zod` в `.d.ts`.
- `AGENTS.md` отражает фактическую структуру после E1.
- Все проверки этапа зелёные.

## Свидетельства из текущего кода

| Путь | Символы | Зачем |
|---|---|---|
| `package.json` (Task 1) | `scripts.test:perf` = `vitest run -c vitest.perf.config.ts` | Команда набора |
| `src/core/client.ts` (Task 24) | `createPlatformAuthzClient`, `check`, `permissions` | Объект замеров |
| `src/core/cache.ts` (Task 21) | `SnapshotCache.accept` | Место запасного плана по памяти |
| `AGENTS.md` | раздел «Структура проекта» с пометками (E1)/(E2)/(E3) | Обновить под факт |
| Vitest 5 (Context7 `/vitest-dev/vitest/v5.0.3`) | `test.execArgv: string[]` | Передача `--expose-gc` в процесс воркера |

## Файлы для изменения

| Путь | Действие | Что сделать |
|---|---|---|
| `vitest.perf.config.ts` | create | Набор `test/perf/**/*.perf.spec.ts`, `pool: 'forks'`, `execArgv: ['--expose-gc']` |
| `test/perf/check.perf.spec.ts` | create | AC-17: время и память |
| `src/core/cache.ts` | modify (только по условию Task 29, шаг 4) | Интернирование строк снимка |
| `AGENTS.md` | modify | Структура, команды, точки входа после E1 |

## Task 29: Набор производительности (AC-17, NFR-1)

### Зачем
NFR-1 — нефункциональное требование с численным порогом, поэтому оно живёт в отдельном наборе. Нужен `--expose-gc` и последовательный запуск без параллельных файлов: замеры не должны мешать друг другу (AC-17: «в CI — тот же job `test`»; CI появится после этапа).

### Шаги реализации
1. Создать `vitest.perf.config.ts`:
   ```ts
   // Набор производительности (prd.md AC-17, NFR-1): test/perf, отдельный процесс Node с --expose-gc, без параллелизма файлов.
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
       test: {
           include: ['test/perf/**/*.perf.spec.ts'],
           environment: 'node',
           pool: 'forks',
           execArgv: ['--expose-gc'],
           fileParallelism: false,
           testTimeout: 300_000,
       },
   });
   ```
   `pool: 'forks'`: флаг `--expose-gc` гарантированно действует в дочернем процессе; для `worker_threads` часть флагов V8 не применяется.
2. Создать `test/perf/check.perf.spec.ts` (первая строка — `// AC-17 (NFR-1): check из кэша p99 < 0,2 мс; память ≤ 2 КБ на снимок (полный каталог: 24 права, 12 модулей).`):
   - Каталог для объёма — константы в файле:
     ```ts
     const PERMISSIONS = ['chat.use', 'chat.web', 'chat.office', 'chat.images', 'chat.messengers', 'kanban.use', 'calendar.use', 'native.files.read', 'knowledge.read', 'dashboard.read', 'native.files.write', 'knowledge.manage', 'native.models.manage', 'agents.manage', 'members.manage', 'roles.manage', 'modules.manage', 'audit.read', 'integrations.manage', 'billing.read', 'workers.use', 'agents.use', 'reports.read', 'connections.manage'] as const; // 20 прав Platform @ 7adb423 + 4 для полного объёма (24)
     const MODULES = ['files', 'knowledge', 'web', 'office', 'images', 'kanban', 'calendar', 'workers', 'agents', 'dashboard', 'reports', 'connections'] as const; // каталог модулей Platform
     ```
     Снимок: первые 12 прав в `permissions`, остальные 12 в `denied` (чередуются `FORBIDDEN`, `PLAN_MODULE`, `MODULE_DISABLED`), все 12 модулей в `modules` (у каждого третьего `enabled: false, code: 'MODULE_DISABLED'`), `roles: ['admin']`, `limits: { fileSizeMb: 50 }`.
   - Свой минимальный `fetch` без записи запросов (запись исказила бы замер памяти): `async (_input, init) => new Response(JSON.stringify(snapshotFor(JSON.parse(String(init?.body)).sub)), { status: 200 })`, где `snapshotFor(sub)` даёт `memberId: `mem_${sub}``. Ответ строится через `JSON.stringify` → `JSON.parse` в клиенте, как в production: строки в каждом снимке свои.
   - `tokenProvider: { getToken: async () => 'perf-token' }`, без `logger` и `metrics`.
   - `it('AC-17: check из кэша — p99 < 0,2 мс (10 000 прогрев + 100 000 замеров по 10 правам)')`:
     ```
     client = createPlatformAuthzClient({ baseUrl: 'http://platform:3000', tokenProvider, fetch })
     subject = { sub: 'usr_perf', tenant: 'acme', tenantId: 'cmp_perf', act: 'human' }
     await client.check(subject, PERMISSIONS[0])                       // снимок в кэше
     for i < 10_000: await client.check(subject, PERMISSIONS[i % 10])  // прогрев
     samples = new Float64Array(100_000)
     for i < 100_000: t = performance.now(); await client.check(subject, PERMISSIONS[i % 10]); samples[i] = performance.now() − t
     samples.sort(); p50 = samples[50_000]; p99 = samples[99_000]
     console.log(`AC-17 time: p50=${p50.toFixed(4)} ms p99=${p99.toFixed(4)} ms`)
     expect(p99).toBeLessThan(0.2)
     ```
     Часы клиента — реальные (`Date.now`). За время замера TTL 60 с не истекает: 110 000 вызовов занимают единицы секунд. Если прогон дольше 50 с, тест падает с сообщением «замер дольше TTL», а не даёт ложный промах.
   - `it('AC-17: память — ≤ 20 МБ на 10 000 снимков (≤ 2 КБ на снимок)')`:
     ```
     gc = (globalThis as { gc?: () => void }).gc; expect(gc, 'запускать через pnpm test:perf (--expose-gc)').toBeTypeOf('function')
     client = createPlatformAuthzClient({ baseUrl, tokenProvider, fetch, maxEntries: 20_000 })
     gc(); before = process.memoryUsage().heapUsed
     for i < 10_000: await client.permissions({ sub: `usr_${i}`, tenant: 'acme', tenantId: 'cmp_perf', act: 'human' })
     gc(); after = process.memoryUsage().heapUsed
     bytes = after − before; perSnapshot = bytes / 10_000
     console.log(`AC-17 memory: ${bytes} B total, ${perSnapshot.toFixed(0)} B per snapshot`)
     expect(await client.permissions({ sub: 'usr_0', … })).toBeDefined()   // клиент жив после второго gc → снимки не собраны
     expect(bytes).toBeLessThanOrEqual(20 * 1024 * 1024)
     ```
3. Выполнить `pnpm test:perf`. Отчёт (p50, p99, байт на снимок) — в выводе.
4. **Запасной план, только если тест памяти красный** (байт на снимок > 2048). Решение принято на этапе планирования и выполняется буквально:
   - В `src/core/cache.ts` добавить приватный пул: `#strings = new Map<string, string>()` с пределом `STRING_POOL_MAX = 10_000` записей и `#modules = new Map<string, ModuleState>()` с ключом `${id}|${enabled}|${code ?? ''}`.
   - Добавить приватный метод `#compact(snapshot)`, вызываемый в `#write` перед `#store` только для `snapshot.allow === true`. Он строит новый объект того же типа: `roles` и `permissions` — массивы интернированных строк (`#intern(s)`: вернуть строку из пула, при отсутствии и размере пула < предела — положить); `denied` — объект с интернированными ключами (значения — литералы кодов); `modules` — общие `Object.freeze`-объекты из `#modules`. `memberId`, `epoch`, `limits` переносятся как есть.
   - Комментарий `// ponytail: пул строк до 10 000 записей; при большем каталоге интернирование прекращается (память растёт линейно), поднимать предел только по замеру AC-17.`
   - `clear()` пулы не очищает: это не данные участников, а словарь каталога.
   - Перезапустить `pnpm test` и `pnpm test:perf`. Оба должны быть зелёными.
   Если тест памяти зелёный с первого раза, шаг 4 не выполняется и `cache.ts` не меняется.
5. Если красный тест времени (p99 ≥ 0,2 мс): остановиться и сообщить p50 и p99 пользователю. Оптимизация горячего пути без замера профиля в план не входит, а снижать порог нельзя (NFR-1).

### Интерфейсы и контракты
- Публичный API не меняется. Запасной план меняет только внутреннее представление снимка в кэше. `permissions()` по-прежнему возвращает объект формы `PermissionsResponse`.

### Свидетельства требований
- AC-17, NFR-1, prd.md §4 (`test/perf/`, `vitest.perf.config.ts`).

### Ошибки и логирование
- Логирования нет (`logger` не передан). Отчёт — `console.log` теста.

### Тесты
Этот набор. Команда: `pnpm test:perf`. Он не входит в `pnpm test`: другой `include`.

### Критерии приёмки
- `pnpm test:perf` зелёный; в выводе строки `AC-17 time: …` и `AC-17 memory: …`.

### Проверка
- `pnpm test:perf` → 0; `pnpm typecheck` → 0 (конфиг входит в `tsconfig.json`); `pnpm lint` → 0.

**Skill:** nestjs-code generic vitest.perf.config.ts (CREATE); nestjs-code test unit check.perf (CREATE) — perf-набор библиотеки (`test/perf/*.perf.spec.ts`, а не `*.spec.ts` рядом с кодом); nestjs-code generic src/core/cache.ts (MODIFY) — только по условию шага 4.

## Task 30: `AGENTS.md` и итоговая проверка этапа

### Зачем
`AGENTS.md` — карта репозитория для агентов. После E1 пометки «(E1)» устарели, а команды `pnpm` появились. Итоговая проверка подтверждает, что этап оставляет проект в рабочем состоянии и что в `.d.ts` нет `zod` (подготовка к AC-12 в E2).

### Шаги реализации
1. В `AGENTS.md`:
   - «Структура проекта»: убрать пометки «(E1)» у созданного. Дерево `src/core/` привести к фактическому составу: `index.ts`, `types.ts`, `codes.ts`, `errors.ts`, `schemas.ts`, `options.ts`, `log-limiter.ts`, `transport.ts`, `token-provider.ts`, `cache.ts`, `decide.ts`, `client.ts` с однострочными комментариями. `test/`: `unit/` (spec по модулям и `support/`), `perf/`, `fixtures/` (`platform-events.schema.json`, `SOURCES.md`). Пометки «(E2)» у `src/nest/*`, `src/testing/*`, `test/consumer/` и «(E3)» у `test/contract/`, `docs/`, `scripts/` оставить. Добавить конфиги: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts`, `vitest.perf.config.ts`.
   - Новый раздел «Команды» после «Структуры проекта»:
     ```bash
     pnpm install         # зависимости по pnpm-lock.yaml
     pnpm typecheck       # tsc --noEmit
     pnpm lint            # ESLint (TSDoc, границы ядра)
     pnpm format:check    # Prettier
     pnpm test            # слой U: test/unit
     pnpm test:perf       # AC-17: test/perf с --expose-gc
     pnpm build           # dist/ (.js + .d.ts)
     ```
     Строкой ниже: «Makefile и CI появятся после E1 (`/aif-build-automation`, `/aif-ci`)».
   - «Ключевые точки входа»: убрать «(E1)» у `src/core/index.ts` и `package.json`; добавить `src/core/client.ts` — «`createPlatformAuthzClient`: оркестровка кэша, свежести и запросов».
2. Выполнить итоговую проверку по порядку, каждую команду отдельно:
   - `pnpm install --frozen-lockfile`
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm format:check`
   - `pnpm test`
   - `pnpm test:perf`
   - `pnpm build`
   - `grep -rl "zod" dist --include=*.d.ts` — ожидается пустой вывод (код 1): `.d.ts` пакета не импортирует `zod` (NFR-4; AC-12 проверит это в E2).
   - `grep -rlE "@nestjs|reflect-metadata|rxjs|@verdeect/auth" dist/core` — ожидается пустой вывод (D2).
3. Если `grep` по `zod` нашёл файлы: найти экспорт, тип которого ссылается на zod (обычно схема, случайно ставшая `export const`), и сделать его неэкспортируемым по правилу Task 10. Повторить `pnpm build` и `grep`.

### Интерфейсы и контракты
- `AGENTS.md` в `.prettierignore` (Task 3): формат таблиц ручной.

### Свидетельства требований
- D2, NFR-4; rules/base.md; skill-context «Library Package Scope». README и CHANGELOG — этап E3 (prd.md §9), здесь не создаются.

### Ошибки и логирование
Не применимо.

### Тесты
Итоговые прогоны шага 2.

### Критерии приёмки
- Все команды шага 2 дают ожидаемый результат.
- В `AGENTS.md` нет пометок «(E1)».

### Проверка
- Команды шага 2.

**Skill:** none — документ-карта репозитория (markdown) и запуск проверок.

## Риски фазы и меры
- Риск: шум замера времени на загруженной машине WSL.
  Мера: 10 000 прогревочных вызовов, `fileParallelism: false`, отдельный процесс. При красном результате — стоп и отчёт (Task 29, шаг 5), без снижения порога.
- Риск: `heapUsed` включает служебные объекты V8.
  Мера: оба замера после `gc()`, база снимается после создания клиента. Запасной план по интернированию зафиксирован (Task 29, шаг 4).

## Чек-лист завершения фазы
- Задачи 29–30 удовлетворяют критериям приёмки.
- Все команды Task 30, шаг 2 — ожидаемый результат.
- Чекбоксы в `index.md` обновлены.
