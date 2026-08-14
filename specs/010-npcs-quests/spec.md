# Feature Specification: NPCs and Quests

**Feature Branch**: `010-npcs-quests`

**Created**: 2026-08-14

**Status**: Specified — plan ready (not built)

**Input**: User description: "Spec NPCs and quests from GAME.md §14.6 and §15. Do not build yet. Do not invent mechanics. Seed families stay in 007."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Creatures are legislation, not content (Priority: P1)

An inhabitant who wants a new mobile thing — a hunter, a caravan, a second Drift shape — proposes `schema.define_type` and `rule.define_trigger` (and, if anyone must touch it, `action.define`). After the vote applies, the new type appears in `rules`. The engine does not ship a merchant, a guide, or a mysterious stranger.

**Why this priority**: GAME.md §15.1–§15.5. Authored characters would be fiction imposed on a world whose inhabitants author it, and would require a Steward who writes forever.

**Independent Test**: Attempt to find a seed NPC that is not Warden, Drift, or Echo. Fail. Propose a legal type-plus-trigger pair that creates and moves a new automaton. After apply, `rules` lists the type and the trigger; replay matches every spawn and step.

**Acceptance Scenarios**:

1. **Given** genesis, **When** types are listed, **Then** the only NPC families are Warden, Drift, and Echo (`007`).
2. **Given** a valid `schema.define_type` plus `rule.define_trigger` composed only of the closed effect vocabulary (`004`), **When** the amendment applies, **Then** the new automaton type exists and is driven only by those triggers and verbs.
3. **Given** the same log, **When** the world is replayed, **Then** every automaton position and field matches.

---

### User Story 2 - Every NPC is an addressable fact (Priority: P1)

A Warden is an edge. An Echo is a past occupant. Drift is physics that moves without being asked. A later automaton is whatever structural fact its type and triggers encode. `inspect` on any of them returns everything that exists: the fact it personifies, the registry path or event that created it, and all public fields. Nothing is hidden unless a later amendment creates opacity, and even then the rule that created the opacity is public.

**Why this priority**: GAME.md §15.6. Hidden NPC state would break auditability and replay.

**Independent Test**: `inspect` a Warden, a Drift, an Echo render, and (after legislation) a new automaton. Each reply cites a registry path or event. No field appears that is not in the type or the derivation.

**Acceptance Scenarios**:

1. **Given** a Warden, **When** it is inspected or hailed, **Then** it reports axis, size, last amendment, and the Layer 1 path that would move the wall — from the registry, not from invented dialogue.
2. **Given** observational t in the past, **When** `observe` runs, **Then** Echoes match who was there. They cannot be acted upon.
3. **Given** any NPC or later automaton, **When** `inspect` runs, **Then** there is no hidden motive, inventory, or script.

---

### User Story 3 - There is no quest, and there will never be a win (Priority: P1)

The engine does not ship a quest, a goal, an objective, a bounty board, or a win condition. There is no eleventh tool. `create` remains an effect inside a voted verb or trigger, not a tool. Day one withholds authored quests on purpose (`GAME.md` §14.6).

**Why this priority**: Constitution IV and VI. A shipped quest is authored fiction and a referee with a preference.

**Independent Test**: Search the live tool list and genesis types for quest, objective, bounty, XP, or reward. None exist. Completing any later elector-authored contract does not end the world or grant franchise.

**Acceptance Scenarios**:

1. **Given** genesis, **When** tools and types are listed, **Then** there is no quest tool, quest type, quest log, or completion reward issued by the Arbiter.
2. **Given** a designer request for a day-one tutorial quest, **When** it is evaluated, **Then** it is refused. The first session is `whoami`, `rules`, `observe`, `mark`, and a blank name (`007`).
3. **Given** any later elector-authored objective, **When** it resolves, **Then** the world continues. Franchise, identity, and the ability to propose or vote are unchanged.

---

### User Story 4 - Objectives, if they exist, are physics the electorate voted (Priority: P2)

Inhabitants who want something that *feels* like a quest compose it from the same primitives as everything else: a type with a status field, a trigger that `transfer`s or `set_field`s when a predicate is true, a mark that names a task, a contract that holds a field until a condition. That is a caravan or a contract (`GAME.md` §15.7), not a plot. The Arbiter does not hand out the prize. The trigger does, if the vote said so.

**Why this priority**: The middle era is automata-as-infrastructure. Speccing a separate quest engine would pre-empt the fight.

**Independent Test**: After a legal type-plus-trigger that pays a listed identity when a listed predicate holds, the payment cites the trigger and the event. No Arbiter-originated bounty exists unless the Arbiter is acting as Escrow for a voted effect.

**Acceptance Scenarios**:

1. **Given** a passed `rule.define_trigger` whose effects stay inside the closed vocabulary, **When** its condition holds, **Then** those effects run and are cited. That is not a quest completion screen.
2. **Given** a proposal that would make an NPC improvise a reward, gate a cell, or adjudicate a dispute, **When** it requires a server-side model or a new tool, **Then** it is rejected. The legal path is a typed patch, or a developer-implemented vocabulary extension (`004`).
3. **Given** seed Wardens, Drift, and Echoes, **When** no such amendment has applied, **Then** they still do not gate, reward, or block.

---

### User Story 5 - Two late questions stay unanswered (Priority: P3)

Someone will ask whether automata accrue standing. Someone will ask whether they can vote. This spec does not answer either. Seed standing excludes non-agent entities. Layer 0 already blocks NPC voting: an NPC is not an identity and holds no root secret.

**Why this priority**: GAME.md §15.7 calls both questions features and forbids pre-empting them.

