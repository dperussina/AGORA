# Research: World Engine M1

## Decision: TypeScript + Node 22

**Rationale**: MCP Tier-1 SDK for 2026-07-28 is TypeScript. One language from fold to later MCP surface. Strict mode matches project rules.

**Alternatives considered**: Rust (stronger determinism story, slower to MCP); Python (fine for fold, weaker MCP path). Rejected to avoid a polyglot M4.

## Decision: SQLite (WAL) via better-sqlite3

**Rationale**: GAME.md allows Postgres or SQLite. M1 needs an embeddable append-only table and replay tests without a daemon. WAL + a single writer matches FR-014 when ticks arrive.

**Alternatives considered**: Postgres now (ops weight, no gain for replay tests); JSONL files (fine for toys, weak indexes for `marks-as-of-T`); Convex (query clocks, not a hash-chained log).

## Decision: SHA-256 over canonical JSON

**Rationale**: Portable, no extra deps, enough for tamper-evidence. Merkle roots of segments can hash the same way later.

**Alternatives considered**: BLAKE3 (faster, extra dep); raw protobuf (schema churn). Canonical JSON is enough if we forbid `undefined` and NaN.

## Decision: bigint for consequential quantities

**Rationale**: Constitution forbids float in weight, standing, currency. `bigint` is integer. Ratios later use integer milli-units (e.g. weight × 1000).

**Alternatives considered**: decimal.js (float-shaped API, easy to misuse); number (fails the gate).

## Decision: Fold is a pure function `(state, event) => state`

**Rationale**: Replay is `events.reduce(fold, genesisState)`. Snapshots are serialized `FoldState` at a sequence. Unknown event types leave state unchanged and still chain the hash (the event happened; M1 has no reducer).

**Alternatives considered**: Event sourcing frameworks (overkill, hide the chain); mutable in-place store as truth (violates Bedrock 3).

## Decision: Defer tick wall-clock to M5

**Rationale**: M1 must not read `Date.now()` in the fold. Dormancy gap *payloads* may *record* a wall duration supplied by the caller; the fold does not measure it. Tick scheduler is a single-writer job later.

**Alternatives considered**: Ship the scheduler in M1 (scope creep; no identities to be "present").

## Decision: No Date.now in tests of the fold

**Rationale**: Tests pass a logical tick and sequence. Wall time appears only in optional dormancy-gap fixtures as a literal number in the payload.

## Unresolved → resolved

| Unknown | Resolution |
|---------|------------|
| Storage engine | SQLite WAL |
| Hash | SHA-256 canonical JSON |
| Test runner | Vitest |
| M1 event vocabulary | `genesis`, `append_test`, ignore-unknown |
| Segment sealing | Stub only |
