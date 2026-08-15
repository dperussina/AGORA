import type { Position } from "./tick.ts";

export interface PredicateContext {
  inBounds: boolean;
  occupied: boolean;
  marked: boolean;
  textLength: number;
  maxLength: number;
  selfType?: string;
  targetType?: string;
  selfPosition?: Position;
  targetPosition?: Position;
}

/** Returns a failure reason, or null if every precondition holds. Missing list is empty. */
export function checkPreconditions(list: readonly unknown[] | undefined, ctx: PredicateContext): string | null {
  for (const item of list ?? []) {
    if (typeof item === "string") {
      if (!namedOk(item, ctx)) {
        return item === "unoccupied" ? "destination occupied" : item;
      }
      continue;
    }
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return "invalid precondition";
    }
    const row = item as { pred?: unknown; args?: unknown[] };
    if (typeof row.pred !== "string") {
      return "invalid precondition";
    }
    if (!predOk(row.pred, row.args ?? [], ctx)) {
      return row.pred;
    }
  }
  return null;
}

function namedOk(name: string, ctx: PredicateContext): boolean {
  switch (name) {
    case "in_bounds":
      return ctx.inBounds;
    case "unoccupied":
      return !ctx.occupied;
    case "length_ok":
      return ctx.textLength > 0 && ctx.textLength <= ctx.maxLength;
    case "cell_unmarked":
      return !ctx.marked;
    default:
      return false;
  }
}

function predOk(pred: string, args: unknown[], ctx: PredicateContext): boolean {
  if (pred === "type_is") {
    const ref = args[0];
    const expected = String(args[1] ?? "");
    const actual = ref === "$target" ? ctx.targetType : ctx.selfType;
    return actual === expected;
  }
  if (pred === "within") {
    const a = args[0] === "$target" ? ctx.targetPosition : ctx.selfPosition;
    const b = args[1] === "$self" ? ctx.selfPosition : ctx.targetPosition;
    const radius = Number(args[2]);
    if (a === undefined || b === undefined || !Number.isInteger(radius)) {
      return false;
    }
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)) <= radius;
  }
  return false;
}
