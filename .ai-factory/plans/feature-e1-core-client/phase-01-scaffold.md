# Фаза 1: Каркас пакета

Plan: [index.md](index.md)
Tasks: 1-6
Depends on: none

## Цель

Репозиторий становится устанавливаемым TypeScript-пакетом ESM по образцу `verdeect-auth`. Должны проходить `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` и `pnpm build`. Точки входа `.`, `./nest`, `./testing` существуют, но пусты: содержимое `nest` и `testing` — этап E2, ядра — фазы 2–5. Один unit-тест фиксирует манифест пакета (D2, NFR-4).

## Свидетельства из текущего кода

| Путь | Символы / строки | Зачем |
|---|---|---|
| `/home/administrator/projects/verdeect2/verdeect-auth/package.json` | `exports`, `scripts`, `peerDependenciesMeta`, `devDependencies` | Образец манифеста. Версии инструментов берутся отсюда дословно |
| `/home/administrator/projects/verdeect2/verdeect-auth/tsconfig.json`, `tsconfig.build.json` | `compilerOptions` | Образец конфигурации TS (`NodeNext`, `strict`, `noUncheckedIndexedAccess`) |
| `/home/administrator/projects/verdeect2/verdeect-auth/eslint.config.js` | flat config, правило `jsdoc/require-jsdoc` | Образец линтера с TSDoc публичного API |
| `/home/administrator/projects/verdeect2/verdeect-auth/.prettierrc.json`, `.prettierignore`, `.gitignore`, `pnpm-workspace.yaml` | — | Образцы форматирования, игнора и настроек pnpm |
| `/home/administrator/projects/verdeect2/verdeect-platform/apps/platform/package.json` | `zod 4.6.7`, `ajv 8.20.0`, `ajv-formats 3.0.1` | Версии, совпадающие с Platform (NFR-4) |
| `requirements/0000-platform-client/prd.md` | §4, NFR-4 | Раскладка репозитория, `exports`, зависимости |
| `.gitignore` (текущий) | только `Zone.Identifier` | Нужно дополнить `node_modules/`, `dist/` и т. д. |

Локальные версии: Node `v24.22.1`, pnpm `12.11.2`.

## Файлы для изменения

| Путь | Действие | Что сделать |
|---|---|---|
| `package.json` | create | Манифест: `exports`, `engines`, `packageManager`, зависимости по NFR-4, скрипты |
| `pnpm-workspace.yaml` | create | Настройки pnpm (`minimumReleaseAge` по умолчанию, `allowBuilds` по факту установки) |
| `pnpm-lock.yaml` | create (генерирует pnpm) | Фиксация зависимостей |
| `tsconfig.json` | create | Проверка типов `src`, `test`, конфигов Vitest |
| `tsconfig.build.json` | create | Сборка `src` → `dist` (`.js` + `.d.ts`) |
| `eslint.config.js` | create | Flat config, TSDoc публичного API, запрет импортов в ядре |
| `.prettierrc.json` | create | Копия образца |
| `.prettierignore` | create | Образец плюс копии из Platform |
| `.gitignore` | modify | Добавить артефакты сборки и кэшей |
| `vitest.config.ts` | create | Unit-контур `test/unit/**/*.spec.ts` |
| `src/core/index.ts` | create | Точка входа `.` (в этой фазе — пустая) |
| `src/nest/index.ts` | create | Точка входа `./nest` (пустая до E2) |
| `src/testing/index.ts` | create | Точка входа `./testing` (пустая до E2) |
| `test/unit/package-manifest.spec.ts` | create | Тест манифеста (D2, NFR-4) |

## Task 1: Манифест пакета и установка зависимостей

### Зачем
Без `package.json` нет ни сборки, ни тестов. Манифест фиксирует контракт загрузки: три подпути, закрытый `testing`, единственную runtime-зависимость `zod` и необязательные peer-зависимости (D2, NFR-4). От него зависят все следующие задачи.

