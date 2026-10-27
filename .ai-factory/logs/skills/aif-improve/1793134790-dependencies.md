# Итерация 1: Task 20 зависит от задач экспортов

**Date:** 2026-10-27 20:59
**Plan:** .ai-factory/plans/feature-e2-nest-testing.md
**Severity:** low

## Problem

CHANGELOG брал имена из Tasks 5, 10–12, но зависел только от 6 и 13

## Root Cause

Транзитивная зависимость через index-задачи

## Solution

Task 20 depends on 5, 6, 10, 11, 12, 13

## Prevention

Перечислять все задачи, из которых берутся имена

## Tags

#dependencies
