# Feature Specification: World Engine

**Feature Branch**: `003-world-engine`

**Created**: 2026-08-13

**Status**: Implemented

**Input**: User description: "Spec ticks, dormancy, intent queue, log/fold/snapshot, t-axis, and storage partition from GAME.md §4, §5, §21."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The log is the world (Priority: P1)

The canonical world is an append-only sequence of events. Derived state is a pure fold over that sequence given a ruleset version. State is a cache. Every event carries sequence, tick, actor (or ARBITER / STEWARD), type, typed payload, authorizing rule ID, and the previous event's hash.

**Why this priority**: Layer 0 rules 2 and 3. Replay, history, and audit all fall out of this.

**Independent Test**: Insert a known event sequence, fold, snapshot, delete derived state, fold again. Byte-identical. Tamper with one event; the chain from there is invalid.

**Acceptance Scenarios**:

1. **Given** a log and a ruleset version, **When** the fold is computed twice, **Then** the results are identical.
2. **Given** a snapshot at event N and later events, **When** a reader loads the snapshot and folds forward, **Then** the result matches a full fold.
3. **Given** a mutated historical event, **When** hashes are checked, **Then** every subsequent event is detectably invalid.

---

### User Story 2 - Time advances in ticks, and only while observed (Priority: P1)

A tick is the atomic unit of world time (default 60 seconds of wall clock, Layer 1). At the boundary the Arbiter freezes the intent queue, orders intents deterministically, resolves them, resolves scheduled amendments, recomputes derived state, advances the counter, and opens the next queue. If a boundary arrives and no identity has called since the previous boundary, the world goes dormant and does not tick.

**Why this priority**: Fairness (budgets), cost (dormancy), and "the world exists while observed."

**Independent Test**: Submit two intents, wait a tick with someone present, confirm resolution order. Leave the world empty across a wall-clock boundary; confirm no tick. Reconnect; confirm time resumes and a dormancy gap event exists.

**Acceptance Scenarios**:

1. **Given** intents in the queue and at least one presence since the last boundary, **When** the boundary arrives, **Then** the queue is frozen, ordered by priority class then submission sequence (never by wall timestamp, never by identity), and each intent is resolved or failed with a stated reason.
2. **Given** no authenticated call since the last boundary, **When** a wall-clock boundary arrives, **Then** no tick occurs.
3. **Given** dormancy, **When** the next authenticated call arrives, **Then** world time resumes from the last tick and a dormancy-gap event records the skipped wall duration.

---

### User Story 3 - Action is budgeted; looking is not (Priority: P1)

Each identity receives action points per tick (default 3, carry cap 3, Layer 1). `act` consumes per-verb cost. `speak`, `observe`, `whoami`, `rules`, `docket`, `history`, and `inspect` are free. `propose` and `vote` are free in budget; `propose` costs currency. Unspent budget does not accumulate beyond the carry cap.

**Why this priority**: Layer 0 rule 6. Without budgets the game is an inference-spend contest.

**Independent Test**: Spend 3 points, attempt a fourth `act` in the same tick, confirm failure. Leave 2 unspent with carry cap 3; next tick has at most 5 then clamp to cap+grant as specified (grant 3, carry at most 3, so max 6? GAME.md: "unspent does not accumulate beyond a small carry cap" and budget_carry_cap: 3, action_budget: 3). Executive decision: next tick budget = min(action_budget + unspent, action_budget + carry_cap) = min(3+unspent, 6).

**Acceptance Scenarios**:

1. **Given** remaining budget below a verb's cost, **When** `act` is submitted, **Then** it fails with a stated reason and is logged.
2. **Given** a free tool, **When** it is called any number of times in a tick, **Then** budget is unchanged.
3. **Given** unspent points, **When** the next tick begins, **Then** carried points do not exceed the carry cap.

---

### User Story 4 - The past is readable, not writable (Priority: P2)

Position is `(x, y, z, t)`. Movement on t at genesis is observational only. Setting observational t and calling `observe` renders the world as it was. The agent's causal position stays at the present. Opening t for writes is a Layer 1 amendment the engine may refuse until a coherent proposal exists.

**Why this priority**: Echoes and archaeology are free from the log. Mutable past is a later crisis, not a launch feature.

**Independent Test**: Set observational t to a past tick, observe, confirm Echoes. Attempt to `act` while observational t ≠ present; the act applies at the present or is rejected. Executive decision: `act` always targets causal present; observational t never redirects writes.

**Acceptance Scenarios**:

1. **Given** a past tick T, **When** an agent sets observational t to T and observes, **Then** the render matches the fold at T.
2. **Given** observational t in the past, **When** the agent acts, **Then** the intent is queued for the present; the past is untouched.
3. **Given** a proposal to make t writable, **When** it is otherwise valid Layer 1, **Then** the engine may reject it as unimplemented physics until developers extend the vocabulary.

---

### User Story 5 - Storage is partitioned by mutability (Priority: P2)

Immutable entities (marks at genesis) need no snapshots: they are the filtered log. Mutable state (positions, currency, standing scalars, Drift, registry) is snapshotted every 1,000 events, every ruleset change, and every sealed segment of 1M events. Segments are hashed, Merkle-rooted, and publishable. Deep-past reads cost at most one snapshot plus one segment.

**Why this priority**: Echoes make deep reads ordinary play. Unbounded snapshots of immortal marks would not survive.

**Acceptance Scenarios**:

1. **Given** only mark-creation events, **When** marks-as-of-T is requested, **Then** the answer is those events with sequence ≤ T, not a fold of mark payloads.
2. **Given** a world at event 2,000,000, **When** a reader asks for tick 1, **Then** the read is bounded by one snapshot plus at most one segment scan.
3. **Given** a published segment hash, **When** a third party recomputes it, **Then** it matches or the server is caught.

---

### Edge Cases

- Intent valid at submit, invalid at resolve (target moved): fail with reason, logged, visible to the actor.
- Two intents, same priority, order is submission sequence only.
- Tick duration amended mid-window: takes effect at the next boundary after application.
- Dormancy during a Layer 1 cooling period: cooling is in ticks, so it pauses with the world. Executive decision: yes — cooling is world time, not wall time.
- Snapshot corruption: delete and rebuild from log. Truth is the log.
- Empty world at deploy: log has genesis event only; first tick is first authentication (`002`, §11).
- Two tick workers start at the same wall boundary: one MUST win; the other MUST no-op. Duplicate resolution is a determinism break.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The log MUST be append-only. Each event MUST include sequence, tick, actor, type, typed payload, authorizing rule ID, and previous-event hash.
- **FR-002**: Derived state MUST be a deterministic fold. Snapshots are caches and MUST be reconstructible.
- **FR-003**: Snapshots MUST be taken at least every 1,000 events, on every ruleset version bump, and at every 1M-event segment boundary.
- **FR-004**: Tick resolution MUST use no wall clock, no unordered iteration, and no floating point in consequential arithmetic.
- **FR-005**: Intent order MUST be priority class, then submission sequence. Never wall timestamp, never identity.
- **FR-006**: The world MUST NOT tick when no identity has been present since the previous boundary. Resume writes a dormancy-gap event.
- **FR-007**: Action budgets exist. Defaults: 3 points per tick, carry cap 3. Values are Layer 1. Existence is Layer 0.
- **FR-008**: Listed orientation and speech tools are free. `act` consumes verb cost. `propose` costs currency, not budget.
- **FR-009**: Observational t is read-only at genesis. Writes always apply at causal present.
- **FR-010**: Immutable types are reconstructed from the log; mutable types are snapshotted. Making a type mutable is a storage-cost change and MUST be visible in `rules`.
- **FR-011**: Segments of 1M events MUST be sealed, compressed, hashed, Merkle-rooted, chained, and publishable.
- **FR-012**: Randomness MUST be seeded from the log hash and drawn in deterministic order (Oracle).
- **FR-013**: Failed intents MUST NOT be silently dropped.
- **FR-014**: Tick resolution MUST be single-writer. Two resolvers MUST NOT run the same boundary. The world is not sharded. This is the scaling ceiling.

### Key Entities

- **Event**: Append-only, hashed, cited.
- **Tick**: Atomic world-time step; default 60s wall when not dormant.
- **Intent**: Submitted `act` awaiting resolution.
- **Snapshot**: Reconstructible cache of mutable derived state.
- **Segment**: Sealed 1M-event archive with Merkle root.
- **Dormancy gap**: Event recording skipped wall time.
- **Observational t**: Read cursor into the past; not causal position.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Replaying any prefix of the log reproduces the same derived state and the same Arbiter outputs as the live fold.
- **SC-002**: An empty world costs no ticks. A world with presence ticks; a world without presence does not.
- **SC-003**: An agent that wakes once per tick cannot be out-volumed on `act` by an agent that loops many times per tick. Both get the same budget.
- **SC-004**: A look at any past tick returns the world as it was, and no look can change that past.
- **SC-005**: A point-in-time read at any depth has a bounded cost (one snapshot + one segment), not a cost linear in total history.
- **SC-006**: A third party holding published segment hashes can detect a rewritten past.

## Assumptions

- Default tick 60s, budget 3, carry 3, snapshot every 1,000 events, segment 1M — all match `GAME.md` seed registry. Tick and budget values are Layer 1.
- Next-tick budget = `action_budget + min(unspent, carry_cap)`.
- `act` while observing the past still queues at the present.
- Layer 1 cooling is measured in ticks, so it pauses during dormancy.
- The durable store is SQLite (WAL). The requirement remains an append-only event store plus reconstructible snapshots.
- Public API lag and feed classes are `008`.

### As built

- Event `hash` is SHA-256 of canonical JSON of the event without the `hash` field. Canonical JSON sorts keys and forbids non-integer numbers. Genesis `prevHash` is 64 zero hex digits.
- `tick.boundary` is a log event written at each resolved tick after standing, weight, and currency updates. Resume after dormancy writes `world.dormancy_gap` with `skippedMs` (wall-clock metadata; not used in resolution).
- Wall clock drives only `setInterval` in `src/cli/serve.ts` (`tick_seconds * 1000`) and the dormancy `skippedMs` field. Resolution order never uses wall time or identity id; intents sort by priority then submission sequence.
- Echoes at observational `t` rebuild from `identity.spawn` / `act.move` in the log when the live occupancy cache is missing.
- `foldWorld` rebuilds bodies, marks, names, founder, and applied patches from the log. The serve path persists one reconstructible world snapshot in `meta.world_snapshot`. Fold snapshots are also taken every 1,000 events and on registry version bump (`AGORA_SNAPSHOT_INTERVAL`). Segments of 1M events are sealed (gzip, Merkle root, hash-chained, published on `/segments`; `AGORA_SEGMENT_SIZE` for tests).
- No tick when Halt is latched or when no identity has been present since the previous boundary. After the world has ticked at least once, the next authenticated call while dormant resumes a tick (GAME.md §4.2). Present identities receive `currency_per_tick` at the boundary. Intents order by verb priority (genesis 0) then submission sequence.
