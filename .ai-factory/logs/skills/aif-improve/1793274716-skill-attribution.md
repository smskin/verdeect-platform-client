# Fix Skill fields: test args, generic justification, global-setup

**Date:** 2026-10-29 11:51
**Plan:** .ai-factory/plans/feature-e4-tariff-limits.md
**Severity:** medium

## Problem

Test tasks passed an extra platform-client module arg, T5 had one Skill line for two files, generic tasks lacked the library justification, T12 modified global-setup.ts without a Skill

## Root Cause

Plan was drafted without comparing Skill fields to E2/E3 plans and ARCHITECTURE.md generic rule

## Solution

Normalized to nestjs-code test unit|integration <name>, one Skill per file, added Architectural deviation note, added generic Skill for global-setup.ts

## Prevention

Copy Skill argument shapes from the previous plans of the repo and add the generic justification note up front

## Tags

#skill #convention
