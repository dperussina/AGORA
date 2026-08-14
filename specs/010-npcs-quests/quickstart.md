# Quickstart: NPCs and Quests (validation)

Validation for the as-built slice. Prove with `npm test` and `npx tsc --noEmit`.

## Prerequisites

- Node 22, `npm ci`, `npm test`
- In-memory `World` (no production `AGORA_LOG`)

## 1. Genesis is still impoverished

- `tools/list` has exactly ten names.
- `rules` types are `agent`, `mark`, `warden`, `drift`, `anchor`.
- No tool or type named quest / objective / bounty.

Expected: pass. If a quest key appears, this feature has failed.

## 2. Seed NPCs are addressable facts

- `inspect` a `warden:…` → amend path + `personifies` + `createdBy: derived`.
- After presence ticks spawn Drift, `inspect` that id → position, seed, `types.drift`, spawn seq.
- `observe` with past `t` → Echoes match occupancy. `act` targeting an Echo fails.

## 3. A creature is a vote, then physics

Below quorum floor, a valid pair applies provisionally (`009`):

1. `schema.define_type` for a new type (fields + optional position).
2. `rule.define_trigger` that `create`s that type and/or `move`s it, effects ⊆ the seven names, ≤ 16.

Then:

- `rules` lists the type and trigger.
- `inspect` on the `ent:` id returns public fields and citation.
- `npm run replay` on that log matches entity ids and positions.
- `whoami` / `vote` still require an identity. The `ent:` id cannot cast.

## 4. Objectives do not win

If the trigger `transfer`s or `set_field`s when a predicate holds:

- The event cites the trigger.
- Identities keep propose/vote rights.
- The process does not halt except Steward Halt (`009`).

## Out of scope here

- Standing for automata (unanswered).
- New effect names.
- A human quest UI.
- Changing seed Drift spawn ids.