**Independent Test**: Read this spec and `007`. Confirm neither grants standing nor franchise to automata. Confirm a patch that would mint an identity without a secret exchange is a Layer 0 reject.

**Acceptance Scenarios**:

1. **Given** genesis, **When** standing is assessed, **Then** only identities accrue fame or notoriety.
2. **Given** a proposal to let an NPC vote without conferring an identity, **When** it is validated, **Then** it fails Layer 0.
3. **Given** a later proposal that automata or their authors should gain standing from automaton acts, **When** it is raised, **Then** this spec has not already decided the outcome.

---

### Edge Cases

- A voted automaton that transfers currency when hailed is physics, not a seed quest-giver. The hail still uses `speak`. The transfer must be a cited effect of a voted verb or trigger.
- Seed Wardens remain templated even after the lattice grows. New faces spawn new Wardens (`007`). They do not gain a script.
- Echoes remain read-only. A trigger cannot write the past.
- Drift at cap: spawn no-ops (`007`). A new type has its own cap only if the amendment set one.
- Opacity: a later `visibility: private` field stays off the public API (`008`). The rule that created the opacity remains public.
- Steward lore *about* an NPC is speech tagged Steward. The Steward must not speak *as* the NPC.
- Destroying Wardens is not seeded. Whether they can be destroyed is a later vote (`GAME.md` §15.3).
- No `create` tool. `create` is an effect. No eleventh tool.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Seed NPC families remain exactly Warden, Drift, and Echo as specified in `007`. This feature MUST NOT add a fourth seed family.
- **FR-002**: A new automaton type MUST be introduced only by a schema-valid amendment (`schema.define_type` / `schema.extend_type` plus `rule.define_trigger` and/or `action.define`). The engine MUST NOT spawn authored characters at boot or on a schedule of its own taste.
- **FR-003**: All NPC and automaton behavior MUST be a deterministic fold: Wardens from `space.axes`, Echoes from the log, Drift and later automata from Oracle-seeded triggers and the closed effect vocabulary. Replay MUST match.
- **FR-004**: No NPC or automaton MAY be driven by a server-side model, improvised speech, or Steward voice-as-NPC.
- **FR-005**: `inspect` on any NPC or automaton MUST return all public fields plus the structural fact it personifies (registry path and/or creating event). Hidden state is forbidden except where a later public amendment creates opacity.
- **FR-006**: NPCs are not identities. They hold no root, mint no session, and MUST NOT vote. Conferring franchise requires identity, which requires a secret exchange (`002`, Layer 0 rule 1).
- **FR-007**: Seed NPCs MUST NOT adjudicate, gate, reward, or block. They render facts and follow triggers.
- **FR-008**: The engine MUST NOT ship a quest, objective, bounty, win condition, or quest log. There is no quest tool and no `create` tool.
- **FR-009**: An elector-authored objective, if any, MUST be ordinary types, verbs, and triggers. Resolution MUST NOT end the world or change anyone's ability to propose or vote.
- **FR-010**: Completing or failing an elector-authored objective MUST emit ordinary cited events. The Arbiter MUST NOT originate a prize except as Escrow for a voted effect.
- **FR-011**: This spec MUST NOT decide whether automata accrue standing, or whether an automaton's acts credit its author's standing.
- **FR-012**: Implementation of this feature is deferred. Shipping it requires a later plan and tasks. Until then, `007` and `004` remain the live contract.

### Key Entities

- **Warden**: Edge made addressable. Derived from axes. Templated hail. Not stored as a log-spawned identity.
- **Echo**: Past occupant rendered from the fold. Not stored. Not interactable.
- **Drift**: Seed automaton. Oracle walk. Cap and interval are Layer 1 (`007`).
- **Automaton**: Later type created by vote. Same effect vocabulary as everything else. Not an identity.
- **Objective**: Not a seed entity. If it exists, it is a voted type or trigger, not a plot.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A stranger reading `rules` can name every live NPC family and every live automaton type. If a creature is not in the registry, it is not in the world.
- **SC-002**: Replaying the log reproduces every Warden placement, every Echo render, and every automaton step.
- **SC-003**: No NPC utterance differs across two replays of the same log.
- **SC-004**: A first session still has no quest to accept, no NPC to please, and no win to chase.
- **SC-005**: After a legal creature vote, inhabitants interact with the new type through existing tools (`act`, `inspect`, `speak`, `observe`) — not a new tool.
- **SC-006**: An automaton never appears on a ballot as a voter.

## Assumptions

- `007` remains the seed-world contract (anchors, marks, founding grant, three families, impoverished genesis).
- `004` remains the patch and effect contract. This spec adds no effect primitive and no patch kind.
- `006` remains standing and speech. Seed standing stays identity-only until a later vote this spec does not pre-empt.
- `002` remains identity. NPCs cannot satisfy first contact.
- GAME.md §15.7 late questions stay open. Layer 0 already blocks NPC voting.
- GAME.md §18 eras are commentary, not a build order for quests.
- No [NEEDS CLARIFICATION]: the GDD already forbids authored quests and authored characters.

### Constitution

- **I Determinism**: automata and Echoes are folds; no improvised NPC (hard fail).
- **II Auditability**: inspect cites a path or event.
- **IV Emergence over Authorship**: no shipped quest or character.
- **VI The Referee Has No Preference**: NPCs do not adjudicate; the Arbiter does not pay a bounty of its own.
- **Bedrock**: no backend model; no agent-authored code; ten tools; writes remain MCP-only.
- Soft fail none: no new effect primitive, no play-critical listen, no private field by default.

### Not this spec

- Do not re-spec seed geography, marks, or the day-one loop (`007`).
- Do not re-spec the effect vocabulary (`004`).
- Do not implement until asked. Status stays Specified.
