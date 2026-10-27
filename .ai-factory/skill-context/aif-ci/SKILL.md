# Project Rules for /aif-ci

> Bundle: aif-prompts 2026-10-13 (portable baseline; /aif-evolve may extend it).
> Last updated: 2026-10-27
> Based on: reference project `.gitlab-ci.yml` (GitLab, self-hosted runners) + NestJS service layout + manual rules

## Rules

### Pipeline Shape
**Source**: reference project, 2026-10-05
**Rule**: Target GitLab. Stages `prepare → install → lint → test → Build → Deploy`. Pipelines start manually (`workflow: rules: - if: $CI_PIPELINE_SOURCE == "web"`). `default: interruptible: true` and `retry` only on `runner_system_failure` / `stuck_or_timeout_failure`. Jobs are routed by runner tags (`CI` — docker/shell builder, `CI_PHP` — PHP checks; deploy tags come from the tenant matrix). Header comment documents stages, tags and decisions.

### CI Image From the Dockerfile
**Source**: reference project, 2026-10-05
**Rule**: `build-ci-image` (stage `prepare`) builds the `ci` Dockerfile stage with `--cache-from` and pushes `${CI_DOCKER_REGISTRY}/${CI_PROJECT_PATH}-ci:latest`; all check jobs use that image so runtime versions match production.

### Isolate Test Jobs From Real Infrastructure
**Source**: reference project, 2026-10-05
**Rule**: Every job that runs tests uses a `prepare-env` anchor that **unsets** every variable that could point to real infrastructure (APP_KEY, DB_*, REDIS_*, broker, cache/queue/session drivers, AWS_*, realtime, identity provider, E2E_*, SENTRY_*), then `cp .env.example .env` and `php artisan key:generate`, then `php artisan config:clear`. Explain in a comment: env vars override `phpunit.xml`, and `RefreshDatabase` would wipe a real database. Recommend scoping production variables to `production/*` environments as the first line of defence.

### Jobs
**Source**: reference project, 2026-10-05
**Rule**: `install` (composer with cache keyed by `composer.lock`, `vendor/` as artifact), `code-style` (`pint --test`), `static-analysis` (phpstan; copies `.env.example`), `tests` (`pest --log-junit report.xml`, or `phpunit --log-junit` in PHPUnit projects, junit report `when: always`), `tests-integration` (service `postgres:<version>` with alias, wait-for-port anchor, `--group=pgsql --fail-on-skipped`), `frontend` (needs `vendor/`, `npm ci` with cache, `npm run build` before `check` and `types:check`). `Build` needs all check jobs, builds release targets tagged with `${CI_COMMIT_SHORT_SHA}` and `latest`, runs image-level tests (e.g. renderer unit tests with `--network none`) **before** pushing, logs out and prunes in `after_script`.

### Multi-Tenant Manual Deploy
**Source**: reference project, 2026-10-05
**Rule**: `.AbstractDeploy` (manual, `needs: [Build]`, `dependencies: []`) exports `VERSION`, `DOCKER_REGISTRY`, `DOCKER_IMAGE`, derives `COMPOSE_PROJECT_NAME=<prefix>-${TENANT:?}`, runs `pull`, `up -d`, `ps`, `exec -T app php artisan migrate --force`, tails logs. The concrete deploy job uses `environment: production/$TENANT`, `resource_group: production/$TENANT`, `parallel: matrix` of `TENANT` + `RUNNER_TAG`, and `tags: [$RUNNER_TAG]`. A comment lists every per-tenant variable and the checklist for onboarding a new tenant.

### No Browser Tests in CI
**Source**: reference project, 2026-10-05
**Rule**: Do not add Playwright/e2e jobs. Browser scenarios log in through the real identity provider test installation; its accounts and client secrets are not stored in GitLab. Document in the header that e2e runs locally via `make test-browser` before merging to `main`.

### Release and Source Maps for GlitchTip
**Source**: manual, 2026-10-12
**Rule**: The `Build` job builds with BuildKit and passes `--secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN --build-arg SENTRY_RELEASE=${CI_COMMIT_SHORT_SHA} --build-arg SENTRY_ORG --build-arg SENTRY_PROJECT_FRONTEND`, so the Vite plugin uploads hidden source maps to `https://errors.ppmk.pro` with the same release the runtime reports (`VERSION`). `SENTRY_AUTH_TOKEN` is a masked + protected variable used only by `Build`. The deploy header comment lists `SENTRY_LARAVEL_DSN`, `SENTRY_FRONTEND_DSN` and the per-tenant `SENTRY_ENVIRONMENT` (`production-<tenant>`) among the per-tenant variables and the GlitchTip project creation among the onboarding steps. No CI job sends events.

