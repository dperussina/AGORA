import { parseCellString, parsePositionLike } from "./cell.ts";
import type { Entity } from "./effects.ts";
import { chebyshev } from "./geography.ts";
import type { Registry } from "./registry.ts";
import type { Position } from "./tick.ts";

export type Scalar = string | number | boolean | null;

export interface PredicateContext {
  inBounds: boolean;
  occupied: boolean;
  marked: boolean;
  textLength: number;
  maxLength: number;
  tick?: number;
  selfId?: string;
  targetId?: string;
  selfType?: string;
  targetType?: string;
  selfPosition?: Position;
  targetPosition?: Position;
  params?: Record<string, Scalar>;
  entities?: Map<string, Entity>;
  fields?: Map<string, Record<string, Scalar>>;
  bodies?: Map<string, Position>;
  registry?: Registry;
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
    if (!evalPredicate(item, ctx)) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        const pred = (item as { pred?: unknown }).pred;
        if (typeof pred === "string") {
          return pred;
        }
      }
      return "invalid precondition";
    }
  }
  return null;
}

/** Unified fail-closed predicate evaluator for verb preconditions and triggers. */
export function evalPredicate(condition: unknown, ctx: PredicateContext): boolean {
  if (condition === undefined || condition === null) {
    return true;
  }
  if (typeof condition === "string") {
    return namedOk(condition, ctx);
  }
  if (typeof condition !== "object" || Array.isArray(condition)) {
    return false;
  }
  const row = condition as { pred?: unknown; args?: unknown[] };
  if (typeof row.pred !== "string") {
    return false;
  }
  return predOk(row.pred, Array.isArray(row.args) ? row.args : [], ctx);
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
  switch (pred) {
    case "and":
      return args.length > 0 && args.every((sub) => evalPredicate(sub, ctx));
    case "or":
      return args.length > 0 && args.some((sub) => evalPredicate(sub, ctx));
    case "not":
      return args.length === 1 && !evalPredicate(args[0], ctx);
    case "eq":
      return resolveValue(args[0], ctx) === resolveValue(args[1], ctx);
    case "neq":
      return resolveValue(args[0], ctx) !== resolveValue(args[1], ctx);
    case "gt":
      return compareNumbers(args[0], args[1], ctx, (a, b) => a > b);
    case "gte":
      return compareNumbers(args[0], args[1], ctx, (a, b) => a >= b);
    case "lt":
      return compareNumbers(args[0], args[1], ctx, (a, b) => a < b);
    case "lte":
      return compareNumbers(args[0], args[1], ctx, (a, b) => a <= b);
    case "mod": {
      const dividend = resolveNumber(args[0], ctx);
      const divisor = resolveNumber(args[1], ctx);
      const remainder = resolveNumber(args[2], ctx);
      return (
        dividend !== undefined &&
        divisor !== undefined &&
        remainder !== undefined &&
        divisor > 0 &&
        dividend % divisor === remainder
      );
    }
    case "type_is": {
      const refId = resolveRefId(args[0], ctx);
      const expected = String(args[1] ?? "");
      if (refId === undefined) {
        return false;
      }
      if (args[0] === "$target" && ctx.targetType !== undefined) {
        return ctx.targetType === expected;
      }
      if (args[0] === "$self" && ctx.selfType !== undefined) {
        return ctx.selfType === expected;
      }
      const entity = ctx.entities?.get(refId);
      if (entity !== undefined) {
        return entity.type === expected;
      }
      if (ctx.bodies?.has(refId)) {
        return expected === "agent";
      }
      return false;
    }
    case "exists": {
      const refId = resolveRefId(args[0], ctx);
      if (refId === undefined) {
        return false;
      }
      return (ctx.entities?.has(refId) ?? false) || (ctx.bodies?.has(refId) ?? false);
    }
    case "field_eq": {
      const refId = resolveRefId(args[0], ctx);
      const field = typeof args[1] === "string" ? args[1] : "";
      if (refId === undefined || field === "") {
        return false;
      }
      const actual = lookupField(refId, field, ctx);
      const expected = resolveValue(args[2], ctx);
      return actual === expected;
    }
    case "owner_is": {
      const refId = resolveRefId(args[0], ctx);
      const actor = resolveRefId(args[1], ctx);
      if (refId === undefined || actor === undefined) {
        return false;
      }
      const owner = lookupField(refId, "owner", ctx);
      const holder = lookupField(refId, "holder", ctx);
      return owner === actor || holder === actor;
    }
    case "within": {
      const a = resolveCell(args[0], ctx);
      const b = resolveCell(args[1], ctx);
      const radius = resolveNumber(args[2], ctx);
      if (a === undefined || b === undefined || radius === undefined || radius < 0) {
        return false;
      }
      return chebyshev(a, b) <= radius;
    }
    case "within_reach": {
      const dest = resolveCell(args[0], ctx);
      const origin = ctx.selfPosition ?? (ctx.selfId !== undefined ? ctx.bodies?.get(ctx.selfId) : undefined);
      const reach = ctx.registry?.params["reach"]?.value ?? 8;
      if (dest === undefined || origin === undefined) {
        return false;
      }
      return chebyshev(origin, dest) <= reach;
    }
    case "count_where": {
      const type = resolveValue(args[0], ctx);
      const filter = args[1];
      const op = typeof args[2] === "string" ? args[2] : "gte";
      const targetCount = resolveNumber(args[3], ctx);
      if (typeof type !== "string" || targetCount === undefined || ctx.entities === undefined) {
        return false;
      }
      const count = countEntitiesMatching(ctx.entities, type, filter, ctx);
      return applyOp(count, op, targetCount);
    }
    default:
      return false;
  }
}

