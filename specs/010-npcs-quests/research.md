# Research: NPCs and Quests

## Decision: This is a guard, not a content pack

**Rationale**: GAME.md §14.6 and §15 forbid authored quests and authored characters. Constitution IV and VI say the same. Building a quest engine would pre-empt the electorate and give the referee a preference.

**Alternatives considered**: Ship a tutorial quest (fails IV). Ship a merchant NPC (fails §15.1 and no-AI). Leave the spec unimplemented forever (user asked for a plan; the live gaps are inspect citation and tests).

## Decision: Reuse `entities` + `runEffects`

**Rationale**: `create` / `destroy` / `move` / `set_field` already write `World.entities`. Seed Drift is a special Oracle path so replay stays bit-identical with `007`. A voted creature is a registry type whose instances live in that map.

**Alternatives considered**: A fourth in-memory `npcs` collection (redundant). Storing automata only as log events with no fold (breaks `inspect` and occupancy). Giving Drift and voted types the same spawn helper (would change seed Drift ids and fail `007` replay).

## Decision: Inspect cites; it does not narrate

**Rationale**: Principle II. A Warden personifies `space.axes.<axis>`. Drift personifies `types.drift` and the spawn event. A later entity personifies `types.<name>` and `effect.create` seq. Templates stay in `text.narrate.*`.

**Alternatives considered**: Free-text NPC bios (authorship). Hiding the amend path (breaks the Warden loop in §15.3). Scanning the whole log on every inspect (unnecessary; seq is known at create).

## Decision: No standing or franchise change

**Rationale**: GAME.md §15.7 leaves both questions open. Layer 0 rule 1 already blocks voting without a secret. Seed `assessStanding` stays identity-only.

**Alternatives considered**: Credit the author's standing for automaton acts (pre-empts the fight). Let entities vote (Layer 0 fail).

## Decision: Forbidden genesis list is a test, not a registry flag

**Rationale**: Self-description is the live registry. A `quest: false` param would be a mechanic. Tests assert `TOOL_NAMES` is ten names and genesis `types` keys are exactly the seed set.

**Alternatives considered**: A Layer 0 path `quest.forbidden` (over-constitutionalizes a vocabulary word). Rejecting any type whose name contains "quest" (the electorate may name a type that; it is still just a type).

## Decision: No new effect primitive

**Rationale**: Soft-fail in the constitution guard. `004` already has the seven effects. A "complete_quest" effect would be a plot device.

**Alternatives considered**: `emit` scoped to a quest id (channel-shaped; out of scope). Developer vocabulary extension (only if a later vote proves the seven cannot express the physics).
