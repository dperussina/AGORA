import {
  EFFECT_VOCABULARY,
  HOOK_VOCABULARY,
  LAYER0_PATHS,
  MAX_EFFECTS,
  PATCH_EXAMPLES,
  SEED_TRIGGERS,
  SEED_VERBS,
  type Registry,
} from "./registry.ts";
import { ANCHOR_CLASSES, designationOf, liveAnchors } from "./geography.ts";

export type Patch =
  | { kind: "param.set"; path: string; value: number }
  | { kind: "text.set"; path: string; value: string }
  | {
      kind: "space.op";
      op: "resize" | "add_axis" | "reclassify" | "create_anchor" | "destroy_anchor";
      axis?: string | { name: string; size: number; wrap: boolean; writable: boolean };
      size?: number;
      designation?: string;
      class?: string;
      centre?: { x: number; y: number; z: number };
    }
  | { kind: "schema.define_type"; name: string; fields: Record<string, SchemaField> }
  | { kind: "schema.extend_type"; type: string; fields: Record<string, SchemaField> }
  | {
      kind: "action.define";
      name: string;
      cost: number;
      params?: Record<string, string>;
      preconditions?: unknown[];
      effects?: Array<{ effect: string; args: unknown[] }>;
      code?: string;
    }
  | {
      kind: "action.update";
      name: string;
      cost: number;
      params?: Record<string, string>;
      preconditions?: unknown[];
      effects?: Array<{ effect: string; args: unknown[] }>;
      code?: string;
    }
  | { kind: "action.remove"; name: string }
  | { kind: "rule.define_trigger"; id: string; when: string; condition: unknown; effects: Array<{ effect: string; args: unknown[] }> }
  | { kind: "rule.update_trigger"; id: string; when: string; condition: unknown; effects: Array<{ effect: string; args: unknown[] }> }
  | { kind: "rule.remove_trigger"; id: string }
  | { kind: "tier.move"; path: string; tier: 1 | 2 }
  | { kind: "revert"; proposalId: number };

export type SchemaField = { type: string; default?: unknown; visibility?: string };

export const EXTEND_TYPE_SHAPE =
  'schema.extend_type uses fields like define_type: {"kind":"schema.extend_type","type":"bounty","fields":{"currency":{"type":"int","visibility":"public"}}}';

export type Validation =
  | { ok: true; tier: 1 | 2 }
  | { ok: false; code: string; reason: string; hint?: string; example?: Record<string, unknown> };

