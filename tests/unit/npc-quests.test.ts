import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "../../src/mcp/catalog.ts";
import { seedRegistry } from "../../src/engine/registry.ts";
import { publicRead } from "../../src/public/read.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

const FORBIDDEN = ["quest", "objective", "bounty", "xp", "reward", "create", "accept", "complete"];

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

function propose(world: World, token: string, patch: Record<string, unknown>) {
  return call(world, req("tools/call", { name: "propose", arguments: { patch } }), token);
}

describe("npc and quest guard", () => {
  it("forbids a quest tool, type, or create tool at genesis", () => {
    expect(TOOL_NAMES).toHaveLength(10);
    expect(TOOL_NAMES).not.toContain("create");
    expect(TOOL_NAMES).not.toContain("quest");
    const types = Object.keys(seedRegistry().types).sort();
    expect(types).toEqual(["agent", "anchor", "drift", "mark", "warden"]);
    const catalog = `${TOOL_NAMES.join(" ")} ${types.join(" ")}`;
    for (const word of FORBIDDEN) {
      expect(catalog.split(/\s+/)).not.toContain(word);
    }
  });

  it("cites what a warden and a drift personify", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const warden = world.wardens[0];
    expect(warden).toBeDefined();
    const hailed = call(
      world,
      req("tools/call", { name: "inspect", arguments: { target: warden!.id } }),
      ada.sessionToken,
    ).result as { fields: { personifies: string; createdBy: string; amendPath: string } };
    expect(hailed.fields.personifies).toBe(`space.axes.${warden!.axis}`);
    expect(hailed.fields.createdBy).toBe("derived");
    expect(hailed.fields.amendPath).toBe(`space.axes.${warden!.axis}.size`);

    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    for (let i = 0; i < 26; i += 1) {
      world.advanceTick();
      call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    }
    const drift = world.drifts[0];
    expect(drift).toBeDefined();
    const seen = call(
      world,
      req("tools/call", { name: "inspect", arguments: { target: drift!.id } }),
      ada.sessionToken,
    ).result as { fields: { personifies: string; createdBy: number | string } };
    expect(seen.fields.personifies).toBe("types.drift");
    expect(seen.fields.createdBy).not.toBeUndefined();

    const past = call(
      world,
      req("tools/call", { name: "observe", arguments: { t: 0 } }),
      ada.sessionToken,
    ).result as { echoes: unknown[] };
    expect(Array.isArray(past.echoes)).toBe(true);
    const actEcho = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 0, y: 0, z: 0 }, target: "echo:0" } }),
      ada.sessionToken,
    );
    expect(actEcho.result).toMatchObject({ accepted: false, reason: "echoes are observational" });
  });

  it("creates an inspectable automaton from a voted type and trigger", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    propose(world, ada.sessionToken, {
      kind: "schema.define_type",
      name: "mote",
      fields: { hue: { type: "string" } },
    });
    propose(world, ada.sessionToken, {
      kind: "rule.define_trigger",
      id: "mote_spawn",
      when: "tick_boundary",
      condition: null,
      effects: [{ effect: "create", args: ["mote", { x: 3, y: 4, z: 5 }, { hue: "ash" }] }],
    });
    expect(world.clerk.registry.types["mote"]).toBeDefined();
    expect(world.clerk.registry.triggers["mote_spawn"]).toBeDefined();
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    const id = [...world.entities.keys()][0];
    expect(id).toBeDefined();
    expect(id).toMatch(/^ent:/);
    if (id === undefined) {
      return;
    }
    const seen = call(
      world,
      req("tools/call", { name: "inspect", arguments: { target: id } }),
      ada.sessionToken,
    ).result as { fields: { type: string; personifies: string; createdBy: number; hue: string } };
    expect(seen.fields.type).toBe("mote");
    expect(seen.fields.personifies).toBe("types.mote");
    expect(seen.fields.hue).toBe("ash");
    expect(typeof seen.fields.createdBy).toBe("number");
    const created = world.log.events().find((event) => event.type === "effect.create" && event.payload["id"] === id);
    expect(created).toBeDefined();
    expect(created!.payload["createdBy"]).toBe(created!.seq);
    expect(created!.payload["x"]).toBe(3);
    expect(created!.payload["y"]).toBe(4);
    expect(created!.payload["z"]).toBe(5);
    expect(seen.fields.createdBy).toBe(created!.seq);
    const map = publicRead(world, "/map") as {
      entities: Array<{ id: string; type: string; position: { x: number; y: number; z: number } }>;
    };
    expect(map.entities).toEqual([{ id, type: "mote", position: { x: 3, y: 4, z: 5 } }]);

    const replay = new World(world.log);
    replay.hydrate(world.capture());
    const restored = replay.entities.get(id);
    expect(restored).toBeDefined();
    expect(restored!.id).toBe(id);
    expect(restored!.type).toBe("mote");
    expect(restored!.position).toEqual({ x: 3, y: 4, z: 5 });
    expect(restored!.createdBy).toBe(created!.seq);
    expect(restored!.fields["hue"]).toBe("ash");
  });

  it("cites a trigger when it sets a field", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    propose(world, ada.sessionToken, {
      kind: "rule.define_trigger",
      id: "pay_once",
      when: "tick_boundary",
      condition: null,
      effects: [{ effect: "set_field", args: [ada.identityId, "paid", 1] }],
    });
    call(world, req("tools/call", { name: "whoami", arguments: {} }), ada.sessionToken);
    world.advanceTick();
    expect(world.fields.get(ada.identityId)?.["paid"]).toBe(1);
    expect(
      world.log.events().some((event) => event.type === "effect.set_field" && event.payload["triggerId"] === "pay_once"),
    ).toBe(true);
  });

  it("does not let automata vote or accrue standing", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const noAuth = call(world, req("tools/call", { name: "vote", arguments: { proposal_id: 1, position: "for" } }));
    expect(noAuth.result).not.toMatchObject({ ok: true });
    const asEntity = call(
      world,
      req("tools/call", { name: "vote", arguments: { proposal_id: 1, position: "for" } }),
      "ent:1",
    );
    expect(asEntity.result).not.toMatchObject({ ok: true });
    expect([...world.standing.keys()].every((id) => world.identities.identities.has(id))).toBe(true);
    expect(world.identities.identities.has("ent:1")).toBe(false);
    expect(world.identities.identities.has(ada.identityId)).toBe(true);
  });
});
