import { describe, expect, it } from "vitest";
import { GENESIS_SEED, Oracle } from "../../src/engine/oracle.ts";
import { BIND_VOCABULARY } from "../../src/engine/registry.ts";
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

function plant(
  world: World,
  id: string,
  type: string,
  position: { x: number; y: number; z: number },
  fields: Record<string, string | number | boolean | null> = {},
) {
  world.entities.set(id, {
    id,
    type,
    fields: { position: formatCell(position), ...fields },
  });
}

function wounds(world: World) {
  return [...world.entities.values()].filter((entity) => entity.type === "wound");
}

describe("automata binds", () => {
  it("lists the new binds on rules path hooks", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const seen = call(
      world,
      req("tools/call", { name: "rules", arguments: { path: "hooks" } }),
      ada.sessionToken,
    ).result as { binds: string[] };
    expect(seen.binds).toEqual([...BIND_VOCABULARY]);
  });

  it("honors mod on a voted param name", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    world.clerk.registry.params["raid_interval"] = { value: 3, type: "int", tier: 2, min: 1, max: 100 };
    world.clerk.registry.triggers["raid_clock"] = {
      when: "tick_boundary",
      condition: { pred: "mod", args: ["$tick", "$raid_interval", 0] },
      effects: [{ effect: "set_field", args: [ada.identityId, "raids", 1] }],
    };
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    expect(world.fields.get(ada.identityId)?.["raids"]).toBeUndefined();
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    expect(world.fields.get(ada.identityId)?.["raids"]).toBeUndefined();
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    expect(world.fields.get(ada.identityId)?.["raids"]).toBe(1);
  });

  it("no-ops $each_beast when none exist", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    world.clerk.registry.triggers["empty_pack"] = {
      when: "tick_boundary",
      condition: null,
      effects: [
        {
          effect: "create",
          args: ["wound", null, { beast: "$each_beast", target: "$nearest_body", amount: 1 }],
        },
      ],
    };
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    expect(wounds(world)).toHaveLength(0);
  });

  it("lets a turret wound the nearest body in range", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const turretAt = { x: 10, y: 10, z: 10 };
    plant(world, "ent:turret", "turret", turretAt, { range: 3, bite: 2 });
    world.bodies.set(ada.identityId, { x: 12, y: 10, z: 10 });
    world.clerk.registry.triggers["turret_read"] = {
      when: "tick_boundary",
      condition: { pred: "within", args: ["$self", "$nearest_body", "$range"] },
      effects: [
        {
          effect: "create",
          args: [
            "wound",
            "$position",
            { beast: "$each_turret", target: "$nearest_body", amount: "$bite", tick: "$tick" },
          ],
        },
      ],
    };
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    const hit = wounds(world);
    expect(hit).toHaveLength(1);
    expect(hit[0]?.fields["target"]).toBe(ada.identityId);
    expect(hit[0]?.fields["beast"]).toBe("ent:turret");
    expect(hit[0]?.fields["amount"]).toBe(2);
  });

  it("does not wound a body outside range", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    plant(world, "ent:turret", "turret", { x: 10, y: 10, z: 10 }, { range: 2, bite: 2 });
    world.bodies.set(ada.identityId, { x: 14, y: 10, z: 10 });
    world.clerk.registry.triggers["turret_read"] = {
      when: "tick_boundary",
      condition: { pred: "within", args: ["$self", "$nearest_body", "$range"] },
      effects: [
        {
          effect: "create",
          args: ["wound", "$position", { beast: "$each_turret", target: "$nearest_body", amount: "$bite" }],
        },
      ],
    };
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    expect(wounds(world)).toHaveLength(0);
  });

  it("skips a hollow body when choosing $nearest_body", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    const hollow = world.anchors.find((anchor) => anchor.class === "hollow");
    expect(hollow).toBeDefined();
    plant(world, "ent:turret", "turret", { x: hollow!.centre.x + 2, y: hollow!.centre.y, z: hollow!.centre.z }, {
      range: 8,
      bite: 1,
    });
    world.bodies.set(bob.identityId, { ...hollow!.centre });
    world.bodies.set(ada.identityId, { x: hollow!.centre.x + 3, y: hollow!.centre.y, z: hollow!.centre.z });
    world.clerk.registry.triggers["turret_read"] = {
      when: "tick_boundary",
      condition: { pred: "within", args: ["$self", "$nearest_body", "$range"] },
      effects: [
        {
          effect: "create",
          args: ["wound", "$position", { beast: "$each_turret", target: "$nearest_body", amount: 1 }],
        },
      ],
    };
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    expect(wounds(world)[0]?.fields["target"]).toBe(ada.identityId);
  });

  it("picks a tied nearest body from the log tip", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    const turretAt = { x: 20, y: 20, z: 20 };
    plant(world, "ent:turret", "turret", turretAt, { range: 4, bite: 1 });
    world.bodies.set(ada.identityId, { x: 20, y: 20, z: 22 });
    world.bodies.set(bob.identityId, { x: 20, y: 20, z: 18 });
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    world.clerk.registry.triggers["turret_read"] = {
      when: "tick_boundary",
      condition: { pred: "within", args: ["$self", "$nearest_body", "$range"] },
      effects: [
        {
          effect: "create",
          args: ["wound", "$position", { beast: "$each_turret", target: "$nearest_body", amount: 1 }],
        },
      ],
    };
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    const tick = world.clerk.tick + 1;
    const tip = world.log.tip()?.hash ?? GENESIS_SEED;
    const tied = [ada.identityId, bob.identityId].sort((a, b) => (a < b ? -1 : 1));
    const expected = tied[new Oracle(`${tip}:nearest:ent:turret:${formatCell(turretAt)}:${tick}`).int(tied.length)];
    world.advanceTick();
    expect(wounds(world)[0]?.fields["target"]).toBe(expected);
  });

  it("steps $toward the nearest body one cell", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    plant(world, "ent:beast", "beast", { x: 5, y: 5, z: 5 });
    world.bodies.set(ada.identityId, { x: 8, y: 5, z: 5 });
    world.clerk.registry.triggers["lunge"] = {
      when: "tick_boundary",
      condition: null,
      effects: [{ effect: "move", args: ["$each_beast", "$toward"] }],
    };
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    const beast = world.entities.get("ent:beast");
    expect(beast?.position).toEqual({ x: 6, y: 5, z: 5 });
    expect(beast?.fields["position"]).toBe("6,5,5");
  });

  it("does not fire an unknown trigger pred", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    world.clerk.registry.triggers["open_always"] = {
      when: "tick_boundary",
      condition: { pred: "always", args: [] },
      effects: [{ effect: "set_field", args: [ada.identityId, "open", 1] }],
    };
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    expect(world.fields.get(ada.identityId)?.["open"]).toBeUndefined();
  });

  it("still walks seed Drift after $each_drift stays special-cased", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    for (let i = 0; i < 25; i += 1) {
      call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
      world.advanceTick();
    }
    const drift = world.drifts[0];
    expect(drift).toBeDefined();
    let moved = false;
    for (let i = 0; i < 8; i += 1) {
      const before = { ...world.drifts[0]!.position };
      call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
      world.advanceTick();
      const after = world.drifts[0]!.position;
      if (after.x !== before.x || after.y !== before.y || after.z !== before.z) {
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
  });

  it("still refuses clerk-coin transfer to a non-identity", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    plant(world, "ent:nest", "nest", { x: 1, y: 1, z: 1 });
    const before = world.clerk.identities.get(ada.identityId)?.currency ?? 0;
    world.clerk.registry.triggers["nest_take"] = {
      when: "tick_boundary",
      condition: null,
      effects: [{ effect: "transfer", args: ["currency", ada.identityId, "ent:nest", 1] }],
    };
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    expect(world.clerk.identities.get("ent:nest")).toBeUndefined();
    expect(world.clerk.identities.get(ada.identityId)?.currency).toBeGreaterThanOrEqual(before);
  });
});
