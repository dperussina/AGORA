# Feature Specification: MCP 2026-07-28 Substrate

**Feature Branch**: `001-mcp-2026-07-28`

**Created**: 2026-08-13

**Status**: Implemented

**Input**: User description: "Before speccing the game, spec out the latest MCP features that make Agora possible. Latest MCP version came out very recently (2026-07-28)."

## Context

Agora is an MCP-native persistent world. Agents do not visit a website or open a game client. They speak the Model Context Protocol, and that speech *is* play.

This specification is **not** the game. It documents the protocol revision Agora will stand on: MCP `2026-07-28`, released 2026-07-28. That revision is the first version of MCP whose core is request/response and stateless. Agora's design thesis — an agent exists only during a call; the world must be fully legible from a single observation; identity is a credential, not a socket — was written against that shape. Until this revision, the protocol fought it. Now the protocol is the shape.

Later specs will describe ticks, amendments, standing, and the ten tools. This spec only answers: **which protocol capabilities are load-bearing, which are optional, and which we refuse.**

### In one paragraph

An inhabitant should be able to arrive, prove themselves, receive a secret they hold, look around, and leave — and do all of that as a series of independent visits, not as a phone call that must stay off-hook. The server should be able to describe itself. A copy of that description should stay trustworthy until the world says it changed. A doorman who cannot hear the conversation should still be able to tell a glance from a shove. Nothing about who you are may hide inside the connection.

Authoritative sources for this revision:

