# Tasks: NPCs and Quests

**Input**: Design documents from `/specs/010-npcs-quests/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The spec’s independent tests and `contracts/genesis-forbids.md` are the feature.

**Organization**: Guard first. No quest engine. No eleventh tool. No fourth seed family.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US5 map to spec user stories
- Every task names a file path

## Phase 1: Setup

**Purpose**: Point the tree at this slice. No new package, no `src/quest/`.

- [ ] T001 Confirm `.specify/feature.json` points at `specs/010-npcs-quests` and that `src/npc/` and `src/quest/` do not exist
- [ ] T002 [P] Read `specs/010-npcs-quests/contracts/genesis-forbids.md` and `specs/010-npcs-quests/contracts/inspect-npc.md` before editing engine files

---

## Phase 2: Foundational

**Purpose**: Shared inspect citation and create-event seq. Blocks every story that inspects an NPC or automaton.

**⚠️ CRITICAL**: No user story work until this phase is complete

- [ ] T003 Add `createdBy` (event seq or `"derived"`) and `personifies` (registry path) to inspect results in `src/world/world.ts`
- [ ] T004 Include creating event seq on `effect.create` payloads in `src/engine/effects.ts` and the `emit` path in `src/world/world.ts`
- [ ] T005 Keep genesis `registry.types` keys exactly `agent`, `mark`, `warden`, `drift`, `anchor` in `src/engine/registry.ts`

**Checkpoint**: Inspect can cite. Seed types unchanged. Still ten tools.

---

## Phase 3: User Story 3 - There is no quest, and there will never be a win (Priority: P1) 🎯 MVP

**Goal**: Prove genesis has no quest tool, type, log, or Arbiter prize.

**Independent Test**: `tools/list` is ten names. `rules` types are the seed set. No quest / objective / bounty / xp key.

### Tests

- [ ] T006 [P] [US3] Add genesis-forbid tests from `specs/010-npcs-quests/contracts/genesis-forbids.md` in `tests/unit/npc-quests.test.ts`

### Implementation

- [ ] T007 [US3] Assert `TOOL_NAMES` in `src/mcp/catalog.ts` stays the ten live tools and does not include `create` or `quest`
- [ ] T008 [US3] Leave `src/engine/registry.ts` without a quest, objective, bounty, or reward type

**Checkpoint**: MVP. A first session still has nothing to accept.

---

## Phase 4: User Story 2 - Every NPC is an addressable fact (Priority: P1)

**Goal**: Warden, Drift, and Echo inspect/observe cite the fact they personify. No hidden script.

**Independent Test**: `inspect` a warden and a drift; `observe` a past tick. Citations match `contracts/inspect-npc.md`. Echoes cannot be acted on.

### Tests

- [ ] T009 [P] [US2] Add inspect-citation tests for warden and drift in `tests/unit/npc-quests.test.ts`

### Implementation

- [ ] T010 [US2] Return `personifies` and `createdBy: "derived"` on warden inspect in `src/world/world.ts`
- [ ] T011 [US2] Return `personifies: "types.drift"` and spawn seq on drift inspect in `src/world/world.ts`
- [ ] T012 [US2] Keep Echoes read-only in `src/world/world.ts` (`observe` past `t`; no act target)
- [ ] T013 [P] [US2] Mention entity and warden targets in the `inspect` description in `src/mcp/catalog.ts` without adding a tool

**Checkpoint**: Seed NPCs are facts. Still no quest.

---

## Phase 5: User Story 1 - Creatures are legislation, not content (Priority: P1)

**Goal**: A voted type+trigger creates an inspectable automaton. Replay matches. No authored character at boot.

**Independent Test**: Below floor, apply `schema.define_type` + `rule.define_trigger`. `rules` lists them. `inspect` the `ent:` id. Replay the log.

### Tests

- [ ] T014 [P] [US1] Add voted-automaton create/inspect/replay tests in `tests/unit/npc-quests.test.ts`

### Implementation

- [ ] T015 [US1] Route `inspect` of `ent:<n>` through `World.entities` in `src/world/world.ts` with `personifies: types.<type>` and `createdBy` seq
- [ ] T016 [US1] Keep seed Drift on the Oracle path in `src/world/world.ts`; do not spawn a fourth family at construct
- [ ] T017 [US1] Let `runEffects` `create` of a voted type land in `World.entities` via existing `src/engine/effects.ts` (no new collection)

**Checkpoint**: Creatures arrive by vote. Boot is still Warden / Drift / Echo.

---

## Phase 6: User Story 4 - Objectives, if they exist, are physics the electorate voted (Priority: P2)

**Goal**: A trigger that transfers or sets a field cites the trigger. Seed NPCs still do not gate or reward.

**Independent Test**: Voted trigger fires; event cites the trigger. Warden/Drift/Echo still do not pay or block.

### Tests

- [ ] T018 [P] [US4] Add trigger-payment citation test in `tests/unit/npc-quests.test.ts`

### Implementation

- [ ] T019 [US4] Ensure trigger `emit` / `append` in `src/world/world.ts` cites the trigger id on `transfer` / `set_field` effects
- [ ] T020 [US4] Do not add seed gate/reward behavior to wardens or drift in `src/world/world.ts`

**Checkpoint**: A contract is physics. Not a completion screen.

---

## Phase 7: User Story 5 - Two late questions stay unanswered (Priority: P3)

**Goal**: Automata do not accrue standing. They cannot vote. Do not implement the opposite.

**Independent Test**: Standing is identity-only. `vote` with an `ent:` or `warden:` id fails. No patch mints an identity without a secret.

### Tests

- [ ] T021 [P] [US5] Add standing-and-franchise tests in `tests/unit/npc-quests.test.ts`

### Implementation

- [ ] T022 [US5] Keep `assessStanding` identity-only in `src/world/world.ts`
- [ ] T023 [US5] Reject `vote` / first contact when the principal is not an identity in `src/world/world.ts`

**Checkpoint**: §15.7 still unanswered in code.

---

## Phase 8: Polish

**Purpose**: Docs and quickstart stay honest. No quest copy on the door.

- [ ] T024 [P] Sync the no-quest / no-eleventh-tool line in `public/llms.txt` and `.cursor/skills/agora-play/SKILL.md` (copy play skill to `public/skills/agora-play/SKILL.md`)
- [ ] T025 [P] Mark `010` as-built notes in `specs/010-npcs-quests/spec.md` and `specs/000-index.md` only after tests pass
- [ ] T026 Run `specs/010-npcs-quests/quickstart.md` via `npm test` and `npx tsc --noEmit`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup**: start immediately
- **Foundational**: after Setup — BLOCKS stories
- **US3 (MVP)**: after Foundational — no other story
- **US2**: after Foundational; can follow or sit beside US3
- **US1**: after Foundational + inspect citation (T003–T004)
- **US4**: after US1 (needs a voted type/trigger)
- **US5**: after Foundational; independent of US4
- **Polish**: after the stories you ship

### User Story Dependencies

- **US3**: no story deps — ship first
- **US2**: needs T003
- **US1**: needs T003–T004
- **US4**: needs US1
- **US5**: no story deps

### Parallel Opportunities

- T002 with T001
- T006 with T007 once foundation exists
- T009 with T013
- T014 after T003–T004
- T018 after US1
- T021 with T022/T023
- T024 and T025 after tests

### Parallel Example: MVP (US3)

```text
T006 tests/unit/npc-quests.test.ts
T007 src/mcp/catalog.ts
T008 src/engine/registry.ts
```

---

## Implementation Strategy

### MVP First (US3 only)

1. Phase 1–2
2. Phase 3 (genesis forbids)
3. Stop. `npm test`. No quest in the catalog.

### Incremental

1. US3 → genesis is clean
2. US2 → seed NPCs cite
3. US1 → voted creature inspects and replays
4. US4 → trigger payment cites
5. US5 → franchise stays identity-only
6. Polish docs

### Do not

- Add `src/quest/` or an eleventh tool
- Spawn a merchant, guide, or tutorial quest
- Decide standing-for-automata
- Expand the effect vocabulary
