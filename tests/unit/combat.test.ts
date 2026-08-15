import { describe, expect, it } from "vitest";
import { FALL_LINGER, WAR_WOUND_MAX, thisWarWounds } from "../../src/engine/combat.ts";
import { listTools } from "../../src/mcp/catalog.ts";
import { seedRegistry } from "../../src/engine/registry.ts";
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
    req(
      "tools/call",
      {
        name: "whoami",
        arguments: {},
        inputResponses: { intent: "register" },
        requestState: (challenge.result as { requestState: string }).requestState,
      },
      2,
    ),
  ).result as { identityId: string; sessionToken: string };
  const nameChallenge = call(world, req("tools/call", { name: "whoami", arguments: {} }, 3), creds.sessionToken);
  call(
    world,
    req(
      "tools/call",
      {
        name: "whoami",
        arguments: {},
        inputResponses: { name },
        requestState: (nameChallenge.result as { requestState: string }).requestState,
      },
      4,
    ),
    creds.sessionToken,
  );
  const identity = world.clerk.identities.get(creds.identityId);
  if (identity !== undefined) {
    identity.ticksPresent = 100;
    identity.currency = 40;
  }
  return creds;
}

function installCombat(world: World) {
  world.clerk.registry.verbs["declare"] = {
    cost: 1,
    params: { target: "id" },
    preconditions: [],
    effects: [
      { effect: "create", args: ["war", null, { attacker: "$self", defender: "$target", status: "open" }] },
      { effect: "emit", args: ["war.declared"] },
    ],
  };
  world.clerk.registry.verbs["strike"] = {
    cost: 1,
    params: { name: "string", position: "string", target: "id", tick: "int" },
    preconditions: [],
    effects: [
      { effect: "create", args: ["wound", null, { beast: "$name", position: "$position", striker: "$self", tick: "$tick" }] },
      { effect: "emit", args: ["war.struck"] },
    ],
  };
  world.clerk.registry.verbs["yield"] = {
    cost: 1,
    params: { target: "id" },
    preconditions: [],
    effects: [
      { effect: "destroy", args: ["$target"] },
      { effect: "emit", args: ["war.yielded"] },
    ],
  };
  world.clerk.registry.verbs["fall"] = {
    cost: 1,
    params: { position: "string", target: "id", tick: "int", until: "int" },
    preconditions: [],
    effects: [
      { effect: "create", args: ["fallen", null, { holder: "$target", position: "$position", tick: "$tick", until: "$until" }] },
      { effect: "emit", args: ["body.fell"] },
    ],
  };
  world.clerk.registry.verbs["rise"] = {
    cost: 1,
    params: { target: "id" },
    preconditions: [],
    effects: [
      { effect: "destroy", args: ["$target"] },
      { effect: "emit", args: ["body.rose"] },
    ],
  };
}

function keepPresent(world: World, token: string) {
  call(world, req("tools/call", { name: "whoami", arguments: {} }, 90), token);
}

