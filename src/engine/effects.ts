import { formatCell, parseCellString } from "./cell.ts";
import { MAX_EFFECTS, type Registry } from "./registry.ts";
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
  tick?: number;
  fromTrigger?: boolean;
  registry?: Registry;
  params?: Record<string, string | number | boolean | null>;
  fields: Map<string, Record<string, string | number | boolean | null>>;
  entities: Map<string, Entity>;
  emit: (name: string, payload: Record<string, unknown>) => void;
  nextId: () => string;
  /** Clerk currency helpers (transactional). */
  moveCurrency?: (from: string, to: string, amount: number) => boolean;
  creditCurrency?: (to: string, amount: number) => boolean;
  debitCurrency?: (from: string, amount: number) => boolean;
  peekCurrency?: (id: string) => number | undefined;
  applyCurrency?: (balances: Map<string, number>) => void;
  expire?: (type: string, age: number) => void;
  /** Identity cells live on bodies, not entities. */
  bodies?: Map<string, Position>;
  occupied?: (at: Position, except?: string) => boolean;
  boundReason?: (at: Position) => string | null;
}

export interface EffectReport {
  effect: string;
  ok: boolean;
  reason?: string;
}

type Scalar = string | number | boolean | null;
type Eval = { ok: true; value: Scalar } | { ok: false; reason: string };

