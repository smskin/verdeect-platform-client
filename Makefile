# @verdeect/platform-client — единая точка входа: make help
#
# Все цели работают на хосте: это npm-библиотека без БД и стека разработки.
# Уровни тестов (AGENTS.md, docs/testing.md):
#   test / test-module — слой U без perf, быстро; во время работы.
#   test-timing        — perf AC-17 (--expose-gc), только на тихой машине.
#   test-integration   — слой C против настоящего Platform (Testcontainers, нужен Docker); test-contract — псевдоним.
#   test-load          — нагрузочного набора нет, уровень пуст.
#   test-full          — перед слиянием и выпуском: lint, analyse, test, pack-check, test-integration, test-timing.
# test-integration (test-contract) и test-full — локально, не в ci и не в CI (prd.md D10).
# TEST_TIMEOUT_SCALE — множитель тайм-аутов конфигов Vitest, только локально на загруженной машине (в CI — 1).
# Цели публикации нет — пакет публикует только CI по тегу v<semver> (prd.md D1).
# Многострочные рецепты склеены через `; \` — make 3.81 (macOS) игнорирует .ONESHELL.

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# --- Инструменты (переопределяемые) ---
PNPM ?= pnpm

# --- Параметры целей ---
FILTER ?=
# test-module: файлы слоя U через пробел — подстроки пути test/unit/<m> (cache → test/unit/cache.spec.ts).
M ?=
# Множитель testTimeout и hookTimeout конфигов Vitest (число > 0); задаётся вручную, не по нагрузке.
TEST_TIMEOUT_SCALE ?= 1
# Слой C: готовый образ Platform вместо сборки ../verdeect-platform и его коммит для отчёта (D10).
PLATFORM_IMAGE ?=
PLATFORM_COMMIT ?=
# Слой C: каталог verdeect-platform для сборки образа (например, git worktree нужного коммита).
PLATFORM_DIR ?= ../verdeect-platform
# Слой C: legacy — Platform без дополнения B.1 (AC-22, необязательный прогон).
PLATFORM_LIMITS ?=
# Слой C: предел одного вызова CLI Platform, мс (целое > 0); пусто — 120000.
PLATFORM_CLI_TIMEOUT_MS ?=
# Слой C: предел готовности сервиса Platform (старт и GET /health), мс (целое > 0); пусто — 120000.
PLATFORM_READY_TIMEOUT_MS ?=
export TEST_TIMEOUT_SCALE PLATFORM_IMAGE PLATFORM_COMMIT PLATFORM_DIR PLATFORM_LIMITS PLATFORM_CLI_TIMEOUT_MS PLATFORM_READY_TIMEOUT_MS

.DEFAULT_GOAL := help

##@ Справка

.PHONY: help
help: ## Список целей
	@awk 'BEGIN {FS = ":.*##"; printf "Использование: make \033[36m<цель>\033[0m\n"} \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Установка

.PHONY: install
install: ## Зависимости по pnpm-lock.yaml
	$(PNPM) install --frozen-lockfile

##@ Проверки

.PHONY: lint
lint: ## ESLint (TSDoc, границы ядра) и проверка Prettier
	$(PNPM) lint; \
	$(PNPM) format:check

.PHONY: analyse
analyse: ## tsc --noEmit
	$(PNPM) typecheck

.PHONY: build
build: ## Сборка в dist/ (.js + .d.ts)
	$(PNPM) build

# Проверки архива (AC-12, AC-16): pack:check сам собирает dist/, затем publint, attw и test:package.
.PHONY: pack-check
pack-check: ## pack:check — сборка dist/, publint, attw esm-only, проверки упакованного архива (AC-12, AC-16)
	$(PNPM) pack:check

.PHONY: test-package
test-package: build ## Только проекты-потребители упакованного архива (AC-12)
	$(PNPM) test:package

.PHONY: ci
ci: lint analyse test test-timing build pack-check ## Всё в порядке конвейера (без слоя C)

##@ Уровни тестов

.PHONY: test
test: ## Слой U (test/unit) без perf; по имени: make test FILTER='AC-6'
	$(PNPM) exec vitest run $(if $(FILTER),-t "$(FILTER)")

.PHONY: test-module
test-module: ## Слой U по файлам: make test-module M='cache decide' (без M — весь слой U)
	$(PNPM) exec vitest run $(foreach m,$(M),test/unit/$(m)) $(if $(FILTER),-t "$(FILTER)")

# Нагрузку хоста только сообщает: контура e2e у библиотеки нет, отказывать не от чего.
.PHONY: test-timing
test-timing: ## perf AC-17 (--expose-gc) — только на тихой машине
	@cores=$$(getconf _NPROCESSORS_ONLN); \
	if [ -r /proc/loadavg ]; then \
		load=$$(cut -d' ' -f1 /proc/loadavg); \
	else \
		load=$$(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' | awk '{ print $$1 }' || true); \
	fi; \
	echo "[test-timing] load average: $${load:-неизвестно} (ядер: $$cores)"; \
	if [ -n "$${load:-}" ] && awk -v l="$$load" -v c="$$cores" 'BEGIN { exit !(l > c) }'; then \
		echo "[test-timing] WARN: машина загружена — p99 AC-17 недостоверен, повторите на тихой машине"; \
	fi; \
	$(PNPM) test:perf

.PHONY: test-integration
test-integration: ## Слой C против настоящего Platform в Testcontainers (локально, не в ci; PLATFORM_DIR, PLATFORM_IMAGE, PLATFORM_COMMIT, PLATFORM_LIMITS, PLATFORM_CLI_TIMEOUT_MS, PLATFORM_READY_TIMEOUT_MS)
	$(PNPM) test:contract

.PHONY: test-contract
test-contract: test-integration ## Псевдоним test-integration (docs/releasing.md, D10)

.PHONY: test-load
test-load: ## Нагрузочного набора нет — сообщение и код 0
	@echo "[test-load] нагрузочного набора нет — уровень пуст; производительность AC-17 — make test-timing"

.PHONY: test-full
test-full: lint analyse test pack-check test-integration test-timing ## Перед слиянием и выпуском (слой C — Docker и Platform)

##@ Очистка

.PHONY: clean
clean: ## Артефакты сборки, покрытие и архивы
	rm -rf dist coverage *.tgz
