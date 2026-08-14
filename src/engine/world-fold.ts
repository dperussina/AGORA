import { applyPatch, rebuildRegistry } from "./apply.ts";
import { fold, genesisState } from "./fold.ts";
import { seedRegistry, type Registry } from "./registry.ts";
import type { Event, FoldState } from "./types.ts";
import type { Patch } from "./validate.ts";
import type { Position } from "./tick.ts";

export interface WorldView {
  fold: FoldState;
  registry: Registry;
  bodies: Record<string, Position>;
  marks: Record<string, { text: string; authorId: string; tick: number }>;
  names: Record<string, string>;
  founder: string | null;
  identities: string[];
  applied: Array<{ id: number; patch: Patch }>;
}

export function foldWorld(events: readonly Event[]): WorldView {
  let foldState = genesisState();
  let registry = seedRegistry();
  const applied: Array<{ id: number; patch: Patch }> = [];
  const appliedIds = new Set<number>();
  const bodies: Record<string, Position> = {};
  const marks: Record<string, { text: string; authorId: string; tick: number }> = {};
  const names: Record<string, string> = {};
  const identitySet = new Set<string>();
  let founder: string | null = null;

  for (const event of events) {
    foldState = fold(foldState, event);
    const actor = event.actor.startsWith("identity:") ? event.actor.slice("identity:".length) : undefined;
    if (event.type === "credential.mint_root" && typeof event.payload["identityId"] === "string") {
      identitySet.add(event.payload["identityId"]);
    }
    if (event.type === "identity.founder" && typeof event.payload["identityId"] === "string") {
      founder = event.payload["identityId"];
    }
    if (event.type === "identity.name" && typeof event.payload["identityId"] === "string" && typeof event.payload["name"] === "string") {
      names[event.payload["identityId"]] = event.payload["name"];
    }
    if (event.type === "identity.spawn" && actor !== undefined) {
      const x = event.payload["x"];
      const y = event.payload["y"];
      const z = event.payload["z"];
      if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
        bodies[actor] = { x, y, z };
      }
    }
    if (event.type === "act.move" && actor !== undefined) {
      const x = event.payload["x"];
      const y = event.payload["y"];
      const z = event.payload["z"];
      if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
        bodies[actor] = { x, y, z };
      }
    }
    if (event.type === "act.mark" && actor !== undefined && typeof event.payload["text"] === "string") {
      const x = event.payload["x"];
      const y = event.payload["y"];
      const z = event.payload["z"];
      if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
        marks[`${x},${y},${z}`] = { text: event.payload["text"], authorId: actor, tick: event.tick };
      }
    }
    if (
      (event.type === "amendment.applied" || event.type === "amendment.provisional") &&
      typeof event.payload["proposalId"] === "number" &&
      event.payload["patch"] !== null &&
      typeof event.payload["patch"] === "object"
    ) {
      const patch = event.payload["patch"] as Patch;
      const id = event.payload["proposalId"];
      if (appliedIds.has(id)) {
        continue;
      }
      if (patch.kind !== "revert") {
        registry = applyPatch(registry, patch, id);
        applied.push({ id, patch });
        appliedIds.add(id);
      } else {
        const keep = applied.filter((item) => item.id !== patch.proposalId);
        applied.length = 0;
        applied.push(...keep);
        registry = rebuildRegistry(applied);
      }
    }
    if (event.type === "amendment.reverted" && typeof event.payload["proposalId"] === "number") {
      const keep = applied.filter((item) => item.id !== event.payload["proposalId"]);
      applied.length = 0;
      applied.push(...keep);
      registry = rebuildRegistry(applied);
    }
  }

  return {
    fold: foldState,
    registry,
    bodies,
    marks,
    names,
    founder,
    identities: [...identitySet].sort(),
    applied: [...applied],
  };
}

export function occupancyAtTick(
  events: readonly Event[],
  tick: number,
): Array<{ identityId: string; name: string | null; position: Position }> {
  const bodies: Record<string, Position> = {};
  const names: Record<string, string> = {};
  for (const event of events) {
    if (event.tick > tick) {
      continue;
    }
    const actor = event.actor.startsWith("identity:") ? event.actor.slice("identity:".length) : undefined;
    if (event.type === "identity.name" && typeof event.payload["identityId"] === "string" && typeof event.payload["name"] === "string") {
      names[event.payload["identityId"]] = event.payload["name"];
    }
    if ((event.type === "identity.spawn" || event.type === "act.move") && actor !== undefined) {
      const x = event.payload["x"];
      const y = event.payload["y"];
      const z = event.payload["z"];
      if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
        bodies[actor] = { x, y, z };
      }
    }
  }
  return Object.entries(bodies)
    .map(([identityId, position]) => ({ identityId, name: names[identityId] ?? null, position }))
    .sort((a, b) => (a.identityId < b.identityId ? -1 : 1));
}
