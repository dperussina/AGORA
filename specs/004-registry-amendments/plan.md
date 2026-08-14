# Implementation Plan: Registry Amendments (M2 — patch validator)

**Branch**: `004-registry-amendments` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Milestone slice**: **M2 only** — typed patch validation. No docket, tally, apply, or MCP. Invalid patches return a precise reason and never mutate the registry.

## Summary

A closed set of patch kinds is checked against a registry document and Layer 0. This is the highest-risk component. Fuzz-shaped unit tests cover unknown kinds, missing paths, min/max, Layer 0, effect-cap, and illegal effects.

**Language**: TypeScript / Node 22 (same package as M1).
**Storage**: None. Pure function `validatePatch(registry, patch)`.
**Testing**: Vitest.

## Constitution Check

PASS: no prose amendments, no eval, no LLM, no float in thresholds stored as integer milli-units where needed. Validator does not apply patches (M3).

## Executive decisions

- Validator is pure and deterministic.
- Layer 0 paths: `identity.*` bedrock, `log.append_only`, `fold.deterministic`, `amendment.typed`, `enfranchise.nonzero`, `budget.exists`, `arbiter.exists`, `steward.sunset`.
- `action.define` max 16 effects; effects ∈ {create, destroy, move, transfer, set_field, reveal, emit}.
- Currency spend and docketing are M3.

## Next

Implement `src/engine/registry.ts` + `src/engine/validate.ts` + tests. Then M3 clerk.
