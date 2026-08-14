# Data Model: World Engine M1

## Event

Append-only. Never updated. Never deleted.

| Field | Type | Rules |
|-------|------|--------|
| `seq` | integer ≥ 0 | Monotonic, unique. Genesis is 0. |
| `tick` | integer ≥ 0 | Logical world tick at append. M1 tests supply it; M5 scheduler writes it. |
| `actor` | `identity:<id>` \| `ARBITER` \| `STEWARD` | Required. |
| `type` | string | Closed for reducers; unknown types still store and hash. |
| `payload` | JSON object | Typed per `type`. Canonicalized before hash. |
| `ruleId` | string | Authorizing rule. Genesis uses `L0-genesis`. |
| `prevHash` | hex sha256 | Genesis uses 64 zeros. |
| `hash` | hex sha256 | Hash of canonical record *excluding* `hash` itself. |

**Validation**: `seq` = last+1; `prevHash` = last `hash`; payload is a plain object; no `undefined`.

## FoldState (derived, cacheable)

Not authoritative.

| Field | Type | Notes |
|-------|------|--------|
| `tipSeq` | integer | Last folded event |
| `tipHash` | hex | Last event hash |
| `tick` | integer | Last event's tick |
| `rulesetVersion` | integer | 0 at M1 |
| `mutable` | object | Positions, counters, test registers — key-sorted |
| `oracleCursor` | integer | How many RNG draws consumed (0 at M1) |

Immutable entities (marks later) are **not** stored here. They are queries over the log (`type = mark_created AND seq ≤ T`).

## Snapshot

| Field | Type | Rules |
|-------|------|--------|
| `atSeq` | integer | Inclusive |
| `state` | FoldState | Canonical JSON |
| `stateHash` | hex | Hash of canonical `state` |

Taken every N events (default 1000, tests 5), on ruleset bump (none in M1), and at segment boundaries (later).

**Rebuild**: delete all snapshots, fold from 0, recreate. Must match.

## Segment (designed, stub)

| Field | Type |
|-------|------|
| `index` | integer |
| `fromSeq` / `toSeq` | inclusive range, 1M events |
| `merkleRoot` | hex |
| `prevRoot` | hex |

M1 ships `merkleRoot(hashes[])` only.

## Actor

`ARBITER` | `STEWARD` | identity string. M1 tests use `ARBITER` and `identity:test-1`.

## State transitions

```
empty store
  → append genesis (seq 0, prevHash 0…0)
  → append events (seq n, prevHash = hash n-1)
  → fold(0..n) → FoldState
  → snapshot(n)
  → wipe FoldState + snapshots
  → load snapshot(k) + fold(k+1..n) ≡ fold(0..n)
```

Illegal: patching an event, inserting with a gap, two writers appending concurrently without a lock (SQLite serialized writes; application MUST use one append mutex).