export function entityMatchesFilter(
  entity: Entity,
  filter: unknown,
  ctx: PredicateContext,
): boolean {
  if (filter === null || filter === undefined) {
    return true;
  }
  if (typeof filter !== "object" || Array.isArray(filter)) {
    return false;
  }
  for (const [key, rawExpected] of Object.entries(filter as Record<string, unknown>)) {
    const expected = resolveValue(rawExpected, ctx);
    if (entity.fields[key] !== expected) {
      return false;
    }
  }
  return true;
}

function countEntitiesMatching(
  entities: Map<string, Entity>,
  type: string,
  filter: unknown,
  ctx: PredicateContext,
): number {
  let count = 0;
  for (const entity of entities.values()) {
    if (entity.type !== type) {
      continue;
    }
    if (entityMatchesFilter(entity, filter, ctx)) {
      count += 1;
    }
  }
  return count;
}

function applyOp(a: number, op: string, b: number): boolean {
  switch (op) {
    case "eq":
      return a === b;
    case "neq":
      return a !== b;
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    default:
      return false;
  }
}

function compareNumbers(
  leftRaw: unknown,
  rightRaw: unknown,
  ctx: PredicateContext,
  fn: (a: number, b: number) => boolean,
): boolean {
  const left = resolveNumber(leftRaw, ctx);
  const right = resolveNumber(rightRaw, ctx);
  if (left === undefined || right === undefined) {
    return false;
  }
  return fn(left, right);
}

