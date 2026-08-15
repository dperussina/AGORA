import { chebyshev } from "./geography.ts";
import type { Position } from "./tick.ts";

export const FOLLOW_FLOOR_IDS = ["3ae4", "5d0c", "774b"] as const;

export type CellClass = "place" | "kept" | "empty";
export type WakeKind = "stirring" | "thinning" | "guestmark";

export const WAKE_AGE = 3;

export function wakeRate(cellClass: CellClass): number {
  if (cellClass === "place") {
    return 90;
  }
  if (cellClass === "kept") {
    return 12;
  }
  return 4;
}

export function wakeKind(cellClass: CellClass, anchorClass: string | null): WakeKind {
  if (cellClass === "place" && anchorClass === "hollow") {
    return "stirring";
  }
  if (cellClass === "place" && anchorClass === "nexus") {
    return "guestmark";
  }
  return "thinning";
}

export function formatCell(position: Position): string {
  return `${position.x},${position.y},${position.z}`;
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

export function pickFollowFloor(
  wakePos: Position,
  currentDesignation: string | null,
  floors: Array<{ designation: string; centre: Position }>,
): { designation: string; centre: Position } | null {
  const pool = floors.filter((item) => item.designation !== currentDesignation);
  const use = pool.length > 0 ? pool : floors;
  if (use.length === 0) {
    return null;
  }
  return [...use].sort((a, b) => {
    const da = chebyshev(wakePos, a.centre);
    const db = chebyshev(wakePos, b.centre);
    if (da !== db) {
      return da - db;
    }
    return a.designation < b.designation ? -1 : 1;
  })[0] ?? null;
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
