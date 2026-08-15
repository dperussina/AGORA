import {
  EFFECT_VOCABULARY,
  HOOK_VOCABULARY,
  LAYER0_PATHS,
  MAX_EFFECTS,
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
  | { kind: "schema.define_type"; name: string; fields: Record<string, { type: string; default?: unknown; visibility?: string }> }
  | { kind: "schema.extend_type"; type: string; field: { name: string; type: string; default?: unknown; visibility?: string } }
  | {
      kind: "action.define";
      name: string;
      cost: number;
      params: Record<string, string>;
      preconditions: unknown[];
      effects: Array<{ effect: string; args: unknown[] }>;
    }
  | { kind: "rule.define_trigger"; id: string; when: string; condition: unknown; effects: Array<{ effect: string; args: unknown[] }> }
  | { kind: "tier.move"; path: string; tier: 1 | 2 }
  | { kind: "revert"; proposalId: number };

export type Validation =
  | { ok: true; tier: 1 | 2 }
  | { ok: false; code: string; reason: string };

const KINDS = new Set([
  "param.set",
  "text.set",
  "space.op",
  "schema.define_type",
  "schema.extend_type",
  "action.define",
  "rule.define_trigger",
  "tier.move",
  "revert",
]);

export function validatePatch(registry: Registry, patch: unknown): Validation {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return fail("schema", "patch must be an object");
  }
  const kind = (patch as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !KINDS.has(kind)) {
    return fail("schema", "unknown or missing patch kind");
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
      if (!body.name || registry.types[body.name] !== undefined) {
        return fail("conflict", "type name missing or already defined");
      }
      return { ok: true, tier: 2 };
    case "schema.extend_type":
      if (registry.types[body.type] === undefined) {
        return fail("missing_path", `unknown type ${body.type}`);
      }
      return { ok: true, tier: 2 };
    case "action.define":
      return validateAction(registry, body);
    case "rule.define_trigger":
      return validateTrigger(body);
    case "tier.move":
      if (isLayer0(body.path) || body.path.startsWith("steward.sunset")) {
        return fail("layer0", "cannot move a Layer 0 path");
      }
      if (body.tier !== 1 && body.tier !== 2) {
        return fail("schema", "tier must be 1 or 2");
      }
      return { ok: true, tier: 1 };
    case "revert":
      if (!Number.isInteger(body.proposalId) || body.proposalId < 0) {
        return fail("schema", "revert requires a proposalId");
      }
      return { ok: true, tier: 2 };
    default:
      return fail("schema", "unknown or missing patch kind");
  }
}

function validateParamSet(registry: Registry, body: Extract<Patch, { kind: "param.set" }>): Validation {
  if (typeof body.path !== "string") {
    return fail("schema", "param.set requires a path");
  }
  if (isLayer0(body.path)) {
    return fail("layer0", `Layer 0 path cannot be amended: ${body.path}`);
  }
  const key = body.path.replace(/^params\./, "");
  const param = registry.params[key];
  if (param === undefined) {
    return fail("missing_path", `unknown param ${body.path}`);
  }
  if (!Number.isInteger(body.value)) {
    return fail("schema", "param value must be an integer");
  }
  if (param.min !== undefined && body.value < param.min) {
    return fail("bounds", `${key} below min ${param.min}`);
  }
  if (param.max !== undefined && body.value > param.max) {
    return fail("bounds", `${key} above max ${param.max}`);
  }
  return { ok: true, tier: param.tier };
}

const TEXT_MAX = 2000;

function validateTextSet(registry: Registry, body: Extract<Patch, { kind: "text.set" }>): Validation {
  if (typeof body.path !== "string") {
    return fail("schema", "text.set requires a path");
  }
  if (isLayer0(body.path)) {
    return fail("layer0", `Layer 0 path cannot be amended: ${body.path}`);
  }
  const key = body.path.replace(/^text\./, "");
  if (!(key in registry.text) && !isOpenTextKey(registry, key)) {
    return fail("missing_path", `unknown text ${body.path}`);
  }
  if (typeof body.value !== "string") {
    return fail("schema", "text value must be a string");
  }
  if (body.value.length > TEXT_MAX) {
    return fail("bounds", `text longer than ${TEXT_MAX}`);
  }
  return { ok: true, tier: 2 };
}

/** GAME.md §7.2: names, descriptions, lore, epithets. Not an arbitrary wiki. */
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
      return fail("schema", "reclassify requires designation and class nexus|cairn|vantage|hollow");
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
  return fail("schema", "unknown space.op");
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

function validateTrigger(body: Extract<Patch, { kind: "rule.define_trigger" }>): Validation {
  if (typeof body.id !== "string" || body.id.length === 0) {
    return fail("schema", "rule.define_trigger requires an id");
  }
  if (typeof body.when !== "string" || !(HOOK_VOCABULARY as readonly string[]).includes(body.when)) {
    return fail("vocabulary", `unknown when ${String(body.when)}`);
  }
  return validateEffects(body.effects);
}

function validateAction(
  registry: Registry,
  body: Extract<Patch, { kind: "action.define" }>,
): Validation {
  if (!body.name) {
    return fail("schema", "action.define requires a name");
  }
  if (registry.verbs[body.name] !== undefined) {
    return fail("conflict", `verb ${body.name} exists`);
  }
  if (!Number.isInteger(body.cost) || body.cost < 0) {
    return fail("schema", "cost must be a non-negative integer");
  }
  return validateEffects(body.effects);
}

function validateEffects(effects: Array<{ effect: string; args: unknown[] }>): Validation {
  if (!Array.isArray(effects)) {
    return fail("schema", "effects must be an array");
  }
  if (effects.length > MAX_EFFECTS) {
    return fail("effect_cap", `at most ${MAX_EFFECTS} effects`);
  }
  for (const item of effects) {
    if (item === null || typeof item !== "object" || typeof item.effect !== "string") {
      return fail("schema", "each effect needs an effect name");
    }
    if (!(EFFECT_VOCABULARY as readonly string[]).includes(item.effect)) {
      return fail("vocabulary", `unknown effect ${item.effect}`);
    }
  }
  return { ok: true, tier: 2 };
}

function isLayer0(path: string): boolean {
  return typeof path === "string" && (LAYER0_PATHS.has(path) || path.startsWith("layer0."));
}

function fail(code: string, reason: string): Validation {
  return { ok: false, code, reason };
}