### Шаги реализации
1. Создать `package.json` (2 пробела, порядок полей — как в образце):
   ```json
   {
     "name": "@verdeect/platform-client",
     "version": "0.0.0",
     "description": "Клиент авторизации Platform для сервисов Вердикта 2.0: решение по праву из кэша снимка, модуль NestJS, подделка Platform для тестов",
     "keywords": ["verdeect", "authz", "permissions", "platform", "nestjs"],
     "repository": { "type": "git", "url": "git+https://github.com/smskin/verdeect-platform-client.git" },
     "license": "UNLICENSED",
     "type": "module",
     "sideEffects": false,
     "packageManager": "pnpm@12.11.2",
     "engines": { "node": ">=22.12" },
     "files": ["dist", "README.md", "CHANGELOG.md"],
     "exports": {
       ".": { "types": "./dist/core/index.d.ts", "default": "./dist/core/index.js" },
       "./nest": { "types": "./dist/nest/index.d.ts", "default": "./dist/nest/index.js" },
       "./testing": { "types": "./dist/testing/index.d.ts", "development": "./dist/testing/index.js" },
       "./package.json": "./package.json"
     },
     "publishConfig": { "access": "public" },
     "scripts": {
       "build": "node -e \"fs.rmSync('dist', { recursive: true, force: true })\" && tsc -p tsconfig.build.json",
       "typecheck": "tsc -p tsconfig.json --noEmit",
       "lint": "eslint .",
       "format": "prettier --write .",
       "format:check": "prettier --check .",
       "test": "vitest run",
       "test:perf": "vitest run -c vitest.perf.config.ts"
     },
     "dependencies": { "zod": "4.6.7" },
     "peerDependencies": {
       "@nestjs/common": "^12.1.3",
       "@nestjs/core": "^12.1.3",
       "@verdeect/auth": "^1.0.1",
       "reflect-metadata": "^0.2.2",
       "rxjs": "^7.8.2"
     },
     "peerDependenciesMeta": {
       "@nestjs/common": { "optional": true },
       "@nestjs/core": { "optional": true },
       "@verdeect/auth": { "optional": true },
       "reflect-metadata": { "optional": true },
       "rxjs": { "optional": true }
     },
     "devDependencies": {
       "@eslint/js": "10.0.1",
       "@types/node": "22.20.5",
       "ajv": "8.20.0",
       "ajv-formats": "3.0.1",
       "eslint": "10.12.0",
       "eslint-config-prettier": "10.1.8",
       "eslint-plugin-jsdoc": "65.4.0",
       "globals": "17.13.0",
       "prettier": "3.9.10",
       "typescript": "5.9.3",
       "typescript-eslint": "8.71.2",
       "vitest": "5.0.4"
     }
   }
   ```
   Скрипт `test:perf` ссылается на `vitest.perf.config.ts` из Task 29 и до неё не запускается. `ajv`/`ajv-formats` нужны в Task 12 (AC-15 U); ставятся сейчас, чтобы lock-файл менялся один раз.
2. Создать `pnpm-workspace.yaml`:
   ```yaml
   # Настройки pnpm для репозитория из одного пакета (списка packages нет).
   # minimumReleaseAge — явно не задан, действует значение pnpm по умолчанию (сутки) — .ai-factory/rules/base.md.
   # Исключения minimumReleaseAgeExclude — только с обоснованием и условием снятия.
   ```
   Ключ `allowBuilds` добавляется только по шагу 4.
3. Выполнить `pnpm install` в корне.
4. Если pnpm сообщил о пропущенных скриптах сборки (`Ignored build scripts: …`), добавить в `pnpm-workspace.yaml` блок `allowBuilds:` ровно с этими пакетами (`<имя>: true`), как в образце, и повторить `pnpm install`. Если сообщения нет — блок не добавлять.
5. Не добавлять в этой фазе `unplugin-swc`, `@swc/core`, `@nestjs/*`, `@verdeect/auth`, `reflect-metadata`, `rxjs`, `publint`, `@arethetypeswrong/cli` в `devDependencies`. Они нужны только для декораторов и проверок пакета — это E2 и E3.

