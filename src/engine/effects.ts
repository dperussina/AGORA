import type { Position } from "./tick.ts";
import { parseCellString } from "./wake.ts";

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
  params?: Record<string, string | number | boolean | null>;
  fields: Map<string, Record<string, string | number | boolean | null>>;
  entities: Map<string, Entity>;
  emit: (name: string, payload: Record<string, unknown>) => void;
  nextId: () => string;
  /** GAME.md currency lives on the clerk, not the field bag. */
  moveCurrency?: (from: string, to: string, amount: number) => boolean;
  creditCurrency?: (to: string, amount: number) => boolean;
  peekCurrency?: (id: string) => number | undefined;
  applyCurrency?: (balances: Map<string, number>) => void;
  leaveWake?: () => void;
  expire?: (type: string, age: number) => void;
}

export interface EffectReport {
  effect: string;
  ok: boolean;
  reason?: string;
}

type Scalar = string | number | boolean | null;
type Eval = { ok: true; value: Scalar } | { ok: false; reason: string };

function cloneEntities(entities: Map<string, Entity>): Map<string, Entity> {
  const copy = new Map<string, Entity>();
  for (const [id, entity] of entities) {
    copy.set(id, {
      ...entity,
      fields: { ...entity.fields },
      ...(entity.position === undefined ? {} : { position: { ...entity.position } }),
    });
  }
  return copy;
}

function cloneFields(
  fields: Map<string, Record<string, string | number | boolean | null>>,
): Map<string, Record<string, string | number | boolean | null>> {
  const copy = new Map<string, Record<string, string | number | boolean | null>>();
  for (const [id, bag] of fields) {
    copy.set(id, { ...bag });
  }
  return copy;
}

export function runEffects(effects: readonly Effect[], ctx: EffectContext): EffectReport[] {
  const stagedEntities = cloneEntities(ctx.entities);
  const stagedFields = cloneFields(ctx.fields);
  const currency = new Map<string, number>();
  const emits: Array<{ name: string; payload: Record<string, unknown> }> = [];
  let leave = false;
  const expires: Array<[string, number]> = [];

  const balanceOf = (id: string): number | undefined => {
    const staged = currency.get(id);
    if (staged !== undefined) {
      return staged;
    }
    const peeked = ctx.peekCurrency?.(id);
    if (peeked !== undefined) {
      currency.set(id, peeked);
      return peeked;
    }
    return undefined;
  };

  const staged: EffectContext = {
    ...ctx,
    entities: stagedEntities,
    fields: stagedFields,
    emit: (name, payload) => {
      emits.push({ name, payload });
    },
    moveCurrency: (from, to, amount) => {
      if (ctx.peekCurrency !== undefined) {
        const fromBal = balanceOf(from);
        const toBal = balanceOf(to);
        if (fromBal === undefined || toBal === undefined || amount < 0 || fromBal < amount) {
          return false;
        }
        currency.set(from, fromBal - amount);
        currency.set(to, toBal + amount);
        return true;
      }
      return ctx.moveCurrency?.(from, to, amount) ?? false;
    },
    creditCurrency: (to, amount) => {
      if (ctx.peekCurrency !== undefined) {
        const toBal = balanceOf(to);
        if (toBal === undefined || amount < 0) {
          return false;
        }
        currency.set(to, toBal + amount);
        return true;
      }
      return ctx.creditCurrency?.(to, amount) ?? false;
    },
    leaveWake:
      ctx.leaveWake === undefined
        ? undefined
        : () => {
            leave = true;
          },
    expire:
      ctx.expire === undefined
        ? undefined
        : (type, age) => {
            expires.push([type, age]);
          },
  };

  const reports: EffectReport[] = [];
  for (const item of effects.slice(0, 16)) {
    const report = applyEffect(item, staged);
    reports.push(report);
    if (!report.ok) {
      return reports;
    }
  }

  ctx.entities.clear();
  for (const [id, entity] of stagedEntities) {
    ctx.entities.set(id, entity);
  }
  ctx.fields.clear();
  for (const [id, bag] of stagedFields) {
    ctx.fields.set(id, bag);
  }
  if (ctx.peekCurrency !== undefined) {
    ctx.applyCurrency?.(currency);
  }
  for (const event of emits) {
    ctx.emit(event.name, event.payload);
  }
  if (leave) {
    ctx.leaveWake?.();
  }
  for (const [type, age] of expires) {
    ctx.expire?.(type, age);
  }
  return reports;
}

