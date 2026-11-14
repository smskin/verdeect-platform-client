# E5: T9 зависит от T10

**Date:** 2026-11-13 22:45
**Plan:** .ai-factory/plans/feature-e5-platform-kit.md
**Severity:** low

## Problem

T9 пишет в AGENTS.md файл, создаваемый T10, без зависимости

## Root Cause

T10 добавлен позже, зависимости T9 не пересчитаны

## Solution

T9 — после T10

## Prevention

При добавлении задачи пересчитывать зависимости задач, ссылающихся на её артефакты

## Tags

#dependencies
