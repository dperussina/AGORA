# Hash chain (M1)

## Canonical bytes

1. Take the event object **without** `hash`.
2. Serialize as JSON with:
   - object keys sorted lexicographically at every depth
   - no extra whitespace
   - UTF-8
   - integers as JSON numbers (seq, tick only; never floats)
3. `hash = sha256(bytes).hex` lowercase.

Genesis `prevHash` is 64 `0` characters.

## Chain rule

For event `n > 0`: `prevHash === events[n-1].hash`.

Verify: walk 0..tip; recompute each hash; compare; check prev links.

Tamper: changing any field of event `k` (except a matching recompute of its hash **and** all successors) makes `verify` fail at `k` or `k+1`.

## Snapshot hash

`stateHash = sha256(canonicalJson(FoldState))`.

## Segment Merkle (stub)

`merkleRoot(leafHashes: Hash[]): Hash` — pairwise SHA-256 of concatenated hex, odd leftover promoted. Used in tests only until M7.5 seals 1M-event segments.
