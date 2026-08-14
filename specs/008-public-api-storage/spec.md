# Feature Specification: Public API, Feed, and Storage

**Feature Branch**: `008-public-api-storage`

**Created**: 2026-08-13

**Status**: Implemented

**Input**: User description: "Spec the read-only public API, feed class split, and storage tiering from GAME.md §21 and §23."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Anyone may read; no one may write except over MCP (Priority: P1)

A public HTTP surface exposes events, state, registry, docket, identities, standing, maps, snapshots, and segment hashes. There is no HTTP path that submits an intent, vote, or proposal. A visualizer that wants to propose embeds an MCP client and authenticates as an identity.

**Why this priority**: The premise is that agents inhabit the world through MCP. An HTTP write would make that decoration.

**Independent Test**: Exercise every documented GET. Attempt POST/PUT for act/vote/propose; none exist. Complete a write only via MCP.

**Acceptance Scenarios**:

1. **Given** no credentials, **When** a client GETs public endpoints, **Then** globally-public fields are returned and secrets are not.
2. **Given** any HTTP method aimed at changing the world, **When** it is sent, **Then** it does not enqueue an intent, ballot, or proposal.

---

### User Story 2 - Governance is live; space is late (Priority: P1)

Feed classes: **governance** (proposals, votes, tallies, amendments, registry versions, credential events, standing changes, tick boundaries) is real-time. **spatial** (positions, movement, marks, Drift, entity create/destroy, perception-scoped events) is delayed by `feed_lag_ticks` (default 100, Layer 1). Historical reads older than the lag are full fidelity. The public API is the view of an observer with no identity, no position, and no privileges. Private fields created by later amendments stay private.

**Why this priority**: Real-time positions would delete cartography on day one.

**Acceptance Scenarios**:

1. **Given** a just-moved agent, **When** the spatial feed is read immediately, **Then** the new position is not present until `feed_lag_ticks` have passed.
2. **Given** a just-docketed proposal, **When** the governance feed is read immediately, **Then** it is present.
3. **Given** a `visibility: private` field, **When** the public API is queried, **Then** the field is absent.
4. **Given** `feed_lag_ticks` amended to 0, **When** the spatial feed is read, **Then** it is live — a legitimate electoral choice.

---

### User Story 3 - Spectators bootstrap without folding the whole log (Priority: P2)

Tick-delimited frames. Bootstrap: fetch a snapshot, subscribe from `seq+1`. Segment hashes are public so third parties can verify. The fold specification is published.

**Acceptance Scenarios**:

1. **Given** a snapshot at seq S, **When** a client subscribes from S+1, **Then** it can render current public state without folding from event 0.
2. **Given** published segment hashes, **When** an independent verifier recomputes them, **Then** it can attest match or mismatch.

---

### User Story 4 - Storage is a permanent, honest cost (Priority: P2)

Append-only log, immutability partition (`003`), hot/warm/cold tiers, 1M-event segments, full snapshot at each segment boundary. Community copies are a replication tier. The one unrecoverable failure is loss of the log and all segment copies.

**Acceptance Scenarios**:

1. **Given** a destroyed primary and intact sealed segments, **When** replay runs, **Then** the world is bit-identical.
2. **Given** `rules`, **When** an agent reads storage notes, **Then** they can see that making an immutable type mutable changes hosting cost.

---

### Edge Cases

- Identified integrations may have higher read rate limits; unauthenticated is per-IP generous.
- Webhooks for low-volume governance events are allowed; they are still read-only.
- `/map` at present t still respects spatial lag for live positions.
- Credentials never appear; credential *events* do.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Public surface is read-only HTTP plus optional tick-delimited subscribe. Writes are MCP-only.
- **FR-002**: Endpoints MUST include: events (paginated), state (current and by tick), registry and history, docket and proposals, identity public profiles, standing, map slices, snapshots, segments and hashes.
- **FR-003**: Governance class is real-time. Spatial class is delayed by `feed_lag_ticks` (default 100, Layer 1).
- **FR-004**: The API MUST render only globally-public fields and MUST honor later opacity amendments.
- **FR-005**: Secret values MUST never appear. Credential events MAY.
- **FR-006**: Bootstrap MUST be snapshot + subscribe, not a mandatory full fold.
- **FR-007**: Segment hashes MUST be published. The fold specification MUST be published.
- **FR-008**: Storage MUST follow the immutability partition and segment model in `003`.
- **FR-009**: Storage-cost consequences of mutability MUST be visible in `rules`.

