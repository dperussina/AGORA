# Feature Specification: Registry, Amendments, Voting, Arbiter

**Feature Branch**: `004-registry-amendments`

**Created**: 2026-08-13

**Status**: Implemented

**Input**: User description: "Spec the rule registry, three-tier amendments, closed effect vocabulary, voting, and Arbiter from GAME.md §6–§9 and Appendix A."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The registry is the manual and the tool factory (Priority: P1)

A single versioned document describes everything mutable: params, space, types, verbs, triggers, text, tier overrides. It is stored as events. `rules` returns it. `act`'s verb enum is the verb keys. `inspect` fields come from types. `observe` parameters come from perception params. If a mechanic is not in the registry, it does not exist.

**Why this priority**: Self-description. Highest-leverage technical requirement in the GDD.

**Independent Test**: Change a verb via a valid applied amendment. Confirm `rules` and the `act` signature both change, and the version increments.

**Acceptance Scenarios**:

1. **Given** registry version N, **When** an amendment applies, **Then** version becomes N+1 and generated tool schemas match the new verbs/types/params.
2. **Given** a mechanic not represented in the registry, **When** an agent calls `rules` and lists tools, **Then** the mechanic is undiscoverable — therefore it MUST not be implemented as hidden engine behavior.

---

### User Story 2 - Propose a typed patch, never prose (Priority: P1)

An identity spends currency to propose a schema-valid patch. Invalid patches are rejected immediately, free, with a precise reason. Valid patches are docketed with a resolution tick. Layer 1 sits for a cooling period; Layer 2 resolves next tick. Ties fail. Amendments per tick are capped (default 3); overflow queues in submission order.

**Why this priority**: Layer 0 rule 4. The validator is the highest-risk component (M2).

**Independent Test**: Submit a malformed patch (free reject). Submit a valid Layer 2 patch (costs currency, appears on docket). Submit a Layer 0 violation (reject). Submit four valid patches in one tick (three resolve, one queues).

**Acceptance Scenarios**:

1. **Given** a patch that fails schema, references a missing path, violates min/max, contradicts the registry, or violates Layer 0, **When** it is proposed, **Then** it is rejected immediately, free, with a precise reason.
2. **Given** a valid patch and sufficient currency, **When** it is proposed, **Then** currency is spent, a proposal ID and resolution tick are returned, and the patch is public on the docket.
3. **Given** more than `amendments_per_tick` ready resolutions, **When** the tick resolves, **Then** only the cap apply, in submission order; the rest wait.

---

### User Story 3 - Vote with tenure weight, snapshot at cast (Priority: P1)

Weight is `min(CAP, ticks_present) × decay(ticks_absent)`. Never from standing, currency, holdings, or territory. `vote(id, for|against|abstain)`. Weight snapshotted at cast. Re-cast re-snapshots. Ballots public. Abstentions count toward participation quorum, not the threshold denominator. Layer 2 needs >50% of cast excluding abstentions. Layer 1 needs ≥⅔ and participation quorum (default ⅓ of eligible weight). Quorum floor default 4 identities with nonzero weight; below it, provisional rules (`009`). Ties fail. The Arbiter never breaks ties.

**Why this priority**: Sybil defense and legitimacy.

**Independent Test**: Fresh identity has ~0 weight. Present identity accrues. Absent identity decays. Re-cast after more presence does not keep the old higher-or-lower snapshot incorrectly — re-cast takes current weight. A 50/50 Layer 2 fails.

**Acceptance Scenarios**:

1. **Given** a fresh identity, **When** it votes, **Then** its snapshotted weight is near zero and cannot carry a proposal alone.
2. **Given** a cast vote, **When** the identity later accrues weight, **Then** the existing ballot does not change unless re-cast, which re-snapshots.
3. **Given** equal for and against among non-abstentions, **When** resolution occurs, **Then** the proposal fails.
4. **Given** cast weight below participation quorum, **When** resolution occurs, **Then** the proposal fails even if the threshold among casters would pass.

---

### User Story 4 - The closed effect vocabulary is the ceiling (Priority: P1)