### Интерфейсы и контракты
- `exports["."]` указывает на `dist/core/index.*`: ядро лежит в `src/core` (prd.md §4), `rootDir` сборки — `src`. Формулировка AC-12 «граф импортов `dist/index.js`» (E2) относится к цели `exports["."]`.
- `./testing` — только `types` и `development`, без `default` (prd.md §4, §5.5).
- `dependencies` — ровно `{ "zod": "4.6.7" }` (NFR-4). `@verdeect/auth` — только peer (NFR-4).

### Свидетельства требований
- prd.md §4 («`exports`: `"."` — ядро; `"./nest"`; `"./testing"` — `{types, development}` без `default`»).
- prd.md NFR-4: перечень peer-зависимостей и диапазонов, точные версии в `devDependencies`, `zod 4.6.7`.
- D2: ядро без Nest, подпути `nest` и `testing`.

### Ошибки и логирование
Логирования нет (конфигурация). Если `pnpm install` падает на `minimumReleaseAge` (версия моложе суток), не добавлять исключение молча. Остановиться и сообщить пакет и версию: исключение требует обоснования (rules/base.md).

### Тесты
Покрываются Task 6 (`test/unit/package-manifest.spec.ts`).

### Критерии приёмки
- `pnpm install` завершается с кодом 0, создан `pnpm-lock.yaml`.
- `package.json` совпадает с шагом 1.

### Проверка
- `pnpm install --frozen-lockfile` → код 0.

**Skill:** none — конфигурация пакета (`package.json`, `pnpm-workspace.yaml`), не код.

## Task 2: Конфигурация TypeScript

### Зачем
Единые настройки компилятора для проверки типов (`src`, `test`, конфиги Vitest) и для сборки `src` → `dist`. Настройки `strict` и `noUncheckedIndexedAccess` требует `nestjs-specialist` §1.

### Шаги реализации
1. Создать `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2023",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "strict": true,
       "noUncheckedIndexedAccess": true,
       "noImplicitOverride": true,
       "exactOptionalPropertyTypes": false,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "resolveJsonModule": true,
       "isolatedModules": true,
       "experimentalDecorators": true,
       "emitDecoratorMetadata": true,
       "noEmit": true,
       "types": ["node"]
     },
     "include": ["src", "test", "vitest.config.ts", "vitest.perf.config.ts"]
   }
   ```
   `experimentalDecorators` и `emitDecoratorMetadata` совпадают с образцом: в E2 их не придётся менять, на ядро они не влияют. `vitest.perf.config.ts` появится в Task 29, а `include` с несуществующим файлом не ломает `tsc`.
