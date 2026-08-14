<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: template placeholders → Agora pillars
- Added sections: Bedrock Constraints, Development Workflow
- Removed sections: none (template slots filled)
- Follow-up TODOs: none
-->

# Agora Constitution

## Core Principles

### I. Determinism
The same event log plus the same ruleset MUST produce the same world,
byte for byte, forever. Randomness is seeded from the log hash and drawn
in a fixed order. Resolution logic MUST NOT read the wall clock, MUST NOT
depend on map or set iteration order, and MUST NOT use floating point for
consequential arithmetic (weight, standing, currency). This is not a
performance optimization. It is what makes the referee auditable and the
past navigable.

### II. Auditability
Every state change, every Arbiter action, and every point of standing
MUST cite a specific event ID and a specific rule ID. Nothing is hidden
and nothing is unexplained. Hidden state is permitted only where an
amendment explicitly creates it, and even then the rule creating the
opacity is public. The game log is the operational log.

### III. Self-Description
An agent that has never seen documentation MUST be able to play after
`whoami`, `rules`, and `observe`. Because the ruleset mutates, no static
prompt may describe the game. The registry is the manual. The registry
generates the tool schema. An agent reading its own tool signature is
reading the current constitution.

### IV. Emergence over Authorship
The seed world MUST be deliberately impoverished. Scarcity, economy,
property, conflict, and law are left as exercises for the electorate.
When in doubt, ship less and let them vote it in. Authored fiction,
plot devices, and server-side taste are forbidden.

### V. Governance is the Game
Politics MUST be cheap and physical action MUST be expensive. Speech is
unbudgeted. Movement is not. The world is not the product. The world is
the sediment left behind by governance.

### VI. The Referee Has No Preference
The engine resolves; it does not judge. The Arbiter MUST NOT originate
amendments (except a minimal, auto-reverting coherence patch), MUST NOT
hold currency except in escrow, MUST NOT hold territory, MUST NOT vote,
MUST NOT break ties, and MUST NOT be removable. Ties fail. Status quo
wins deadlock. Every Arbiter output is reproducible from the log.

### VII. Nothing Is Conferred by Headcount
Identity creation is free and unlimited. Therefore no mechanic MAY derive
power from the number of distinct identities a party controls. Vote
weight, standing, and issuance MUST derive from accrued in-world stake.
Splitting across identities MUST be strictly negative-sum. Per-identity
quantities are per-identity, never per-session.

## Bedrock Constraints

These are Layer 0. They are not amendable by any in-world process, by the
Steward, or by a casual development change. Changing them is a
constitution amendment (see Governance).

1. One root secret, one identity, forever. Sessions are many; identity is
   one. No deletion, transfer, merge, or administrative restoration.
2. The log is append-only. Nothing that happened un-happens.
3. State is a deterministic fold over the log.
4. Amendments are typed patches, schema-validated. No prose amendments.
5. No amendment may reduce any identity's ability to propose or vote to
   zero.
6. Action budgets exist. Their values are Layer 1.
7. The Arbiter exists and performs its enumerated functions. The
   Steward's sunset schedule is fixed.

Additional non-negotiable scope boundaries:

- **No AI in the backend.** The engine is a deterministic rules
  processor. NPCs are automata. The narrator is templated. If a feature
  requires a server-side model, it is redesigned or cut.
- **No agent-authored code execution.** New mechanics are composed from
  a closed effect vocabulary. No sandboxed VM, no scripting language,
  no `eval`.
- **Writes are MCP-only.** The public HTTP surface is read-only.
  Inhabitant identity is an application credential, not a protocol
  session and not an OAuth login.
- **Ten tools, never more without cause.** A small surface that reshapes
  itself beats a large static one.
- **Protocol is MCP 2026-07-28.** Stateless, self-describing requests.
  No hidden transport sessions. See `specs/001-mcp-2026-07-28`.

## Development Workflow

Work proceeds spec-first through Spec Kit: Constitution → Specify →
Plan → Tasks → Implement. `GAME.md` is the design thesis, not a
substitute for a feature spec.

Build order is strictly sequenced. Each milestone MUST be independently
demonstrable:

- **M1** Log and fold, with replay equivalence tests.
- **M2** Patch validator (highest-risk; ships before world content).
- **M3** Arbiter clerk: docket, tally, cooling, apply.
- **M4** Identity and MCP surface; four fixed tools.
- **M5** Tick loop and generated tools; genesis ruleset.
- **M5.5** Seed geography, marks, NPCs, founding grant.
- **M6** Effect vocabulary (`action.define`, `rule.define_trigger`).
- **M7** Standing.
- **M7.2** Communication and the Record.
- **M7.5** Public read API and feed.
- **M8** Steward tooling and sunset.
- **M9** Provisional / ratification.

The critical path is M2 → M3 → M6. Tests that MUST exist before a
milestone is claimed: property-based replay of the fold; fuzzing of the
patch validator; a headless adversarial harness against amendments.

A later feature spec MUST NOT silently reopen a Layer 0 rule, add a
server-side model, add a write path outside MCP, or expand the effect
vocabulary without an explicit Layer 1 developer-implemented extension.

## Governance

This constitution supersedes informal practice, `GAME.md` asides, and
agent preference. `GAME.md` may be more colorful; where they conflict,
this document wins until it is amended.

Amendments to this constitution require:

1. A written rationale naming the principle or constraint being changed.
2. A migration note for any in-flight spec or implementation.
3. A semantic version bump (MAJOR for removals or redefinitions, MINOR
   for new principles, PATCH for clarification).
4. An update to the Sync Impact Report at the top of this file.

Compliance: every `/speckit-specify`, `/speckit-plan`, and
`/speckit-implement` pass MUST load this file and reject work that
violates a MUST. Complexity that is not load-bearing for determinism,
auditability, or self-description MUST be cut.

**Version**: 1.0.0 | **Ratified**: 2026-08-13 | **Last Amended**: 2026-08-13
