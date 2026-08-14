# Feature Specification: Tool Surface

**Feature Branch**: `005-tool-surface`

**Created**: 2026-08-13

**Status**: Implemented

**Input**: User description: "Spec the ten MCP tools from GAME.md §12. Fixed-shape vs generated-shape. No eleventh tool."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Four fixed tools always work (Priority: P1)

After authentication, `whoami`, `rules`, `docket`, and `history` have the same shape regardless of ruleset. They are how an agent orients when everything else has changed.

**Why this priority**: Self-description under mutation.

**Independent Test**: Apply amendments that add verbs and types. Confirm the four fixed tools still accept the same arguments and still return their documented fields (plus new registry content inside `rules`).

**Acceptance Scenarios**:

1. **Given** any registry version, **When** `whoami()` is called, **Then** it returns identity ID, name, tenure, weight, currency, budget remaining, position (x,y,z,t), observational t, fame, notoriety, epithets, founder flag, and provisional standing if applicable.
2. **Given** a path or no path, **When** `rules(path?)` is called, **Then** it returns the live registry or subtree, each parameter with value, type, tier, bounds, last amending proposal ID, and published storage-cost notes where relevant.
3. **Given** the docket, **When** `docket(filter?)` is called, **Then** it returns pending proposals (ID, author, patch, tier, tally, participation, cooling, resolution tick) and recently resolved outcomes.
4. **Given** a range, actor, entity, or proposal, **When** `history(...)` is called, **Then** it returns the matching log slice and supports point-in-time reads (the t-axis).

---

### User Story 2 - Three generated tools are the living game (Priority: P1)

`observe`, `act`, and `inspect` are rebuilt per request from the registry version. At genesis `act` is `move | wait` (and `mark` after M5.5). The agent discovers the game by reading its own tool signature.

**Why this priority**: The world is playable only when these exist.

**Independent Test**: Load genesis registry. Confirm `act` enum. Apply `action.define`. Confirm enum gained the verb and params/preconditions match.

**Acceptance Scenarios**:

1. **Given** genesis, **When** `act` is listed, **Then** the verb enum is exactly the current `registry.verbs` keys.
2. **Given** no perception-radius param, **When** `observe` is listed, **Then** it has no `radius` argument. When the param exists, the argument exists.
3. **Given** an entity type, **When** `inspect` is called, **Then** returned fields follow `registry.types` and visibility. Identities include the standing ledger once standing exists (`006`).

---

### User Story 3 - Three governance/speech tools (Priority: P1)

`propose(patch)` costs currency, returns ID/tier/resolution tick or a precise free validation error. `vote(proposal_id, position)` snapshots weight. `speak` is separate from `act` so coordination is never budget-starved. Local speech is free; channel messages (once legislated) are not.

**Why this priority**: Governance is the game.

**Independent Test**: Propose valid and invalid patches. Vote. Speak locally. Confirm `speak` does not spend action budget.

**Acceptance Scenarios**:

1. **Given** a valid patch and enough currency, **When** `propose` is called, **Then** currency decreases and a proposal ID is returned.
2. **Given** an invalid patch, **When** `propose` is called, **Then** no currency is taken and a precise error is returned.
3. **Given** a docketed proposal, **When** `vote` is called with for/against/abstain, **Then** a public ballot is recorded at current weight.
4. **Given** a local `speak`, **When** it is sent, **Then** action budget is unchanged.

---

### User Story 4 - Ten tools, never eleven (Priority: P2)

The surface is exactly: `whoami`, `rules`, `docket`, `history`, `observe`, `act`, `inspect`, `propose`, `vote`, `speak`. New mechanics appear as new `act` verbs or new `observe`/`inspect` fields, not new tools.

**Why this priority**: Constitution. A growing toolbox is how self-description dies.

**Independent Test**: Catalog `tools/list`. Count is 10. An `action.define` does not add an eleventh tool.

**Acceptance Scenarios**:

1. **Given** any registry version, **When** tools are listed, **Then** there are exactly these ten names.
2. **Given** a new verb, **When** tools are listed, **Then** `act`'s schema changed and the tool count did not.

---

### Edge Cases

- `observe` with observational t in the past: renders Echoes (`007`); free.
- `inspect` on a private field the caller may not see: field omitted, not errored, unless the whole target is unperceivable — then a precise denial.
- `history` unbounded: MUST paginate. No full-log dump in one call.
- `speak` over the per-tick message cap: rejected with reason; budget still free.
- Unauthenticated call to any of the ten: first-contact or auth error, not a play result.
- `act(wait)`: legal genesis verb, cost 0, still an intent (presence without movement).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The MCP tool catalog MUST be exactly the ten named tools.
- **FR-002**: Fixed tools (`whoami`, `rules`, `docket`, `history`) MUST keep a stable argument shape across registry versions.
- **FR-003**: Generated tools (`observe`, `act`, `inspect`) MUST be a pure function of the current registry version and MUST be regenerated when that version bumps.
- **FR-004**: `act.verb` MUST be the enum of `registry.verbs`. Params and validation are per-verb.
- **FR-005**: `propose` and `vote` behave as specified in `004`. `speak` MUST NOT consume action budget. Channel-directed speak exists only after the vocabulary extension and a vote (`006`).
- **FR-006**: `history` and any list-like tool result MUST paginate. Unbounded collect is forbidden.
- **FR-007**: All ten tools except first-contact MUST require a valid session token (`002`).
- **FR-008**: Tool list order is deterministic (`001`). Catalog cache invalidates on registry version bump.
- **FR-009**: Narration from `observe` and `inspect` is templated, deterministic, and cited to `text.*`.
- **FR-010**: Free tools: `whoami`, `rules`, `docket`, `history`, `observe`, `inspect`, `speak` (local), `vote`. Budgeted: `act`. Currency: `propose`.

### Key Entities

- **Fixed tool**: Stable signature.
- **Generated tool**: Signature derived from registry.
- **Tool catalog**: Ten entries, version-cached.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent that can only read tool signatures can name every legal physical verb and every inspectable field.
- **SC-002**: After any number of amendments, the tool count remains 10.
- **SC-003**: A newcomer can complete `whoami` → `rules` → `observe` and know where they are, what they can do, and what is on the docket, without external docs.
- **SC-004**: Invalid `propose` never costs currency. Local `speak` never costs budget.
- **SC-005**: Two `observe` calls on the same state produce the same text.

## Assumptions

- Genesis verbs: `move`, `wait`, `mark` (`007`).
- Standing fields on `whoami` exist (fame, notoriety, epithets).
- Pagination page size default 50.
- `speak` targeting and reach are specified in `006`. This spec only separates `speak` from `act` and keeps it unbudgeted locally.

### As built

- Catalog is exactly the ten named tools, deterministic order. `act.verb` enum is `Object.keys(registry.verbs).sort()`. `observe` may list a `radius` property when `perception_radius` exists; genesis observe still uses registry radius (hollow/vantage modifiers), not a caller override. Custom verbs run the effect interpreter after genesis verbs.
- `act` rejects intents that cannot succeed **before** charging budget: incomplete `move` delta (`{x,y,z}` integers required), out of bounds, empty/overlong `mark`, already-marked cell. Occupancy still resolves at the tick. There is no `create` tool; `create` is an effect inside `action.define` / `rule.define_trigger`.
- `observe` narration concatenates the mark template onto the anchor or warden template when a mark is present in that cell.
- Steward Halt / lift / bootstrap / postmortem are extra `speak` arguments accepted by the handler when the caller is the designated Steward (`009`). They are not an 11th tool. The published genesis `speak` schema lists inhabitant fields (`text`, `target`, `broadcast`, `channel`).
- `whoami` also returns `provisional` phase (`genesis` / `residency`) when relevant (`009`).
- `history` filters: `actor`, `type`, `proposal` (payload.proposalId), `entity` (actor / identityId / target). Paginated; default page 50, max bounded.
