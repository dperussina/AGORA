import type { Position } from "./tick.ts";

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