### NestJS Pipeline
**Source**: manual, 2026-10-13
**Rule**: For a NestJS service keep the stages, manual start, `build-ci-image` from the Dockerfile `ci` stage and runner tags (`CI_NODE` instead of `CI_PHP` for check jobs). Differences:
- `install`: `pnpm install --frozen-lockfile`, cache on the pnpm store keyed by `pnpm-lock.yaml`, `node_modules/` as artifact.
- `code-style` (`eslint .` + `prettier --check .`), `static-analysis` (`tsc --noEmit`), `tests` (Vitest unit with `--reporter=default --reporter=junit --outputFile=report.xml`, junit report `when: always`), `tests-integration` (services `postgres:<version>` and `rabbitmq:<version>` with aliases, wait-for-port anchor, `TEST_DATABASE_URL` / `TEST_RABBITMQ_URL` pointing at them so the Testcontainers helpers reuse them instead of starting containers; migrations applied by the test setup with the owner role, tests run with the application role).
- `prepare-env` unsets `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `RABBITMQ_URL`, `AUTH_*`, `AWS_*`/`S3_*`, `SENTRY_*` and any service URLs before tests; the comment explains why (a real database must never be reachable from a test job).
- `Build`: builds `production` with `--build-arg VERSION=${CI_COMMIT_SHORT_SHA}`; backend source maps stay inside the image (`--enable-source-maps`) unless the service has a frontend.
- **Shared SaaS deploy:** a Verdict service is one installation per environment, not one per client. Use a single manual deploy job per environment (`environment: production`, `resource_group: production`) that runs `pull`, `run --rm migrate`, `up -d`, `ps`; no `TENANT` matrix. The header comment lists the required variables (`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `RABBITMQ_URL`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, issuer/JWKS settings, …).

### Visual Regression Job
**Source**: manual, 2026-10-21
**Rule**: In projects with UI and exported mockups the pipeline has a job `test-visual` in the `test` stage: image `mcr.microsoft.com/playwright:v<@playwright/test version>-noble`, frozen install, build of the pages, `playwright test -c playwright.visual.config.ts`, junit report, `test-results/` as artifacts on failure, no `allow_failure`. The rule "no e2e in CI" does not apply to it: the visual run needs no e2e contour.

### Library Package Pipeline
**Source**: manual, 2026-10-27 (verdeect-platform-client, adapted from verdeect-auth; requirements D1, D10, NFR-6)
**Rule**: This repository is a published npm library hosted on GitHub (`smskin/verdeect-platform-client`); the pipeline is GitHub Actions in `.github/workflows/ci.yml`, not GitLab CI. This rule overrides every GitLab-specific rule above ("Pipeline Shape", "CI Image From the Dockerfile", "Isolate Test Jobs From Real Infrastructure", "Jobs", "Multi-Tenant Manual Deploy", "Release and Source Maps for GlitchTip", "NestJS Pipeline"). Jobs: `lint` → `test` → `build` → `publish`, triggered on every push and pull request; pnpm version from `packageManager`, frozen install, no Docker, no services, no deploy. `test` runs `make test` (unit + performance set) on every supported Node major from `engines.node` (currently 22 and 24, matrix). Contract tests (`make test-contract`, layer C) do NOT run in CI: they run locally before a release tag (requirements D10). `build` runs `make build pack-check` and uploads `dist/` as an artifact. `publish` runs only for tags matching `v<major>.<minor>.<patch>` (tags protected by a repository ruleset), needs all other jobs, uses the GitHub environment `npm` and publishes via npm Trusted Publishing (OIDC: `id-token: write`, npm CLI ≥ 11.15, GitHub-hosted runner, no long-lived token); no `NPM_TOKEN` / `NODE_AUTH_TOKEN` at all — the very first release 1.0.0 is published manually by the maintainer; `scripts/publish.mjs` fails before `npm publish --access public` if the tag differs from `v` + `package.json` version or if the version already exists on npm. Workflow `permissions` are minimal (`contents: read`; `id-token: write` only in `publish`). Actions are pinned to a major version or commit SHA. The header comment lists the environment and the ruleset. No `continue-on-error`.
