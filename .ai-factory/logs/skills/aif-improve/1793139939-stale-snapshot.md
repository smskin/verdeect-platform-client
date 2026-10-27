# E3 iter3: allowBuilds, снимок admin, таймаут CLI, довод AC-14

**Date:** 2026-10-27 22:25
**Plan:** /home/administrator/projects/verdeect2/verdeect-platform-client/.ai-factory/plans/feature-e3-contract-release.md
**Severity:** high

## Problem

testcontainers тянет ssh2/cpu-features/protobufjs без allowBuilds; admin мог получить устаревший снимок viewer из кэша; 5 с на docker exec слишком мало для CLI с Nest; тест AC-14 опирался на время, которое ничего не доказывает

## Root Cause

План не учитывал кэш Platform между процессами CLI и сервиса и правила сборки pnpm

## Solution

pnpm-workspace.yaml в Task 2, порядок и ожидание события для admin в 8a, 30 с на exec, доказательство через minEpoch в 8b

## Prevention

Для кэширующих сервисов проверять путь инвалидации между процессами; при новых зависимостях сверять allowBuilds

## Tags

#contract #cache #pnpm #timeouts
