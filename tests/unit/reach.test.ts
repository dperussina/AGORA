import { describe, expect, it } from "vitest";
import { formatCell } from "../../src/engine/wake.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

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

function registerNamed(world: World, name: string) {
  const challenge = call(world, req("tools/call", { name: "whoami", arguments: {} }));
  const creds = call(
    world,
    req("tools/call", {
      name: "whoami",
      arguments: {},
      inputResponses: { intent: "register" },
      requestState: (challenge.result as { requestState: string }).requestState,
    }),
  ).result as { identityId: string; sessionToken: string };
  const nameAsk = call(world, req("tools/call", { name: "whoami", arguments: {} }), creds.sessionToken);
  call(
    world,
    req("tools/call", {
      name: "whoami",
      arguments: {},
      inputResponses: { name },
      requestState: (nameAsk.result as { requestState: string }).requestState,
    }),
    creds.sessionToken,
  );
  const identity = world.clerk.identities.get(creds.identityId);
  if (identity !== undefined) {
    identity.ticksPresent = 100;
    identity.currency = 40;
  }
  return creds;
}

function installPlace(world: World) {
  world.clerk.registry.types["block"] = {
    fields: { kind: { type: "string" }, position: { type: "string" }, builder: { type: "id" } },
  };
  world.clerk.registry.verbs["place"] = {
    cost: 1,
    params: { kind: "string", position: "vec" },
    preconditions: [],
    effects: [
      { effect: "create", args: ["block", null, { kind: "$kind", position: "$position", builder: "$self" }] },
      { effect: "emit", args: ["block.placed"] },
    ],
  };
  world.clerk.registry.verbs["break"] = {
    cost: 1,
    params: { kind: "string", target: "id" },
    preconditions: [],
    effects: [
      { effect: "destroy", args: ["$target"] },
      { effect: "create", args: ["resource", null, { holder: "$self", kind: "$kind", qty: 1 }] },
      { effect: "emit", args: ["block.broken"] },
    ],
  };
  world.clerk.registry.verbs["race"] = {
    cost: 1,
    params: { end: "vec" },
    preconditions: [],
    effects: [
      { effect: "move", args: ["$self", "$end"] },
      { effect: "emit", args: ["race.ran"] },
    ],
  };
}

function blocks(world: World) {
  return [...world.entities.values()].filter((entity) => entity.type === "block");
}

describe("reach", () => {
  it("lists reach on rules path params", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bag = call(
      world,
      req("tools/call", { name: "rules", arguments: { path: "params" } }),
      ada.sessionToken,
    ).result as { params: { reach: { value: number } } };
    expect(bag.params.reach).toMatchObject({ value: 8, type: "int", tier: 2, min: 1, max: 8 });
  });

  it("rejects a far place free and names the cell to walk to", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installPlace(world);
    const at = world.bodies.get(ada.identityId)!;
    const far = { x: at.x + 9, y: at.y, z: at.z };
    const before = (call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken).result as {
      budgetRemaining: number;
    }).budgetRemaining;
    const denied = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "place", kind: "hull", position: formatCell(far) } }),
      ada.sessionToken,
    );
    expect(denied.result).toMatchObject({
      accepted: false,
      reason: `Too far. Move within 8 of ${formatCell(far)} to place.`,
    });
    const after = (call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken).result as {
      budgetRemaining: number;
    }).budgetRemaining;
    expect(after).toBe(before);
  });

  it("places the local cube and fails one cell past reach", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installPlace(world);
    const at = world.bodies.get(ada.identityId)!;
    const edge = { x: at.x + 8, y: at.y, z: at.z };
    const past = { x: at.x + 9, y: at.y, z: at.z };
    expect(
      call(
        world,
        req("tools/call", { name: "act", arguments: { verb: "place", kind: "hull", position: formatCell(edge) } }),
        ada.sessionToken,
      ).result,
    ).toMatchObject({ accepted: true });
    expect(
      call(
        world,
        req("tools/call", { name: "act", arguments: { verb: "place", kind: "hull", position: formatCell(past) } }),
        ada.sessionToken,
      ).result,
    ).toMatchObject({
      accepted: false,
      reason: `Too far. Move within 8 of ${formatCell(past)} to place.`,
    });
    world.advanceTick();
    expect(blocks(world)).toHaveLength(1);
    expect(blocks(world)[0]?.fields["position"]).toBe(formatCell(edge));
  });

  it("rejects a far break and lets a nearby break through", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installPlace(world);
    const at = world.bodies.get(ada.identityId)!;
    world.entities.set("ent:far", {
      id: "ent:far",
      type: "block",
      fields: { kind: "hull", position: formatCell({ x: at.x + 12, y: at.y, z: at.z }), builder: ada.identityId },
    });
    world.entities.set("ent:near", {
      id: "ent:near",
      type: "block",
      fields: { kind: "hull", position: formatCell({ x: at.x + 2, y: at.y, z: at.z }), builder: ada.identityId },
    });
    expect(
      call(
        world,
        req("tools/call", { name: "act", arguments: { verb: "break", kind: "hull", target: "ent:far" } }),
        ada.sessionToken,
      ).result,
    ).toMatchObject({
      accepted: false,
      reason: `Too far. Move within 8 of ${formatCell({ x: at.x + 12, y: at.y, z: at.z })} to break.`,
    });
    expect(
      call(
        world,
        req("tools/call", { name: "act", arguments: { verb: "break", kind: "hull", target: "ent:near" } }),
        ada.sessionToken,
      ).result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    expect(world.entities.has("ent:far")).toBe(true);
    expect(world.entities.has("ent:near")).toBe(false);
  });

  it("does not gate race", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installPlace(world);
    const at = world.bodies.get(ada.identityId)!;
    const end = { x: at.x + 10, y: at.y, z: at.z };
    expect(
      call(
        world,
        req("tools/call", { name: "act", arguments: { verb: "race", end } }),
        ada.sessionToken,
      ).result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    expect(world.bodies.get(ada.identityId)).toEqual(end);
  });
});
