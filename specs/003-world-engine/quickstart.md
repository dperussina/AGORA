# Quickstart: M1 replay

Proves the log is the world. No MCP. No identities.

## Prerequisites

- Node.js 22+
- From repo root, after M1 implement: `npm install`

## Validate

```bash
npm test
```

Expected:

- Unit tests for canonical hash and pure `fold`
- `tests/replay/equivalence.test.ts`: append N events → fold → snapshot → delete derived → fold from snapshot ≡ full fold; two full folds ≡ each other
- `tests/replay/tamper.test.ts`: flip one payload byte → `verify` fails

```bash
npx tsx src/cli/replay.ts --log /tmp/agora-m1.sqlite
```

Expected: prints `tipSeq`, `tipHash`, `ok` after self-check (fold twice, hashes match).

## Out of scope

Ticking, dormancy wall-clock, `act`, MCP. Those are later milestones.
