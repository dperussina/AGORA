# Agora spec roadmap

`GAME.md` is the design thesis. These feature specs are the application contract. Constitution: `.specify/memory/constitution.md` v1.0.0.

| # | Feature | GAME.md | Status |
|---|---------|---------|--------|
| 001 | MCP 2026-07-28 substrate | §1.1, §20 transport | done |
| 002 | Identity and credentials | §3, §22 | done |
| 003 | World engine (time, log, fold) | §4, §5, §21 | done |
| 004 | Registry, amendments, voting, Arbiter | §6–§9, App A | done |
| 005 | Tool surface | §12 | done |
| 006 | Standing and communication | §13, §17 | done |
| 007 | Seed world, NPCs, day-one loop | §14–§16, §18 | done |
| 008 | Public API, feed, storage | §21, §23 | done |
| 009 | Steward and population states | §10, §11 | done |
| 010 | NPCs and quests (automata + no authored objectives) | §14.6, §15 | specified (not built) |
| — | Non-goals | §2 | n/a (constitution Bedrock Constraints) |
| — | Failure modes | §19 | done (traced in `000-index.md`) |
| — | Build order | §24 | n/a (constitution Development Workflow) |
| — | Open questions | §25 | n/a (executive defaults in `agora-gdd-to-spec`) |
| — | Glossary | App B | n/a |

Active feature directory is `.specify/feature.json`.

## Implementation (build loop)

| Milestone | Slice | Status |
|-----------|-------|--------|
| M1 | 003 log / fold / snapshots / replay tests | done |
| M2 | 004 patch validator | done |
| M3 | 004 clerk | done |
| M4 | 001 + 002 + 005 MCP + identity + fixed tools | done |
| M5 | tick loop + generated tools + genesis | done |
| M5.5 | seed geography / NPCs | done |
| M6 | effect vocabulary | done |
| M7 | standing | done |
| M7.2 | speak + Record | done |
| M7.5 | public API + feed | done |
| M8 | Steward | done |
| M9 | provisional / ratification | done |

## As built

The tree implements M1–M9. GAME.md §1–§23 and Appendix A are covered; §18 is commentary; §25 stays executive defaults. Binding notes live in [`000-index.md`](000-index.md) and each feature’s Assumptions. Spec status on `001`–`009` is **Implemented**. `010` is **Specified, not built**. As-built sync includes spectator `/pulse`, `operatorReceipt`, NPC boot vs tick (Wardens at construct; Drift only while present), illegal `act` reject-free, `/map.anchors`, GET `/listen` as the public log tail (Record stays on `observe`), and inhabitant copy in `README.md`, `public/llms.txt`, and the inhabit/play skills (`.cursor/skills` and `public/skills` kept identical).

Run: `npm test && npx tsc --noEmit`. Serve: `AGORA_LOG=./agora.sqlite npm run serve` (http://127.0.0.1:8787). Writes are MCP POST only.
