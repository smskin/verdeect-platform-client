# Project Rules for /aif-review

> Bundle: aif-prompts 2026-10-13 (portable baseline; /aif-evolve may extend it).
> Last updated: 2026-10-30
> Based on: manual rules

## Rules

### Review Against Specialist Constraints
**Source**: manual, 2026-10-05
**Rule**: In addition to the generic checklist, review each changed file against the MUST DO / MUST NOT DO constraints and dependency rules of the relevant specialist: `/laravel-specialist` (module boundaries — only `I{Service}Service` and Events across modules; invokable single-method HTTP controllers with OpenAPI; Spatie Data requests/responses; `Type|null` instead of `?Type`; `declare(strict_types=1)`; no `$guarded`; no array/json casts), `/laravel-vue-specialist` (no direct API calls from views/components; `storeToRefs`; `shallowRef` for chart instances; no `any`, no TS enums; components ≤300 lines), `/python-specialist` (layer direction CLI → Pipeline → Services → Models/DTO; no sibling feeder imports; services stateless), `/nestjs-specialist` (module boundaries — only `I*Service` contracts and events across modules; one route per HTTP controller with `@Permission()` or justified `@Public()`; transactions, audit and outbox only in use-cases; actions never open transactions; tenant and user only from `RequestContext`; every tenant table with RLS + `FORCE ROW LEVEL SECURITY`; consumers idempotent through the inbox; no publishing to RabbitMQ outside the outbox; zod validation with `.strict()`; no `any`, non-null assertions, CommonJS or `drizzle-kit push`; display text only via i18n keys). Violations of these are at least `major` severity.

### Untracked Files
**Source**: manual, 2026-10-05
**Rule**: When reviewing without arguments and nothing is staged, also list untracked files (`git status --porcelain`) and include new source files in the review — a new feature consists mostly of untracked files that `git diff` does not show.

### Error Reporting
**Source**: manual, 2026-10-12
**Rule**: Flag as `major`: a `catch` that swallows a `Throwable` / `Error` without `report()` / `capture_exception` / `Sentry.captureException`; a DSN or GlitchTip token in code, config, compose defaults or `.env.example`; `send_default_pii` enabled, user context with e-mail/name/IP, or request bodies/tokens reaching events; tracing/replay/profiling turned on; a frontend DSN baked into the bundle (`VITE_*`). Rules: local skill `glitchtip-integration` (GT01–GT16).

### Test Speed Regressions
**Source**: manual, 2026-10-30 (verdeect-identity)
**Rule**: Treat as blocking: timeouts raised inside spec files instead of fixing the cause; a file moved to the `isolated` project without a stated reason, or a file that writes env / mocks modules / patches prototypes left in `shared`; timing or load specs added to `test-integration`; a unit spec that imports the whole application module; production compose or `.env.example` setting the test hashing cost; real waits (`sleep`, polling) where elapsed time is not the subject of the test. Non-blocking (minor): new integration files without cleanup in `afterAll`.

### Visual Regression Against Mockups
**Source**: manual, 2026-10-21
**Rule**: Treat as blocking: new or widened entries in `tests/Visual/deviations.ts` without a user approval in the plan; changes to `threshold`, `maxDiffPixels`, baseline generation or the guard tests of the catalog; edits of files under `requirements/**/mockups`; UI changes in screens that have mockups without a passing `make test-visual`.

### Expected Errors Are Not Reported
**Source**: manual, 2026-10-23 (verdeect-bff, review E1)
**Rule**: Exceptions to "Error Reporting" — not findings: (1) health/readiness probes that turn a dependency failure into a probe status (`/health` 503 or `degraded`) without reporting — reporting every probe of a down dependency floods GlitchTip; (2) expected error responses — the known codes of the project's error table, including expected 503/504 of an unavailable dependency and 4xx request errors of the framework (body parsing, size, content type) — logged as `warn` and counted in metrics instead of being reported. Only unexpected errors (`INTERNAL_ERROR`, unhandled exceptions of consumers, jobs and entry points) go to GlitchTip. A `catch` that hides an unexpected error is still `major`.

### Public Package Surface
**Source**: manual, 2026-10-27 (verdeect-platform-client, adapted from verdeect-auth)
**Rule**: Treat as blocking: a `default` condition added to `exports["./testing"]` or an import of `testing` from the main or `./nest` entry; an import of `@nestjs/*` from the core entry; `@verdeect/auth`, `@nestjs/*`, `rxjs` or `reflect-metadata` moved from optional `peerDependencies` to `dependencies`; zod types leaking into public declarations; a public export added, removed or changed without TSDoc, README and `CHANGELOG.md` updates (before the first release — while `CHANGELOG.md` has only `[Unreleased]` and no version is published — TSDoc and the `[Unreleased]` entry are enough; README is required from the release milestone on); a breaking change (request/response handling, decision code or message, guard status, option, export signature, minimum Node/NestJS version) without a major version; hand edits of files copied from `verdeect-platform` (codes, catalog, JSON Schemas) without re-copying and updating the source commit; tokens, client secrets or `Authorization` headers in logs; any secret, environment URL or `.npmrc` with a token committed.
