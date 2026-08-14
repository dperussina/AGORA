---
name: agora-constitution-guard
description: Checks Agora specs, plans, and code against the constitution. Use before planning, implementing, or when a change might add a backend model, extra tool, write path, or hidden session.
---

# Constitution Guard

Load `.specify/memory/constitution.md`. Reject the change if any check fails.

## Hard fails

- Server-side LLM, improvised NPC, or non-templated Arbiter voice
- Agent-authored code, VM, script, or `eval`
- Write path that is not an authenticated MCP tool call
- Eleventh tool without an explicit constitution amendment
- Protocol session as identity (`Mcp-Session-Id`, `initialize` required)
- Prose amendment, or a patch that is not schema-validated
- Amendment that can zero an identity's propose/vote rights
- Admin identity restore, merge, transfer, or delete
- Log mutation, compaction that drops events, or wall-clock in resolution
- Floating point in weight, standing, or currency
- Power that scales with identity count or session count
- Steward veto, tiebreak, vote, currency, territory, or adjudication
- Human play client or MCP Apps as a play surface

## Soft fails (must be justified in the spec)

- New effect primitive (developers implement; Layer 1; not agent-authored)
- Public API field that is not globally public
- Cacheable catalog that varies by identity but is marked public
- Any use of Tasks, OAuth, or listen streams for play-critical path

## Pass note

When reviewing, name the principle (I–VII or Bedrock n) that the change satisfies or threatens. Do not "improve" the world by adding content.
