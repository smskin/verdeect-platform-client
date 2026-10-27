# Итерация 1: проверка zod в Task 8 и границы ESLint для testing

**Date:** 2026-10-27 20:59
**Plan:** .ai-factory/plans/feature-e2-nest-testing.md
**Severity:** medium

## Problem

Task 8 ждал конверт от parsePolicyChanged и метрики от fake.client, у которого нет metrics; Task 2a не запрещал @nestjs/* и @verdeect/auth в src/testing

## Root Cause

Сигнатуры ядра не сверены с кодом; правила зависимостей ARCHITECTURE.md перенесены в ESLint не полностью

## Solution

Task 8 проверяет zod через ok/event и клиента createTestClient; Task 2a запрещает в testing импорты Nest, auth и nest

## Prevention

Сверять возвращаемые значения функций ядра с кодом; переносить каждое правило зависимостей в lint

## Tags

#description #eslint #boundaries
