import type { Registry } from "./registry.ts";
import { seedRegistry } from "./registry.ts";
import type { Patch } from "./validate.ts";
import { designationOf } from "./geography.ts";

export function applyPatch(registry: Registry, patch: Patch, proposalId: number): Registry {
  const next: Registry = structuredClone(registry);
  next.version = registry.version + 1;

  switch (patch.kind) {
    case "param.set": {
      const key = patch.path.replace(/^params\./, "");
      const param = next.params[key];
      if (param === undefined) {
        throw new Error(`apply missing param ${key}`);
      }
      param.value = patch.value;
      param.lastAmendment = proposalId;
      break;
    }
    case "text.set": {
      const key = patch.path.replace(/^text\./, "");
      next.text[key] = patch.value;
      break;
    }
    case "space.op": {
      if (patch.op === "resize" && typeof patch.axis === "string" && patch.size !== undefined) {
        const axis = next.space.axes.find((item) => item.name === patch.axis);
        if (axis !== undefined) {
          axis.size = patch.size;
          axis.lastAmendment = proposalId;
        }
      }
      if (patch.op === "add_axis" && typeof patch.axis === "object" && patch.axis !== null) {
        next.space.axes.push({ ...patch.axis, lastAmendment: proposalId });
      }
      if (patch.op === "reclassify" && patch.designation !== undefined && patch.class !== undefined) {
        next.space.anchorClass = { ...next.space.anchorClass, [patch.designation]: patch.class as "nexus" | "cairn" | "vantage" | "hollow" };
      }
      if (patch.op === "destroy_anchor" && patch.designation !== undefined) {
        const gone = new Set(next.space.removedAnchors ?? []);
        gone.add(patch.designation);
        next.space.removedAnchors = [...gone].sort();
        next.space.extraAnchors = (next.space.extraAnchors ?? []).filter((item) => item.designation !== patch.designation);
        if (next.space.anchorClass !== undefined) {
          const rest = { ...next.space.anchorClass };
          delete rest[patch.designation];
          next.space.anchorClass = rest;
        }
      }
      if (patch.op === "create_anchor" && patch.class !== undefined && patch.centre !== undefined) {
        const designation = designationOf(patch.centre);
        next.space.removedAnchors = (next.space.removedAnchors ?? []).filter((id) => id !== designation);
        next.space.extraAnchors = [
          ...(next.space.extraAnchors ?? []).filter((item) => item.designation !== designation),
          {
            designation,
            class: patch.class as "nexus" | "cairn" | "vantage" | "hollow",
            centre: { ...patch.centre },
          },
        ];
      }
      break;
    }
    case "schema.define_type":
      next.types[patch.name] = { fields: patch.fields };
      break;
    case "schema.extend_type": {
      if (patch.field === undefined || typeof patch.field.name !== "string" || patch.field.name.length === 0) {
        throw new Error("schema.extend_type requires field.name");
      }
      const existing = next.types[patch.type] ?? { fields: {} };
      existing.fields ??= {};
      next.types[patch.type] = existing;
      existing.fields[patch.field.name] = {
        type: patch.field.type,
        default: patch.field.default,
        visibility: patch.field.visibility,
      };
      break;
    }
    case "action.define":
      next.verbs[patch.name] = {
        cost: patch.cost,
        params: patch.params,
        preconditions: patch.preconditions,
        effects: patch.effects,
      };
      break;
    case "rule.define_trigger":
      next.triggers[patch.id] = {
        when: patch.when,
        condition: patch.condition,
        effects: patch.effects,
      };
      break;
    case "tier.move":
      next.tiers[patch.path] = patch.tier;
      break;
    case "revert":
      throw new Error("revert is applied via rebuild, not applyPatch");
  }
  return next;
}

export function rebuildRegistry(applied: ReadonlyArray<{ id: number; patch: Patch }>): Registry {
  let registry = seedRegistry();
  for (const item of applied) {
    if (item.patch.kind === "revert") {
      continue;
    }
    registry = applyPatch(registry, item.patch, item.id);
  }
  return registry;
}
