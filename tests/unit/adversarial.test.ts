import { describe, expect, it } from "vitest";
import { seedRegistry } from "../../src/engine/registry.ts";
import { validatePatch } from "../../src/engine/validate.ts";
import { Clerk } from "../../src/engine/clerk.ts";

describe("adversarial amendment harness", () => {
  it("never dockets Layer 0, eval, or over-cap patches", () => {
    const clerk = new Clerk();
    clerk.addIdentity("a", 100, 200);
    const attacks = [
      { kind: "param.set", path: "log.append_only", value: 0 },
      { kind: "param.set", path: "layer0.fold", value: 1 },
      { kind: "tier.move", path: "steward.sunset", tier: 2 },
      {
        kind: "action.define",
        name: "eval_me",
        cost: 1,
        params: {},
        preconditions: [],
        effects: [{ effect: "eval", args: ["1"] }],
      },
      {
        kind: "action.define",
        name: "too_many",
        cost: 1,
        params: {},
        preconditions: [],
        effects: Array.from({ length: 17 }, () => ({ effect: "emit", args: ["x"] })),
      },
    ];
    for (const patch of attacks) {
      const before = clerk.identities.get("a")!.currency;
      const result = clerk.propose("a", patch);
      expect(result.ok).toBe(false);
      expect(clerk.identities.get("a")!.currency).toBe(before);
      expect(clerk.docket()).toHaveLength(0);
    }
  });

  it("rejects a fuzz of malformed patches without spending", () => {
    const registry = seedRegistry();
    const clerk = new Clerk();
    clerk.addIdentity("a", 1000, 200);
    const fuzz: unknown[] = [
      null,
      1,
      "patch",
      [],
      { kind: "nope" },
      { kind: "param.set" },
      { kind: "param.set", path: "params.action_budget", value: 1.5 },
      { kind: "param.set", path: "params.action_budget", value: -1 },
      { kind: "text.set", path: "text.missing", value: "x" },
      { kind: "space.op", op: "resize", axis: "q", size: 8 },
      { kind: "revert", proposalId: -4 },
    ];
    for (const patch of fuzz) {
      expect(validatePatch(registry, patch).ok).toBe(false);
      const before = clerk.identities.get("a")!.currency;
      expect(clerk.propose("a", patch).ok).toBe(false);
      expect(clerk.identities.get("a")!.currency).toBe(before);
    }
  });
});