function applyEffect(item: Effect, ctx: EffectContext): EffectReport {
  const args = item.args;
  switch (item.effect) {
    case "set_field": {
      const ref = resolveRef(args[0], ctx);
      if (!ref.ok) {
        return fail(item.effect, ref.reason);
      }
      const field = String(args[1] ?? "");
      if (field === "") {
        return fail(item.effect, "set_field requires a field");
      }
      const value = evalArg(args[2], ctx);
      if (!value.ok) {
        return fail(item.effect, value.reason);
      }
      bagOf(ref.value, ctx)[field] = value.value;
      return ok(item.effect);
    }
    case "create": {
      const type = evalArg(args[0], ctx);
      if (!type.ok || typeof type.value !== "string" || type.value === "") {
        return fail(item.effect, type.ok ? "create requires a type" : type.reason);
      }
      const position = resolvePosition(args[1], ctx);
      if (!position.ok) {
        return fail(item.effect, position.reason);
      }
      const fields = asFieldBag(args[2], ctx);
      if (!fields.ok) {
        return fail(item.effect, fields.reason);
      }
      if (type.value === "wound") {
        if (fields.value["target"] === undefined) {
          if (fields.value["beast"] === ctx.selfId) {
            fields.value["target"] = ctx.selfId;
          } else if (ctx.targetId !== undefined) {
            fields.value["target"] = ctx.targetId;
          }
        }
        if (fields.value["amount"] === undefined) {
          fields.value["amount"] = 1;
        }
      }
      const id = ctx.nextId();
      ctx.entities.set(id, {
        id,
        type: type.value,
        fields: fields.value,
        position: position.value,
      });
      ctx.emit("effect.create", {
        id,
        type: type.value,
        fields: fields.value,
        ...(position.value === undefined ? {} : position.value),
      });
      return ok(item.effect);
    }
    case "destroy": {
      const ref = resolveRef(args[0], ctx);
      if (!ref.ok) {
        return fail(item.effect, ref.reason);
      }
      if (!ctx.entities.has(ref.value)) {
        return fail(item.effect, `unknown entity ${ref.value}`);
      }
      ctx.entities.delete(ref.value);
      ctx.emit("effect.destroy", { id: ref.value });
      return ok(item.effect);
    }
    case "move": {
      const ref = resolveRef(args[0], ctx);
      if (!ref.ok) {
        return fail(item.effect, ref.reason);
      }
      const entity = ctx.entities.get(ref.value);
      if (entity?.position === undefined) {
        return fail(item.effect, `entity ${ref.value} has no position`);
      }
      const dest = resolveMove(entity.position, args[1]);
      if (!dest.ok) {
        return fail(item.effect, dest.reason);
      }
      entity.position = dest.value;
      ctx.emit("effect.move", { id: ref.value, ...entity.position });
      return ok(item.effect);
    }
    case "transfer": {
      const field = String(args[0] ?? "");
      const from = resolveRef(args[1], ctx);
      const to = resolveRef(args[2], ctx);
      const amount = evalArg(args[3], ctx);
      if (field === "") {
        return fail(item.effect, "transfer requires a field");
      }
      if (!from.ok) {
        return fail(item.effect, from.reason);
      }
      if (!to.ok) {
        return fail(item.effect, to.reason);
      }
      if (!amount.ok || typeof amount.value !== "number" || amount.value < 0) {
        return fail(item.effect, amount.ok ? "transfer amount must be a non-negative integer" : amount.reason);
      }
      if (field === "currency") {
        const source = ctx.entities.get(from.value);
        if (source !== undefined) {
          if (source.type !== "gold") {
            return fail(item.effect, "not gold");
          }
          if (source.fields["holder"] !== ctx.selfId) {
            return fail(item.effect, "not the holder");
          }
          const backing = source.fields["currency"];
          if (typeof backing !== "number" || !Number.isInteger(backing) || backing < amount.value) {
            return fail(item.effect, "insufficient currency");
          }
          if (ctx.creditCurrency === undefined || !ctx.creditCurrency(to.value, amount.value)) {
            return fail(item.effect, "insufficient currency");
          }
          source.fields["currency"] = backing - amount.value;
          return ok(item.effect);
        }
        if (ctx.moveCurrency !== undefined) {
          if (!ctx.moveCurrency(from.value, to.value, amount.value)) {
            return fail(item.effect, "insufficient currency");
          }
          return ok(item.effect);
        }
      }
      const src = bagOf(from.value, ctx);
      const have = typeof src[field] === "number" ? src[field] : 0;
      if (have < amount.value) {
        return fail(item.effect, `insufficient ${field}`);
      }
      const dst = bagOf(to.value, ctx);
      src[field] = have - amount.value;
      dst[field] = (typeof dst[field] === "number" ? dst[field] : 0) + amount.value;
      return ok(item.effect);
    }
    case "reveal": {
      const ref = resolveRef(args[0], ctx);
      if (!ref.ok) {
        return fail(item.effect, ref.reason);
      }
      const field = String(args[1] ?? "");
      if (field === "") {
        return fail(item.effect, "reveal requires a field");
      }
      bagOf(ref.value, ctx)[`revealed:${field}`] = true;
      return ok(item.effect);
    }
    case "emit": {
      const message = interpolate(args[0], ctx);
      if (!message.ok) {
        return fail(item.effect, message.reason);
      }
      ctx.emit(String(message.value ?? "emit"), { args: args.slice(1) });
      return ok(item.effect);
    }
    case "leave_wake": {
      if (ctx.leaveWake === undefined) {
        return fail(item.effect, "leave_wake is not bound");
      }
      ctx.leaveWake();
      return ok(item.effect);
    }
    case "expire": {
      const type = evalArg(args[0], ctx);
      const age = evalArg(args[1], ctx);
      if (!type.ok || typeof type.value !== "string" || type.value === "") {
        return fail(item.effect, type.ok ? "expire requires a type" : type.reason);
      }
      if (!age.ok || typeof age.value !== "number" || age.value < 0) {
        return fail(item.effect, age.ok ? "expire age must be a non-negative integer" : age.reason);
      }
      if (ctx.expire === undefined) {
        return fail(item.effect, "expire is not bound");
      }
      ctx.expire(type.value, age.value);
      return ok(item.effect);
    }
    default:
      return fail(item.effect, `unknown effect ${item.effect}`);
  }
}