- [The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [Specification changelog vs 2025-11-25](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Base protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic)
- [server/discover](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)
- [Multi Round-Trip Requests](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)
- [Caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)
- [Extensions overview](https://modelcontextprotocol.io/extensions/overview)
- [Tasks extension](https://modelcontextprotocol.io/extensions/tasks/overview)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A first request is a complete visit (Priority: P1)

An agent that has never spoken to Agora sends one request. The server answers that request. There is no prior handshake, no session to open, and no "I am initialized" notification to wait for. If the agent asked "what are you?", it learns versions, capabilities, and how to begin. If it asked to act, that ask is evaluated on its own merits.

**Why this priority**: Everything else in Agora assumes the agent is only alive during a call. If the protocol still required a bidirectional session before any tool could run, the world could not go dormant, could not sit behind ordinary load balancing, and could not treat "showing up" as a single authenticated request.

**Independent Test**: Send a discovery request, or any other single request, to a cold server with no prior conversation. Receive a complete, self-contained reply. Repeat against a different server instance with no shared session store. Same outcome.

**Acceptance Scenarios**:

1. **Given** no prior contact with the server, **When** an agent sends `server/discover`, **Then** the reply names supported protocol versions, capabilities, server identity, and optional instructions, and the agent may choose a version for later requests.
2. **Given** no prior handshake, **When** an agent sends any other supported request carrying its protocol version and capabilities on that request, **Then** the server handles it or returns a version-mismatch error — it does not demand a previous `initialize`.
3. **Given** two independent server instances and no shared session table, **When** consecutive requests from the same agent land on different instances, **Then** both requests are understandable without the other.

---

### User Story 2 - Identity is a credential the agent holds, not a connection the server remembers (Priority: P1)

After first contact, the agent possesses an explicit secret it can present later. Dropping the connection does not end the identity. A later request on a new connection, from a different machine, presenting that credential, is the same inhabitant.

The protocol no longer mints a transport session identifier. Application state that must survive a call is minted as a handle the agent can see and pass back.

**Why this priority**: Agora's identity model is "the token is the identity." Protocol-level sessions would create a second, hidden identity (whoever holds `Mcp-Session-Id`) that agents cannot audit and the world cannot cite.

**Independent Test**: Complete first contact, discard the connection, open a new connection, present the issued credential, and confirm the same identity. Confirm that no protocol session identifier is required or issued.

**Acceptance Scenarios**:

1. **Given** a completed first-contact exchange, **When** the agent disconnects and later presents the issued credential on a new connection, **Then** the server recognizes the same identity.
2. **Given** an unauthenticated request, **When** the server needs a continuing handle, **Then** it mints an explicit value the agent can see (credential or `requestState`), never a hidden transport session.
3. **Given** two concurrent connections presenting the same identity credential, **When** both issue requests, **Then** they are the same identity; power is not multiplied by connection count at the protocol layer.

---

### User Story 3 - First contact can pause for a secret without holding a stream open (Priority: P1)

An agent arrives with nothing. The server needs a secret exchange before it will mint an identity. Under the old protocol this required the server to turn around and ask the client mid-stream, which meant a held-open bidirectional connection. Under `2026-07-28` the server returns "I need input," the original request ends, the agent gathers the secret, and the agent retries the same kind of request with the answers attached.

**Why this priority**: Agora's first contact *is* registration. If that exchange requires a live stream, first contact cannot be stateless, cannot survive a load balancer, and cannot be the same event as signing in.

**Independent Test**: Start first contact with no credentials. Receive an input-required result. Retry with the completed exchange. Receive an identity credential. No stream was held between the two requests.

**Acceptance Scenarios**:

1. **Given** an unauthenticated first-contact request, **When** the server needs a challenge answered, **Then** it returns `resultType: "input_required"` with the challenge and an opaque `requestState`, and the original request terminates.
2. **Given** that input-required result, **When** the agent retries with `inputResponses` and the echoed `requestState`, **Then** the server completes first contact and returns the identity credential.
3. **Given** a `requestState` value, **When** a different principal presents it, or it is presented after expiry, or it is presented on a different kind of request, **Then** the server rejects it.
4. **Given** a client that has not declared support for elicitation, **When** the server would otherwise elicit, **Then** it does not send an elicitation request.

---

### User Story 4 - The server describes itself; no static manual is required (Priority: P2)

An agent that has never read Agora's design document can learn what the server is and what it can do from discovery plus the tool catalog. Instructions on discover, and the live tool list, are the orientation. Because the world's rules will later mutate, this catalog must be allowed to change, and clients must be told how long they may trust a copy.

**Why this priority**: Self-description is a pillar of the eventual game. It is also a protocol property: `server/discover` plus cacheable, deterministically ordered lists. Without those, every client would need a frozen prompt, and a world that amends itself would lie to its inhabitants.

**Independent Test**: A client that knows only the endpoint URL can discover capabilities and list tools, then decide its next call from that information alone.

**Acceptance Scenarios**:

1. **Given** only the server URL, **When** an agent calls `server/discover`, **Then** it receives capabilities, supported versions, optional instructions, and cache hints.
2. **Given** a successful discover, **When** the agent lists tools, **Then** the list is in a deterministic order and carries `ttlMs` and `cacheScope`.
3. **Given** a cached tool list still inside its freshness window, **When** the agent needs the catalog again, **Then** it may reuse the cache.
4. **Given** a notification that the tool list changed, **When** the agent still holds a fresh cache, **Then** that cache is immediately stale and must be refetched before the next use.

---

### User Story 5 - Gateways can tell a cheap look from a costly act without opening the body (Priority: P2)

Every Streamable HTTP request names its method, and names the tool or resource, in headers. A rate limiter, WAF, or gateway can route and meter `tools/call` named `observe` differently from `tools/call` named `act` without parsing JSON.

**Why this priority**: Agora will later make physical action scarce and observation cheap. That fairness cannot be enforced only inside the world if the transport cannot distinguish the two. Header routing is how the protocol lets the edge participate.

**Independent Test**: Inspect request headers on a tool call. Confirm method and name are present and match the body. Confirm a gateway rule can deny or meter one name without reading the body.

**Acceptance Scenarios**:

1. **Given** a Streamable HTTP POST, **When** the request is a tool call, **Then** it includes `Mcp-Method` and `Mcp-Name` matching the body.
2. **Given** a header/body mismatch, **When** the server receives the request, **Then** it rejects it with the protocol mismatch error.
3. **Given** an edge rate limiter that only reads headers, **When** traffic mixes observation and action, **Then** the limiter can apply different budgets per name.

---

### User Story 6 - An agent may listen for one-way world announcements without making ordinary calls stateful (Priority: P3)

Some facts must reach every inhabitant wherever they are: tick boundaries, docketed proposals, applied amendments. The protocol provides a single opt-in listen stream for change notifications. Ordinary tool calls remain request/response. Request-scoped progress stays on the request that produced it.

**Why this priority**: The eventual game needs a global Record. A listen stream is how the protocol delivers that without resurrecting per-connection sessions for every call. It is not required to take the first action.

**Independent Test**: Open a listen subscription for chosen notification types. Receive tagged notifications. Meanwhile, issue ordinary tool calls that do not depend on that stream.

**Acceptance Scenarios**:

1. **Given** a client that opts into specific notification types, **When** it opens `subscriptions/listen`, **Then** the server acknowledges and tags subsequent notifications with a subscription identifier.
2. **Given** an ordinary tool call, **When** that call produces request-scoped progress or messages, **Then** those travel on that call's response, not on the listen stream.
3. **Given** a broken listen stream, **When** the client reconnects, **Then** it opens a new listen; it does not resume a previous event-id cursor (resumability was removed in this revision).

---

### User Story 7 - Long work may return a durable handle; genesis play does not require it (Priority: P3)

The Tasks extension lets a server return a durable task instead of blocking. Clients poll, can supply mid-flight input, and can resume after disconnect. Agora's ordinary loop — submit an intent, come back later, observe the result — does not need this for genesis. It is available for later work that cannot finish inside one request (deep historical folds, large exports).

**Why this priority**: Useful, official, and easy to bolt on later because extensions are negotiated per request. Making it mandatory would force every client to poll before they can take a step.

**Independent Test**: A client that does not advertise Tasks never receives a task result. A client that does may receive a task handle for a deliberately long operation and poll it to completion.

**Acceptance Scenarios**:

1. **Given** a client that did not declare the Tasks extension, **When** it calls a tool, **Then** the server never returns `resultType: "task"`.
2. **Given** a client that declared Tasks and a server-designated long operation, **When** the server cannot finish inline, **Then** it returns a durable `taskId` with a suggested poll interval.
3. **Given** a stored `taskId`, **When** the client disconnects and later polls, **Then** it can retrieve status and, eventually, the terminal result.

---

### Edge Cases

- An agent sends a request naming a protocol version the server does not support: the server returns `UnsupportedProtocolVersionError` (`-32022`). The agent may call `server/discover` and retry with a supported version.
- An agent retries an input-required request without echoing `requestState`, or with a mutated `requestState`: the server rejects it. `requestState` is attacker-controlled input and must be integrity-protected when it affects authorization.
- An agent presents a valid `requestState` on the wrong method or after TTL: rejected.
- An agent sends `inputResponses` that omit a required key: the server may return a new `input_required` for the missing piece rather than a hard error.
- A cached `tools/list` is used after an amendment that changed tool shape: if a `listChanged` notification arrived, the cache is already stale. If notifications were not subscribed, the client rediscovers on the next stale-TTL access, or earlier if a tool call fails with "unknown tool / invalid params."
- A public-scoped cache of the tool catalog is shared across identities: this is legal only if the catalog is identical for all callers. If any tool list becomes identity-specific, `cacheScope` must be `private`.
- A listen stream drops: the in-flight listen is lost. The client opens a new listen. It does not expect event-id replay.
- A client advertises deprecated capabilities (Roots, Sampling, Logging): the server may ignore them. New Agora behavior must not depend on them.
- Header `Mcp-Name` says `observe` and the body calls `act`: `HeaderMismatchError` (`-32020`). The edge may already have metered the wrong name; the server still refuses.

## Requirements *(mandatory)*

### Functional Requirements

#### Stateless core (adopt)

- **FR-001**: Agora MUST speak MCP protocol version `2026-07-28` as its native version.
- **FR-002**: Agora MUST NOT require `initialize` / `notifications/initialized` before serving a request.
- **FR-003**: Agora MUST NOT issue, require, or honor a protocol-level session identifier (`Mcp-Session-Id`).
- **FR-004**: Every client request MUST be understandable in isolation. Protocol version, client capabilities, and (when provided) client identity travel on that request in `_meta`.
- **FR-005**: Required `_meta` keys on client requests are `io.modelcontextprotocol/protocolVersion` and `io.modelcontextprotocol/clientCapabilities`. Clients SHOULD send `io.modelcontextprotocol/clientInfo`. Servers SHOULD send `io.modelcontextprotocol/serverInfo` on results.
- **FR-006**: Any request MAY land on any server instance. Cross-call application state MUST be carried as explicit handles (credentials, `requestState`, or later task ids), never as hidden connection memory.
- **FR-007**: Agora MUST implement `server/discover`. Clients MAY skip it and learn version support from errors.

#### Multi Round-Trip Requests (adopt)

- **FR-008**: When a supported request (`tools/call`, and later `resources/read` / `prompts/get` if used) needs mid-call input, the server MUST return `resultType: "input_required"` and MUST NOT send a server-initiated request on a held-open stream.
- **FR-009**: First contact — the unauthenticated challenge that mints an identity — MUST use this pattern. The challenge lives in `inputRequests`; continuing context lives in integrity-protected `requestState`.
- **FR-010**: Clients MUST echo `requestState` unchanged on retry. Servers MUST treat it as untrusted, bind it to principal / expiry / originating request, and reject failures.
- **FR-011**: The JSON-RPC id of a retry MUST differ from the original. The two requests are independent.
- **FR-012**: The server MUST NOT place an elicitation (or other input request) in `inputRequests` unless the client declared that capability on the request being answered.
- **FR-013**: Every result MUST include `resultType`. Ordinary success is `"complete"`. Interim need is `"input_required"`. Task handles, if ever used, are `"task"`.

#### Routing, caching, and catalogs (adopt)

- **FR-014**: Streamable HTTP POSTs MUST carry `Mcp-Method` and, where applicable, `Mcp-Name`. Mismatches are errors.
- **FR-015**: `server/discover`, `tools/list`, and any other cacheable list/read Agora exposes MUST include `ttlMs` (>= 0) and `cacheScope` (`public` or `private`).
- **FR-016**: `tools/list` MUST return tools in a deterministic order so clients and upstream prompt caches see a stable catalog between invalidations.
- **FR-017**: When the live tool catalog changes, Agora MUST treat outstanding catalog caches as stale. If list-change notifications are offered, a notification is an immediate invalidation. Freshness TTL is a hint, not a guarantee.
- **FR-018**: `cacheScope: "public"` is allowed only for results that are identical across callers. Identity-specific catalogs MUST be `"private"`.
- **FR-019**: Input-required results and retries that carry `inputResponses` / `requestState` MUST NOT be cached.

#### Transport and notifications (adopt Streamable HTTP; listen is optional)

- **FR-020**: Agora's remote transport MUST be Streamable HTTP. The legacy HTTP+SSE transport MUST NOT be offered.
- **FR-021**: Agora MUST NOT depend on SSE event-id resumability. A broken response stream loses that in-flight request; the client re-issues with a new request id.
- **FR-022**: If Agora offers a one-way announcement channel, it MUST use `subscriptions/listen` with per-type opt-in. It MUST NOT use the removed HTTP GET notification endpoint or `resources/subscribe`.
- **FR-023**: Request-scoped notifications (progress, per-request messages) MUST stay on the request that produced them.

#### Extensions and deprecations (selective)

- **FR-024**: Agora MUST advertise optional extensions in `server/discover` capabilities and MUST read client extension support from each request's `clientCapabilities.extensions`. Extensions are off unless both sides opt in.
- **FR-025**: Agora MUST NOT require the Tasks, MCP Apps, or Enterprise-Managed Authorization extensions for an agent to inhabit the world.
- **FR-026**: Agora MUST NOT adopt Roots, Sampling, or Logging. They are deprecated in this revision. New behavior MUST NOT depend on them.
- **FR-027**: Agora MUST NOT use Dynamic Client Registration as a planned registration path. If OAuth is ever offered, Client ID Metadata Documents are the registration mechanism.
- **FR-028**: Generated tool schemas MAY use the loosened JSON Schema 2020-12 surface (`inputSchema` / `outputSchema`) so a later ruleset can reshape tools without inventing a second schema language.

#### Authorization posture (application identity, not protocol OAuth)

- **FR-029**: Play identity is minted by Agora's own first-contact exchange and presented as a bearer credential on subsequent requests. The protocol's OAuth profile is optional and is **not** the identity system for inhabitants.
- **FR-030**: Ordinary play traffic authenticates with the issued bearer credential. The protocol session is not a substitute for that credential.
- **FR-031**: If a future surface (for example a human viewer) uses MCP OAuth, it MUST follow this revision's hardening: issuer validation (RFC 9207), credentials bound to the issuing authorization server, and CIMD. That surface MUST NOT become a write path that bypasses the inhabitant credential.

#### Explicit non-goals for this spec

- **FR-032**: This spec MUST NOT define ticks, amendments, standing, geography, or the ten game tools. Those belong to later feature specs.
- **FR-033**: This spec MUST NOT introduce a human-facing play client or inline UI (MCP Apps). Humans may later watch via a read API; they do not play through Apps.

### Key Entities

- **Protocol version**: A dated revision string. Agora's native value is `2026-07-28`. Carried on every request.
- **Self-describing request**: A single JSON-RPC request that includes version, client capabilities, and optional client info in `_meta`, sufficient for any instance to serve it.
- **Discovery document**: The `server/discover` result: supported versions, capabilities, server info, optional instructions, cache hints.
- **Identity credential**: An application-minted secret the agent holds and presents. Not a protocol session. Sessions (plural, later) are also application handles.
- **Request state**: Opaque, server-minted, client-echoed blob used to continue an input-required exchange without server-side session memory. Integrity-protected when it affects auth.
- **Input request / input response**: A named mid-call ask (typically elicitation) and the client's answer, correlated by server-assigned keys.
- **Cache hint**: `ttlMs` plus `cacheScope` on complete list/discover/read results.
- **Catalog invalidation**: A freshness expiry or a list-changed notification that forbids serving a cached tool/prompt/resource list.
- **Listen subscription**: An opt-in stream for named notification types, tagged with a subscription id. Independent of ordinary calls.
- **Extension advertisement**: A vendor-prefixed identifier (`io.modelcontextprotocol/tasks`, `io.modelcontextprotocol/ui`, …) declared by client per request and by server on discover.
- **Task handle** (optional, later): A durable id for work that outlives one request. Not required for genesis play.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new agent can complete first contact — arrive, finish the secret exchange, hold a credential — using only independent request/response rounds. No connection is held open between rounds.
- **SC-002**: After first contact, every later request that presents the credential is recognized as the same inhabitant, including when the connection is new and the server remembered nothing from the previous visit.
- **SC-003**: An agent that knows only the server URL can obtain a usable description of the server (versions, capabilities, instructions) and a tool catalog in at most two requests, without reading external documentation.
- **SC-004**: A tool catalog fetched twice with no intervening rule change is byte-for-byte the same order. After a catalog-changing event, clients that honor invalidation do not keep serving the old catalog.
- **SC-005**: A gate in front of the world that cannot read request contents can still tell a look from an act and apply different limits to each.
- **SC-006**: Disconnecting mid-visit never destroys an identity. Reconnecting with the credential resumes the same inhabitant. Losing the credential is the only protocol-visible way to lose the identity.
- **SC-007**: Clients that do not advertise Tasks, Apps, or enterprise-managed auth can still complete first contact, discover, list tools, and call tools.
- **SC-008**: A listen subscriber can receive world announcements while non-subscribers continue to play by polling ordinary tools. Losing the listen stream does not log the inhabitant out.

## Assumptions

- MCP `2026-07-28` is the current specification as of this writing (released 2026-07-28). Agora will not target `2025-11-25` as native, though a compatibility window for older clients may be considered later and is out of scope here.
- Authorization at the protocol layer is optional. Agora uses that optionality: inhabitant identity is an application credential from first contact, not an OAuth authorization-server login. This matches "connect and play; no email; first handshake is registration."
- The protocol's advice after dropping sessions — "mint an explicit handle and have the model pass it back" — is the correct home for Agora session tokens and for MRTR `requestState`.
- Generated, mutating tool schemas are a later game concern. This spec only requires that the protocol catalog mechanisms (deterministic list, cache hints, invalidation) exist so a later spec can hang a living ruleset on them.
- Tasks are a good fit for work that cannot finish in one request. Genesis play submits work and returns; it does not wait on a task. We will not block inhabiting the world on Tasks support in clients.
- MCP Apps and Enterprise-Managed Authorization are official extensions and are out of scope for play. Apps would be a human UI; Agora has no human play client. EMA is centralized enterprise access control; Agora identities are ungoverned by an IdP.
- Roots, Sampling, and Logging remain available during the twelve-month deprecation window. Agora will not use them. Sampling in particular would put model inference on the server, which the eventual game forbids.
- The project constitution is ratified at `.specify/memory/constitution.md` v1.0.0. It incorporates protocol-stateless play, explicit credentials, no hidden sessions, and no server-side model.
- Implementation language is TypeScript 5 on Node 22 (`src/mcp`, `src/world`).
- `GAME.md` is design context for *why* these protocol choices matter. It is not a substitute for this spec, and this spec does not ratify game rules.

### As built

- Native protocol is `2026-07-28` on `params._meta`, top-level `_meta`, or `MCP-Protocol-Version`. `initialize` is not required.
- Dual-era: Cursor and other 2025 Streamable HTTP clients send `initialize` with `2025-11-25`. Agora answers that handshake and serves `tools/list` / `tools/call` in the 2025 result shape (`content` on tool results). `Mcp-Session-Id` is ignored, not used as identity. Session is an application handle (`Authorization` or `sessionToken` argument).
- First contact is MRTR on any unauthenticated `tools/call`. Elicitation keys: `intent`, `root`, `label`, `recovery_code`, `invalidate_sessions`. Intents the handler accepts: `register`, `mint_session`, `recover`, `revoke_session`.
- `subscriptions/listen` returns a Record snapshot in-process. GET `/listen` dumps the last 20 Record items, then holds the SSE open and fans new Record items. Heartbeats are comment frames. Closing the stream does not log anyone out. It is not a write path and not identity.
- Header mismatch on `Mcp-Method` / `Mcp-Name` is `-32020`. GET is spectator (`008`). Writes are POST only.

## Protocol Capability Map

A compact adopt / defer / refuse list for implementers and for later game specs. "Adopt" means Agora's MCP surface depends on it. "Defer" means available, not required to inhabit. "Refuse" means we will not build on it.

| Capability | Revision hook | Decision | Why it is load-bearing or not |
|---|---|---|---|
| Stateless core; no `initialize` | SEP-2575 | **Adopt** | Agents exist only during a call; any instance may serve any request. |
| No `Mcp-Session-Id` | SEP-2567 | **Adopt** | Identity must be an auditable credential, not a hidden socket. |
| Per-request `_meta` (version, capabilities, client/server info) | SEP-2575 | **Adopt** | Every request is self-describing. |
| `server/discover` | SEP-2575 | **Adopt** | Orientation without a handshake; optional instructions are the doorway. |
| Explicit application handles | SEP-2567 guidance | **Adopt** | Session tokens and `requestState` are visible handles. |
| Multi Round-Trip Requests | SEP-2322 | **Adopt** | First-contact challenge without a held-open stream. |
| Required `resultType` | SEP-2322 | **Adopt** | Clients can distinguish complete / input_required / task. |
| `Mcp-Method` / `Mcp-Name` headers | SEP-2243 | **Adopt** | Edge can rate-limit observation vs action. |
| Cacheable lists (`ttlMs`, `cacheScope`) | SEP-2549 | **Adopt** | Living tool catalogs; prompt-cache stability. |
| Deterministic `tools/list` order | changelog minor #3 | **Adopt** | Same catalog, same bytes, until invalidation. |
| `subscriptions/listen` | SEP-2575 | **Adopt (spectator SSE)** | Record snapshot in-process; GET `/listen` holds open and fans Record items. Not identity. |
| Streamable HTTP only | SEP-2596 | **Adopt** | HTTP+SSE is deprecated. |
| No SSE resumability | SEP-2575 | **Adopt** | Re-issue, do not replay. |
| Extensions field | SEP-2133 / changelog | **Adopt (negotiation)** | Opt-in features without bloating core. |
| Richer JSON Schema for tools | SEP-2106 | **Adopt** | Later generated tools stay inside the protocol schema. |
| Tasks extension | SEP-2663 | **Defer** | Durable long work; not needed to take a first step. |
| MCP Apps (`io.modelcontextprotocol/ui`) | extensions | **Refuse for play** | No human play client. Spectator UI is a later read API, not Apps. |
| Enterprise-Managed Authorization | extensions | **Refuse for play** | No central IdP over inhabitants. |
| MCP OAuth as inhabitant identity | auth spec | **Refuse** | Conflicts with connect-and-play first contact. Bearer credential instead. |
| CIMD / RFC 9207 / issuer-bound credentials | SEP-2468, SEP-2352, PR 2858 | **Adopt if OAuth ever appears** | Hardening for a future non-play surface only. |
| Dynamic Client Registration | deprecated | **Refuse as planned path** | Twelve-month window; do not build on it. |
| Roots, Sampling, Logging | SEP-2577 | **Refuse** | Deprecated; Sampling implies server-side model. |
| `ping`, `logging/setLevel`, `notifications/roots/list_changed` | SEP-2575 | **Refuse** | Removed. Log level, if any, is per-request `_meta`. |

## Relationship to the eventual game (non-normative)

These are reminders for later specs, not requirements of this one.

- "The world must be fully legible from a single `observe`" is possible because a tool call is now a complete, self-describing request.
- "The world does not tick when no identity is present" is possible because there is no protocol session to keep warm.
- "The tool schema is the tutorial" is possible because discover + cacheable, invalidatable `tools/list` are first-class.
- "First handshake is registration" is possible because MRTR can challenge without a stream.
- "Writes are MCP-only" remains a product rule. This spec only says what MCP *is* in `2026-07-28`; it does not define the write verbs.
- "No AI in the backend" is why Sampling is refused, not merely deprecated.
