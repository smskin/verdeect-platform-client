# Project Rules for /aif-build-automation

> Bundle: aif-prompts 2026-10-13 (portable baseline; /aif-evolve may extend it).
> Last updated: 2026-10-27
> Based on: reference project Makefile (Laravel + Docker) + NestJS service layout + manual rules

## Rules

### Makefile Is the Single Entry Point
**Source**: reference project, 2026-10-05
**Rule**: Generate a GNU Makefile with `SHELL := bash`, `.ONESHELL`, `.SHELLFLAGS := -eu -o pipefail -c`, `.DELETE_ON_ERROR`, `--warn-undefined-variables`, `--no-builtin-rules`, a self-documenting `help` default goal (`## description`, `##@ Section`). Multi-line recipes that share variables are written as one command joined with `; \` (macOS ships make 3.81, where `.ONESHELL` is ignored). Tool variables overridable: `PHP ?= php`, `COMPOSER ?= composer`, `NPM ?= npm`, `COMPOSE ?= docker compose`.

### Tests Run on the Host
**Source**: reference project, 2026-10-05
**Rule**: The header comment MUST explain: code checks (`test`, `lint`, `analyse`, frontend checks) run **on the host**, never in the `app` container — container env vars override `phpunit.xml` and `RefreshDatabase` would wipe the development database. Only targets that need the running stack use `$(COMPOSE) exec`.

### Required Targets
**Source**: reference project, 2026-10-05
**Rule**: Provide at least these sections and targets (names fixed so other skills can rely on them):
- **Setup:** `install` (composer + npm ci), `setup` (install, build, up, seed).
- **Development:** `up`, `down`, `restart`, `ps`, `logs`, `shell`, `watch`, `build`.
- **Application:** `migrate`, `seed` (asks for confirmation, `migrate:fresh --seed`), `routes`, `tinker`, `queue-restart`.
- **Checks:** `test` (`vendor/bin/pest`, or `php artisan test` in PHPUnit projects), `test-filter FILTER=…`, `test-db` (creates a separate test database in the dev PostgreSQL), `test-integration` (`--group=pgsql --fail-on-skipped` against that database), `lint` (`pint --test`), `fmt`, `analyse` (phpstan), `front` (`npm run check` + `types:check`), `ci` (everything, including browser tests, in pipeline order).
- **Browser tests:** `e2e-up` (separate compose project `<project>-e2e` with `--env-file .env --env-file .env.e2e -f compose.yml -f compose.override.yml -f compose.e2e.yml`, waits for `/up`, migrates), `e2e-reset` (`migrate:fresh --seed --seeder=E2eSeeder`), `test-browser SPEC=…` (depends on `build` and `e2e-reset`, runs `npm run test:browser` with `APP_URL` of the e2e port), `e2e-run` (up → reset → test → `e2e-down`, tearing down even when tests fail), `e2e-logs`, `e2e-down`, `e2e-clean` (`down -v`), `e2e-shell`.
- **Images:** `image` (all release targets with the same tags as `compose.yml`), `config-prod` (renders `compose.production.yml` with dummy values and `--env-file /dev/null`; its variable list mirrors the `${VAR:?}` list).
- **Cleanup:** `clean` (build output, `playwright-report`, `test-results`), `clean-all` (asks for confirmation, `down -v`).

### Destructive Targets Ask First
**Source**: reference project, 2026-10-05
**Rule**: Any target that drops the development database or volumes (`seed`, `clean-all`) asks for `y/N` confirmation; e2e targets never touch the development project.

### NestJS Targets
**Source**: manual, 2026-10-13
**Rule**: For a NestJS service keep the same section and target **names** (other skills rely on them) with Node commands; tool variables `PNPM ?= pnpm`, `NODE ?= node`, `COMPOSE ?= docker compose`:
- **Setup:** `install` (`pnpm install --frozen-lockfile`), `setup` (install, up, migrate).
- **Application:** `migrate` (`$(COMPOSE) run --rm migrate`), `db-generate NAME=…` (`pnpm drizzle-kit generate --name $(NAME)` on the host, then reminds to review the SQL), `db-custom NAME=…` (`drizzle-kit generate --custom`), `seed` (asks for confirmation; recreates development data), `shell`, `logs`. No `drizzle-kit push` target.
- **Checks (host):** `test` (Vitest unit: `pnpm vitest run --config vitest.config.ts`), `test-filter FILTER=…`, `test-integration` (Vitest integration + http specs: `pnpm vitest run --config vitest.integration.config.ts`; PostgreSQL/RabbitMQ come from Testcontainers, or from `TEST_DATABASE_URL` / `TEST_RABBITMQ_URL` when set — never from the development `.env`), `lint` (`eslint .` + `prettier --check .`), `fmt` (`prettier --write .` + `eslint --fix`), `analyse` (`tsc --noEmit`), `front` only when the repository has a frontend, `ci` (all of the above in pipeline order).
- **Images / Cleanup:** `image`, `config-prod`, `clean` (`dist`, `coverage`, `report.xml`), `clean-all` (asks for confirmation, `down -v`). E2E targets only when the service has a browser UI (see `/aif-dockerize` NestJS rule).
- The header comment states that tests run on the host and integration tests start their own containers, so the development database is never touched; no `test-db` target is needed.

### Visual Regression Target
**Source**: manual, 2026-10-21
**Rule**: In projects with UI and exported mockups the Makefile keeps the target `test-visual` (Playwright inside the pinned image `mcr.microsoft.com/playwright:v<@playwright/test version>-noble`, optional `SPEC=`), and `ci` includes it. Regeneration or audit of the Makefile must not drop it.

### Library Package Targets
**Source**: manual, 2026-10-27 (verdeect-platform-client, adapted from verdeect-auth)
**Rule**: This repository is a published npm library without Docker. This rule overrides "Required Targets" and "NestJS Targets". The Makefile has exactly these targets, all running on the host with `PNPM ?= pnpm`: `install` (`$(PNPM) install --frozen-lockfile`), `lint` (eslint + prettier check), `analyse` (`tsc --noEmit`), `test` (Vitest unit tests, then the performance set `vitest.perf.config.ts` with `--expose-gc`; optional `FILTER=`), `build` (`tsc -p tsconfig.build.json` into `dist/`), `pack-check` (publint, `attw --pack --profile esm-only`, tarball content test and the consumer project `test/consumer` installing the packed tarball), `test-contract` (layer C: Testcontainers stand against the `verdeect-platform` image — built from `../verdeect-platform` with `docker build --target production` unless `PLATFORM_IMAGE` is set; local only, NOT part of `ci`), `ci` (`lint analyse test build pack-check`), `clean` (`dist`, `coverage`, `*.tgz`). No `up`, `down`, `migrate`, `seed`, `shell`, `e2e-*`, `test-integration`, `front`, `test-browser`, `test-visual`, `image`, `config-prod` targets. There is no publish target: publishing happens only in CI.