describe("combat law", () => {
  it("lists live combat verbs and forwards position tick until name target", () => {
    const registry = seedRegistry();
    const stub = { clerk: { registry } };
    installCombat(stub as unknown as World);
    const act = listTools(registry).find((tool) => tool.name === "act")?.inputSchema as {
      properties: { verb: { enum: string[] }; position: { type: string }; tick: { type: string }; until: { type: string }; name: { type: string }; target: { type: string } };
    };
    expect(act.properties.verb.enum).toEqual(expect.arrayContaining(["declare", "strike", "yield", "fall", "rise"]));
    expect(act.properties.position.type).toBe("string");
    expect(act.properties.tick.type).toBe("integer");
    expect(act.properties.until.type).toBe("integer");
    expect(act.properties.name.type).toBe("string");
    expect(act.properties.target.type).toBe("string");
  });

  it("rejects fall when create cannot bind, then writes fallen when params arrive", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    installCombat(world);
    const stripped = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "fall" } }, 10),
      ada.sessionToken,
    );
    expect(stripped.result).toMatchObject({ accepted: false, reason: "unbound $target" });
    const at = world.bodies.get(bob.identityId)!;
    const tick = world.clerk.tick;
    expect(
      call(
        world,
        req(
          "tools/call",
          {
            name: "act",
            arguments: {
              verb: "fall",
              target: bob.identityId,
              position: `${at.x},${at.y},${at.z}`,
              tick,
              until: tick + FALL_LINGER,
            },
          },
          11,
        ),
        ada.sessionToken,
      ).result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    const fallen = [...world.entities.values()].find((item) => item.type === "fallen");
    expect(fallen?.fields).toMatchObject({
      holder: bob.identityId,
      position: `${at.x},${at.y},${at.z}`,
      tick,
      until: tick + FALL_LINGER,
    });
    expect(world.log.events().some((event) => event.type === "body.fell")).toBe(true);
    expect(world.log.events().some((event) => event.type === "effect.create" && event.payload["type"] === "fallen")).toBe(
      true,
    );
  });

  it("writes wound.target, no-ops strike on a fallen holder, and auto-falls at three this-war wounds", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    installCombat(world);
    const at = world.bodies.get(bob.identityId)!;
    const cell = `${at.x},${at.y},${at.z}`;
    expect(
      call(
        world,
        req("tools/call", { name: "act", arguments: { verb: "declare", target: bob.identityId } }, 10),
        ada.sessionToken,
      ).result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    const declared = world.log.events().find((event) => event.type === "war.declared");
    expect(declared?.payload["defender"]).toBe(bob.identityId);
    expect(declared?.payload["attacker"]).toBe(ada.identityId);

    for (let i = 0; i < WAR_WOUND_MAX; i += 1) {
      keepPresent(world, ada.sessionToken);
      expect(
        call(
          world,
          req(
            "tools/call",
            {
              name: "act",
              arguments: {
                verb: "strike",
                name: "Bob",
                position: cell,
                target: bob.identityId,
                tick: world.clerk.tick,
              },
            },
            20 + i,
          ),
          ada.sessionToken,
        ).result,
      ).toMatchObject({ accepted: true });
      world.advanceTick();
    }

    const wounds = [...world.entities.values()].filter((item) => item.type === "wound");
    expect(wounds).toHaveLength(WAR_WOUND_MAX);
    expect(wounds.every((item) => item.fields["target"] === bob.identityId)).toBe(true);
    const created = world.log.events().find((event) => event.type === "effect.create" && event.payload["type"] === "wound");
    expect((created?.payload["fields"] as { target?: string } | undefined)?.target).toBe(bob.identityId);
    const fallen = [...world.entities.values()].find((item) => item.type === "fallen");
    expect(fallen?.fields["holder"]).toBe(bob.identityId);
    expect(world.log.events().some((event) => event.type === "body.fell")).toBe(true);
    expect(thisWarWounds(world.entities.values(), { target: bob.identityId, name: "Bob", sinceTick: 0 }).length).toBe(
      WAR_WOUND_MAX,
    );

    keepPresent(world, ada.sessionToken);
    expect(
      call(
        world,
        req(
          "tools/call",
          {
            name: "act",
            arguments: { verb: "strike", name: "Bob", position: cell, target: bob.identityId, tick: world.clerk.tick },
          },
          30,
        ),
        ada.sessionToken,
      ).result,
    ).toMatchObject({ accepted: false, reason: "holder is fallen" });
  });

  it("rises while until is live and walks home on a missed rise", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    installCombat(world);
    const home = { x: 8, y: 9, z: 10 };
    world.entities.set("ent:home", {
      id: "ent:home",
      type: "home",
      fields: { owner: bob.identityId, position: "8,9,10", name: "Bob's rest" },
      position: home,
    });
    const at = world.bodies.get(bob.identityId)!;
    const tick = world.clerk.tick;
    call(
      world,
      req(
        "tools/call",
        {
          name: "act",
          arguments: {
            verb: "fall",
            target: bob.identityId,
            position: `${at.x},${at.y},${at.z}`,
            tick,
            until: tick + FALL_LINGER,
          },
        },
        10,
      ),
      ada.sessionToken,
    );
    world.advanceTick();
    const fallen = [...world.entities.values()].find((item) => item.type === "fallen");
    expect(fallen).toBeDefined();
    keepPresent(world, ada.sessionToken);
    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "rise", target: fallen!.id } }, 11), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    expect([...world.entities.values()].some((item) => item.type === "fallen")).toBe(false);
    expect(world.log.events().some((event) => event.type === "body.rose")).toBe(true);

    call(
      world,
      req(
        "tools/call",
        {
          name: "act",
          arguments: {
            verb: "fall",
            target: bob.identityId,
            position: `${at.x},${at.y},${at.z}`,
            tick: world.clerk.tick,
            until: world.clerk.tick + FALL_LINGER,
          },
        },
        12,
      ),
      ada.sessionToken,
    );
    world.advanceTick();
    const second = [...world.entities.values()].find((item) => item.type === "fallen");
    expect(second).toBeDefined();
    for (let i = 0; i <= FALL_LINGER; i += 1) {
      keepPresent(world, ada.sessionToken);
      world.advanceTick();
    }
    expect([...world.entities.values()].some((item) => item.type === "fallen")).toBe(false);
    expect(world.bodies.get(bob.identityId)).toEqual(home);
    const died = world.log.events().find((event) => event.type === "body.died");
    expect(died?.payload["holder"]).toBe(bob.identityId);
    expect(died?.payload["dest"]).toBe("8,9,10");
  });
});
