# Seed source path contradicted between Reconciliation and T12

**Date:** 2026-10-29 11:52
**Plan:** .ai-factory/plans/feature-e4-tariff-limits.md
**Severity:** low

## Problem

Reconciliation said seed/plans.json comes from the Platform image while T12 reads it from ../verdeect-platform

## Root Cause

Reconciliation line written before T12 was refined

## Solution

Reconciliation now points to ../verdeect-platform/seed/plans.json at the run commit

## Prevention

Re-sync Reconciliation artifacts after task refinements

## Tags

#consistency #contract
