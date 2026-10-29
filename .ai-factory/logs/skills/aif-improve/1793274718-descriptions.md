# Task descriptions referenced wrong helpers and docs locations

**Date:** 2026-10-29 11:51
**Plan:** .ai-factory/plans/feature-e4-tariff-limits.md
**Severity:** medium

## Problem

AC-22 test used prepareMember (viewer) for an admin check; client tests named no existing helpers; parser TSDoc update missing; setLimits docs targeted the README API table which lists only export names

## Root Cause

Plan was written from requirements without verifying helper behavior and doc structure in the repo

## Solution

T12 grants admin via memberGrant; T5 names createTestClient/allowedSnapshot/log/permissionsRequests; T3 updates TSDoc; T10 puts Limits in README API types and setLimits in docs/testing.md

## Prevention

Verify roles produced by test helpers and the shape of target doc sections before writing tasks

## Tags

#description #helpers #docs
