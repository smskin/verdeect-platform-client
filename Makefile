# @verdeect/platform-client — единая точка входа: make help
#
# Все цели работают на хосте: это npm-библиотека без Docker, БД и стека разработки.
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

.DEFAULT_GOAL := help

##@ Справка

.PHONY: help
help: ## Список целей
	@awk 'BEGIN {FS = ":.*##"; printf "Использование: make \033[36m<цель>\033[0m\n"} \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 } \
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

.PHONY: build
build: ## Сборка в dist/ (.js + .d.ts)
	$(PNPM) build

# Проверки архива: publint, attw и проекты-потребители test/consumer (AC-12).
.PHONY: pack-check
pack-check: build ## publint, attw esm-only и проекты-потребители упакованного архива (AC-12)
	$(PNPM) exec publint --strict; \
	$(PNPM) exec attw --pack . --profile esm-only; \
	$(PNPM) test:package

.PHONY: test-package
test-package: build ## Только проекты-потребители упакованного архива (AC-12)
	$(PNPM) test:package

.PHONY: ci
ci: lint analyse test build pack-check ## Всё в порядке конвейера

##@ Очистка

.PHONY: clean
clean: ## Артефакты сборки, покрытие и архивы
	rm -rf dist coverage *.tgz