2. Создать `tsconfig.build.json`:
   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "noEmit": false,
       "rootDir": "src",
       "outDir": "dist",
       "declaration": true,
       "declarationMap": false,
       "sourceMap": false
     },
     "include": ["src"]
   }
   ```
   Тесты лежат вне `src` (`test/`), поэтому исключать `*.spec.ts` не нужно.

### Интерфейсы и контракты
- `dist/core/index.js` + `.d.ts`, `dist/nest/index.*`, `dist/testing/index.*` — цели `exports` из Task 1.
- Source map в архив не попадает (`sourceMap: false`, ARCHITECTURE «Антипаттерны»).

### Свидетельства требований
- NFR-4 (ESM, Node ≥ 22.12), prd.md §4 (`tsconfig*.json`).

### Ошибки и логирование
Не применимо (конфигурация).

### Тесты
Проверка через `pnpm typecheck` и `pnpm build` в Task 6.

### Критерии приёмки
- `pnpm typecheck` проходит после Task 5.

### Проверка
- `pnpm typecheck` → код 0 (после Task 5).

**Skill:** none — конфигурация компилятора.

## Task 3: Линтер, форматирование, git-игнор

### Зачем
`make lint` в будущем CI (E3) и правило TSDoc публичного API (rules/base.md «Комментарии»). Запрет импортов в ядре делает правило зависимостей ARCHITECTURE машинно проверяемым (D2). Без игнора копий Prettier переформатирует их, и они перестанут совпадать с источником (AC-11, AC-15).

### Шаги реализации
1. Создать `.prettierrc.json` — дословная копия `/home/administrator/projects/verdeect2/verdeect-auth/.prettierrc.json` (4 пробела; 2 для yaml/json/md; одинарные кавычки; ширина 100; `trailingComma: all`; `endOfLine: lf`).
2. Создать `.prettierignore`:
   ```
   node_modules/
   dist/
   coverage/
   pnpm-lock.yaml
   requirements/
   .ai-factory/
   .claude/
   .serena/
   *.tgz
   .ai-factory.json
   .mcp.json
   AGENTS.md
   # Копии verdeect-platform — не переформатируются (сверяются с источником побайтно)
   src/core/codes.ts
   test/fixtures/
   ```
   `AGENTS.md` добавлен, потому что существующие таблицы в нём не отформатированы Prettier: файл ведётся вручную и через `/aif-docs`.
3. Переписать `.gitignore` целиком:
   ```
   node_modules/
   dist/
   coverage/
   *.tgz
   .npmrc
   # Serena: локальный кэш индекса
   .serena/cache/

   # Windows: метаданные загрузки
   *:Zone.Identifier
   *Zone.Identifier
   ```
4. Создать `eslint.config.js` по образцу `verdeect-auth/eslint.config.js` со следующими отличиями:
   - Первая строка: `// Flat config пакета @verdeect/platform-client (.ai-factory/rules/base.md, ARCHITECTURE.md — правила зависимостей, TSDoc публичного API).`
   - Блок `languageOptions` (globals node, `parserOptions.emitDecoratorMetadata/experimentalDecorators`) — для `files: ['src/**/*.ts', 'test/**/*.ts', 'vitest*.config.ts']` (в образце было `tests/**`).
   - Блок `jsdoc/require-jsdoc` — `files: ['src/**/*.ts']`, без `ignores` для spec (тестов в `src` нет), опции дословно как в образце.
   - Новый блок сразу после jsdoc-блока — копия кодов Platform не правится, у неё свой TSDoc:
     ```js
     {
         // Копия verdeect-platform decision-codes.ts (AC-11): не правится, поэтому TSDoc не требуется.
         files: ['src/core/codes.ts'],
         rules: { 'jsdoc/require-jsdoc': 'off' },
     },
     ```
   - Новый блок — граница ядра (ARCHITECTURE «Правила зависимостей», D2, NFR-4):
     ```js
     {
         // Ядро без Nest и без подпутей nest/testing (ARCHITECTURE.md, D2).
         files: ['src/core/**/*.ts'],
         rules: {
             'no-restricted-imports': [
                 'error',
                 {
                     patterns: [
                         { group: ['@nestjs/*', 'rxjs', 'reflect-metadata'], message: 'Ядро не зависит от NestJS (D2).' },
                         { group: ['@verdeect/auth', '@verdeect/auth/*'], message: 'Ядро принимает Subject, Principal сопоставляется в src/nest (D2).' },
                         { group: ['../nest/*', '../testing/*', '@verdeect/platform-client', '@verdeect/platform-client/*'], message: 'Ядро не импортирует nest и testing (ARCHITECTURE.md).' },
                     ],
                 },
             ],
         },
     },
     {
         files: ['src/nest/**/*.ts'],
         rules: {
             'no-restricted-imports': ['error', { patterns: [{ group: ['../testing/*'], message: 'nest не импортирует testing (ARCHITECTURE.md).' }] }],
         },
     },
     ```
   - Блок для `*.js`/`*.mjs`: `files: ['*.js', '*.mjs', 'scripts/**/*.mjs']`.
   - Последним элементом — `prettier`.
