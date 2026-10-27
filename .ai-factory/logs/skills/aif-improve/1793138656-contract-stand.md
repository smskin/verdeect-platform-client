# E3: порядок тестов слоя C, env стенда, зависимости, отклонение раскладки

**Date:** 2026-10-27 22:04
**Plan:** /home/administrator/projects/verdeect2/verdeect-platform-client/.ai-factory/plans/feature-e3-contract-release.md
**Severity:** medium

## Problem

Не зафиксирован порядок тестов на общей компании AC-13; пустые PLATFORM_IMAGE из Makefile трактовались бы как заданные; условная установка @types/amqplib; неполные depends on у 6b и 19; нет пометки об отклонении test/contract от nestjs-code integration; в сверке не было факта о событии organization.disabled

## Root Cause

План писался до проверки типов amqplib и без разбора взаимодействия Makefile-экспорта со стендом

## Solution

Порядок тестов в Task 8a, правило пустых переменных в 7a, amqplib без @types, прямые зависимости, Architectural deviation в Phase 4, строка сверки company_suspended

## Prevention

Для общих стендов фиксировать порядок тестов; проверять типы пакетов по node_modules образца до плана

## Tags

#contract #dependencies #testcontainers