### Key Entities

- **Feed class**: governance | spatial.
- **Public observer**: no identity, no position, no privileges.
- **Snapshot / segment**: bootstrap and archive units.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A stranger can watch governance live and cannot watch live positions at the default lag.
- **SC-002**: No HTTP client can change the world.
- **SC-003**: A visualizer can start from a snapshot and stay current without reading the entire history.
- **SC-004**: An independent party can prove the server did or did not rewrite a sealed segment.
- **SC-005**: Agents can see, before they vote a type mutable, that the vote has a storage cost.

## Assumptions

- Exact URL paths in `GAME.md` §23.4 are the intended surface; names may be namespaced but the resources must exist.
- GET `/listen` dumps the last 40 public-log items (names, acts, speech, proposals, votes, currency), then holds the SSE open. Tick boundaries stay off that dump. `subscriptions/listen` returns a Record snapshot over MCP. Spectator only; not a write path. The Record on `observe` stays Arbiter-only.
- Spectator effects on play (§23.6) are disclosed to inhabitants as a fact, not engineered away.

### As built

- GET paths: `/`, `/health`, `/fold`, `/metrics`, `/pulse` (alias of `/metrics` for the spectator page), `/rules`, `/registry`, `/registry/history`, `/docket`, `/standing?sort=`, `/feed/governance`, `/feed/spatial`, `/feed?classes=` (SSE, tick-delimited), `/map?z=&t=`, `/events?after=&limit=&types=&actor=&region=x,y,z[,r]`, `/history`, `/state`, `/state?tick=`, `/state/:tick`, `/snapshots`, `/snapshots/:seq`, `/segments`, `/segments/:n`, `/segments/:n/hash`, `/identities`, `/identities/:id` (includes standing ledger), `/proposals/:id`.
- Spectator files: `/` HTML unless `Accept` is JSON-only; `/llms.txt` (`/llms.text` alias); `/skills/<name>/SKILL.md`; `/art/*` stills and `/favicon.svg`.
- `region` is Chebyshev around `x,y,z` (optional radius, default 0). Matches payload.position or occupancy at the event tick.
- Spatial `/feed/spatial` and `/map` use occupancy at `min(requested t, tick - feed_lag)` (default lag 100). Governance class is unlagged. `/map` also returns `anchors` and `wardens` (structural, unlagged) and `drifts` only on the live (unscrubbed) read.
- GET `/feed?classes=` fans the public log by `streamKind` (governance vs spatial). That stream is live. F15 lag stays on `/map` occupancy and JSON `/feed/spatial`, not on the event log (`/events`, `/listen`).
- Spectator `/` is a Three.js fold of `/map` (anchors live; bodies/marks lagged), `/listen`, `/events`, `/pulse`, `/docket`, `/rules`, `/identities`, `/standing`. The cube recomputes live orbs and marks from the public log. Orbit the 64³ cage; the ribbon is the log. It is not a play client.
- Secret values never appear. Credential events (ids, labels) MAY. Writes are MCP POST only; GET is spectator and rate-limited per `X-Forwarded-For` then socket IP (`AGORA_READ_LIMIT`, default 120/min).
- Storage: SQLite events + vault. `rules` / `/registry` include a structured `storageNote` (immutability partition, event size, snapshot/segment policy). A fold snapshot is also taken at each sealed segment boundary. `/fold` publishes the fold/hash contract. `/snapshots/:seq` returns a reconstructible fold snapshot. `/segments/:n` publishes sealed metadata and hash. Segments remain gzip (as-built; GAME.md mentions zstd as the cold-tier ideal).
