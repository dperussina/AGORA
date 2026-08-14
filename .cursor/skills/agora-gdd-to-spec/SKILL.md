---
name: agora-gdd-to-spec
description: Turns GAME.md design thesis into Spec Kit feature specs without inventing mechanics. Use when writing or updating Agora specs, covering a GAME.md section, or continuing the spec roadmap.
---

# Agora GDD → Spec

## Rules

1. Read `.specify/memory/constitution.md` first. A spec that violates a MUST is wrong.
2. Read `GAME.md` for the section being specified. Do not invent verbs, patches, or entities.
3. Read `specs/ROADMAP.md` and do not duplicate a covered section.
4. Follow `.cursor/skills/speckit-specify/SKILL.md` for directory, `feature.json`, template, and checklist.
5. Protocol questions defer to `specs/001-mcp-2026-07-28/spec.md`.

## Executive defaults (do not re-litigate)

From `GAME.md` §25, already decided:

| Q | Decision |
|---|---|
| Effect cap | 16 effects per verb at genesis; Layer 1 |
| Standing iterations | 20, fixed |
| Dependent provisionals | Auto-fail, cite the dependency |
| Weight cap | 2,000 ticks |
| Abstentions | Count toward participation, not the threshold |
| Echo density | Name at most 24 actors; aggregate the rest |
| Mark permanence | No Layer 0 storage cap |
| Feed lag | 100 ticks, Layer 1 |
| The Record | Stays; not votable at genesis |
| Growing lattice | New anchors by density; old anchors never move |
| Credential events | Public, including labels |
| Storage cost | Visible in `rules` |
| Writable t | Layer 1 the engine may refuse until coherent |

## As built (do not re-litigate)

From the shipped tree. Full table: `specs/000-index.md`.

| Topic | Decision |
|-------|----------|
| Credential hash | scrypt N=1024 (not Argon2id); session bearer SHA-256 |
| First contact | MRTR intents `register` / `mint_session` / `recover` / `revoke_session`; register mints `genesis` session |
| Below floor | Valid propose applies immediately, tagged provisional |
| Ratification | 50-tick residency after floor; pass keeps; fail reverts |
| Coherence | Immediate revert, not a one-tick pending patch |
| Steward | `speak` args, not an 11th tool; Halt is a latch |
| Listen | GET `/listen` is the public log tail; `subscriptions/listen` is a Record snapshot; not identity |
| Naming | fame ≥ 5 or notoriety ≥ 5 |
| Broadcast | `base + floor(fame/2)` |
| Persistence | SQLite events + vault; fold snapshots every 1k / version bump / segment boundary; 1M segments sealed |
| Weight / quorum | Integer registry params; Layer 1 default is exact ⅔ |
| Dormancy | `skippedMs` on `world.dormancy_gap` |
| Geography | Wardens regenerate on `space.op`; new anchors in grown volume |

## Output

One feature per invocation. Sequential `specs/NNN-short-name/`. User stories over GAME.md flavor. No implementation stack in success criteria. No eleventh tool. No server-side model. No prose amendments.

## After writing

Update `specs/ROADMAP.md` coverage. Point `.specify/feature.json` at the new directory.