function ok(effect: string): EffectReport {
  return { effect, ok: true };
}

function fail(effect: string, reason: string): EffectReport {
  return { effect, ok: false, reason };
}

function resolveRef(value: unknown, ctx: EffectContext): { ok: true; value: string } | { ok: false; reason: string } {
  if (value === "$self" || value === "self") {
    return { ok: true, value: ctx.selfId };
  }
  if (value === "$target" || value === "target") {
    if (ctx.targetId === undefined) {
      return { ok: false, reason: "unbound $target" };
    }
    return { ok: true, value: ctx.targetId };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: "entity ref must be a string" };
  }
  const bound = bindParam(value, ctx);
  if (bound !== undefined) {
    return typeof bound === "string" ? { ok: true, value: bound } : { ok: false, reason: `${value} is not an id` };
  }
  if (value.startsWith("$")) {
    return { ok: false, reason: `unbound ${value}` };
  }
  return { ok: true, value };
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

function evalArg(value: unknown, ctx: EffectContext): Eval {
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    if (typeof value === "number" && !Number.isInteger(value)) {
      return { ok: false, reason: "non-integer number" };
    }
    return { ok: true, value };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: "unsupported argument" };
  }
  const plus = /^(.+)\s*\+\s*(.+)$/.exec(value);
  if (plus?.[1] !== undefined && plus[2] !== undefined) {
    const left = lookup(plus[1], ctx);
    const right = lookup(plus[2], ctx);
    if (!left.ok) {
      return left;
    }
    if (!right.ok) {
      return right;
    }
    if (typeof left.value === "number" && typeof right.value === "number") {
      return { ok: true, value: left.value + right.value };
    }
    return { ok: false, reason: "addition requires integers" };
  }
  return lookup(value, ctx);
}

