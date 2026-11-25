import { chebyshev } from "./geography.ts";
import type { Position } from "./tick.ts";

export const DEFAULT_REACH = 8;

export function formatCell(position: Position): string {
  return `${position.x},${position.y},${position.z}`;
}

export function parseCellString(value: string): Position | null {
  const parts = value.split(",");
  if (parts.length !== 3) {
    return null;
  }
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  if (![x, y, z].every((n) => Number.isInteger(n))) {
    return null;
  }
  return { x, y, z };
}

export function parsePositionLike(value: unknown): Position | null {
  if (typeof value === "string") {
    return parseCellString(value.startsWith("cell:") ? value.slice(5) : value);
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

export function signStep(from: Position, toward: Position): Position {
  return {
    x: Math.sign(toward.x - from.x),
    y: Math.sign(toward.y - from.y),
    z: Math.sign(toward.z - from.z),
  };
}

export function normalizeStep(delta: Position): Position {
  return {
    x: Math.sign(delta.x),
    y: Math.sign(delta.y),
    z: Math.sign(delta.z),
  };
}

export function tooFarReason(from: Position, dest: Position, radius: number, verb: string): string | null {
  if (chebyshev(from, dest) <= radius) {
    return null;
  }
  return `Too far. Move within ${radius} of ${formatCell(dest)} to ${verb}.`;
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
