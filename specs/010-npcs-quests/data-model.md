# Data model: NPCs and Quests

No new tables. No quest document. Fold state already in the tree.

## Seed families (`007`, unchanged)

| Entity | Stored? | Identity? | Source |
|--------|---------|-----------|--------|
| Warden | Derived each construct / `space.op` | No | `space.axes` + `warden_spacing` |
| Echo | Not stored | No | Occupancy at observational t |
| Drift | `World.drifts[]` | No | `drift_spawn` / `drift_walk` Oracle |

## Automaton (later, voted)

Existing `Entity` in `src/engine/effects.ts`:

| Field | Rule |
|-------|------|
| `id` | `ent:<n>` from `nextId`. Not an identity id. |
| `type` | Must be a key in `registry.types` after the defining amendment. |
| `fields` | Public unless a later type sets `visibility: private`. |
| `position` | Optional. Occupancy only if present. |

Created only by a cited `create` effect on a voted verb or trigger. Destroyed only by `destroy`. Not in `identities`. Not in `clerk.identities`. Cannot hold a root or cast a ballot.

## Objective

Not an entity. If inhabitants want one, they define a type and a trigger. Resolution is those effects. The world does not end. Franchise does not change.

## Inspect citation (to add)

On Warden, Drift, Echo-target (if addressed), and `Entity`:

| Field | Meaning |
|-------|---------|
| `personifies` | Registry path (`space.axes.x`, `types.drift`, `types.<name>`) |
| `createdBy` | Event seq, or `derived` for Wardens/Echoes |

No `motive`, `script`, `questId`, or `dialogue` field unless a voted type adds a public string field by that name — then it is just a string.

## Validation

- Genesis `registry.types` keys: `agent`, `mark`, `warden`, `drift`, `anchor` only.
- `TOOL_NAMES` length 10. No `create`, `quest`, `accept`.
- `vote` target must be an identity. An `ent:` or `warden:` id is a reject.
- Standing rows cite identity ids only.
- Replay of a log that contains `effect.create` for a voted type reproduces entity ids, types, fields, and positions.