5. Выполнить `pnpm format` один раз, чтобы конфиги приняли формат Prettier.

### Интерфейсы и контракты
- Правило `@typescript-eslint/consistent-type-imports: error` обязывает импортировать типы через `import type` (rules/base.md «Структура модулей»).
- Правило `curly: all` (rules/base.md «Поток управления»).

### Свидетельства требований
- ARCHITECTURE.md «Правила зависимостей» (запрет `@nestjs/*`, `@verdeect/auth`, `nest`/`testing` в ядре).
- rules/base.md «Комментарии и документация в коде» (TSDoc у каждого публичного экспорта).
- Library Package Scope (skill-context): копии из Platform не правятся вручную.

### Ошибки и логирование
Не применимо (конфигурация).

### Тесты
Не нужны: правила проверяет `pnpm lint` в Task 6.

### Критерии приёмки
- `pnpm lint` и `pnpm format:check` проходят после Task 5.

### Проверка
- `pnpm lint` → код 0; `pnpm format:check` → код 0.

**Skill:** none — конфигурация линтера и форматтера.

## Task 4: Конфигурация Vitest (unit)

### Зачем
`pnpm test` запускает слой U (prd.md §7): `test/unit/**/*.spec.ts` без сети и Docker. Файл подготовки, проверяющий логи на секреты, добавляется в Task 17 (AC-19).

### Шаги реализации
1. Создать `vitest.config.ts`:
   ```ts
   // Unit-контур (слой U, prd.md §7): test/unit/**/*.spec.ts без сети и Docker; fetch и часы подделаны.
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
       test: {
           include: ['test/unit/**/*.spec.ts'],
           environment: 'node',
           restoreMocks: true,
       },
   });
   ```
   `unplugin-swc` не нужен: в ядре нет декораторов. SWC для `emitDecoratorMetadata` добавляет E2.

### Интерфейсы и контракты
- Условие экспорта `development` Vitest ставит сам (prd.md §5.5) — настраивать не нужно.

### Свидетельства требований
- prd.md §7, слой U: «без сети, подделанный `fetch` и часы; в CI».

### Ошибки и логирование
Не применимо.

### Тесты
Конфигурация проверяется запуском `pnpm test` в Task 6.

### Критерии приёмки
- `pnpm test` находит `test/unit/package-manifest.spec.ts`.

### Проверка
- `pnpm test` → код 0 (после Task 6).

**Skill:** nestjs-code generic vitest.config.ts (CREATE) — конфиг тестов библиотеки, не сервиса; тип `test` описывает тест-файлы, а не конфиг.

## Task 5: Точки входа `.`, `./nest`, `./testing`

### Зачем
Сборка должна давать три цели `exports` из Task 1, иначе `exports` указывает в пустоту. Содержимое: ядро — фазы 2–5 (Task 25), `nest` и `testing` — этап E2.

### Шаги реализации
1. Создать `src/core/index.ts`:
   ```ts
   // Точка входа "." @verdeect/platform-client (prd.md §5.1): публичный контракт ядра — явный список реэкспортов.
   // Заполняется по мере появления модулей ядра (Task 25).
   export {};
   ```
2. Создать `src/nest/index.ts`:
   ```ts
   // Точка входа "./nest" (prd.md §5.4): PlatformAuthzModule, @RequirePermission, PermissionGuard — этап E2.
   export {};
   ```
3. Создать `src/testing/index.ts`:
   ```ts
   // Точка входа "./testing" (prd.md §5.5): createFakePlatform — этап E2. Грузится только с условием development.
   export {};
   ```

### Интерфейсы и контракты
- Публичной поверхности пока нет. TSDoc не требуется: экспортируемых объявлений нет.

### Свидетельства требований
- D2, prd.md §4 (раскладка `src/core`, `src/nest`, `src/testing`); исходный запрос: «`src/nest` и `src/testing` в этом этапе — пустые точки входа».

