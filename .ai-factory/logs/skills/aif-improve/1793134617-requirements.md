# Сверка Task 5 и Task 8 с PRD v1.9 (подделка testing)

**Date:** 2026-10-27 20:56
**Plan:** .ai-factory/plans/feature-e2-nest-testing.md
**Severity:** medium

## Problem

Task 5 не описывал участника из members без permissions и эпоху NOT_MEMBER; Task 8 не проверял epoch 1 снимка, members без permissions, все GeneralDenyCode; проверка zod была развилкой

## Root Cause

PRD обновлён до r3 после написания задач; детали значений по умолчанию не перенесены дословно

## Solution

Task 5 дополнен правилами members/NOT_MEMBER, Task 8 — тремя тестами AC-8a и проверкой через parsePolicyChanged

## Prevention

После правки требований сверять каждое новое предложение AC с названиями тестов

## Tags

#requirements #tests #ac-8a
