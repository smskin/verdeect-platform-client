# Выпуск версии

[← README](../README.md)

Документ для мейнтейнеров. Пакет публикует только CI по защищённому тегу; ручная публикация с машины разработчика — не способ выпуска. Единственное исключение — первый выпуск 1.0.0 (см. «Первый выпуск» ниже, D1).

## Выпуск по шагам

1. **`main` зелёный.** Изменения влиты, локально проходит `make ci`.
2. **`make test-contract` против текущего `main` Platform (D10).** Слой C поднимает в Testcontainers PostgreSQL, RabbitMQ и образ, собранный из `../verdeect-platform`. Нужен Docker.

   ```bash
   git -C ../verdeect-platform checkout main
   git -C ../verdeect-platform pull origin main
   make test-contract
   ```

   Все тесты зелёные. В выводе есть строка `[contract] Platform: <commit> (build …), dirty: no` — этот коммит (7 знаков) записывается в таблицу «Совместимость» README (NFR-5). Для выпуска не годится прогон с `PLATFORM_IMAGE` без `PLATFORM_COMMIT` (коммит `unknown`) или с `dirty: yes`. Выпускной прогон идёт без `PLATFORM_LIMITS` (`[contract] limits mode: b1`): AC-22 проверяет ключи B.1 в `limits`; `PLATFORM_LIMITS=legacy` — только необязательная проверка совместимости с Platform без дополнения B.1. Чтобы не переключать рабочую копию `../verdeect-platform`, образ можно собрать из отдельного worktree: `git -C ../verdeect-platform worktree add <dir> <commit>`, затем `make test-contract PLATFORM_DIR=<dir>`. Вызов CLI Platform (`member:grant`, `member:revoke`) ограничен 120 с: под нагрузкой хоста старт CLI доходит до ~35 с. На медленной машине предел поднимает `PLATFORM_CLI_TIMEOUT_MS=<мс>` (целое > 0, иначе прогон не стартует); таймауты тестов растут вместе с ним. Сообщение «предел N мс истёк, процесс в контейнере мог доработать» — CLI не уложился в предел, а не обязательно завис. Красный тест слоя C — выпуск останавливается: либо Platform нарушил контракт, либо копию каталога или схемы нужно синхронизировать с источником.

3. **Повысить `version`** в `package.json` по semver (см. ниже).
4. **Дописать раздел версии в `CHANGELOG.md`**: перенести пункты из `## [Unreleased]` в `## [X.Y.Z] - ГГГГ-ММ-ДД` с датой тега. У 1.0.0 раздел уже есть — поправить дату на дату тега. Новый экспорт — строка в `### Added` и в таблице «API» README.
5. **Коммит и тег:**

   ```bash
   git commit -am "chore(release): vX.Y.Z"
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z
   ```

6. **CI** прогоняет `lint` → `test` (Node 22 и 24) → `build` (`make build pack-check`: `pack:check` — `publint --strict`, `attw --profile esm-only`, проверки упакованного архива) → `publish` (Node 24, npm ≥ 11.15, Trusted Publishing). Job `publish` запускается только на тег `v<major>.<minor>.<patch>` и только после зелёных проверок. Слоя C в CI нет (D10).
7. **Проверить публикацию:**

   ```bash
   npm view @verdeect/platform-client@X.Y.Z version
   ```

## Что проверяет `publish` до публикации

`scripts/publish.mjs`:

| Проверка                                                    | Если не прошла                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `GITHUB_REF_NAME` задан                                     | job падает                                                  |
| тег соответствует `v<major>.<minor>.<patch>`                | job падает                                                  |
| тег равен `v` + `version` из `package.json`                 | job падает: «тег vX не совпадает с version Y»               |
| `npm view @verdeect/platform-client@<version>` — версии нет | job падает: «версия уже опубликована, перезапись запрещена» |
| `npm view` ответил ошибкой, отличной от E404                | job падает: без ответа реестра ничего не публикуется        |

Затем `npm publish --access public` из собранного в job `build` каталога `dist/`.

## Ошибки выпуска

- **Тег не совпадает с `version`.** Ничего не опубликовано. Удалить тег, исправить `version` или поставить правильный тег:

  ```bash
  git push origin :refs/tags/vX.Y.Z
  git tag -d vX.Y.Z
  ```

- **Версия уже есть в npm.** Ничего не перезаписано: версию в npm нельзя заменить даже после `unpublish`. Повысить `version`, дописать CHANGELOG, поставить новый тег.

## Semver и контракт Platform (NFR-5)

