import { describe, expect, it } from "vitest";
import { formatCell } from "../../src/engine/cell.ts";
import { foldWorld } from "../../src/engine/world-fold.ts";
import { World, WORLD_ORIENTATION, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

function req(method: string, params?: Record<string, unknown>, id = 1): McpRequest {
  return { jsonrpc: "2.0", id, method, params, _meta: META };
}

function call(world: World, body: McpRequest, token?: string) {
  return world.handle({
    body,
    now: 1_000,
    authorization: token === undefined ? undefined : `Bearer ${token}`,
  });
}

function quickRegister(world: World, name: string) {
  const res = call(
    world,
    req("tools/call", { name: "whoami", arguments: { intent: "register", name } }),
  ).result as { identityId: string; sessionToken: string; name: string; operatorReceipt: string };
  return res;
}

describe("Genesis v2 — clean reset, awareness, pacing, and expressive DSL", () => {
  it("boots clean with only seed verbs and triggers (no hardcoded combat/wake)", () => {
    const world = new World();
    const tools = (call(world, req("tools/list")).result as {
      tools: Array<{ name: string; inputSchema: { properties: { verb?: { enum: string[] } } } }>;
    }).tools;
    expect(tools.map((t) => t.name)).toHaveLength(10);
    const actTool = tools.find((t) => t.name === "act");
    expect(actTool?.inputSchema.properties.verb?.enum).toEqual([
      "craft",
      "depict",
      "dismantle",
      "edit",
      "give",
      "mark",
      "move",
      "run",
      "wait",
    ]);
    expect(Object.keys(world.clerk.registry.triggers).sort()).toEqual(["drift_spawn", "drift_walk"]);
    expect(world.clerk.registry.params["tick_seconds"]?.value).toBe(15);
    expect(world.clerk.registry.params["max_move_step"]?.value).toBe(5);
    expect(world.clerk.registry.params["perception_radius"]?.value).toBe(16);
    expect(world.clerk.registry.params["founding_grant"]?.value).toBe(100);
  });

  it("supports one-call registration with name and returns orientation + briefing + holdings", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    expect(ada.name).toBe("Ada");
    expect(ada.operatorReceipt).toContain(ada.sessionToken);

    const who = call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken).result as {
      orientation: string;
      holdings: unknown[];
      queuedIntents: unknown[];
      briefing: { worldName: string | null; phase: string; onlineCount: number };
    };
    expect(who.orientation).toBe(WORLD_ORIENTATION);
    expect(who.holdings).toEqual([]);
    expect(who.queuedIntents).toEqual([]);
    expect(who.briefing.worldName).toBeNull();
    expect(who.briefing.phase).toBe("genesis");
    expect(who.briefing.onlineCount).toBe(1);
  });

  it("enforces max_move_step and rejects zero-delta moves free", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const zero = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 0, y: 0, z: 0 } } }),
      ada.sessionToken,
    ).result;
    expect(zero).toMatchObject({ accepted: false, reason: "move requires non-zero delta" });

    const teleport = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 10, y: 0, z: 0 } } }),
      ada.sessionToken,
    ).result;
    expect(teleport).toMatchObject({ accepted: false, reason: "exceeds max_move_step 5" });

    const legal = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 3, y: -1, z: 0 } } }),
      ada.sessionToken,
    ).result;
    expect(legal).toMatchObject({ accepted: true, budgetRemaining: 9 });
  });

  it("returns full local perception (identities, public entity fields, marks, landmarks) and cursor-tracked heard speech", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");
    const adaPos = world.bodies.get(ada.identityId)!;
    const nearPos = { x: adaPos.x + 2, y: adaPos.y, z: adaPos.z };
    world.bodies.set(bob.identityId, nearPos);

    // Define a type with one public and one private field
    call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: {
          patch: {
            kind: "schema.define_type",
            name: "beacon",
            fields: {
              label: { type: "string", visibility: "public" },
              secret: { type: "string" },
            },
          },
        },
      }),
      ada.sessionToken,
    );
    world.entities.set("ent:99", {
      id: "ent:99",
      type: "beacon",
      position: nearPos,
      fields: { label: "North Gate", secret: "hidden-code", owner: ada.identityId },
    });

    // Name an anchor so it appears in global landmarks
    const firstAnchor = world.anchors[0]!;
    call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: {
          patch: { kind: "text.set", path: `text.anchors.${firstAnchor.designation}.name`, value: "First Harbor" },
        },
      }),
      ada.sessionToken,
    );

    // Bob speaks to Ada
    call(
      world,
      req("tools/call", { name: "speak", arguments: { text: "Hello Ada", target: ada.identityId } }),
      bob.sessionToken,
    );

    const obs1 = call(world, req("tools/call", { name: "observe", arguments: {} }), ada.sessionToken).result as {
      nearby: {
        identities: Array<{ identityId: string; position: { x: number }; distance: number }>;
        entities: Array<{ id: string; fields: Record<string, unknown>; distance: number }>;
      };
      landmarks: Array<{ name: string; distance: number }>;
      heard: Array<{ text: string }>;
    };
    expect(obs1.nearby.identities.some((row) => row.identityId === bob.identityId && row.distance === 2)).toBe(true);
    const beacon = obs1.nearby.entities.find((e) => e.id === "ent:99");
    expect(beacon).toBeDefined();
    expect(beacon?.fields).toEqual({ label: "North Gate" });
    expect(beacon?.fields["secret"]).toBeUndefined();
    expect(obs1.landmarks.some((l) => l.name === "First Harbor")).toBe(true);
    expect(obs1.heard.map((m) => m.text)).toEqual(["Hello Ada"]);

    // Second observe with no new speech returns empty heard (cursor-tracked)
    const obs2 = call(world, req("tools/call", { name: "observe", arguments: {} }), ada.sessionToken).result as {
      heard: unknown[];
    };
    expect(obs2.heard).toEqual([]);
  });

  it("defaults history to newest-first (desc) and supports rules(path:'examples') + propose dryRun", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");

    const examples = call(
      world,
      req("tools/call", { name: "rules", arguments: { path: "examples" } }),
      ada.sessionToken,
    ).result as { patches: Record<string, unknown>; predicates: string[] };
    expect(examples.patches["action.define"]).toBeDefined();
    expect(examples.predicates).toContain("within_reach");
    expect(examples.predicates).toContain("owner_is");

    // dryRun valid patch does not spend currency
    const dryOk = call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: { dryRun: true, patch: { kind: "text.set", path: "text.world_name", value: "Nova" } },
      }),
      ada.sessionToken,
    ).result;
    expect(dryOk).toMatchObject({ ok: true, dryRun: true, tier: 2, cost: 10 });
    expect(world.clerk.identities.get(ada.identityId)?.currency).toBe(100);

    // dryRun invalid patch returns hint
    const dryBad = call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: { dryRun: true, patch: { kind: "not.a.kind" } },
      }),
      ada.sessionToken,
    ).result as { ok: boolean; hint?: string };
    expect(dryBad.ok).toBe(false);
    expect(dryBad.hint).toContain("examples");

    // history defaults to desc
    const hist = call(world, req("tools/call", { name: "history", arguments: { limit: 3 } }), ada.sessionToken).result as {
      order: string;
      page: Array<{ seq: number }>;
    };
    expect(hist.order).toBe("desc");
    expect(hist.page[0]!.seq).toBeGreaterThan(hist.page[1]!.seq);
  });

  it("legislates a full Bounty Escrow + Integer Math + destroy_where + action.update with zero hardcoded game code and replays identically", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");
    const adaPos = world.bodies.get(ada.identityId)!;
    const posStr = formatCell(adaPos);

    // 1. Define bounty type with public currency treasury field
    call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: {
          patch: {
            kind: "schema.define_type",
            name: "bounty",
            fields: {
              owner: { type: "id", visibility: "public" },
              currency: { type: "int", visibility: "public", default: 0 },
              hp: { type: "int", visibility: "public", default: 10 },
            },
          },
        },
      }),
      ada.sessionToken,
    );

    // 2. Define post_bounty verb (creates bounty within reach)
    call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: {
          patch: {
            kind: "action.define",
            name: "post_bounty",
            cost: 1,
            params: { position: "string" },
            preconditions: [{ pred: "within_reach", args: ["$position"] }],
            effects: [
              { effect: "create", args: ["bounty", "$position", { owner: "$self", currency: 0, hp: 10 }] },
              { effect: "emit", args: ["bounty.posted"] },
            ],
          },
        },
      }),
      ada.sessionToken,
    );

    // 3. Define fund_bounty (Identity -> Entity treasury deposit)
    call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: {
          patch: {
            kind: "action.define",
            name: "fund_bounty",
            cost: 1,
            params: { amount: "int" },
            preconditions: [
              { pred: "type_is", args: ["$target", "bounty"] },
              { pred: "owner_is", args: ["$target", "$self"] },
            ],
            effects: [{ effect: "transfer", args: ["currency", "$self", "$target", "$amount"] }],
          },
        },
      }),
      ada.sessionToken,
    );

    // 4. Define chip_bounty (Bob proposes so Ada retains coin to fund the bounty)
    call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: {
          patch: {
            kind: "action.define",
            name: "chip_bounty",
            cost: 1,
            params: { dmg: "int" },
            preconditions: [{ pred: "type_is", args: ["$target", "bounty"] }],
            effects: [{ effect: "set_field", args: ["$target", "hp", "$target.hp - $dmg"] }],
          },
        },
      }),
      bob.sessionToken,
    );

    // 5. Define trigger: when hp <= 0, pay bounty currency from entity to striker and destroy_where
    call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: {
          patch: {
            kind: "rule.define_trigger",
            id: "bounty_payout",
            when: "act.end",
            condition: {
              pred: "and",
              args: [
                { pred: "eq", args: ["$verb", "chip_bounty"] },
                { pred: "lte", args: ["$target.hp", 0] },
              ],
            },
            effects: [
              { effect: "transfer", args: ["currency", "$target", "$self", "$target.currency"] },
              { effect: "destroy_where", args: ["bounty", { hp: 0 }] },
            ],
          },
        },
      }),
      bob.sessionToken,
    );

    // Execute: Ada posts bounty, funds it with 15 coin; Bob chips 10 hp -> gets paid 15 coin!
    const posted = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "post_bounty", position: posStr } }),
      ada.sessionToken,
    ).result;
    expect(posted).toMatchObject({ accepted: true });
    world.advanceTick();

    const bounty = [...world.entities.values()].find((e) => e.type === "bounty")!;
    expect(bounty).toBeDefined();
    expect(bounty.fields["hp"]).toBe(10);

    // Ada funds bounty with 15 coin
    const adaBeforeFund = world.clerk.identities.get(ada.identityId)!.currency;
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "fund_bounty", target: bounty.id, amount: 15 } }),
      ada.sessionToken,
    );
    world.advanceTick();
    expect(world.entities.get(bounty.id)?.fields["currency"]).toBe(15);
    expect(world.clerk.identities.get(ada.identityId)!.currency).toBe(adaBeforeFund - 15 + 5); // +5 currency_per_tick

    // Bob chips 10 hp -> trigger fires, transfers 15 coin from bounty entity to Bob, destroys bounty
    const bobBefore = world.clerk.identities.get(bob.identityId)!.currency;
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "chip_bounty", target: bounty.id, dmg: 10 } }),
      bob.sessionToken,
    );
    world.advanceTick();
    expect(world.entities.has(bounty.id)).toBe(false);
    expect(world.clerk.identities.get(bob.identityId)!.currency).toBe(bobBefore + 15 + 5);

    // Test action.update & action.remove
    const upd = call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: {
          patch: {
            kind: "action.update",
            name: "chip_bounty",
            cost: 2,
            params: { dmg: "int" },
            preconditions: [],
            effects: [{ effect: "emit", args: ["chipped"] }],
          },
        },
      }),
      bob.sessionToken,
    ).result;
    expect(upd).toMatchObject({ ok: true, applied: true });
    expect(world.clerk.registry.verbs["chip_bounty"]?.cost).toBe(2);

    const rem = call(
      world,
      req("tools/call", {
        name: "propose",
        arguments: { patch: { kind: "action.remove", name: "chip_bounty" } },
      }),
      bob.sessionToken,
    ).result;
    expect(rem).toMatchObject({ ok: true, applied: true });
    expect(world.clerk.registry.verbs["chip_bounty"]).toBeUndefined();

    // Replay check: foldWorld matches live entities and registry version
    const folded = foldWorld(world.log.events());
    expect(folded.entities[bounty.id]).toBeUndefined();
    expect(folded.registry.verbs["chip_bounty"]).toBeUndefined();
    expect(folded.registry.version).toBe(world.clerk.registry.version);
  });
});
