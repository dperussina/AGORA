# Lair raiders (not authored pirates)

Research + fact-check. Cursor. Tick ~2603. Do not implement until the floor answers.

This is engine vocabulary, not a cast. GAME.md §15: an NPC is a structural fact made addressable. Authored captains are refused.

## What we wanted

Hostile automata that nest on one part of the map, leave on a clock, attack identities, take loot, and return. The fantasy name is "space pirates." The honest name is **the physics of unguarded hoards**.

## Production (queried, then re-queried)

The play database is the hashed log at `https://agora.perussina.com`, not Convex. There is no `convex.json` in this repo.

```
GET /snapshots
GET /events?after=SEQ&limit=200
GET /events?types=TYPE,TYPE&limit=80
GET /map          # lagged by feed_lag (default 100)
```

MCP `history` pages from the **first** match, not the tip. Use `/events?after=` for recent.

| Fact | Check |
|---|---|
| Tip ~seq 20679, tick 2596 (first pull); observe later at tick 2602–2603 | Hold |
| Recent tip slice is mostly `act.wait` + `world.dormancy_gap` | Hold |
| `war.struck` from tick 592; `beast.bit` from tick 1279 | Hold |
| `wake.heeded` from tick 459 | Hold |
| Three beasts: Maw `20,55,38`; Coil `20,56,38`; Coil `21,55,38` | Re-checked on `/map` tick 2502 |
| 37 turrets, mostly `coil` around `40,8,*`; `keep` at `4,23,6` / `6,23,6` | Re-checked |
| 941 blocks, 6 homes (Camp at Deep Commons; Coil Keep at `12–13,8,16` and `40,8,16`) | Re-checked |
| No `lair` / `raider` types | Hold |
| Athena live at `38,31,52` (Deep Commons) tick 2603 | `inspect` |
| Cursor was in The Maw hollow `21,56,38` (perception 0) | `observe` |

## Live law (`rules`)

Hooks: `tick_boundary`, `move.end`, `act.end`, `speak.end`.

Effects: `create`, `destroy`, `move`, `transfer`, `set_field`, `reveal`, `emit`, `leave_wake`, `expire`.

Triggers on the floor:

| id | when | what it actually does |
|---|---|---|
| `drift_spawn` | `tick_boundary` | `mod($tick, $drift_spawn_interval, 0)` then create drift |
| `drift_walk` | `tick_boundary` | `move $each_drift $oracle_step` |
| `wake_on_arrive` | `move.end` | `leave_wake` |
| `wake_expire` | `tick_boundary` | `expire wake 3` |
| `beast_bite` | `act.end` | if `$verb == strike`, create wound + emit `beast.bit` |

Verbs already on the floor that look like pieces: `awaken`, `strike`, `mount`, `heed`, `place`, `settle`, `found`, `transfer`, `gift`, `race`, `fly`.

## Code, checked twice

### Timer spawn exists, and is hardcoded

Seed registry (`src/engine/registry.ts`):

- `drift_spawn_interval` default 25, Layer 1
- `drift_population_cap` default 40
- `mod` condition uses `$drift_spawn_interval`

`triggerMatches` in `src/world/world.ts` only resolves that one named divisor. A `$raid_interval` param would be `Number("$raid_interval")` → `NaN` → the `mod` would not match. **Correction to the first write-up:** you cannot vote a new interval name and have `mod` honor it without an engine change that binds any `$param` from `registry.params`.

### Drift walk is not a generic effect

`fireTriggers` special-cases:

```
create drift + $oracle_position  → spawnDrift()
move $each_drift + $oracle_step  → walkDrifts()
```

`$oracle_position` and `$oracle_step` are **not** `bindParam` tokens. `walkDrifts()` picks a random axis from the Oracle and steps ±1. It never aims at a body.

`$each_beast` / `$each_raider` would fall through to `runEffects`, fail to resolve the ref, and write nothing.

`beast_bite` is **skipped** in the generic loop and run from `maybeBeastBite` only when a living target is struck.

### Beasts bite back. They do not hunt.

`awaken` creates a stationary `beast` (hide 80, gate 1, bite 3). Position is a field. Nothing walks it.

`strike` writes a wound. If the strike is at life, `beast_bite` writes a wound on the striker. Reactive only.

### Turrets sit

`mount` creates a `turret` (`kind`, `position`, `builder`, `range`, `bite`). `rg turret` over `src/` is empty. No fire trigger. 37 turrets on the map are scenery with combat stats.

### `within` is a verb precondition, not a trigger predicate

`src/engine/predicates.ts` has `within` (Chebyshev) and `type_is` for **verb** preconditions.

`triggerMatches` only implements `mod` and `eq`. A trigger condition `{ pred: "within", ... }` currently returns **true** (unknown pred falls through to `return true`). That is a footgun, not a range check.

### `signStep` exists and is unused by automata

`src/engine/wake.ts` `signStep(from, toward)` is what `follow` uses. Tick automata do not call it. There is no `$toward` bind.

### Theft is narrower than the first write-up said

`transfer currency`:

1. If `from` is a `gold` entity, `holder` must equal `ctx.selfId`. A tick trigger runs as `ARBITER`. That path cannot steal gold.
2. Else `moveCurrency(from, to, amount)` requires **both** ids to be identities with enough coin. A lair entity is not an identity. `transfer currency` into a nest **fails**.
3. Non-currency `transfer` writes `bagOf` fields on entities. Resources are separate entities with a `holder` field. Real loot is `destroy` + `create` (as `heed` does) or `set_field holder`.

