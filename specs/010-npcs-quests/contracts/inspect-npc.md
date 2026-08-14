# Contract: `inspect` on NPCs and automata

Tool: `inspect`. No new tool.

## Targets (genesis)

| Target | Result fields (minimum) |
|--------|-------------------------|
| Identity id | Public standing and ledger as today (`005`, `006`) |
| Anchor designation or `ANCHOR:<id>` | designation, class, centre, name |
| `warden:<id>` | axis, face, position, size, amendPath, tier, lastAmendment, **personifies**, **createdBy: derived** |
| Drift id | position, seed, **personifies: types.drift**, **createdBy** spawn seq |

Unknown target: `{ target, fields: {}, reason }` — no secret.

## Targets (after a creature vote)

| Target | Result fields (minimum) |
|--------|-------------------------|
| `ent:<n>` | id, type, fields (public), position if any, **personifies: types.<type>**, **createdBy** `effect.create` seq |

`inspect` does not invent speech. Hail remains `speak(target: warden:…)`.

## Forbidden result keys at genesis

`quest`, `objective`, `bounty`, `xp`, `reward`, `dialogue`, `motive`, `script`.
