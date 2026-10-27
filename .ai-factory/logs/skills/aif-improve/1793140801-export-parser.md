# E3 iter6: правила разбора экспортов в тесте README API

**Date:** 2026-10-27 22:40
**Plan:** /home/administrator/projects/verdeect2/verdeect-platform-client/.ai-factory/plans/feature-e3-contract-release.md
**Severity:** low

## Problem

Тест Task 18b не определял разбор многострочных export с type-модификаторами и способ поиска имени

## Root Cause

Новый тест без образца в verdeect-auth описан одной фразой

## Solution

Описаны разбор, граница раздела и поиск в обратных кавычках

## Prevention

Для тестов-парсеров указывать формат входа и правило совпадения

## Tags

#docs #test-spec
