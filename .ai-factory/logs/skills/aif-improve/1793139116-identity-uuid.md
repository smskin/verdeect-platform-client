# E3 iter1: UUID в событиях identity, Prettier README, D10-тест, стенд

**Date:** 2026-10-27 22:11
**Plan:** /home/administrator/projects/verdeect2/verdeect-platform-client/.ai-factory/plans/feature-e3-contract-release.md
**Severity:** high

## Problem

tenantId/sub/memberId в схеме identity — format uuid, slug без _; Prettier переотступил бы пример README; D10-тест ловил комментарии; проба на сети по умолчанию; Postgres без ожидания; старые номера задач; Skill у .mjs; Task 19 смешивал файлы; зависимости 14 и 22

## Root Cause

План не сверял форматы полей схемы событий и конфиг Prettier для md

## Solution

UUID и Ajv2020 в 6a/7f, override Prettier в 17, разбор YAML в 14, Network в Task 1, PostgreSqlContainer, Task 19b, перенумерация таблиц, deps

## Prevention

Сверять format-ограничения JSON Schema и форматтеры для вставленных копий кода

## Tags

#schema #prettier #dependencies #contract
