import type { Position } from "./tick.ts";

export interface Effect {
  effect: string;
  args: unknown[];
}

export interface Entity {
  id: string;
  type: string;
  fields: Record<string, string | number | boolean | null>;
  position?: Position;
  createdBy?: number;
}

export interface EffectContext {
  selfId: string;
  targetId?: string;
  fields: Map<string, Record<string, string | number | boolean | null>>;
  entities: Map<string, Entity>;
  emit: (name: string, payload: Record<string, unknown>) => void;
  nextId: () => string;
}

export function runEffects(effects: readonly Effect[], ctx: EffectContext): void {
  for (const item of effects.slice(0, 16)) {
    applyEffect(item, ctx);
  }
}

function applyEffect(item: Effect, ctx: EffectContext): void {
  const args = item.args;
  switch (item.effect) {
    case "set_field": {
      const ref = resolveRef(args[0], ctx);
      const field = String(args[1] ?? "");
      if (ref === undefined || field === "") {
        return;
      }
      const bag = bagOf(ref, ctx);
      bag[field] = evalArg(args[2], ctx);
      break;
    }
    case "create": {
      const type = String(args[0] ?? "entity");
      const id = ctx.nextId();
      ctx.entities.set(id, {
        id,
        type,
        fields: asFieldBag(args[2]),
        position: asPosition(args[1]),
      });
      ctx.emit("effect.create", { id, type });
      break;
    }
    case "destroy": {
      const ref = resolveRef(args[0], ctx);
      if (ref !== undefined && ctx.entities.has(ref)) {
        ctx.entities.delete(ref);
        ctx.emit("effect.destroy", { id: ref });
      }
      break;
    }
    case "move": {
      const ref = resolveRef(args[0], ctx);
      const entity = ref === undefined ? undefined : ctx.entities.get(ref);
      const delta = asPosition(args[1]);
      if (entity?.position !== undefined && delta !== undefined) {
        entity.position = {
          x: entity.position.x + delta.x,
          y: entity.position.y + delta.y,
          z: entity.position.z + delta.z,
        };
      }
      break;
    }
    case "transfer": {
      const from = resolveRef(args[0], ctx);
      const to = resolveRef(args[1], ctx);
      const field = String(args[2] ?? "");
      const amount = Number(evalArg(args[3], ctx));
      if (from === undefined || to === undefined || field === "" || !Number.isInteger(amount)) {
        return;
      }
      const src = bagOf(from, ctx);
      const dst = bagOf(to, ctx);
      const have = typeof src[field] === "number" ? src[field] : 0;
      if (have < amount) {
        return;
      }
      src[field] = have - amount;
      dst[field] = (typeof dst[field] === "number" ? dst[field] : 0) + amount;
      break;
    }
    case "reveal": {
      const ref = resolveRef(args[0], ctx);
      const field = String(args[1] ?? "");
      if (ref !== undefined) {
        bagOf(ref, ctx)[`revealed:${field}`] = true;
      }
      break;
    }
    case "emit": {
      ctx.emit(String(args[0] ?? "emit"), { args: args.slice(1) });
      break;
    }
    default:
      break;
  }
}

function resolveRef(value: unknown, ctx: EffectContext): string | undefined {
  if (value === "$self") {
    return ctx.selfId;
  }
  if (value === "$target") {
    return ctx.targetId;
  }
  if (typeof value === "string" && !value.startsWith("$")) {
    return value;
  }
  return undefined;
}

function bagOf(id: string, ctx: EffectContext): Record<string, string | number | boolean | null> {
  const entity = ctx.entities.get(id);
  if (entity !== undefined) {
    return entity.fields;
  }
  const existing = ctx.fields.get(id);
  if (existing !== undefined) {
    return existing;
  }
  const created: Record<string, string | number | boolean | null> = {};
  ctx.fields.set(id, created);
  return created;
}

function evalArg(value: unknown, ctx: EffectContext): string | number | boolean | null {
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return typeof value === "number" && !Number.isInteger(value) ? 0 : value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const plus = /^(.+)\s*\+\s*(.+)$/.exec(value);
  if (plus?.[1] !== undefined && plus[2] !== undefined) {
    const left = Number(evalArg(lookup(plus[1], ctx), ctx));
    const right = Number(evalArg(lookup(plus[2], ctx), ctx));
    if (Number.isInteger(left) && Number.isInteger(right)) {
      return left + right;
    }
  }
  return lookup(value, ctx);
}

function lookup(token: string, ctx: EffectContext): string | number | boolean | null {
  const trimmed = token.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const field = /^\$self\.(\w+)$/.exec(trimmed);
  if (field?.[1] !== undefined) {
    return bagOf(ctx.selfId, ctx)[field[1]] ?? 0;
  }
  const target = /^\$target\.(\w+)$/.exec(trimmed);
  if (target?.[1] !== undefined && ctx.targetId !== undefined) {
    return bagOf(ctx.targetId, ctx)[target[1]] ?? 0;
  }
  return trimmed;
}

function asPosition(value: unknown): Position | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  if (typeof row["x"] === "number" && typeof row["y"] === "number" && typeof row["z"] === "number") {
    return { x: row["x"], y: row["y"], z: row["z"] };
  }
  return undefined;
}

function asFieldBag(value: unknown): Record<string, string | number | boolean | null> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === null || typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isInteger(item))) {
      out[key] = item;
    }
  }
  return out;
}