function lookup(token: string, ctx: EffectContext): Eval {
  const trimmed = token.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return { ok: true, value: Number(trimmed) };
  }
  if (trimmed === "$self" || trimmed === "self") {
    return { ok: true, value: ctx.selfId };
  }
  if (trimmed === "$target" || trimmed === "target") {
    return ctx.targetId === undefined ? { ok: false, reason: "unbound $target" } : { ok: true, value: ctx.targetId };
  }
  const field = /^\$self\.(\w+)$/.exec(trimmed);
  if (field?.[1] !== undefined) {
    return { ok: true, value: bagOf(ctx.selfId, ctx)[field[1]] ?? 0 };
  }
  const target = /^\$target\.(\w+)$/.exec(trimmed);
  if (target?.[1] !== undefined) {
    if (ctx.targetId === undefined) {
      return { ok: false, reason: "unbound $target" };
    }
    return { ok: true, value: bagOf(ctx.targetId, ctx)[target[1]] ?? 0 };
  }
  const bound = bindParam(trimmed, ctx);
  if (bound !== undefined) {
    return { ok: true, value: bound };
  }
  if (trimmed.startsWith("$")) {
    return { ok: false, reason: `unbound ${trimmed}` };
  }
  return { ok: true, value: trimmed };
}

function bindParam(token: string, ctx: EffectContext): Scalar | undefined {
  const name = token.startsWith("$") ? token.slice(1) : token;
  if (!/^[A-Za-z_]\w*$/.test(name)) {
    return undefined;
  }
  const params = ctx.params;
  if (params === undefined || !Object.prototype.hasOwnProperty.call(params, name)) {
    return undefined;
  }
  return params[name] ?? null;
}

function interpolate(value: unknown, ctx: EffectContext): Eval {
  if (typeof value !== "string") {
    return evalArg(value, ctx);
  }
  if (!value.includes("$")) {
    return { ok: true, value };
  }
  const parts = value.split(/(\$[A-Za-z_]\w*(?:\.\w+)?)/);
  let out = "";
  for (const part of parts) {
    if (!part.startsWith("$")) {
      out += part;
      continue;
    }
    const found = lookup(part, ctx);
    if (!found.ok) {
      return found;
    }
    out += found.value === null ? "" : String(found.value);
  }
  return { ok: true, value: out };
}

function resolvePosition(
  value: unknown,
  ctx: EffectContext,
): { ok: true; value: Position | undefined } | { ok: false; reason: string } {
  if (value === null || value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value === "string") {
    const bound = bindParam(value, ctx);
    if (bound !== undefined) {
      if (typeof bound === "string") {
        const cell = parseCellString(bound);
        return cell === null ? { ok: false, reason: "position must be a vec or null" } : { ok: true, value: cell };
      }
      return resolvePosition(bound, ctx);
    }
    const cell = parseCellString(value);
    if (cell !== null) {
      return { ok: true, value: cell };
    }
    if (value.startsWith("$")) {
      return { ok: false, reason: `unbound ${value}` };
    }
    return { ok: false, reason: "position must be a vec or null" };
  }
  const vec = asPosition(value);
  if (vec === undefined) {
    return { ok: false, reason: "position must be a vec or null" };
  }
  return { ok: true, value: vec };
}

function resolveMove(
  from: Position,
  value: unknown,
): { ok: true; value: Position } | { ok: false; reason: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "move requires a vec" };
  }
  const row = value as Record<string, unknown>;
  const vec = asPosition(value);
  if (vec === undefined) {
    return { ok: false, reason: "move requires a vec" };
  }
  if (row["absolute"] === true) {
    return { ok: true, value: vec };
  }
  return { ok: true, value: { x: from.x + vec.x, y: from.y + vec.y, z: from.z + vec.z } };
}

function asPosition(value: unknown): Position | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  if (typeof row["x"] === "number" && typeof row["y"] === "number" && typeof row["z"] === "number") {
    if (![row["x"], row["y"], row["z"]].every((n) => Number.isInteger(n))) {
      return undefined;
    }
    return { x: row["x"], y: row["y"], z: row["z"] };
  }
  return undefined;
}

function asFieldBag(
  value: unknown,
  ctx: EffectContext,
): { ok: true; value: Record<string, Scalar> } | { ok: false; reason: string } {
  if (value === null || value === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "create fields must be an object" };
  }
  const out: Record<string, Scalar> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const resolved = evalArg(item, ctx);
    if (!resolved.ok) {
      return resolved;
    }
    out[key] = resolved.value;
  }
  return { ok: true, value: out };
}