export function readExtendFields(patch: {
  fields?: unknown;
  field?: { name?: unknown; type?: unknown; default?: unknown; visibility?: unknown };
}): Record<string, SchemaField> | null {
  if (patch.fields !== null && typeof patch.fields === "object" && !Array.isArray(patch.fields)) {
    const out: Record<string, SchemaField> = {};
    for (const [name, spec] of Object.entries(patch.fields as Record<string, unknown>)) {
      if (name.length === 0 || spec === null || typeof spec !== "object" || Array.isArray(spec)) {
        return null;
      }
      const row = spec as { type?: unknown; default?: unknown; visibility?: unknown };
      if (typeof row.type !== "string" || row.type.length === 0) {
        return null;
      }
      out[name] = {
        type: row.type,
        ...(row.default === undefined ? {} : { default: row.default }),
        ...(typeof row.visibility === "string" ? { visibility: row.visibility } : {}),
      };
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  const legacy = patch.field;
  if (
    legacy !== undefined &&
    typeof legacy.name === "string" &&
    legacy.name.length > 0 &&
    typeof legacy.type === "string" &&
    legacy.type.length > 0
  ) {
    return {
      [legacy.name]: {
        type: legacy.type,
        ...(legacy.default === undefined ? {} : { default: legacy.default }),
        ...(typeof legacy.visibility === "string" ? { visibility: legacy.visibility } : {}),
      },
    };
  }
  return null;
}

const KINDS = new Set([
  "param.set",
  "text.set",
  "space.op",
  "schema.define_type",
  "schema.extend_type",
  "action.define",
  "action.update",
  "action.remove",
  "rule.define_trigger",
  "rule.update_trigger",
  "rule.remove_trigger",
  "tier.move",
  "revert",
]);

export function validatePatch(registry: Registry, patch: unknown): Validation {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return fail("schema", "patch must be an object", "Call rules(path: 'examples') for valid patch templates.");
  }
  const kind = (patch as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !KINDS.has(kind)) {
    return fail(
      "schema",
      "unknown or missing patch kind",
      `Allowed kinds: ${[...KINDS].join(", ")}. Call rules(path: 'examples') for templates.`,
    );
  }
  const body = patch as Patch;

  switch (body.kind) {
    case "param.set":
      return validateParamSet(registry, body);
    case "text.set":
      return validateTextSet(registry, body);
    case "space.op":
      return validateSpaceOp(registry, body);
    case "schema.define_type":
      if (typeof body.name !== "string" || body.name.length === 0 || registry.types[body.name] !== undefined) {
        return fail("conflict", "type name missing or already defined", undefined, PATCH_EXAMPLES["schema.define_type"]);
      }
      if (body.fields === undefined || readExtendFields({ fields: body.fields }) === null) {
        return fail("schema", "schema.define_type requires a non-empty fields object", undefined, PATCH_EXAMPLES["schema.define_type"]);
      }
      return { ok: true, tier: 2 };
    case "schema.extend_type":
      if (typeof body.type !== "string" || registry.types[body.type] === undefined) {
        return fail("missing_path", `unknown type ${String(body.type)}`, "Define the type first with schema.define_type.", PATCH_EXAMPLES["schema.extend_type"]);
      }
      if (body.fields === undefined || readExtendFields({ fields: body.fields }) === null) {
        return fail("schema", EXTEND_TYPE_SHAPE, undefined, PATCH_EXAMPLES["schema.extend_type"]);
      }
      return { ok: true, tier: 2 };
    case "action.define":
      return validateActionDefine(registry, body);
    case "action.update":
      return validateActionUpdate(registry, body);
    case "action.remove":
      return validateActionRemove(registry, body);
    case "rule.define_trigger":
      return validateTriggerDefine(registry, body);
    case "rule.update_trigger":
      return validateTriggerUpdate(registry, body);
    case "rule.remove_trigger":
      return validateTriggerRemove(registry, body);
    case "tier.move":
      if (isLayer0(body.path) || body.path.startsWith("steward.sunset")) {
        return fail("layer0", "cannot move a Layer 0 path");
      }
      if (body.tier !== 1 && body.tier !== 2) {
        return fail("schema", "tier must be 1 or 2", undefined, PATCH_EXAMPLES["tier.move"]);
      }
      return { ok: true, tier: 1 };
    case "revert":
      if (!Number.isInteger(body.proposalId) || body.proposalId < 0) {
        return fail("schema", "revert requires a proposalId", undefined, PATCH_EXAMPLES["revert"]);
      }
      return { ok: true, tier: 2 };
    default:
      return fail("schema", "unknown or missing patch kind");
  }
}

function validateParamSet(registry: Registry, body: Extract<Patch, { kind: "param.set" }>): Validation {
  if (typeof body.path !== "string") {
    return fail("schema", "param.set requires a path", undefined, PATCH_EXAMPLES["param.set"]);
  }
  if (isLayer0(body.path)) {
    return fail("layer0", `Layer 0 path cannot be amended: ${body.path}`);
  }
  const key = body.path.replace(/^params\./, "");
  const param = registry.params[key];
  if (param === undefined) {
    return fail("missing_path", `unknown param ${body.path}`, "Call rules(path: 'params') to list valid parameters.", PATCH_EXAMPLES["param.set"]);
  }
  if (!Number.isInteger(body.value)) {
    return fail("schema", "param value must be an integer", undefined, PATCH_EXAMPLES["param.set"]);
  }
  if (param.min !== undefined && body.value < param.min) {
    return fail("bounds", `${key} below min ${param.min}`);
  }
  if (param.max !== undefined && body.value > param.max) {
    return fail("bounds", `${key} above max ${param.max}`);
  }
  return { ok: true, tier: registry.tiers[`params.${key}`] ?? param.tier };
}

const TEXT_MAX = 8000;

function validateTextSet(registry: Registry, body: Extract<Patch, { kind: "text.set" }>): Validation {
  if (typeof body.path !== "string") {
    return fail("schema", "text.set requires a path", undefined, PATCH_EXAMPLES["text.set"]);
  }
  if (isLayer0(body.path)) {
    return fail("layer0", `Layer 0 path cannot be amended: ${body.path}`);
  }
  const key = body.path.replace(/^text\./, "");
  if (!(key in registry.text) && !isOpenTextKey(registry, key)) {
    return fail(
      "missing_path",
      `unknown text ${body.path}`,
      "Valid text keys: world_name, world_lore, anchors.<designation>.name|lore, epithets.<identityId>, types.<type>.lore, narrate.*",
      PATCH_EXAMPLES["text.set"],
    );
  }
  if (typeof body.value !== "string") {
    return fail("schema", "text value must be a string", undefined, PATCH_EXAMPLES["text.set"]);
  }
  if (body.value.length > TEXT_MAX) {
    return fail("bounds", `text longer than ${TEXT_MAX}`);
  }
  return { ok: true, tier: 2 };
}

function isOpenTextKey(registry: Registry, key: string): boolean {
  if (key === "world_lore") {
    return true;
  }
  const epithet = /^epithets\.(id_[0-9a-f]+)$/.exec(key);
  if (epithet !== null) {
    return true;
  }
  const typeLore = /^types\.([^.]+)\.lore$/.exec(key);
  if (typeLore !== null) {
    return typeLore[1] !== undefined && registry.types[typeLore[1]] !== undefined;
  }
  const anchorText = /^anchors\.([^.]+)\.(name|lore)$/.exec(key);
  if (anchorText === null) {
    return false;
  }
  const designation = anchorText[1];
  return designation !== undefined && liveAnchors(registry).some((anchor) => anchor.designation === designation);
}

function validateSpaceOp(registry: Registry, body: Extract<Patch, { kind: "space.op" }>): Validation {
  if (body.op === "resize") {
    if (typeof body.axis !== "string") {
      return fail("schema", "resize requires axis name");
    }
    const axis = registry.space.axes.find((item) => item.name === body.axis);
    if (axis === undefined) {
      return fail("missing_path", `unknown axis ${body.axis}`);
    }
    if (typeof body.size !== "number" || !Number.isInteger(body.size) || body.size < 1) {
      return fail("bounds", "resize size must be a positive integer");
    }
    return { ok: true, tier: 1 };
  }
  if (body.op === "add_axis") {
    const axis = body.axis;
    if (typeof axis !== "object" || axis === null) {
      return fail("schema", "add_axis requires an axis object");
    }
    if (registry.space.axes.some((item) => item.name === axis.name)) {
      return fail("conflict", `axis ${axis.name} exists`);
    }
    return { ok: true, tier: 1 };
  }
  if (body.op === "reclassify") {
    if (typeof body.designation !== "string" || !isAnchorClass(body.class)) {
      return fail("schema", "reclassify requires designation and class nexus|cairn|vantage|hollow", undefined, PATCH_EXAMPLES["space.op"]);
    }
    const anchors = liveAnchors(registry);
    const current = anchors.find((item) => item.designation === body.designation);
    if (current === undefined) {
      return fail("missing_path", `unknown anchor ${body.designation}`);
    }
    if (current.class === "nexus" && body.class !== "nexus" && nexusCount(anchors) <= 1) {
      return fail("bounds", "cannot reclassify the last Nexus");
    }
    return { ok: true, tier: 1 };
  }
  if (body.op === "destroy_anchor") {
    if (typeof body.designation !== "string") {
      return fail("schema", "destroy_anchor requires designation");
    }
    const anchors = liveAnchors(registry);
    const current = anchors.find((item) => item.designation === body.designation);
    if (current === undefined) {
      return fail("missing_path", `unknown anchor ${body.designation}`);
    }
    if (current.class === "nexus" && nexusCount(anchors) <= 1) {
      return fail("bounds", "cannot destroy the last Nexus");
    }
    return { ok: true, tier: 1 };
  }
  if (body.op === "create_anchor") {
    if (!isAnchorClass(body.class) || !isCentre(body.centre)) {
      return fail("schema", "create_anchor requires class and integer centre");
    }
    const x = axisBound(registry, "x");
    const y = axisBound(registry, "y");
    const z = axisBound(registry, "z");
    const at = body.centre;
    if (at.x < 0 || at.x >= x || at.y < 0 || at.y >= y || at.z < 0 || at.z >= z) {
      return fail("bounds", "centre out of bounds");
    }
    const designation = designationOf(at);
    const anchors = liveAnchors(registry);
    if (anchors.some((item) => item.designation === designation)) {
      return fail("conflict", `anchor ${designation} exists`);
    }
    const minSep = registry.params["anchor_min_separation"]?.value ?? 12;
    if (anchors.some((item) => cheby(item.centre, at) < minSep)) {
      return fail("bounds", "too close to an existing anchor");
    }
    return { ok: true, tier: 1 };
  }
  return fail("schema", "unknown space.op", "Valid ops: resize, add_axis, reclassify, create_anchor, destroy_anchor.", PATCH_EXAMPLES["space.op"]);
}

function isAnchorClass(value: unknown): value is (typeof ANCHOR_CLASSES)[number] {
  return typeof value === "string" && (ANCHOR_CLASSES as readonly string[]).includes(value);
}

function isCentre(value: unknown): value is { x: number; y: number; z: number } {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return Number.isInteger(row["x"]) && Number.isInteger(row["y"]) && Number.isInteger(row["z"]);
}

function axisBound(registry: Registry, name: string): number {
  return registry.space.axes.find((item) => item.name === name)?.size ?? 64;
}

function nexusCount(anchors: Array<{ class: string }>): number {
  return anchors.filter((item) => item.class === "nexus").length;
}

function cheby(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

function validateTriggerDefine(registry: Registry, body: Extract<Patch, { kind: "rule.define_trigger" }>): Validation {
  if (typeof body.id !== "string" || body.id.length === 0) {
    return fail("schema", "rule.define_trigger requires an id", undefined, PATCH_EXAMPLES["rule.define_trigger"]);
  }
  if (registry.triggers[body.id] !== undefined) {
    return fail("conflict", `trigger ${body.id} exists`, "Use rule.update_trigger to modify an existing trigger.", PATCH_EXAMPLES["rule.update_trigger"]);
  }
  if (typeof body.when !== "string" || !(HOOK_VOCABULARY as readonly string[]).includes(body.when)) {
    return fail("vocabulary", `unknown when ${String(body.when)}`, `Valid hooks: ${HOOK_VOCABULARY.join(", ")}.`, PATCH_EXAMPLES["rule.define_trigger"]);
  }
  return validateEffects(body.effects);
}

function validateTriggerUpdate(registry: Registry, body: Extract<Patch, { kind: "rule.update_trigger" }>): Validation {
  if (typeof body.id !== "string" || body.id.length === 0) {
    return fail("schema", "rule.update_trigger requires an id", undefined, PATCH_EXAMPLES["rule.update_trigger"]);
  }
  if (registry.triggers[body.id] === undefined) {
    return fail("missing_path", `unknown trigger ${body.id}`, "Use rule.define_trigger to create a new trigger.");
  }
  if (typeof body.when !== "string" || !(HOOK_VOCABULARY as readonly string[]).includes(body.when)) {
    return fail("vocabulary", `unknown when ${String(body.when)}`, `Valid hooks: ${HOOK_VOCABULARY.join(", ")}.`);
  }
  const checked = validateEffects(body.effects);
  if (!checked.ok) {
    return checked;
  }
  return { ok: true, tier: SEED_TRIGGERS.has(body.id) ? 1 : 2 };
}

function validateTriggerRemove(registry: Registry, body: Extract<Patch, { kind: "rule.remove_trigger" }>): Validation {
  if (typeof body.id !== "string" || body.id.length === 0) {
    return fail("schema", "rule.remove_trigger requires an id", undefined, PATCH_EXAMPLES["rule.remove_trigger"]);
  }
  if (registry.triggers[body.id] === undefined) {
    return fail("missing_path", `unknown trigger ${body.id}`);
  }
  return { ok: true, tier: 1 };
}

function validateActionDefine(
  registry: Registry,
  body: Extract<Patch, { kind: "action.define" }>,
): Validation {
  if (typeof body.name !== "string" || body.name.length === 0) {
    return fail("schema", "action.define requires a name", undefined, PATCH_EXAMPLES["action.define"]);
  }
  if (registry.verbs[body.name] !== undefined) {
    return fail("conflict", `verb ${body.name} exists`, "Use action.update to modify an existing verb.", PATCH_EXAMPLES["action.update"]);
  }
  if (!Number.isInteger(body.cost) || body.cost < 0) {
    return fail("schema", "cost must be a non-negative integer", undefined, PATCH_EXAMPLES["action.define"]);
  }
  if (typeof body.code === "string" && body.code.trim().length > 0) {
    if (body.code.length > 16_000) {
      return fail("bounds", "action code exceeds 16,000 chars");
    }
    return { ok: true, tier: 2 };
  }
  return validateEffects(body.effects ?? []);
}

function validateActionUpdate(
  registry: Registry,
  body: Extract<Patch, { kind: "action.update" }>,
): Validation {
  if (typeof body.name !== "string" || body.name.length === 0) {
    return fail("schema", "action.update requires a name", undefined, PATCH_EXAMPLES["action.update"]);
  }
  if (registry.verbs[body.name] === undefined) {
    return fail("missing_path", `unknown verb ${body.name}`, "Use action.define to create a new verb.");
  }
  if (!Number.isInteger(body.cost) || body.cost < 0) {
    return fail("schema", "cost must be a non-negative integer");
  }
  if (typeof body.code === "string" && body.code.trim().length > 0) {
    if (body.code.length > 16_000) {
      return fail("bounds", "action code exceeds 16,000 chars");
    }
    return { ok: true, tier: SEED_VERBS.has(body.name) ? 1 : 2 };
  }
  const checked = validateEffects(body.effects ?? []);
  if (!checked.ok) {
    return checked;
  }
  return { ok: true, tier: SEED_VERBS.has(body.name) ? 1 : 2 };
}

function validateActionRemove(
  registry: Registry,
  body: Extract<Patch, { kind: "action.remove" }>,
): Validation {
  if (typeof body.name !== "string" || body.name.length === 0) {
    return fail("schema", "action.remove requires a name", undefined, PATCH_EXAMPLES["action.remove"]);
  }
  if (SEED_VERBS.has(body.name)) {
    return fail("layer0", `cannot remove seed verb ${body.name}`);
  }
  if (registry.verbs[body.name] === undefined) {
    return fail("missing_path", `unknown verb ${body.name}`);
  }
  return { ok: true, tier: 1 };
}

function validateEffects(effects: Array<{ effect: string; args: unknown[] }>): Validation {
  if (!Array.isArray(effects)) {
    return fail("schema", "effects must be an array", undefined, PATCH_EXAMPLES["action.define"]);
  }
  if (effects.length > MAX_EFFECTS) {
    return fail("effect_cap", `at most ${MAX_EFFECTS} effects`);
  }
  for (const item of effects) {
    if (item === null || typeof item !== "object" || typeof item.effect !== "string") {
      return fail("schema", "each effect needs an effect name");
    }
    if (!(EFFECT_VOCABULARY as readonly string[]).includes(item.effect)) {
      return fail(
        "vocabulary",
        `unknown effect ${item.effect}`,
        `Valid effects: ${EFFECT_VOCABULARY.join(", ")}.`,
      );
    }
  }
  return { ok: true, tier: 2 };
}

function isLayer0(path: string): boolean {
  return typeof path === "string" && (LAYER0_PATHS.has(path) || path.startsWith("layer0."));
}

function fail(
  code: string,
  reason: string,
  hint?: string,
  example?: Record<string, unknown>,
): Validation {
  return {
    ok: false,
    code,
    reason,
    ...(hint === undefined ? {} : { hint }),
    ...(example === undefined ? {} : { example }),
  };
}
