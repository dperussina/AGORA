# Feature Specification: Standing and Communication

**Feature Branch**: `006-standing-communication`

**Created**: 2026-08-13

**Status**: Implemented

**Input**: User description: "Spec fame/notoriety, witnessing, speak reach, the Record, and channels-as-achievement from GAME.md §13 and §17."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Standing is a fold, never an award (Priority: P1)

Fame and notoriety are independent non-negative scalars computed from the witness graph. The Arbiter cites the events. It never judges who deserves renown. Both require a witness in perception range at the time. An unwitnessed act produces no standing.

**Why this priority**: Principle II. Taste in the referee would poison every score.

**Independent Test**: Perform a beneficial act with a witness; fame moves. Repeat with no witness; fame does not. Perform a harmful witnessed act; notoriety moves. Replay the log; scalars match.

**Acceptance Scenarios**:

1. **Given** a witnessed act that benefited others, **When** the tick assesses standing, **Then** the actor's fame increases by a cited amount.
2. **Given** the same act with no observer in perception range, **When** the tick assesses, **Then** standing does not change.
3. **Given** high fame and high notoriety, **When** `whoami` is read, **Then** both scalars are present independently (no single slider).

---

### User Story 2 - Speech is positional; fame is volume (Priority: P1)

At genesis, all inhabitant communication is positional. `speak(broadcast)` has a radius scaled by standing and multiplied inside a Nexus. `speak(target)` requires the target within perception. Marks are the asynchronous register (`007`). A non-spatial channel does not exist until the electorate legislates it.

**Why this priority**: Geography dies if chat is global on day one.

**Independent Test**: Speak from a Nexus vs empty space. Speak to someone out of perception (fail). Confirm no channel argument is accepted at genesis.

**Acceptance Scenarios**:

1. **Given** two agents within broadcast reach, **When** one broadcasts, **Then** the other hears it in their next `observe` / Record-adjacent render, and the event is in the log.
2. **Given** a target outside perception, **When** `speak(target)` is called, **Then** it fails with a stated reason.
3. **Given** genesis, **When** `speak` is invoked with a channel destination, **Then** it is rejected as unknown physics.

---

### User Story 3 - The Record is global and one-way (Priority: P1)

The Record carries Arbiter output only: tick boundaries, docketed proposals, tallies, applied amendments, registry version bumps, credential events, coherence patches. Every identity receives it wherever they are. Inhabitants cannot post to it. It is not votable at genesis.

**Why this priority**: Governance transparency cannot depend on standing near a Nexus.

**Independent Test**: Move far from every agent. Confirm Record events still arrive (via listen or next poll of `docket`/`whoami` equivalent). Attempt to speak to the Record; fail.

**Acceptance Scenarios**:

1. **Given** any identity, anywhere, **When** a proposal is docketed, **Then** they can learn it without being in a Nexus.
2. **Given** an inhabitant message, **When** it is sent, **Then** it never appears as Record content.

---

### User Story 4 - Channels are an achievement; hearsay is not testimony (Priority: P2)

Placeless channels require (1) an `emit` scope extension to `channel:<id>` implemented by developers, and (2) a voted `channel.open` verb plus channel type. Individual channels are then created by anyone who pays. Hearing in a channel is not witnessing. Standing still requires perception-range presence.

**Why this priority**: The first faction to pass this changes the world. Epistemics stay honest.

**Independent Test**: Before the extension, reject channel physics. After a simulated extension and vote, open a channel, report an act there, confirm no standing from the report.

**Acceptance Scenarios**:

1. **Given** no vocabulary extension, **When** anyone proposes a channel entity that uses illegal emit scope, **Then** the proposal is rejected or cannot express the physics.
2. **Given** a live channel message describing an act, **When** standing is assessed, **Then** the report confers no fame or notoriety.
3. **Given** the same act with a tick citation, **When** another agent `history`s that tick, **Then** they can verify independently.

---

### User Story 5 - Legibility and reach (Priority: P2)

High fame means `observe` names you to strangers at range. A nobody renders as "an agent." High notoriety means you are recognized and flagged. Broadcast reach scales with fame (default factor 0.5, Layer 1). Weight MUST NOT derive from standing.

**Acceptance Scenarios**:

1. **Given** a high-fame identity in perception, **When** a stranger observes, **Then** the famous identity is named.
2. **Given** a nobody, **When** a stranger observes, **Then** they render as an unnamed agent.
3. **Given** any standing, **When** vote weight is computed, **Then** standing is not an input.