### Ошибки и логирование
Не применимо.

### Тесты
Task 6.

### Критерии приёмки
- После `pnpm build` существуют `dist/core/index.js`, `dist/core/index.d.ts`, `dist/nest/index.js`, `dist/nest/index.d.ts`, `dist/testing/index.js`, `dist/testing/index.d.ts`.

### Проверка
- `pnpm build`, затем `ls dist/core dist/nest dist/testing` → все шесть файлов на месте.

**Skill:** nestjs-code generic src/core/index.ts (CREATE); nestjs-code generic src/nest/index.ts (CREATE); nestjs-code generic src/testing/index.ts (CREATE) — компоненты библиотеки, не сервиса (ARCHITECTURE «Организация кода»).

## Task 6: Тест манифеста пакета (D2, NFR-4)

### Зачем
Фиксирует контракт загрузки до того, как появится код. Регресс в `exports` или в зависимостях ловится сразу. Полная проверка установленного архива (AC-12, AC-16) — E2 и E3.

### Шаги реализации
1. Создать `test/unit/package-manifest.spec.ts`:
   - Первая строка: `// Манифест пакета (prd.md §4, D2, NFR-4): exports трёх подпутей, закрытый testing, зависимости.`
   - Прочитать `package.json` через `readFileSync(new URL('../../package.json', import.meta.url), 'utf8')` и `JSON.parse`; описать локальный интерфейс `Manifest` с нужными полями, без `any`.
   - `describe('D2: точки входа пакета', …)`:
     - `it('D2: exports содержит ".", "./nest", "./testing", "./package.json"')` — точный набор ключей.
     - `it('D2: "." и "./nest" ведут на dist с types и default')` — `exports["."]` = `{ types: './dist/core/index.d.ts', default: './dist/core/index.js' }`, `exports["./nest"]` = `{ types: './dist/nest/index.d.ts', default: './dist/nest/index.js' }`.
     - `it('D2: "./testing" — только types и development, без default')` — ключи ровно `['types', 'development']`.
   - `describe('NFR-4: зависимости и совместимость', …)`:
     - `it('NFR-4: dependencies — только zod 4.6.7')`.
     - `it('NFR-4: peerDependencies по NFR-4, все optional')`: точное равенство объекту из Task 1 и каждое имя в `peerDependenciesMeta` с `optional: true`.
     - `it('NFR-4: ESM и Node >= 22.12')`: `type === 'module'`, `engines.node === '>=22.12'`.
     - `it('NFR-4: версии devDependencies точные')`: ни одна версия не начинается с `^` или `~`.

### Интерфейсы и контракты
- Тест читает только `package.json`, ни сети, ни сборки.

### Свидетельства требований
- D2, NFR-4, prd.md §4.

### Ошибки и логирование
Не применимо.

### Тесты
Этот файл — тест. Команда: `pnpm test`.

### Критерии приёмки
- Все кейсы зелёные. Порча `exports["./testing"]` (добавление `default`) делает тест красным.

### Проверка
- `pnpm typecheck` → 0; `pnpm lint` → 0; `pnpm format:check` → 0; `pnpm test` → 7 passed; `pnpm build` → 0.

**Skill:** nestjs-code test unit package-manifest (CREATE)

## Риски фазы и меры
- Риск: pnpm блокирует версии моложе `minimumReleaseAge`.
  Мера: версии взяты из уже установленных `verdeect-auth` и `verdeect-platform`. При блокировке — стоп и вопрос пользователю (Task 1, раздел «Ошибки»).
- Риск: `eslint .` ругается на `.claude/`, `.serena/` и т. п.
  Мера: каталоги перечислены в `ignores` (как в образце: `requirements/**`, `.ai-factory/**`, `.claude/**`, `.serena/**`).

## Чек-лист завершения фазы
- Каждая задача 1–6 удовлетворяет критериям приёмки.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` — код 0.
- Чекбоксы задач в `index.md` обновлены сразу после проверки.
