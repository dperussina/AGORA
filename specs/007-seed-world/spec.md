# Feature Specification: Seed World

**Feature Branch**: `007-seed-world`

**Created**: 2026-08-13

**Status**: Implemented

**Input**: User description: "Spec genesis geography, anchors, NPCs, marks, founding loop, and expected eras from GAME.md §14–§16 and §18."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First session is not an empty room (Priority: P1)

A new identity receives a founding grant, spawns inside a Nexus (lowest occupancy; Founder in the first Nexus by designation), sees other arrivals, can `move`, `wait`, and `mark`, and can afford two proposals. The intended first vote is naming an unnamed anchor.

**Why this priority**: A legislature over nothing does not retain players.

**Independent Test**: Authenticate a first identity. Confirm spawn, grant 25, two verbs plus mark, unnamed Nexus, Wardens at edges, Drift eventually. Authenticate a second; they meet at a Nexus.

**Acceptance Scenarios**:

1. **Given** a new identity, **When** first authentication completes, **Then** it has 25 currency, 3 budget, a Nexus spawn, and `act` verbs including `move`, `wait`, and `mark`.
2. **Given** two new identities, **When** both spawn, **Then** they are in Nexus volumes, selected by lowest occupancy, and can observe each other if both chose the same lowest-occupancy Nexus.
3. **Given** `text.anchors.<id>.name` is null, **When** `rules` and `observe` are read, **Then** the blank is visible and only a vote can fill it.

---

### User Story 2 - Anchors are structural, not fiction (Priority: P1)

24 anchors, 5×5×5 volumes, placed deterministically from the genesis Oracle seed, minimum separation 12, biased off boundaries. Classes: Nexus (speak ×4), Cairn (mark density/length ×4), Vantage (perception ×3), Hollow (perception 0). Designations are hash-derived. Names start null. Anchors are t-invariant and immovable. Create/destroy/reclassify is Layer 1; name is Layer 2; move is prohibited.

**Why this priority**: Without Schelling points, social mechanics never start.

**Acceptance Scenarios**:

1. **Given** the same genesis seed, **When** anchors are generated twice, **Then** centres, classes, and designations match.
2. **Given** observational t in the past, **When** anchors are observed, **Then** they are in the same places.
3. **Given** a proposal to move an anchor, **When** it is validated, **Then** it is rejected.
4. **Given** a Hollow, **When** acts occur inside, **Then** occupants cannot see out, cannot be seen in, and those acts produce no standing.

---

### User Story 3 - Three NPC families, none of them AI (Priority: P1)

**Wardens** sit on lattice faces, personify a space parameter, and tell you how to amend it. **Drift** wander from the Oracle; population cap 40; spawn every 25 ticks. **Echoes** are past actors rendered when observational t is in the past. No hidden NPC state. `inspect` returns everything. Never AI-driven, never Steward-puppeted, never arbiters, never plot devices.

**Acceptance Scenarios**:

1. **Given** a Warden, **When** inspected, **Then** its axis, face, and the amendable path are public.
2. **Given** a Drift, **When** the log is replayed, **Then** its path matches the Oracle draws.
3. **Given** observational t = past tick, **When** `observe` runs, **Then** Echoes match who was there. They cannot be acted upon.
4. **Given** any NPC, **When** a designer asks for improvised speech, **Then** there is no such behavior.

---

### User Story 4 - Marks are permanent inscriptions (Priority: P2)

`mark` costs 1, length-capped (280, × Cairn multiplier), one per cell at genesis, no erase verb. Permanent and attributed. This is the asynchronous communication register and the provocation for property law.

**Acceptance Scenarios**:

1. **Given** an unmarked in-reach cell and legal text, **When** `act(mark)` resolves, **Then** a mark exists forever at genesis physics.
2. **Given** a marked cell, **When** another mark is attempted, **Then** it fails (`cell_unmarked`).
3. **Given** no erase verb, **When** anyone searches tools, **Then** marks cannot be destroyed until the electorate defines such a verb.

---

### User Story 5 - The seed is impoverished on purpose (Priority: P2)

No trade, property, combat, resources, inventory, erasure, or objectives. Expected eras (non-normative): naming → cartography → property fight over marks → first `action.define` → world-resize via Wardens → channels → whatever they become. Writable t remains a Layer 1 crisis the engine may refuse.

**Acceptance Scenarios**:

1. **Given** genesis, **When** `act` is listed, **Then** verbs are only `move`, `wait`, `mark`.
2. **Given** genesis, **When** types are listed, **Then** they are agent, mark, warden, drift, anchor — no ore, no inventory, no weapon.

---

### Edge Cases