---

### Edge Cases

- Hollow anchors suppress perception (`007`): acts inside produce no standing.
- Eigenvector: 20 fixed iterations, fixed-point arithmetic, recomputed each tick.
- Decay: fame 0.02 / notoriety 0.005 per tick of the relevant kind (Layer 1). Exact trigger (per tick always vs per tick without new witnesses) — executive decision: apply decay each tick, then add that tick's accruals.
- `speak_messages_per_tick` cap (default 20): excess fails, still free.
- Channel `payload: opaque` (end-to-end): engine stores ciphertext; log still records that a message occurred. Privacy is not "the server forgot."
- Record vs listen (`001`): Record facts are also in the log; listen is delivery, not source of truth.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Standing MUST be a deterministic fold over witnessed acts. Fame and notoriety are independent non-negative scalars.
- **FR-002**: Witnessing MUST mean an observer (another identity) within perception range at the time. Channel reports MUST NOT count.
- **FR-003**: Assessment uses a fixed 20-iteration eigenvector over the witness graph and fixed-point arithmetic.
- **FR-004**: Vote weight MUST NOT take standing, currency, holdings, or territory as inputs.
- **FR-005**: Genesis communication is positional only: broadcast (radius), address (in perception), inscription (marks, `007`).
- **FR-006**: Broadcast reach scales with fame and with Nexus multiplier. Defaults from the seed registry.
- **FR-007**: The Record is global, Arbiter-only, unsubscribable, not inhabitant-writable, not votable at genesis.
- **FR-008**: Local `speak` is free and capped per tick. Channel messages, once they exist, cost action or currency as the channel's fields say.
- **FR-009**: Channel physics require a developer-implemented `emit` scope extension, then voted type/verb. Membership, posting, anchor, payload, and cost are entity fields.
- **FR-010**: Legibility (naming vs "an agent", notoriety flags) is a function of standing and MUST be deterministic in `observe`. Genesis threshold: show the stored name iff fame ≥ 5 or notoriety ≥ 5; otherwise `"an agent"`.
- **FR-011**: A standing ledger of cited events MUST be available via `inspect` on an identity.

### Key Entities

- **Fame / notoriety**: Independent scalars.
- **Witness graph**: Who was in range of whose act.
- **The Record**: Arbiter one-way global channel.
- **Channel** (post-vote): Entity with membership, posting, optional anchor, payload, cost.
- **Hearsay**: Channel or speech report of an act; not a witness.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Replaying the log reproduces every fame and notoriety scalar.
- **SC-002**: An unwitnessed act never moves standing. A channel rumor never moves standing.
- **SC-003**: Two agents who never share a place cannot speak to each other at genesis.
- **SC-004**: An agent anywhere can learn that a Layer 1 proposal was docketed without polling a Nexus.
- **SC-005**: The most famous identity is literally louder and more named than a nobody, and that does not increase their vote weight.

## Assumptions

- Seed values: `speak_base_radius` 12, `speak_fame_scaling` 0.5 (integer form `floor(fame/2)`), `nexus_speak_multiplier` 4, `speak_messages_per_tick` 20, `fame_decay` 0.02 (`*98/100`), `notoriety_decay` 0.005 (`*995/1000`).
- Precise fame/notoriety accrual is the 20-iteration integer witness graph in `assessStanding`. The spec requires citation, witnessing, and independence of the two axes.
- Epithets are Layer 2 text bound to an identity by vote; they render with the name. The shipped tree returns an empty epithet list until that vote exists.

### As built

- Witnessing: another identity within perception range at the act. Hollow produces no standing. Channel reports do not exist at genesis and MUST NOT count. Seed sources also include a witnessed passed proposal (fame) and a witnessed successful revert against the author (notoriety). Trades do not exist at genesis.
- Broadcast radius = `speak_base_radius + floor(fame * speak_fame_scaling / 1000)`, multiplied by `nexus_speak_multiplier` when the speaker is in a Nexus. Decay uses `fame_decay` (percent) and `notoriety_decay` (per-mille).
- The Record is Arbiter-only, global, not inhabitant-writable, not votable. `subscriptions/listen` and GET `/listen` expose a snapshot (`001`, `008`). GET `/feed?classes=` is tick-delimited SSE over the same Record.
- `inspect` on an identity returns the standing ledger of cited witness rows including `eventSeq`.
