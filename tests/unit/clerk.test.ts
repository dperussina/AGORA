import { describe, expect, it } from "vitest";
import { Clerk } from "../../src/engine/clerk.ts";
import { applyPatch } from "../../src/engine/apply.ts";
import { seedRegistry } from "../../src/engine/registry.ts";
import { layer1Passes, layer2Passes, weightMilli } from "../../src/engine/weight.ts";

function populatedClerk(): Clerk {
  const clerk = new Clerk();
  clerk.addIdentity("a", 25, 100);
  clerk.addIdentity("b", 25, 100);
  return clerk;
}

describe("weight", () => {
  it("uses integer milli-units and decays while absent", () => {
    expect(weightMilli(10, 0)).toBe(10_000n);
    expect(weightMilli(10, 1)).toBe(9900n);
    expect(weightMilli(0, 0)).toBe(0n);
    expect(weightMilli(3000, 0)).toBe(2_000_000n);
  });

  it("treats ties as failures", () => {
    expect(layer2Passes(10n, 10n)).toBe(false);
    expect(layer2Passes(11n, 10n)).toBe(true);
    expect(layer1Passes(2n, 1n)).toBe(true);
    expect(layer1Passes(1n, 1n)).toBe(false);
  });
});

describe("clerk", () => {
  it("rejects malformed propose without spending currency", () => {
    const clerk = populatedClerk();
    const before = clerk.identities.get("a")!.currency;
    const result = clerk.propose("a", { kind: "prose.please", text: "double the world" });
    expect(result.ok).toBe(false);
    expect(clerk.identities.get("a")!.currency).toBe(before);
  });

  it("charges proposal_cost for a valid patch and dockets Layer 2 for next tick", () => {
    const clerk = populatedClerk();
    const result = clerk.propose("a", {
      kind: "text.set",
      path: "text.world_name",
      value: "The Lattice",
    });
    expect(result).toMatchObject({ ok: true, tier: 2, resolutionTick: 1 });
    expect(clerk.identities.get("a")!.currency).toBe(15);
    expect(clerk.docket()).toHaveLength(1);
  });

  it("never dockets a Layer 0 patch", () => {
    const clerk = populatedClerk();
    const result = clerk.propose("a", {
      kind: "param.set",
      path: "log.append_only",
      value: 0,
    });
    expect(result.ok).toBe(false);
    expect(clerk.docket()).toHaveLength(0);
  });

  it("fails a 50/50 Layer 2 vote and does not apply", () => {
    const clerk = populatedClerk();
    const proposed = clerk.propose("a", {
      kind: "text.set",
      path: "text.world_name",
      value: "Tie Land",
    });
    if (!proposed.ok) {
      throw new Error("expected propose to succeed");
    }
    expect(clerk.vote("a", proposed.proposalId, "for").ok).toBe(true);
    expect(clerk.vote("b", proposed.proposalId, "against").ok).toBe(true);
    clerk.resolveTick();
    const [done] = clerk.resolveTick();
    expect(done?.status).toBe("failed");
    expect(done?.failReason).toBe("threshold or tie");
    expect(clerk.registry.text.world_name).toBeNull();
    expect(clerk.registry.version).toBe(0);
  });

  it("applies a passing text.set and bumps registry version", () => {
    const clerk = populatedClerk();
    const proposed = clerk.propose("a", {
      kind: "text.set",
      path: "text.world_name",
      value: "The Lattice",
    });
    if (!proposed.ok) {
      throw new Error("expected propose to succeed");
    }
    clerk.vote("a", proposed.proposalId, "for");
    clerk.resolveTick();
    const [done] = clerk.resolveTick();
    expect(done?.status).toBe("applied");
    expect(clerk.registry.text.world_name).toBe("The Lattice");
    expect(clerk.registry.version).toBe(1);
  });

  it("applies param.set and action.define", () => {
    const clerk = populatedClerk();
    const budget = clerk.propose("a", {
      kind: "param.set",
      path: "params.action_budget",
      value: 5,
    });
    if (!budget.ok) {
      throw new Error("expected propose to succeed");
    }
    clerk.vote("a", budget.proposalId, "for");
    clerk.vote("b", budget.proposalId, "for");
    for (let i = 0; i < 10; i++) {
      clerk.resolveTick();
    }
    const [done] = clerk.resolveTick();
    expect(done?.status).toBe("applied");
    expect(clerk.registry.params.action_budget?.value).toBe(5);

    const verb = clerk.propose("a", {
      kind: "action.define",
      name: "mine",
      cost: 1,
      params: { target: "mark" },
      preconditions: [],
      effects: [{ effect: "set_field", args: ["durability", -1] }],
    });
    if (!verb.ok) {
      throw new Error("expected propose to succeed");
    }
    clerk.vote("a", verb.proposalId, "for");
    clerk.resolveTick();
    const [applied] = clerk.resolveTick();
    expect(applied?.status).toBe("applied");
    expect(clerk.registry.verbs.mine?.cost).toBe(1);
  });

  it("resolves at most amendments_per_tick and queues overflow", () => {
    const clerk = new Clerk();
    clerk.addIdentity("a", 100, 100);
    clerk.addIdentity("b", 25, 100);
    for (let i = 0; i < 4; i++) {
      const result = clerk.propose("a", {
        kind: "text.set",
        path: "text.world_name",
        value: `Name ${i}`,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        clerk.vote("a", result.proposalId, "for");
      }
    }
    clerk.resolveTick();
    const first = clerk.resolveTick();
    expect(first).toHaveLength(3);
    expect(first.every((item) => item.status === "applied")).toBe(true);
    expect(clerk.docket()).toHaveLength(1);
    const second = clerk.resolveTick();
    expect(second).toHaveLength(1);
    expect(second[0]?.status).toBe("applied");
  });
});

describe("applyPatch", () => {
  it("does not mutate the source registry", () => {
    const registry = seedRegistry();
    const next = applyPatch(
      registry,
      { kind: "text.set", path: "text.world_name", value: "X" },
      1,
    );
    expect(registry.text.world_name).toBeNull();
    expect(next.text.world_name).toBe("X");
    expect(next.version).toBe(1);
  });
});
