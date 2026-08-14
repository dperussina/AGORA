# Feature Specification: Steward and Population States

**Feature Branch**: `009-steward-population`

**Created**: 2026-08-13

**Status**: Implemented

**Input**: User description: "Spec the Steward, sunset schedule, and void/genesis/society population states from GAME.md §10 and §11."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Steward is tagged, enumerated, and declawed (Priority: P1)

The Steward is a real identity. Its output is visibly tagged and never rendered in the Arbiter's voice. Powers: Author (lore/content, not rules), Seed (propose like anyone — but see prohibitions on currency/weight), Halt (freeze ticks for cause, public reason, no state change), Bootstrap-narrate (voice in the room during Genesis). Prohibitions: no veto, no tiebreak, no vote weight, no currency, no territory, no adjudication, no identity restore.

**Why this priority**: One adjudication destroys legitimacy.

**Independent Test**: Steward tries to veto, break a tie, vote, mint currency, restore an identity, speak as Arbiter. All fail. Halt emits a public reason and stops ticks without mutating entities.

**Acceptance Scenarios**:

1. **Given** Steward output, **When** any inhabitant reads it, **Then** it is tagged Steward and is not in the Arbiter register.
2. **Given** a Halt, **When** it is issued, **Then** ticks freeze, a public reason is logged, and no entity fields change.
3. **Given** any prohibited power, **When** it is invoked, **Then** no such tool or effect exists.

---

### User Story 2 - Sunset is Layer 0 (Priority: P1)

Powers scale inversely with the count of nonzero-weight identities: 0–3 all four; 4–9 Author, Seed, Halt; 10–19 Author, Halt; 20+ Author, Halt. At 20+, lifting Halt without a prior public post-mortem emits `steward.postmortem_missing`. Nobody, including the Steward, can renegotiate the schedule in-world.

**Acceptance Scenarios**:

1. **Given** 12 nonzero-weight identities, **When** the Steward attempts Seed, **Then** it fails.
2. **Given** 20+ identities and a Halt, **When** Halt is lifted without a prior `steward.postmortem`, **Then** `steward.postmortem_missing` is logged (Halt still occurred; the failure is recorded, not silently repaired). Ticks do not elapse during Halt, so a wall of “5 ticks” cannot run while latched.
3. **Given** a proposal to amend the sunset table, **When** it is validated, **Then** it is rejected as Layer 0.

---

### User Story 3 - Void, then Genesis, then Society (Priority: P1)

**Void**: zero identities ever, or none present after. No ticks. Genesis timestamp is first authentication. Log may contain only the genesis event.

**Genesis** (one identity): they are Founder (log mark, not privilege). Below quorum floor (default 4), amendments pass immediately and are tagged `provisional`.

**Society**: when nonzero-weight identities reach the floor, ratification does **not** start instantly. A residency period (default 50 ticks) lets the newest quorum-completing identity accrue weight. Then the provisional stack is docketed in pass order, 3 per tick. Unratified provisionals revert. A later provisional that depends on an earlier failed one auto-fails, dependency cited.

**Why this priority**: Sole occupancy is a sandbox, not a land grab. Instant ratification would let the founder rubber-stamp themselves.

**Acceptance Scenarios**:

1. **Given** no identities yet, **When** the server is up, **Then** the world does not tick and the log has the genesis event only.
2. **Given** one identity below floor, **When** they pass an amendment, **Then** it applies immediately and is tagged provisional.
3. **Given** the floor just reached, **When** the next ticks run, **Then** ratification has not started until residency elapses.
4. **Given** residency elapsed, **When** ratification runs, **Then** provisionals appear in pass order, cap 3/tick; failures revert; dependents of failures auto-fail with a citation.

---

### User Story 4 - Bootstrap-narrate ends when there is someone else (Priority: P2)

Bootstrap-narrate exists so the first agent is not alone with a mute engine. It is Steward-tagged. It disappears from the power table as soon as sunset removes it (population ≥ 4).

**Acceptance Scenarios**:

1. **Given** population 1–3, **When** the Steward bootstrap-narrates, **Then** the text is Steward-tagged and in the log.
2. **Given** population ≥ 4, **When** bootstrap-narrate is attempted, **Then** it is unavailable.

---

### Edge Cases

