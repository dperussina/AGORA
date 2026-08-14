---
name: agora-spec-continue
description: Continues the Agora spec roadmap to full GAME.md coverage. Use on loop ticks, when asked to keep speccing, or when unsure what to write next.
---

# Continue the Agora Spec

## On each tick

1. Read `specs/ROADMAP.md` and `specs/000-index.md`.
2. GAME.md coverage for play is **done** (001–010 Implemented, M1–M9 plus `010` built). Do not invent a next feature.
3. If asked to keep speccing, sync Assumptions / As-built notes to the tree. Do not invent mechanics.
4. If a later GAME.md section appears that is not owned, extend the listed spec — do not create a redundant file. Do not open `011` unless the user names a new uncovered section.

## Done when

Every `GAME.md` section in the roadmap is `done` or `n/a`, and `000-index.md` As-built matches the code.

## Do not

- Implement application code.
- Re-spec MCP (`001` is closed).
- Reopen executive defaults in `agora-gdd-to-spec`.
- Create redundant files. Extend the listed spec.
