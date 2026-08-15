import type { Entity } from "./effects.ts";
import type { Position } from "./tick.ts";
import { parseCellString } from "./wake.ts";

/** This-war HP is inverted wound count. Three wounds drop the body. */
export const WAR_WOUND_MAX = 3;

/** fallen.until = tick + linger. Rise in that window; miss it and the body is dead. */
export const FALL_LINGER = 5;

/** Deep Commons / The First Port. Death walks here when no home exists. */
export const FIRST_PORT = "26b8";

export function isOpenWar(entity: Entity): boolean {
  return entity.type === "war" && entity.fields["status"] === "open";
}

export function fallenHolder(entity: Entity): string | null {
  if (entity.type !== "fallen") {
    return null;
  }
  const holder = entity.fields["holder"];
  return typeof holder === "string" && holder.length > 0 ? holder : null;
}

export function fallenFor(entities: Iterable<Entity>, holder: string): Entity | undefined {
  for (const entity of entities) {
    if (fallenHolder(entity) === holder) {
      return entity;
    }
  }
  return undefined;
}

export function openWarBetween(entities: Iterable<Entity>, attacker: string, defender: string): Entity | undefined {
  const wars = [...entities].filter(isOpenWar).sort((a, b) => (a.id < b.id ? -1 : 1));
  return wars.find((war) => {
    const left = war.fields["attacker"];
    const right = war.fields["defender"];
    return (
      (left === attacker && right === defender) ||
      (left === defender && right === attacker) ||
      right === defender
    );
  });
}

export function woundTick(entity: Entity): number | null {
  if (entity.type !== "wound") {
    return null;
  }
  const tick = entity.fields["tick"];
  return typeof tick === "number" && Number.isInteger(tick) ? tick : null;
}

export function woundHitsTarget(entity: Entity, target: string, name?: string): boolean {
  if (entity.type !== "wound") {
    return false;
  }
  if (entity.fields["target"] === target) {
    return true;
  }
  if (name !== undefined && name.length > 0 && entity.fields["beast"] === name) {
    return true;
  }
  return entity.fields["beast"] === target;
}

/** Wounds that count as this-war HP. Lifetime scars before the declare do not. */
export function thisWarWounds(
  entities: Iterable<Entity>,
  args: { target: string; name?: string; sinceTick: number },
): Entity[] {
  const hits: Entity[] = [];
  for (const entity of entities) {
    const tick = woundTick(entity);
    if (tick === null || tick < args.sinceTick) {
      continue;
    }
    if (woundHitsTarget(entity, args.target, args.name)) {
      hits.push(entity);
    }
  }
  hits.sort((a, b) => {
    const ta = woundTick(a) ?? 0;
    const tb = woundTick(b) ?? 0;
    if (ta !== tb) {
      return ta - tb;
    }
    return a.id < b.id ? -1 : 1;
  });
  return hits;
}

export function parseCombatCell(value: unknown): Position | null {
  if (typeof value === "string") {
    return parseCellString(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const row = value as { x?: unknown; y?: unknown; z?: unknown };
    if (
      typeof row.x === "number" &&
      typeof row.y === "number" &&
      typeof row.z === "number" &&
      [row.x, row.y, row.z].every((n) => Number.isInteger(n))
    ) {
      return { x: row.x, y: row.y, z: row.z };
    }
  }
  return null;
}

export function scalarArg(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  return undefined;
}