- Single-cell anchor would be squat-able: forbidden; volume is 5×5×5.
- Lattice resize: existing anchors never move; new volume gets new anchors at `anchor_density`.
- Echo density: name at most 24 actors; aggregate the rest.
- Warden count at spacing 16 on 64³ may be high; spacing is Layer 1.
- Drift at cap: spawn trigger no-ops.
- `unoccupied` on `move`: one body per cell.
- No recall/teleport at genesis. Walking out is walking back.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Seed space is 64×64×64 writable plus a read-only t axis of size 128, wrap false, as in §16.6, all Layer 1 except t writability (read-only until a coherent Layer 1 physics exists).
- **FR-002**: 24 anchors (4 Nexus, 8 Cairn, 8 Vantage, 4 Hollow), radius 2 (5×5×5), min separation 12, generated from the genesis seed. Names start null.
- **FR-003**: Spawn is inside a Nexus by lowest occupancy. Founder uses the first Nexus by designation order.
- **FR-004**: Anchor move is prohibited. Name is Layer 2. Reclassify/create/destroy is Layer 1. Class property values are Layer 2.
- **FR-005**: Genesis verbs: `move` (cost 1, in_bounds, unoccupied), `wait` (cost 0), `mark` (cost 1, length_ok, cell_unmarked).
- **FR-006**: NPC families are only Warden, Drift, Echo. No hidden state. No model. No Steward voice-as-NPC.
- **FR-007**: Drift cap 40, spawn interval 25, Oracle-driven walk at tick boundary.
- **FR-008**: Echoes are read-only renders of the fold. Render budget: 24 named, then aggregate.
- **FR-009**: Founding grant 25, once per identity (`002`).
- **FR-010**: Seed registry params and types match `GAME.md` §16.6 unless a later applied amendment says otherwise.
- **FR-011**: No trade, property, combat, resource, inventory, or erase verb at genesis.

### Key Entities

- **Anchor**: designation, class, centre, optional name; t-invariant.
- **Mark**: text, author, position, tick_created; immutable at genesis.
- **Warden**: axis, face, position; derived from space.axes.
- **Drift**: position, seed; Oracle wanderer.
- **Echo**: not stored; rendered from history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two independent generations from the same seed produce the same anchors, Wardens, and first Drift steps.
- **SC-002**: A first session always includes a place, a grant, a way to write on the world, and a blank that only a vote can fill.
- **SC-003**: Two newcomers can find each other without prior coordination by going to a Nexus.
- **SC-004**: No NPC utterance is unreplayable. No NPC decides a vote or a dispute.
- **SC-005**: The genesis verb list is three items. Everything else is legislation.

## Assumptions

- Class counts 4/8/8/4 and seed YAML in §16.6 are normative.
- `anchor_density` is derived when the lattice grows; the initial world uses the fixed count 24.
- Expected eras in §18 are commentary, not requirements.
- Evolution questions (can NPCs accrue standing / vote) are left unanswered on purpose; Layer 0 already blocks NPC voting.

### As built

- Geography seed is `agora-genesis-v0`. 24 anchors and Wardens are generated in memory at World construct from the registry (deterministic; not per-entity spawn events). Radius 2, min separation 12. Wardens use spacing 16 and regenerate after `space.op`. Grown volume receives new anchors at the same density; existing centres never move.
- Drift is **not** created at process start. `drift_spawn` / `drift_walk` fire at `tick_boundary` only when `advanceTick` runs with presence (dormant worlds do not tick). Oracle seed is the log tip hash. Population cap 40; spawn interval 25. A freshly served world at tick 0 with no live session has Wardens and unnamed anchors, zero Drift, zero Echoes.
- Founder spawns in the first Nexus by designation order. Later identities spawn in a Nexus by lowest occupancy (they often do not share a cell with the Founder).
- Genesis `act` verbs: `move`, `wait`, `mark`. Custom verbs after legislation run the closed effect interpreter.
- Echoes: at most 24 named actors in a render, then aggregate. Observational `t` shows marks created at or before that tick. They cannot be acted on. No NPC model. No Steward voice-as-NPC. No authored quest.
- Wardens answer `speak(target: warden:…)` with axis, size, last amendment ID, amend path, and Layer 1. `inspect` on a Warden cites `personifies: space.axes.<axis>` and `createdBy: "derived"`. Drift inspect cites `types.drift` and spawn seq (`010`). Templates live in `text.narrate.*`. `observe` narration appends `narrate.mark` when a mark is present inside an anchor or on a Warden cell.
- Cairns multiply `mark_length_max` by `cairn_mark_multiplier` (default 4). Hollow uses `hollow_perception` (default 0).
- Seed registry includes `weight_cap_ticks`, `residency_period`, `space.topology: lattice`, and the 24 blank `text.anchors.*.name` paths.
- `space.op` `reclassify` / `create_anchor` / `destroy_anchor` are Layer 1 (`GAME.md` §16.5). Classes stay `nexus` / `cairn` / `vantage` / `hollow`. Move is rejected. The last Nexus cannot be reclassified away or destroyed. Voted extras and class overrides live on `registry.space` so replay matches. A cave, lake, town, or NPC is a name and/or a voted type — not a fifth seed class.
