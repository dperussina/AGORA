# Tasks: World Engine M1

**Input**: Design documents from `/specs/003-world-engine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. Spec SC-001 and plan demand replay equivalence and tamper tests. TDD: tests first where marked.

**M1 scope**: US1 (log/fold) + US5 (snapshots/hash). US2–US4 (ticks, budgets, observational t) are M5 — listed as deferred, not implemented here.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Create `src/engine/`, `src/cli/`, `tests/unit/`, `tests/replay/` per plan.md
- [x] T002 Initialize Node 22 TypeScript project in `package.json` and `tsconfig.json` (strict, NodeNext)
- [x] T003 Add vitest, typescript, tsx, better-sqlite3, @types/better-sqlite3, @types/node as dependencies in `package.json`

---

## Phase 2: Foundational

**⚠️ CRITICAL**: Blocks all user stories

- [x] T004 Implement canonical JSON + SHA-256 in `src/engine/hash.ts`
- [x] T005 Implement Event and FoldState types in `src/engine/types.ts` matching `contracts/event.schema.json` and `data-model.md`
- [x] T006 Implement EventLog interface in `src/engine/log.ts`
- [x] T007 Implement in-memory EventLog in `src/engine/memory-log.ts`
- [x] T008 Export public API from `src/engine/index.ts`

**Checkpoint**: Types, hash, and memory log exist. No fold yet.

---

## Phase 3: User Story 1 - The log is the world (P1) 🎯 MVP

**Goal**: Append-only hashed events; pure fold; two folds match; tamper fails verify.

**Independent Test**: `tests/replay/equivalence.test.ts` and `tests/replay/tamper.test.ts` pass on the memory log.

### Tests

- [x] T009 [P] [US1] Unit tests for canonical hash in `tests/unit/hash.test.ts` (write first, fail, then implement if needed)
- [x] T010 [P] [US1] Unit tests for pure fold in `tests/unit/fold.test.ts`
- [x] T011 [US1] Replay equivalence tests in `tests/replay/equivalence.test.ts`
- [x] T012 [US1] Tamper-detect tests in `tests/replay/tamper.test.ts`

### Implementation

- [x] T013 [US1] Implement `fold`, `foldAll`, `genesisState` in `src/engine/fold.ts` (no Date.now, no float, no unordered iteration)
- [x] T014 [US1] Implement `verifyChain` in `src/engine/hash.ts`
- [x] T015 [US1] Wire memory log append to assign seq, prevHash, hash in `src/engine/memory-log.ts`

**Checkpoint**: Memory log + fold + verify is independently demonstrable.

---

## Phase 4: User Story 5 - Storage partitioned by mutability (P2)

**Goal**: Snapshots are caches; fold-from-snapshot ≡ full fold; SQLite durable log; Merkle stub.

**Independent Test**: Equivalence tests pass against SQLite log; snapshot rebuild matches.

- [x] T016 [US5] Implement `takeSnapshot`, `foldFromSnapshot` in `src/engine/snapshot.ts`
- [x] T017 [US5] Implement SQLite EventLog + snapshot table in `src/engine/sqlite-log.ts`
- [x] T018 [US5] Implement `merkleRoot` stub in `src/engine/segment.ts`
- [x] T019 [US5] Extend `tests/replay/equivalence.test.ts` to cover snapshot rebuild and SQLite

**Checkpoint**: Durable log + snapshots reconstructible.

---

## Phase 5: Deferred (M5 — do not implement now)

- [ ] T020 [US2] Tick scheduler, dormancy, single-writer lock — M5
- [ ] T021 [US3] Action budgets — M5
- [ ] T022 [US4] Observational t / Echo render — M5 / M5.5

---

## Phase 6: Polish

- [x] T023 Replay CLI in `src/cli/replay.ts` per `quickstart.md`
- [x] T024 Run `npm test` and fix failures
- [x] T025 Mark M1 done in `specs/ROADMAP.md` only if replay suite is green

---

## Dependencies

- Setup → Foundational → US1 → US5 → Polish
- US2–US4 blocked until M5
- US1 is the MVP

## Parallel

- T009 and T010 after T004–T005
- T016 and T018 after US1

## MVP

T001–T015. Demo: two folds, same hash, tamper fails.
