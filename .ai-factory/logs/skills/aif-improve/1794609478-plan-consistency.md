# E5: уточнения версий, логов, зависимостей

**Date:** 2026-11-13 22:37
**Plan:** .ai-factory/plans/feature-e5-platform-kit.md
**Severity:** low

## Problem

README ставит 1.1.0, а T7 ссылался на 1.1.1; лишний пункт про worktree в docs.spec; плейсхолдер PC-…; расхождение формата лога db mode; лишняя зависимость T4 от T1

## Root Cause

План писался по памяти о E4 без сверки текущих строк README и docs.spec

## Solution

Явные строки README:29 и getting-started:12; убран лишний пункт; плейсхолдер заменён; лог унифицирован; T4 без зависимостей

## Prevention

Сверять номера строк и версии с текущими файлами до записи задачи

## Tags

#description #dependencies #consistency
