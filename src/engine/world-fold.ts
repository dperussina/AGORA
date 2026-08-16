import { applyPatch, rebuildRegistry } from "./apply.ts";
import type { Entity } from "./effects.ts";
import { fold, genesisState } from "./fold.ts";
import { seedRegistry, type Registry } from "./registry.ts";
import type { Event, FoldState } from "./types.ts";
import type { Patch } from "./validate.ts";
import type { Position } from "./tick.ts";
import { parseCellString } from "./wake.ts";

export interface WorldView {
  fold: FoldState;
  registry: Registry;
  bodies: Record<string, Position>;
  marks: Record<string, { text: string; authorId: string; tick: number }>;
  names: Record<string, string>;
  founder: string | null;
  identities: string[];
  applied: Array<{ id: number; patch: Patch }>;
  entities: Record<string, Entity>;
  entitySeq: number;
}

export function foldWorld(events: readonly Event[]): WorldView {
  let foldState = genesisState();
  let registry = seedRegistry();
  const applied: Array<{ id: number; patch: Patch }> = [];
  const appliedIds = new Set<number>();
  const bodies: Record<string, Position> = {};
  const marks: Record<string, { text: string; authorId: string; tick: number }> = {};
  const names: Record<string, string> = {};
  const entities: Record<string, Entity> = {};
  const identitySet = new Set<string>();
  let founder: string | null = null;
  let entitySeq = 0;

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
    if (event.type === "body.died" && typeof event.payload["holder"] === "string") {
      const dest = parseCellString(typeof event.payload["dest"] === "string" ? event.payload["dest"] : "");
      if (dest !== null) {
        bodies[event.payload["holder"]] = dest;
      }
    }
    if ((event.type === "act.move" || event.type === "act.follow") && actor !== undefined) {
      const x = event.payload["x"];
      const y = event.payload["y"];
      const z = event.payload["z"];
      if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
        bodies[actor] = { x, y, z };
      }
    }
    if (event.type === "effect.move") {
      const id = typeof event.payload["id"] === "string" ? event.payload["id"] : "";
      const x = event.payload["x"];
      const y = event.payload["y"];
      const z = event.payload["z"];
      if (id !== "" && typeof x === "number" && typeof y === "number" && typeof z === "number") {
        if (identitySet.has(id) || bodies[id] !== undefined) {
          bodies[id] = { x, y, z };
        }
        const entity = entities[id];
        if (entity !== undefined) {
          entity.position = { x, y, z };
        }
      }
    }
    if (event.type === "effect.create" && typeof event.payload["id"] === "string") {
      const id = event.payload["id"];
      entitySeq = Math.max(entitySeq, entityNumber(id));
      const rawFields = event.payload["fields"];
      const incoming =
        rawFields !== null && typeof rawFields === "object" && !Array.isArray(rawFields)
          ? { ...(rawFields as Entity["fields"]) }
          : {};
      const prior = entities[id];
      const fields = { ...(prior?.fields ?? {}), ...incoming };
      const named = typeof fields["position"] === "string" ? parseCellString(fields["position"]) : undefined;
      const vec =
        typeof event.payload["x"] === "number" &&
        typeof event.payload["y"] === "number" &&
        typeof event.payload["z"] === "number"
          ? { x: event.payload["x"], y: event.payload["y"], z: event.payload["z"] }
          : named ?? prior?.position;
      entities[id] = {
        id,
        type: typeof event.payload["type"] === "string" ? event.payload["type"] : prior?.type ?? "entity",
        fields,
        ...(vec === null || vec === undefined ? {} : { position: vec }),
        createdBy: prior?.createdBy ?? event.seq,
      };
    }
    if (event.type === "wake.left" && typeof event.payload["id"] === "string") {
      const id = event.payload["id"];
      const position =
        typeof event.payload["position"] === "string" ? parseCellString(event.payload["position"]) : undefined;
      entities[id] = {
        id,
        type: "wake",
        fields: {
          kind: typeof event.payload["kind"] === "string" ? event.payload["kind"] : "",
          position: typeof event.payload["position"] === "string" ? event.payload["position"] : "",
          traveler: typeof event.payload["traveler"] === "string" ? event.payload["traveler"] : "",
          tick: typeof event.payload["tick"] === "number" ? event.payload["tick"] : event.tick,
        },
        ...(position === null || position === undefined ? {} : { position }),
        createdBy: event.seq,
      };
      entitySeq = Math.max(entitySeq, entityNumber(id));
    }
    if (event.type === "act.depict" && typeof event.payload["id"] === "string") {
      const id = event.payload["id"];
      const named = typeof event.payload["position"] === "string" ? event.payload["position"] : "";
      const position = parseCellString(named);
      entities[id] = {
        id,
        type: typeof event.payload["kind"] === "string" ? event.payload["kind"] : "likeness",
        fields: {
          caption: typeof event.payload["caption"] === "string" ? event.payload["caption"] : "",
          mime: typeof event.payload["mime"] === "string" ? event.payload["mime"] : "",
          hash: typeof event.payload["hash"] === "string" ? event.payload["hash"] : "",
          painter: typeof event.payload["painter"] === "string" ? event.payload["painter"] : "",
        },
        ...(position === null ? {} : { position }),
        createdBy: event.seq,
      };
      entitySeq = Math.max(entitySeq, entityNumber(id));
    }
    if (
      (event.type === "effect.destroy" || event.type === "wake.heeded" || event.type === "wake.followed") &&
      typeof event.payload["id"] === "string"
    ) {
      delete entities[event.payload["id"]];
    }
    if (event.type === "wake.followed" && actor !== undefined) {
      const to = event.payload["to"];
      if (to !== null && typeof to === "object" && !Array.isArray(to)) {
        const row = to as { x?: unknown; y?: unknown; z?: unknown };
        if (typeof row.x === "number" && typeof row.y === "number" && typeof row.z === "number") {
          bodies[actor] = { x: row.x, y: row.y, z: row.z };
        }
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
    entities,
    entitySeq,
  };
}

function entityNumber(id: string): number {
  const match = /^ent:(\d+)$/.exec(id);
  return match?.[1] === undefined ? 0 : Number(match[1]);
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
    if ((event.type === "identity.spawn" || event.type === "act.move" || event.type === "act.follow") && actor !== undefined) {
      const x = event.payload["x"];
      const y = event.payload["y"];
      const z = event.payload["z"];
      if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
        bodies[actor] = { x, y, z };
      }
    }
    if (event.type === "effect.move") {
      const id = typeof event.payload["id"] === "string" ? event.payload["id"] : actor;
      const x = event.payload["x"];
      const y = event.payload["y"];
      const z = event.payload["z"];
      if (id !== undefined && id !== "" && typeof x === "number" && typeof y === "number" && typeof z === "number") {
        if (bodies[id] !== undefined || id === actor) {
          bodies[id] = { x, y, z };
        }
      }
    }
  }
  return Object.entries(bodies)
    .map(([identityId, position]) => ({ identityId, name: names[identityId] ?? null, position }))
    .sort((a, b) => (a.identityId < b.identityId ? -1 : 1));
}