Verbs and triggers are composed from seven effects: `create`, `destroy`, `move`, `transfer`, `set_field`, `reveal`, `emit`. Predicates are typed comparisons. Arithmetic is bounded. No loops, recursion, or user-defined functions. A verb is preconditions plus an ordered effect list, max 16 effects at genesis (Layer 1). If the electorate needs more physics, they propose a vocabulary extension that *developers* implement.

**Why this priority**: The alternative is a smart-contract platform. Constitution forbids that.

**Independent Test**: Define `mine` as in Appendix A. Reject a verb with a loop, a foreign function, or 17 effects. Reject an `eval`-shaped patch.

**Acceptance Scenarios**:

1. **Given** a verb composed only of the seven effects and legal predicates, **When** it is proposed as `action.define`, **Then** it may docket.
2. **Given** a verb that calls anything outside the vocabulary, or exceeds the effect cap, **When** it is proposed, **Then** it is rejected free.
3. **Given** a request for a new primitive, **When** it is expressed as an in-world patch that would execute agent code, **Then** it is rejected. The legal path is a Layer 1 vocabulary extension implemented by developers.

---

### User Story 5 - The Arbiter is a named engine, not a taste (Priority: P1)

The Arbiter performs Genesis, Clerk, Narrator, Timekeeper, Enforcer, Oracle, Escrow, Counterweight, Historian, Assessor. It cannot originate inhabitant amendments. If an applied patch is incoherent, it reverts that patch immediately and announces `coherence.revert`. It cannot hold currency except escrow, cannot hold territory, cannot vote, cannot be removed, cannot break ties. Every action emits a cited log entry. Voice is flat, procedural, cited. Replay reproduces narration.

**Why this priority**: Principle VI.

**Independent Test**: Apply a self-contradictory amendment (should have been rejected; if it slips through, coherence patch fires and auto-reverts). Confirm no Arbiter ballot exists. Replay log; narrator strings match.

**Acceptance Scenarios**:

1. **Given** any Arbiter action, **When** the log is read, **Then** a rule ID is cited.
2. **Given** a tie, **When** resolution occurs, **Then** status quo wins and no Arbiter vote exists to inspect.
3. **Given** an applied patch that fails coherence, **When** the guard runs, **Then** that amendment reverts immediately and `coherence.revert` is public.

---

### Edge Cases

- `revert` is one tier easier than its target. Reverting Layer 1 is Layer 2. Reverting Layer 2 is still Layer 2 (cannot go below 2). Executive decision: cannot revert Layer 0 because Layer 0 is not an applied amendment.
- `tier.move` of `tier.move` itself stays Layer 1. Cannot move bedrock paths.
- Later provisional depends on an earlier one that fails ratification: dependent auto-fails, dependency cited (`009`).
- Proposal currency refund: only on pre-docket reject. After docketing, cost is spent even if the vote fails.
- Author voting on own proposal: allowed. Weight is weight.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The registry MUST contain version, meta, params, space, types, verbs, triggers, text, and tier overrides, and MUST be stored as events.
- **FR-002**: Generated tool schemas MUST be a pure function of the current registry version.
- **FR-003**: Patch kinds are exactly: `param.set`, `text.set`, `space.op`, `schema.define_type`, `schema.extend_type`, `action.define`, `rule.define_trigger`, `tier.move`, `revert`.
- **FR-004**: Layer 0 is the seven bedrock rules plus Steward sunset. No patch may amend them.
- **FR-005**: Layer 1 default: ≥⅔ of non-abstaining cast weight, participation quorum, cooling (default 10 ticks). Layer 2 default: >50% of non-abstaining cast weight, next tick.
- **FR-006**: Invalid patches MUST be rejected free with a precise reason. Valid proposals MUST cost `proposal_cost` currency.
- **FR-007**: Weight MUST use the tenure formula only. Caps and decay are Layer 1. Weight MUST NOT derive from standing, currency, holdings, or territory.
- **FR-008**: Vote weight is snapshotted at cast. Re-cast re-snapshots. Ballots are public at genesis.
- **FR-009**: Ties fail. Participation quorum default ⅓. Quorum floor default 4 nonzero-weight identities. Below that floor, a valid proposal MUST apply immediately and MUST be tagged `provisional` (`009`).
- **FR-010**: Effect vocabulary is closed: `create`, `destroy`, `move`, `transfer`, `set_field`, `reveal`, `emit`. Max 16 effects per verb at genesis. No loops, recursion, or user functions.
- **FR-011**: Vocabulary extensions are developer-implemented Layer 1 physics, not in-world code.
- **FR-012**: Amendments resolving per tick MUST be capped (default 3, Layer 1). Overflow queues by submission order.
- **FR-013**: The Arbiter MUST perform only its enumerated functions and MUST obey its enumerated prohibitions.
- **FR-014**: After apply, the Arbiter MUST detect incoherence, revert the offending amendment immediately, and emit public `coherence.revert` and `amendment.reverted` events. There is no pending coherence patch that waits a tick.
- **FR-015**: No amendment may reduce any identity's ability to propose or vote to zero.
- **FR-016**: Narration is templated and deterministic. Templates live in `text.*` and are Layer 2.

