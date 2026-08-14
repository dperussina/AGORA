# Implementation Plan: NPCs and Quests

**Branch**: `010-npcs-quests` (artifacts on `main`) | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-npcs-quests/spec.md`

**Slice**: Guard + inspect citation. Not a quest engine. Not a fourth seed family. Not an eleventh tool.

## Summary

Seed NPCs stay Warden, Drift, and Echo (`007`). Later creatures are ordinary `schema.define_type` + `rule.define_trigger` / `action.define` (`004`). The engine already has `entities` and `runEffects`; it does not inspect those entities or cite what they personify. This plan closes that gap and locks the negatives: no quest type, no quest tool, no authored character, no win condition, no standing or franchise for automata.

## Technical Context

**Language/Version**: TypeScript 5, Node 22, `strict`

**Primary Dependencies**: Existing Agora engine (`src/engine/effects.ts`, `src/engine/validate.ts`, `src/world/world.ts`). No new package. No LLM SDK.

**Storage**: Same append-only log + vault. Automata are fold state (`entities` map) plus cited `effect.create` / trigger events. No quest table.

**Testing**: Vitest. Genesis catalog/type scan. Voted type+trigger → inspect + replay. Layer 0 reject of NPC franchise.

**Target Platform**: Same MCP process as today.

**Project Type**: In-process world engine. No new HTTP write. Spectator GET unchanged.

**Performance Goals**: Inspect and trigger fire stay inside the existing tick. No extra full-log scan per inspect.

**Constraints**: Closed effect vocabulary (seven names, max 16). No `Date.now()` in resolution. No float in standing/weight/currency. Ten tools. Writes MCP-only. Do not decide standing-for-automata.

**Scale/Scope**: Seed: 3 families. Later: N voted types, same entity map. No quest log growth.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Note |
|------|--------|------|
| I Determinism | PASS | Automata are Oracle/trigger folds; no improvised speech |
| II Auditability | PASS | `inspect` cites registry path and/or creating event |
| III Self-description | PASS | New types appear in `rules` and `act` enum only after vote |
| IV Emergence | PASS | No authored quest or character ships |
| V Governance is the game | PASS | Creatures cost a proposal; no free content drop |
| VI Referee has no preference | PASS | Arbiter does not originate a bounty; NPCs do not adjudicate |
| VII No headcount power | PASS | Automata are not identities; splitting still negative-sum |
| Bedrock 1 identity | PASS | No NPC root; franchise still requires a secret |
| Bedrock 4 typed patches | PASS | No prose quest |
| No AI in backend | PASS | Hard fail if anyone adds a model |
| No agent-authored code | PASS | No new effect primitive |
| MCP-only writes | PASS | |
| Ten tools | PASS | `create` stays an effect |
| Soft fails | none | No private field by default; listen not play-critical |

Post-design re-check: still PASS. Contracts add inspect fields and a forbidden-genesis list. They do not add a tool or a seed type.

## Project Structure

### Documentation (this feature)

```text
specs/010-npcs-quests/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── inspect-npc.md
│   └── genesis-forbids.md
└── tasks.md              # next (/speckit-tasks) — not this command
```

### Source Code (repository root)

```text
src/engine/effects.ts     # Entity already; emit may carry creating seq
src/engine/registry.ts    # genesis types stay agent/mark/warden/drift/anchor
src/engine/validate.ts    # Layer 0 still blocks NPC franchise
src/world/world.ts        # inspect(entity); personifies on warden/drift
src/mcp/catalog.ts        # inspect copy may name entity ids; still ten tools
tests/unit/               # genesis forbids + voted automaton replay
```

**Structure Decision**: Same single package. No `src/npc/` or `src/quest/`. If a directory named quest appears, the plan has failed.

## Complexity Tracking

None. No constitution violation to justify.

## Executive decisions

- Do not implement a quest, bounty, XP, or win type.
- Do not add a seed NPC family.
- Reuse `World.entities` + `runEffects`. Seed Drift stays the special-cased Oracle walker (`007`).
- `inspect` grows citation fields. It does not grow a script.
- Standing and NPC voting stay unanswered in code: identities only, Layer 0 reject.

## Next

`/speckit-tasks` when the user wants a task list. `/speckit-implement` only when they ask to build.
