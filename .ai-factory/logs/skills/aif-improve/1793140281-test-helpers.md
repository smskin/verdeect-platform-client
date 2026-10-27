# E3 iter4: хвост логов, свежий снимок перед disable, запись getToken

**Date:** 2026-10-27 22:31
**Plan:** /home/administrator/projects/verdeect2/verdeect-platform-client/.ai-factory/plans/feature-e3-contract-release.md
**Severity:** medium

## Problem

Нет помощника логов для worker'ов; снимок viewer мог истечь до события; нечем проверить отсутствие refresh

## Root Cause

Помощники стенда описаны без учёта границы процессов globalSetup/worker и TTL пакета

## Solution

serviceLogsTail в 7d и deps 7e/7f; check перед organization.disabled; tokenCalls в 7f

## Prevention

Для каждого assert в тестах проверять, какой помощник даёт наблюдаемость

## Tags

#contract #observability #dependencies
