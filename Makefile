# @verdeect/platform-client — единая точка входа: make help
#
# Все цели работают на хосте: это npm-библиотека без БД и стека разработки.
# Docker нужен только test-contract (Testcontainers, слой C).
# make test-contract — локально перед тегом, не в ci (prd.md D10).
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
# Слой C: готовый образ Platform вместо сборки ../verdeect-platform и его коммит для отчёта (D10).
PLATFORM_IMAGE ?=
PLATFORM_COMMIT ?=
# Слой C: каталог verdeect-platform для сборки образа (например, git worktree нужного коммита).
PLATFORM_DIR ?= ../verdeect-platform
# Слой C: legacy — Platform без дополнения B.1 (AC-22, необязательный прогон).
PLATFORM_LIMITS ?=
# Слой C: предел одного вызова CLI Platform, мс (целое > 0); пусто — 120000.
PLATFORM_CLI_TIMEOUT_MS ?=
export PLATFORM_IMAGE PLATFORM_COMMIT PLATFORM_DIR PLATFORM_LIMITS PLATFORM_CLI_TIMEOUT_MS

.DEFAULT_GOAL := help

##@ Справка

.PHONY: help
help: ## Список целей
	@awk 'BEGIN {FS = ":.*##"; printf "Использование: make \033[36m<цель>\033[0m\n"} \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 } \
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

.PHONY: test
test: ## Unit-тесты, затем perf AC-17 (--expose-gc); по имени unit: make test FILTER='AC-6'
	$(PNPM) exec vitest run $(if $(FILTER),-t "$(FILTER)"); \
	$(PNPM) test:perf

.PHONY: test-contract
test-contract: ## Слой C против настоящего Platform в Testcontainers (локально, не в ci; PLATFORM_DIR, PLATFORM_IMAGE, PLATFORM_COMMIT, PLATFORM_LIMITS, PLATFORM_CLI_TIMEOUT_MS)
	$(PNPM) test:contract

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
ci: lint analyse test build pack-check ## Всё в порядке конвейера

##@ Очистка

.PHONY: clean
clean: ## Артефакты сборки, покрытие и архивы
	rm -rf dist coverage *.tgz
