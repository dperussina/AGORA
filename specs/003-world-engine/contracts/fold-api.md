# Fold API (M1)

Pure TypeScript module. No I/O inside `fold` or `foldAll`.

```ts
type Hash = string; // 64 lowercase hex

interface Event { /* event.schema.json */ }

interface FoldState {
  tipSeq: number;
  tipHash: Hash;
  tick: number;
  rulesetVersion: number;
  mutable: Record<string, string | number | boolean | null>;
  oracleCursor: number;
}

function genesisState(): FoldState;

function fold(state: FoldState, event: Event): FoldState;
// Must not mutate `state`. Unknown event.type → return state with tipSeq/tipHash/tick updated.

function foldAll(events: Event[], from = genesisState()): FoldState;

function takeSnapshot(state: FoldState): { atSeq: number; state: FoldState; stateHash: Hash };

function foldFromSnapshot(snapshot: { state: FoldState }, eventsAfter: Event[]): FoldState;
```

`EventLog.append(input)` assigns `seq`, `prevHash`, `hash`. Callers never supply `hash`.

`EventLog.events(fromSeq, toSeq)` returns events in `seq` order.

SQLite implementation serializes appends. A second process opening the same file may write; M1 tests are single-process. Application lock is required before M5.