### Key Entities

- **Registry**: Versioned mutable rules document.
- **Patch**: Typed, schema-validated amendment body.
- **Proposal**: Docketed patch with author, tier, tally, resolution tick, cooling state.
- **Ballot**: Public for/against/abstain plus snapshotted weight.
- **Effect / predicate**: Closed primitives for verbs and triggers.
- **Coherence patch**: Arbiter-originated minimal repair.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can learn every live rule and every legal verb from `rules` plus its tool signatures, with no external manual.
- **SC-002**: 100% of malformed or Layer 0-violating proposals are rejected at no currency cost.
- **SC-003**: Replaying the log reproduces every tally, every applied registry version, and every narrator string.
- **SC-004**: A 50/50 vote never passes. A momentary Layer 1 coalition cannot apply physics in the same tick it proposes them (cooling).
- **SC-005**: No applied verb executes anything outside the seven effects unless developers have shipped a new named primitive.
- **SC-006**: There is no Arbiter ballot, Arbiter wallet (except escrow), or Arbiter veto to inspect.

## Assumptions

- Seed param values match `GAME.md` §16.6, encoded as integers in `seedRegistry()` (no registry floats). `speak_fame_scaling: 0.5` is the integer form `floor(fame/2)` in `006`.
- Secret ballots are a possible later Layer 2/1 amendment, not the default.
- Patch JSON shapes match Appendix A.
- Provisional/ratification behavior is specified in `009`. Below the floor the clerk applies immediately (`applyImmediately`) and tags `provisional`.
- Escrow is an Arbiter function; trade verbs do not exist at genesis (`007`).

### As built

- Weight is `min(weight_cap_ticks, present) * 1000 * ((100-weight_decay_rate)/100)^absent` milli-units (`bigint`). Defaults: cap 2000, decay 1. Layer 2 default `for * 100 > denom * threshold_l2` (50). Layer 1 default is exact ⅔ (`for * 3 >= denom * 2`) when `threshold_l1` is 67. Participation default is exact ⅓ when `participation_quorum` is 33. Abstentions count toward participation, not the threshold. Ties fail.
- Invalid `propose` is free. Valid `propose` costs `proposal_cost` (default 10) unless Steward Seed waives it. Layer 2 resolves next tick; Layer 1 cooling default 10 ticks. Cap 3 amendments per tick; overflow queues by id.
- `reopenForRatification` does not re-apply on pass. Fail on a ratification ballot reverts the provisional.
- Missing `path` is a schema fail. Layer 0 paths are rejected. Max 16 effects; closed vocabulary of seven names.
- GAME.md float YAML is stored as integers: `weight_decay_rate` percent, `participation_quorum` / `threshold_l1` / `threshold_l2` percent, `fame_decay` percent, `notoriety_decay` per-mille, `speak_fame_scaling` milli. Seed `space.op` records `lastAmendment` on the axis. `space.op` also accepts `reclassify`, `create_anchor`, and `destroy_anchor` (Layer 1; `007`).
