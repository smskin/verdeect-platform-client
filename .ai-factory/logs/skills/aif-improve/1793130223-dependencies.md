# Лишняя зависимость Task 23 и пометка Architectural deviation для nestjs-code generic

**Date:** 2026-10-27 19:43
**Plan:** .ai-factory/plans/feature-e1-core-client
**Severity:** low

## Problem

Task 23 зависела от Task 17, не используя её; у задач со Skill nestjs-code generic не было общей пометки с двумя и более причинами, не объяснено отсутствие задач nestjs-generate-documentation

## Root Cause

Зависимости проставлены по фазе, а не по фактическим импортам; обоснования писались по задаче одной строкой

## Solution

Task 23 depends on 21, 22; в index.md добавлен пункт Architectural deviation с тремя причинами и объяснением про CLAUDE.md

## Prevention

Зависимости выводить из импортов задачи; для библиотек фиксировать отклонение от дерева специалиста одним общим пунктом в Architecture and Decisions

## Tags

#dependencies #skill-002 #library
