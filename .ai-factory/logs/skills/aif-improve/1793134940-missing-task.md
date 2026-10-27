# Итерация 3: шаблон nest-no-auth для AC-12

**Date:** 2026-10-27 21:02
**Plan:** .ai-factory/plans/feature-e2-nest-testing.md
**Severity:** medium

## Problem

Проверка ./nest без @verdeect/auth шла в шаблоне без Nest и падала на @nestjs/common

## Root Cause

Условие AC-12 не изолировано от отсутствия других peer-зависимостей

## Solution

Добавлен Task 17b (шаблон nest-no-auth), обновлены 16b, 19, Traceability

## Prevention

Для каждого условия про отсутствие зависимости готовить окружение, где отсутствует только она

## Tags

#missing-task #ac-12 #consumer
