import type { Registry } from "./registry.ts";

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Intent {
  seq: number;
  identityId: string;
  verb: string;
  priority: number;
  delta?: Position;
  text?: string;
  target?: string;
}

export function nextBudget(actionBudget: number, unspent: number, carryCap: number): number {
  return actionBudget + Math.min(Math.max(0, unspent), carryCap);
}

export function axisSize(registry: Registry, name: string): number {
  return registry.space.axes.find((axis) => axis.name === name)?.size ?? 64;
}

export function spawnPosition(registry: Registry): Position {
  return {
    x: Math.floor(axisSize(registry, "x") / 2),
    y: Math.floor(axisSize(registry, "y") / 2),
    z: Math.floor(axisSize(registry, "z") / 2),
  };
}

export function applyMove(
  from: Position,
  delta: Position,
  registry: Registry,
): { ok: true; position: Position } | { ok: false; reason: string } {
  const next = {
    x: from.x + delta.x,
    y: from.y + delta.y,
    z: from.z + delta.z,
  };
  for (const name of ["x", "y", "z"] as const) {
    const size = axisSize(registry, name);
    const value = next[name];
    if (value < 0 || value >= size) {
      return { ok: false, reason: `${name} out of bounds` };
    }
  }
  return { ok: true, position: next };
}