Контракт Platform `v1` соответствует пакету `1.x`. Ломающее изменение контракта Platform — мажорная версия пакета.

| Изменение                                                     | Версия   |
| ------------------------------------------------------------- | -------- |
| ломающее изменение контракта Platform (`v1` → `v2`)           | мажорная |
| сигнатура или удаление экспорта                               | мажорная |
| код, текст или статус ответа guard, код или текст решения     | мажорная |
| поднятие минимальной версии Node, NestJS или `@verdeect/auth` | мажорная |
| новый экспорт, новая необязательная опция                     | минорная |
| исправление без изменения контракта, документация             | патч     |

Мажорная версия: в разделе версии CHANGELOG обязателен подраздел `### Как обновиться` — что изменилось и что сделать потребителю.

## Авторизация в npm: Trusted Publishing

Пакет публикуется через npm Trusted Publishing (OIDC): job `publish` получает от GitHub короткоживущий `id-token` (`permissions: id-token: write` — только у этого job) и обменивает его в npm на токен публикации; provenance npm создаёт автоматически. Требования: GitHub-hosted runner, npm ≥ 11.15 (job ставит его сам: `npm install -g npm@^11.15.0`), environment `npm`.

Токенов в CI нет вовсе: ни секретов в репозитории, ни `NODE_AUTH_TOKEN` в workflow (D1).

### Разовая настройка GitHub

| Что                | Где                         | Значение                                                       |
| ------------------ | --------------------------- | -------------------------------------------------------------- |
| environment `npm`  | Settings → Environments     | правило развёртывания: только теги `v*`                        |
| ruleset тегов `v*` | Settings → Rules → Rulesets | создание — только мейнтейнеры; удаление и перезапись запрещены |

### Первый выпуск (1.0.0) — вручную мейнтейнером (D1)

Trusted Publisher настраивается только для пакета, который уже есть в npm, поэтому 1.0.0 мейнтейнер публикует вручную, с 2FA и без токенов. Цена: у 1.0.0 нет provenance. Это единственная ручная публикация.

1. Шаги 1–4 выше: `main` зелёный, `make test-contract` против текущего `main` Platform, `version` = `1.0.0`, раздел `[1.0.0]` в CHANGELOG с датой тега.
2. Поставить тег **локально**, пока его не пушить:

   ```bash
   git tag v1.0.0
   ```

3. Чистый клон этого тега, проверки и сборка:

   ```bash
   git clone --branch v1.0.0 "$(pwd)" ../verdeect-platform-client-release
   cd ../verdeect-platform-client-release
   make install
   make ci
   make test-contract
   ```

4. Вход в npm с 2FA и публикация из клона (npm ≥ 11.15 — она же нужна для `npm trust`):

   ```bash
   npm login
   npm publish --access public
   ```

   Долгоживущие токены не создаются: `npm login` открывает вход в браузере с 2FA и сохраняет короткоживущий сессионный токен.

5. Проверить: `npm view @verdeect/platform-client@1.0.0 version`.
6. Отозвать сессионный токен: `npm logout`.
7. Запушить тег: `git push origin v1.0.0`. Job `publish` для этого тега упадёт на проверке «версия 1.0.0 уже опубликована» — это ожидаемо и безопасно. Проверки `lint`, `test`, `build` должны быть зелёными.

### После первого выпуска — переход на OIDC

1. Связать пакет с workflow (npm ≥ 11.15, 2FA на аккаунте, право записи в пакет):

   ```bash
   npm trust github @verdeect/platform-client --repo smskin/verdeect-platform-client --file ci.yml --env npm --allow-publish
   ```

   Имена флагов сверьте с `npm trust github --help` — их задаёт npm CLI. То же можно сделать на странице пакета: Settings → Trusted Publisher.

2. Запретить публикацию токенами: страница пакета → Settings → Publishing access → «Require two-factor authentication and disallow tokens».
3. Удалить клон `../verdeect-platform-client-release`.
4. Следующие версии выпускаются только по шагам выше через CI; в логе `[publish]` будет «авторизация: OIDC (Trusted Publishing)».

Если Trusted Publisher не совпадает с запуском (другой репозиторий, файл workflow или environment), `npm publish` в job `publish` падает с E404 или ENEEDAUTH — проверьте параметры шага 1.

## Где смотреть логи публикации

Actions → запуск для тега → job `publish` → шаг `publish`. Строки с префиксом `[publish]`: тег, `version`, результат `npm view`, решение, способ авторизации и команда `npm publish`. Причина падения — последняя строка `[publish]` в stderr.

См. также [CHANGELOG.md](../CHANGELOG.md).