const DESTROY_WHERE_CAP = 256;

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
  const stagedBodies = ctx.bodies === undefined ? undefined : new Map(ctx.bodies);
  const currency = new Map<string, number>();
  const emits: Array<{ name: string; payload: Record<string, unknown> }> = [];
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
    ...(stagedBodies === undefined ? {} : { bodies: stagedBodies }),
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
    debitCurrency: (from, amount) => {
      if (ctx.peekCurrency !== undefined) {
        const fromBal = balanceOf(from);
        if (fromBal === undefined || amount < 0 || fromBal < amount) {
          return false;
        }
        currency.set(from, fromBal - amount);
        return true;
      }
      return ctx.debitCurrency?.(from, amount) ?? false;
    },
    expire:
      ctx.expire === undefined
        ? undefined
        : (type, age) => {
            expires.push([type, age]);
          },
  };

  const reports: EffectReport[] = [];
  for (const item of effects.slice(0, MAX_EFFECTS)) {
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
  if (ctx.bodies !== undefined && stagedBodies !== undefined) {
    ctx.bodies.clear();
    for (const [id, at] of stagedBodies) {
      ctx.bodies.set(id, at);
    }
  }
  if (ctx.peekCurrency !== undefined) {
    ctx.applyCurrency?.(currency);
  }
  for (const event of emits) {
    ctx.emit(event.name, event.payload);
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
      const entity = ctx.entities.get(ref.value);
      if (entity !== undefined && isPublicField(ctx.registry, entity.type, field)) {
        ctx.emit("effect.set_field", { id: ref.value, field, value: value.value });
      }
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
      // Populate registry defaults for any omitted fields
      const typeDef = ctx.registry?.types[type.value];
      if (typeDef !== undefined) {
        for (const [fname, fspec] of Object.entries(typeDef.fields)) {
          if (fields.value[fname] === undefined && fspec.default !== undefined) {
            if (
              typeof fspec.default === "string" ||
              typeof fspec.default === "number" ||
              typeof fspec.default === "boolean" ||
              fspec.default === null
            ) {
              fields.value[fname] = fspec.default;
            }
          }
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
    case "destroy_where": {
      const type = evalArg(args[0], ctx);
      if (!type.ok || typeof type.value !== "string" || type.value === "") {
        return fail(item.effect, type.ok ? "destroy_where requires a type" : type.reason);
      }
      const filter = asFieldBag(args[1], ctx);
      if (!filter.ok) {
        return fail(item.effect, filter.reason);
      }
      const matched = [...ctx.entities.values()]
        .filter((entity) => {
          if (entity.type !== type.value) {
            return false;
          }
          for (const [k, v] of Object.entries(filter.value)) {
            if (entity.fields[k] !== v) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, DESTROY_WHERE_CAP);
      for (const entity of matched) {
        ctx.entities.delete(entity.id);
        ctx.emit("effect.destroy", { id: entity.id, type: entity.type });
      }
      return ok(item.effect);
    }
    case "move": {
      const ref = resolveRef(args[0], ctx);
      if (!ref.ok) {
        return fail(item.effect, ref.reason);
      }
      const from = positionOf(ref.value, ctx);
      if (from === undefined) {
        return fail(item.effect, `entity ${ref.value} has no position`);
      }
      const dest = resolveMove(from, args[1], ctx);
      if (!dest.ok) {
        return fail(item.effect, dest.reason);
      }
      const hopping = ctx.bodies?.has(ref.value) === true;
      if (hopping) {
        const bound = ctx.boundReason?.(dest.value);
        if (bound !== undefined && bound !== null) {
          return fail(item.effect, bound);
        }
        if (ctx.occupied?.(dest.value, ref.value) === true) {
          return fail(item.effect, "destination occupied");
        }
        ctx.bodies?.set(ref.value, dest.value);
      } else {
        const entity = ctx.entities.get(ref.value);
        if (entity === undefined) {
          return fail(item.effect, `entity ${ref.value} has no position`);
        }
        entity.position = dest.value;
        if (typeof entity.fields["position"] === "string") {
          entity.fields["position"] = formatCell(dest.value);
        }
      }
      ctx.emit("effect.move", { id: ref.value, ...dest.value });
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
      if (!amount.ok || typeof amount.value !== "number" || !Number.isInteger(amount.value) || amount.value < 0) {
        return fail(item.effect, amount.ok ? "transfer amount must be a non-negative integer" : amount.reason);
      }
      if (field === "currency") {
        return transferCurrency(from.value, to.value, amount.value, ctx);
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

function entitySupportsCurrency(entity: Entity, registry: Registry | undefined): boolean {
  if (typeof entity.fields["currency"] === "number" && Number.isInteger(entity.fields["currency"])) {
    return true;
  }
  const spec = registry?.types[entity.type]?.fields["currency"];
  return spec?.type === "int";
}

function transferCurrency(fromId: string, toId: string, amount: number, ctx: EffectContext): EffectReport {
  const fromEntity = ctx.entities.get(fromId);
  const toEntity = ctx.entities.get(toId);

  // Entity -> Entity
  if (fromEntity !== undefined && toEntity !== undefined) {
    if (!entitySupportsCurrency(fromEntity, ctx.registry) || !entitySupportsCurrency(toEntity, ctx.registry)) {
      return fail("transfer", "entity does not declare currency field");
    }
    if (!canDebitEntity(fromEntity, ctx)) {
      return fail("transfer", "not authorized to debit entity currency");
    }
    const have = typeof fromEntity.fields["currency"] === "number" ? fromEntity.fields["currency"] : 0;
    if (have < amount) {
      return fail("transfer", "insufficient currency");
    }
    const destHave = typeof toEntity.fields["currency"] === "number" ? toEntity.fields["currency"] : 0;
    fromEntity.fields["currency"] = have - amount;
    toEntity.fields["currency"] = destHave + amount;
    emitCurrencyUpdate(fromEntity, ctx);
    emitCurrencyUpdate(toEntity, ctx);
    return ok("transfer");
  }

  // Entity -> Identity (escrow payout / withdrawal)
  if (fromEntity !== undefined) {
    if (!entitySupportsCurrency(fromEntity, ctx.registry)) {
      return fail("transfer", "entity does not declare currency field");
    }
    if (!canDebitEntity(fromEntity, ctx)) {
      return fail("transfer", "not authorized to debit entity currency");
    }
    const have = typeof fromEntity.fields["currency"] === "number" ? fromEntity.fields["currency"] : 0;
    if (have < amount) {
      return fail("transfer", "insufficient currency");
    }
    if (ctx.creditCurrency === undefined || !ctx.creditCurrency(toId, amount)) {
      return fail("transfer", "insufficient currency");
    }
    fromEntity.fields["currency"] = have - amount;
    emitCurrencyUpdate(fromEntity, ctx);
    return ok("transfer");
  }

  // Identity -> Entity (escrow deposit / bounty funding)
  if (toEntity !== undefined) {
    if (!entitySupportsCurrency(toEntity, ctx.registry)) {
      return fail("transfer", "entity does not declare currency field");
    }
    if (ctx.debitCurrency === undefined || !ctx.debitCurrency(fromId, amount)) {
      return fail("transfer", "insufficient currency");
    }
    const destHave = typeof toEntity.fields["currency"] === "number" ? toEntity.fields["currency"] : 0;
    toEntity.fields["currency"] = destHave + amount;
    emitCurrencyUpdate(toEntity, ctx);
    return ok("transfer");
  }

  // Identity -> Identity (clerk coin)
  if (ctx.moveCurrency !== undefined) {
    if (!ctx.moveCurrency(fromId, toId, amount)) {
      return fail("transfer", "insufficient currency");
    }
    return ok("transfer");
  }

  // Fallback for standalone unit tests without clerk binding
  const src = bagOf(fromId, ctx);
  const have = typeof src["currency"] === "number" ? src["currency"] : 0;
  if (have < amount) {
    return fail("transfer", "insufficient currency");
  }
  const dst = bagOf(toId, ctx);
  src["currency"] = have - amount;
  dst["currency"] = (typeof dst["currency"] === "number" ? dst["currency"] : 0) + amount;
  return ok("transfer");
}

function canDebitEntity(entity: Entity, ctx: EffectContext): boolean {
  if (ctx.fromTrigger === true) {
    return true;
  }
  const owner = entity.fields["owner"];
  const holder = entity.fields["holder"];
  if (owner === undefined && holder === undefined) {
    return true;
  }
  return owner === ctx.selfId || holder === ctx.selfId;
}

function emitCurrencyUpdate(entity: Entity, ctx: EffectContext): void {
  if (isPublicField(ctx.registry, entity.type, "currency")) {
    ctx.emit("effect.set_field", {
      id: entity.id,
      field: "currency",
      value: entity.fields["currency"] ?? 0,
    });
  }
}

function isPublicField(registry: Registry | undefined, type: string, field: string): boolean {
  return registry?.types[type]?.fields[field]?.visibility === "public";
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
  const trimmed = value.trim();

  // Function calls: min(a, b), max(a, b), abs(a)
  const fnMatch = /^(min|max|abs)\(([^)]+)\)$/.exec(trimmed);
  if (fnMatch?.[1] !== undefined && fnMatch[2] !== undefined) {
    const fn = fnMatch[1];
    const parts = fnMatch[2].split(",").map((p) => evalArg(p.trim(), ctx));
    for (const part of parts) {
      if (!part.ok) {
        return part;
      }
      if (typeof part.value !== "number") {
        return { ok: false, reason: `${fn} requires integers` };
      }
    }
    const nums = parts.map((p) => (p as { ok: true; value: number }).value);
    if (fn === "abs" && nums.length === 1) {
      return { ok: true, value: Math.abs(nums[0]!) };
    }
    if (fn === "min" && nums.length === 2) {
      return { ok: true, value: Math.min(nums[0]!, nums[1]!) };
    }
    if (fn === "max" && nums.length === 2) {
      return { ok: true, value: Math.max(nums[0]!, nums[1]!) };
    }
    return { ok: false, reason: `invalid arity for ${fn}` };
  }

  // Binary integer arithmetic: a + b, a - b, a * b, a / b (spaced operators to avoid splitting negative numbers or hyphenated strings)
  const binMatch = /^(.+?)\s+(\+|-|\*|\/)\s+(.+)$/.exec(trimmed);
  if (binMatch?.[1] !== undefined && binMatch[2] !== undefined && binMatch[3] !== undefined) {
    const left = lookup(binMatch[1], ctx);
    const right = lookup(binMatch[3], ctx);
    if (!left.ok) {
      return left;
    }
    if (!right.ok) {
      return right;
    }
    if (typeof left.value !== "number" || typeof right.value !== "number") {
      return { ok: false, reason: "arithmetic requires integers" };
    }
    const op = binMatch[2];
    if (op === "+") {
      return { ok: true, value: left.value + right.value };
    }
    if (op === "-") {
      return { ok: true, value: left.value - right.value };
    }
    if (op === "*") {
      return { ok: true, value: left.value * right.value };
    }
    if (op === "/") {
      if (right.value === 0) {
        return { ok: false, reason: "division by zero" };
      }
      return { ok: true, value: Math.trunc(left.value / right.value) };
    }
  }

  return lookup(trimmed, ctx);
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
  if (trimmed === "$tick") {
    const t = ctx.tick ?? ctx.params?.["tick"];
    return typeof t === "number" ? { ok: true, value: t } : { ok: false, reason: "unbound $tick" };
  }
  const paramRef = /^\$param\.(\w+)$/.exec(trimmed);
  if (paramRef?.[1] !== undefined) {
    const val = ctx.registry?.params[paramRef[1]]?.value;
    return val === undefined ? { ok: false, reason: `unbound ${trimmed}` } : { ok: true, value: val };
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

function positionOf(id: string, ctx: EffectContext): Position | undefined {
  const body = ctx.bodies?.get(id);
  if (body !== undefined) {
    return body;
  }
  const entity = ctx.entities.get(id);
  if (entity === undefined) {
    return undefined;
  }
  if (entity.position !== undefined) {
    return entity.position;
  }
  const raw = entity.fields["position"];
  return typeof raw === "string" ? (parseCellString(raw) ?? undefined) : undefined;
}

function resolveMove(
  from: Position,
  value: unknown,
  ctx: EffectContext,
): { ok: true; value: Position } | { ok: false; reason: string } {
  let token = "";
  let raw: unknown = value;
  if (typeof value === "string") {
    token = value.startsWith("$") ? value.slice(1) : value;
    const bound = bindParam(value, ctx);
    if (bound === undefined && value.startsWith("$")) {
      return { ok: false, reason: `unbound ${value}` };
    }
    if (bound !== undefined && bound !== null) {
      raw = bound;
    }
  }
  if (typeof raw === "string") {
    const cell = parseCellString(raw);
    if (cell === null) {
      return { ok: false, reason: "move requires a vec" };
    }
    raw = cell;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "move requires a vec" };
  }
  const row = raw as Record<string, unknown>;
  const vec = asPosition(raw);
  if (vec === undefined) {
    return { ok: false, reason: "move requires a vec" };
  }
  if (token === "end" || row["absolute"] === true) {
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
    return { ok: false, reason: "fields must be an object" };
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