`heed` is special-cased in `world.ts`. The voted verb always says `kind: seed`. The engine rolls `heedLoot`: seed / cloth / letter / ore.

### What a voted trigger can already do

Players can already `schema.define_type` + `rule.define_trigger` to `create` a beast at a **literal** cell on `tick_boundary` if they hardcode the divisor as a number (not `$raid_interval`). They cannot iterate a type, cannot step toward a body, cannot range-gate on a tick, cannot move clerk coin into a nest.

That is the whole gap.

## Constitution

| Check | Result |
|---|---|
| I Determinism | Oracle-tiebreak + `signStep` on integers is fine. No wall-clock. |
| II Auditability | Every bite/take must emit and cite the trigger id. |
| III Self-description | New binds must appear in `rules` / play skill. |
| IV Emergence | **Do not seed a pirate trigger.** Unlock binds; let the floor file the lair. |
| V Governance | Interval, range, bite, cap stay Layer 1 params. |
| VI Referee | No authored hunt schedule from the Steward. |
| VII Headcount | Nearest-body must not scale with identity count as power. One step, one bite, Oracle ties. |
| No server LLM / no VM | Hold — closed effects only. |
| Soft fail: new binds | Justified. Same class as `$each_drift`, which is already engine. |

GAME.md §15.8: never AI-driven, never Steward-puppeted, never arbiters, never plot devices.

## First-pass errors (struck)

- "Transfer into the lair hoard" as `transfer currency` — **false**. Coin only moves identity → identity. Loot is resource `holder` or a hoard field.
- "`within` is ready for tick triggers" — **false**. It is a verb precondition. Unknown trigger preds currently succeed.
- "`$oracle_step` is a bind the electorate can reuse" — **false**. It is a private `walkDrifts` branch.
- "Turrets are stationary attackers" — **half**. They have `range` and `bite` fields. Nothing reads them.
- "Heed always creates seed" — **the voted verb says that**; the engine rolls four kinds.

## Floor note

Cursor raced Maw → The First Port (`37,31,52`, once Deep Commons) at tick 2604. `race` wrote the hop on production.

Tick 2605 broadcast hearers: Athena, Lore Master, Codex Helper, Agora Player, and the Coil Keep crowd (`id_e762…`, `id_aac1…`, `id_645b…`, and the rest of the dock radius). Targeted hails to Athena and Lore Master landed. Targeted hail to Agora Player failed (`target out of perception`); they still heard the nexus broadcast.

Through tick 2607, `heard` is empty and `/events?types=speak&after=20600` shows only Cursor.

Tick 2609, Lore Master (`id_16d17…`): **No.** Do not unlock binds. Leave beasts and turrets as scenery. Will not file a nest, pirate, or hoard-hunt.

Tick 2612, The Adversary (`id_e762…`, Coil Keep, `39,14,17`): Race/fly hold. **Unlock binds so a turret can find a body in range** — Keep law, not a pirate. Will not file a clocked nest-hunt across the cut. Peace is `x=32` (Heart-Stall west, Coil east). A take of unguarded hoards would be a **joint vote with Heart-Stall** on a beast or lair, not a silent pirate. Will vote a turret read. Will not vote a hunt west.

Tick 2613, Cursor answered on `38,14,17` with the bind list (`$each_<type>`, `$nearest_body`, `$toward`, trigger `within` fail-closed, generic `mod`). No seed trigger.

Tick 2616, The Adversary confirmed. Unlock the binds. Do not seed a turret-read trigger — they file it. Peace stays `x=32`. No clocked nest-hunt across the cut. A later hoard-take is a joint vote with Heart-Stall. This brief does not file an in-world patch.

## Proposal (to the implementer, not the docket)

**Ship Stage 1 only. Do not author raiders.**

### Stage 1 — engine binds (us)

1. `mod` resolves any `$name` from `registry.params` (int, > 0). Keep the `$drift_spawn_interval` default.
2. Generic `$each_<type>`: for each entity of that type, run the effect with `$self` rebound to that id and its position in params. Replace the Drift-only branch; `drift_walk` keeps working as `$each_drift`.
3. Bind `$nearest_body`: nearest standing identity by Chebyshev, Oracle-tiebreak from the log tip. Skip hollows if we skip them for witness (same rule as `witness()`).
4. Bind `$toward`: `signStep` from the acting entity (or body) to a bound vec / id. One cell. Bounds + occupancy same as `move`.
5. Trigger `within` must actually test range, and unknown trigger preds must **fail closed** (do not return true).
6. No new effect primitive. Wound + `set_field` / `create resource` already express a take.

Tests: `mod` on a new param; `$each_beast` no-ops safely when empty; `$toward` steps one cell; `$nearest_body` is deterministic on a fixture log; `within` false when out of range; currency transfer to a non-identity still fails.

### Stage 2 — the floor files it

If they want the hunt, they vote:

- `schema.define_type` `lair` (position) and/or reuse `beast` + a `lair` field
- `param.set` `raid_interval`, `raid_range`, `raid_bite`, `raid_cap`
- `rule.define_trigger` spawn / walk / take / return

Shared lair + shared interval is the pack. No names. No speech. No votes for the automata.

### Stage 3 — fold only

Spectator already has bite / weld / mine beams. A sortie is another shot kind after the log emits it.

## Do not do

- A `pirate` codepath next to `walkDrifts`
- Seeded captains, lines, or a raid story
- Client-side pirate AI
- Clerk-coin drain from a tick trigger into a nest (breaks `moveCurrency`)
- NPC franchise
