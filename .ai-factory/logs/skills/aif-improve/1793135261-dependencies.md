# Итерация 4: зависимости Task 3 и Task 19

**Date:** 2026-10-27 21:07
**Plan:** .ai-factory/plans/feature-e2-nest-testing.md
**Severity:** low

## Problem

Task 3 вызывал скрипт из Task 1, Task 19 использовал pack.ts из 16a без прямой зависимости

## Root Cause

Транзитивные зависимости

## Solution

Task 3 depends on 1, 2b; Task 19 — добавлен 16a

## Prevention

Перечислять все прямые зависимости

## Tags

#dependencies