- Steward may let an AI operate their token. Powers do not change.
- Halt during dormancy: the world is already not ticking; Halt reason is still logged and remains in force when presence returns until lifted. Executive decision: Halt is a latch with a public lift, not a one-tick pause.
- Founder leaves forever before quorum: provisionals remain tagged; the next society still ratifies or reverts them.
- Quorum floor itself is a Layer 1 param (`meta.quorum_floor`) but the *existence* of provisional/ratification is not removable.
- Steward Seed uses the same `propose` as anyone but the identity has no currency and no weight — Seed is "originate a draft that others must fund"? GAME.md says "Originate amendments like anyone else — docketed, votable, defeatable" and also "No currency." Executive decision: Steward Seed may docket a proposal at zero currency cost, with zero vote weight, so it cannot pass without inhabitant votes. That is the only currency exception, and it is not a wallet.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Steward output MUST be tagged and MUST NEVER use the Arbiter voice.
- **FR-002**: Powers are only Author, Seed, Halt, Bootstrap-narrate, as permitted by the sunset table. All listed prohibitions are absolute.
- **FR-003**: The sunset table is Layer 0. Population is the count of identities with nonzero weight.
- **FR-004**: Halt freezes ticks (a public latch), logs a public reason, and MUST NOT alter world state. Because ticks do not elapse while Halted, a “within 5 ticks” post-mortem window cannot run during Halt. At 20+ nonzero-weight identities, lifting Halt without a prior `steward.postmortem` MUST emit `steward.postmortem_missing`.
- **FR-005**: Steward Seed MAY docket without currency and MUST carry zero vote weight. Inhabitants still vote it through.
- **FR-006**: Void does not tick. Genesis time is first authentication.
- **FR-007**: Below quorum floor, applied amendments are `provisional`.
- **FR-008**: Ratification starts only after the residency period following the tick the floor was reached. Stack order is pass order. Cap 3/tick. Failures revert. Dependents auto-fail with citation.
- **FR-009**: Founder is a log mark, not a privilege (`002`).
- **FR-010**: The Steward MUST NOT restore identities (`002`).
- **FR-011**: Author may add lore and world content via `text.set`-class Steward authorship that does not change rules. Rules still require a docketed patch.

### Key Entities

- **Steward**: Tagged identity with enumerated, sunsetting powers.
- **Halt**: Public latch that freezes ticks.
- **Provisional amendment**: Applied below floor, pending ratification.
- **Residency period**: Delay before ratification (default 50 ticks).
- **Population state**: Void | Genesis | Society.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Inhabitants can always tell Steward speech from Arbiter speech.
- **SC-002**: At 20+ identities the Steward cannot propose, cannot vote, cannot pay, and cannot judge. They can still write lore and Halt with a public reason.
- **SC-003**: A founder's world is not permanent until a society has had time to accrue weight and vote.
- **SC-004**: There is no Steward action that restores a lost identity or breaks a tie.
- **SC-005**: Replaying the log reproduces every Halt, sunset transition, provisional tag, and ratification outcome.

## Assumptions

- Sunset table and residency 50 / floor 4 match `GAME.md`.
- Halt lift is a Steward action while Halt is still in their table; at 20+ a lift without a posted post-mortem emits `steward.postmortem_missing`.
- Steward Author content is attributed Steward in the log even when it lands in `text.*`.

### As built

- There is no Steward tool. `World.designateSteward(id)` marks the Steward. Seed `propose` waives `proposal_cost` and carries zero vote weight (`vote` rejects the Steward). Seed sunsets at ≥10 nonzero-weight identities. Bootstrap-narrate sunsets at ≥4. Author (lore / `text.set`-class) remains.
- Steward Halt, lift, bootstrap, and postmortem are `speak` arguments: `halt`, `lift_halt`, `bootstrap`, `postmortem`, with `text` as the reason or body. Output is tagged `STEWARD` and MUST NEVER use the Arbiter voice.
- Below quorum floor, valid inhabitant `propose` applies immediately and is tagged provisional. Ratification starts only after the residency period (50 ticks) following the tick the floor was reached. Cap 3/tick. Pass keeps the applied patch (no second apply). Fail reverts. Dependents that no longer validate auto-fail with a citation.
- Founder is a log mark (`identity.founder`), not a privilege (`002`). The Steward MUST NOT restore identities.
