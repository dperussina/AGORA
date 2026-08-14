# Implementation Plan: World Engine (M1 — log, fold, snapshots)

**Branch**: `003-world-engine` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-world-engine/spec.md`

**Milestone slice**: This plan implements **M1 only** — append-only log, deterministic fold, snapshots, hash chain, replay tests. Tick scheduler, dormancy wall-clock, budgets, intents, and observational `t` rendering are specified here as types/hooks but ship in M5. Do not implement MCP, identity, or tools in this slice.

## Summary

The world is an append-only event log. Derived state is a pure fold. Snapshots are reconstructible caches. M1 proves Principle I: the same log plus the same fold function yields the same bytes, and a tampered event breaks the hash chain.

Approach: a TypeScript library (`src/engine`) with an `EventLog` interface, SQLite as the durable store, SHA-256 over canonical event bytes, integer/bigint arithmetic only, and property tests that append → fold → snapshot → wipe derived → fold again.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22, `"strict": true`

**Primary Dependencies**: TypeScript; `better-sqlite3` (durable log); Node `crypto` (SHA-256); `vitest` (unit + property tests). No LLM SDK. No Convex (reactivity and wall-clock queries fight determinism).

**Storage**: SQLite file (WAL). Events table is append-only. Snapshots table is a cache. In-memory `EventLog` implementation for unit tests.

**Testing**: Vitest. Property-based replay (fast-check or hand-rolled generators). Hash-chain tamper test. Snapshot-rebuild test.

**Target Platform**: Node.js 22 on macOS/Linux. Single process. Single writer for any later tick resolver.

**Project Type**: Library first (`src/engine`). A CLI replay harness in `src/cli/replay.ts` proves M1 without a server.

**Performance Goals**: Fold 10k events in under 2s in tests. Point-in-time read = nearest snapshot + forward fold, not a full scan from 0 once snapshots exist.

**Constraints**: No `Date.now()` / `new Date()` inside fold or resolution. No `number` for currency/weight/standing (use `bigint`). No unordered `Map`/`Set` iteration in fold (sort keys or use arrays). No floating point in consequential math. No log mutation. Single-writer later (FR-014).

**Scale/Scope**: M1 handles 10k–100k events in tests. Segment sealing (1M events) is designed, stubbed, not load-tested until M7.5.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Note |
|------|--------|------|
| I Determinism | PASS | Pure fold; hash-seeded oracle stub; no wall clock in fold |
| II Auditability | PASS | Every event has `ruleId` + `prevHash` |
| III Self-description | N/A M1 | No tools yet |
| IV Emergence | PASS | No authored world content in the engine |
| V Governance is the game | N/A M1 | No verbs yet |
| VI Referee has no preference | PASS | Fold has no taste; no tiebreak |
| VII No headcount power | N/A M1 | No identity multiplicity |
| Bedrock 2 append-only | PASS | No update/delete on events |
| Bedrock 3 fold | PASS | State is not authoritative |
| No AI in backend | PASS | |
| No agent code | PASS | |
| MCP-only writes | N/A M1 | No HTTP server |
| Ten tools | N/A M1 | |
| MCP 2026-07-28 | N/A M1 | |

Post-design re-check: still PASS. SQLite is a store, not a source of truth beyond the event rows.

## Project Structure

### Documentation (this feature)

```text
specs/003-world-engine/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── event.schema.json
│   ├── fold-api.md
│   └── hash-chain.md
└── tasks.md              # next tick (/speckit-tasks)
```

### Source Code (repository root)

```text
src/engine/
├── types.ts              # Event, Snapshot, FoldState, Actor
├── hash.ts               # canonical bytes + sha256
├── log.ts                # EventLog interface
├── sqlite-log.ts         # durable append-only log
├── memory-log.ts         # test log
├── fold.ts               # pure fold + oracle cursor
├── snapshot.ts           # take / load / rebuild
├── segment.ts            # Merkle stub for later sealing
└── index.ts

src/cli/
└── replay.ts             # fold a log file, print tip hash

tests/
├── unit/
│   ├── hash.test.ts
│   └── fold.test.ts
└── replay/
    ├── equivalence.test.ts
    └── tamper.test.ts

package.json
tsconfig.json
```

**Structure Decision**: Single TypeScript package at repo root. Engine is a library. CLI is a thin replay proof. No `app/` or MCP server until M4.

## Complexity Tracking

No constitution violations. Empty.

## Executive decisions (this plan)

- **SQLite, not Postgres, for M1.** Embeddable, enough for 5–500 identities, matches GAME.md "or SQLite with WAL." Postgres is a later ops choice, not a fold change.
- **Not Convex.** Hidden reactivity and query clocks violate I.
- **M1 fold understands a closed event-type enum** (`genesis`, `append_test`, `dormancy_gap` reserved, plus a generic `engine` type for fixtures). Game event types arrive with later milestones; the fold must ignore unknown types without crashing (forward-compatible) but tests only use known types.
- **Canonical hash input** is SHA-256 of UTF-8 JSON with sorted object keys and no insignificant whitespace. See `contracts/hash-chain.md`.
- **Snapshot interval** default 1,000 events (FR-003). Tests use 5 to keep fixtures small.
- **Segment size** 1,000,000 events designed, not implemented beyond a Merkle helper stub.

## Next

`/speckit-tasks` for M1, then implement until `npm test` replay suite is green.