function resolveRefId(raw: unknown, ctx: PredicateContext): string | undefined {
  if (raw === "$self" || raw === "self") {
    return ctx.selfId ?? (typeof ctx.params?.["self"] === "string" ? ctx.params["self"] : undefined);
  }
  if (raw === "$target" || raw === "target") {
    return ctx.targetId ?? (typeof ctx.params?.["target"] === "string" ? ctx.params["target"] : undefined);
  }
  const value = resolveValue(raw, ctx);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function lookupField(id: string, field: string, ctx: PredicateContext): Scalar | undefined {
  const entity = ctx.entities?.get(id);
  if (entity !== undefined) {
    return entity.fields[field];
  }
  return ctx.fields?.get(id)?.[field];
}

export function resolveValue(raw: unknown, ctx: PredicateContext): Scalar | undefined {
  if (typeof raw === "number" || typeof raw === "boolean" || raw === null) {
    return raw;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  if (!raw.startsWith("$")) {
    return raw;
  }
  if (raw === "$tick") {
    return ctx.tick ?? (typeof ctx.params?.["tick"] === "number" ? ctx.params["tick"] : undefined);
  }
  if (raw === "$self") {
    return ctx.selfId ?? ctx.params?.["self"];
  }
  if (raw === "$target") {
    return ctx.targetId ?? ctx.params?.["target"];
  }
  const paramRef = /^\$param\.(\w+)$/.exec(raw);
  if (paramRef?.[1] !== undefined) {
    return ctx.registry?.params[paramRef[1]]?.value;
  }
  const selfField = /^\$self\.(\w+)$/.exec(raw);
  if (selfField?.[1] !== undefined) {
    const id = ctx.selfId ?? (typeof ctx.params?.["self"] === "string" ? ctx.params["self"] : undefined);
    return id === undefined ? undefined : lookupField(id, selfField[1], ctx);
  }
  const targetField = /^\$target\.(\w+)$/.exec(raw);
  if (targetField?.[1] !== undefined) {
    const id = ctx.targetId ?? (typeof ctx.params?.["target"] === "string" ? ctx.params["target"] : undefined);
    return id === undefined ? undefined : lookupField(id, targetField[1], ctx);
  }
  const name = raw.slice(1);
  if (ctx.params !== undefined && Object.prototype.hasOwnProperty.call(ctx.params, name)) {
    return ctx.params[name];
  }
  const regParam = ctx.registry?.params[name]?.value;
  if (regParam !== undefined) {
    return regParam;
  }
  return undefined;
}

function resolveNumber(raw: unknown, ctx: PredicateContext): number | undefined {
  const val = resolveValue(raw, ctx);
  if (typeof val === "number" && Number.isInteger(val)) {
    return val;
  }
  if (typeof val === "string" && /^-?\d+$/.test(val)) {
    return Number(val);
  }
  return undefined;
}

function resolveCell(raw: unknown, ctx: PredicateContext): Position | undefined {
  if (raw === "$self" || raw === "$position") {
    if (ctx.selfPosition !== undefined) {
      return ctx.selfPosition;
    }
    const p = ctx.params?.["position"];
    return typeof p === "string" ? (parseCellString(p) ?? undefined) : undefined;
  }
  if (raw === "$target") {
    if (ctx.targetPosition !== undefined) {
      return ctx.targetPosition;
    }
    const id = resolveRefId("$target", ctx);
    if (id !== undefined) {
      const fromId = cellOfId(id, ctx);
      if (fromId !== undefined) {
        return fromId;
      }
    }
    const p = ctx.params?.["nearest_at"];
    return typeof p === "string" ? (parseCellString(p) ?? undefined) : undefined;
  }
  if (raw === "$nearest_body" || raw === "$nearest_at") {
    const p = ctx.params?.["nearest_at"];
    return typeof p === "string" ? (parseCellString(p) ?? undefined) : undefined;
  }
  if (typeof raw === "string") {
    const bound = resolveValue(raw, ctx);
    if (typeof bound === "string") {
      const parsed = parseCellString(bound);
      if (parsed !== null) {
        return parsed;
      }
      const fromId = cellOfId(bound, ctx);
      if (fromId !== undefined) {
        return fromId;
      }
    }
    return parseCellString(raw) ?? undefined;
  }
  return parsePositionLike(raw) ?? undefined;
}

function cellOfId(id: string, ctx: PredicateContext): Position | undefined {
  const body = ctx.bodies?.get(id);
  if (body !== undefined) {
    return body;
  }
  const entity = ctx.entities?.get(id);
  if (entity === undefined) {
    return undefined;
  }
  if (entity.position !== undefined) {
    return entity.position;
  }
  const raw = entity.fields["position"];
  return typeof raw === "string" ? (parseCellString(raw) ?? undefined) : undefined;
}
