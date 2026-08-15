import { describe, expect, it } from "vitest";
import { generateAnchors } from "../../src/engine/geography.ts";
import { seedRegistry } from "../../src/engine/registry.ts";
import { validatePatch } from "../../src/engine/validate.ts";

describe("validatePatch", () => {
  const registry = seedRegistry();

  it("rejects unknown kinds free", () => {
    const result = validatePatch(registry, { kind: "prose.please", text: "double the world" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("schema");
    }
  });

  it("rejects Layer 0 paths", () => {
    const result = validatePatch(registry, {
      kind: "param.set",
      path: "log.append_only",
      value: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("layer0");
    }
  });

  it("rejects missing params and out-of-bounds values", () => {
    expect(validatePatch(registry, { kind: "param.set", path: "params.nope", value: 1 }).ok).toBe(
      false,
    );
    const over = validatePatch(registry, { kind: "param.set", path: "params.action_budget", value: 1000 });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.code).toBe("bounds");
    }
  });

  it("accepts a legal Layer 1 param.set", () => {
    const result = validatePatch(registry, {
      kind: "param.set",
      path: "params.action_budget",
      value: 5,
    });
    expect(result).toEqual({ ok: true, tier: 1 });
  });

  it("accepts a legal text.set", () => {
    expect(
      validatePatch(registry, { kind: "text.set", path: "text.world_name", value: "The Lattice" }),
    ).toEqual({ ok: true, tier: 2 });
  });

  it("accepts lore paths and rejects invented wiki keys", () => {
    const designation = generateAnchors(registry)[0]?.designation;
    expect(designation).toBeDefined();
    expect(validatePatch(registry, { kind: "text.set", path: "text.world_lore", value: "The lattice remembers." })).toEqual({
      ok: true,
      tier: 2,
    });
    expect(
      validatePatch(registry, {
        kind: "text.set",
        path: `text.anchors.${designation}.lore`,
        value: "Stand here. Hail the Warden.",
      }),
    ).toEqual({ ok: true, tier: 2 });
    expect(validatePatch(registry, { kind: "text.set", path: "text.types.drift.lore", value: "Physics, walking." })).toEqual({
      ok: true,
      tier: 2,
    });
    expect(validatePatch(registry, { kind: "text.set", path: "text.missing", value: "x" }).ok).toBe(false);
    expect(validatePatch(registry, { kind: "text.set", path: "text.world_lore", value: "x".repeat(2001) }).ok).toBe(false);
  });

  it("rejects verbs with illegal effects or too many effects", () => {
    const illegal = validatePatch(registry, {
      kind: "action.define",
      name: "hack",
      cost: 1,
      params: {},
      preconditions: [],
      effects: [{ effect: "eval", args: ["boom"] }],
    });
    expect(illegal.ok).toBe(false);
    if (!illegal.ok) {
      expect(illegal.code).toBe("vocabulary");
    }

    const tooMany = validatePatch(registry, {
      kind: "action.define",
      name: "spam",
      cost: 1,
      params: {},
      preconditions: [],
      effects: Array.from({ length: 17 }, () => ({ effect: "emit", args: ["x"] })),
    });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) {
      expect(tooMany.code).toBe("effect_cap");
    }
  });

  it("accepts Appendix A mine-shaped action.define", () => {
    const result = validatePatch(registry, {
      kind: "action.define",
      name: "mine",
      cost: 2,
      params: { target: "entity_ref" },
      preconditions: [],
      effects: [
        { effect: "destroy", args: ["$target"] },
        { effect: "set_field", args: ["$self", "ore_held", 1] },
        { effect: "emit", args: ["mined", "radius:8"] },
      ],
    });
    expect(result).toEqual({ ok: true, tier: 2 });
  });

  it("rejects an unknown trigger when", () => {
    const unknown = validatePatch(registry, {
      kind: "rule.define_trigger",
      id: "ghost",
      when: "not_a_hook",
      condition: null,
      effects: [{ effect: "emit", args: ["nope"] }],
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.code).toBe("vocabulary");
    }
  });

  it("accepts a trigger on a live hook", () => {
    expect(
      validatePatch(registry, {
        kind: "rule.define_trigger",
        id: "after_step",
        when: "move.end",
        condition: null,
        effects: [{ effect: "emit", args: ["stepped"] }],
      }),
    ).toEqual({ ok: true, tier: 2 });
  });

  it("does not mutate the registry", () => {
    const version = registry.version;
    validatePatch(registry, { kind: "param.set", path: "params.action_budget", value: 5 });
    expect(registry.version).toBe(version);
    expect(registry.params["action_budget"]?.value).toBe(3);
  });
});
