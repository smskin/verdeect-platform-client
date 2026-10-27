# Прямые зависимости тестовых и шаблонных задач E2

**Date:** 2026-10-27 20:56
**Plan:** .ai-factory/plans/feature-e2-nest-testing.md
**Severity:** medium

## Problem

Task 11 ссылался на старый номер Task 8; Tasks 14, 15a, 15c, 15d, 18, 19 не перечисляли напрямую задачи используемых компонентов

## Root Cause

Перенумерация задач и опора на транзитивные зависимости

## Solution

Исправлены depends on у 7 задач

## Prevention

После перенумерации проверять все depends on; перечислять каждую задачу компонента, упомянутого в описании

## Tags

#dependencies #renumbering
