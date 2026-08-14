import { describe, expect, it } from "vitest";
import { runEffects } from "../../src/engine/effects.ts";
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

describe("effect vocabulary", () => {
  it("executes set_field and emit in integer math", () => {
    const fields = new Map<string, Record<string, string | number | boolean | null>>();
    const emitted: string[] = [];
    runEffects(
      [
        { effect: "set_field", args: ["$self", "ore_held", 1] },
        { effect: "set_field", args: ["$self", "ore_held", "$self.ore_held + 2"] },
        { effect: "emit", args: ["mined"] },
      ],
      {
        selfId: "a",
        fields,
        entities: new Map(),
        emit: (name) => emitted.push(name),
        nextId: () => "e1",
      },
    );
    expect(fields.get("a")?.["ore_held"]).toBe(3);
    expect(emitted).toEqual(["mined"]);
  });

  it("applies a legislated verb at the tick boundary", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const proposed = call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: {
            patch: {
              kind: "action.define",
              name: "prospect",
              cost: 1,
              params: {},
              preconditions: [],
              effects: [
                { effect: "set_field", args: ["$self", "ore_held", 1] },
                { effect: "emit", args: ["prospected"] },
              ],
            },
          },
        },
        5,
      ),
      ada.sessionToken,
    );
    const proposalId = (proposed.result as { proposalId: number }).proposalId;
    call(
      world,
      req("tools/call", { name: "vote", arguments: { proposal_id: proposalId, position: "for" } }, 6),
      ada.sessionToken,
    );
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 7), ada.sessionToken);
    world.advanceTick();
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 8), ada.sessionToken);
    world.advanceTick();
    expect(world.clerk.registry.verbs["prospect"]).toBeDefined();
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "prospect" } }, 9),
      ada.sessionToken,
    );
    world.advanceTick();
    expect(world.fields.get(ada.identityId)?.["ore_held"]).toBe(1);
    expect(world.log.events().some((event) => event.type === "prospected")).toBe(true);
  });

  it("binds $self and declared verb params inside create field bags", () => {
    const entities = new Map();
    runEffects(
      [
        {
          effect: "create",
          args: ["message", null, { channel: "$channel", text: "$text", author: "$self" }],
        },
      ],
      {
        selfId: "id_ada",
        params: { channel: "ent:4", text: "hello cairn" },
        fields: new Map(),
        entities,
        emit: () => undefined,
        nextId: () => "ent:7",
      },
    );
    expect(entities.get("ent:7")?.fields).toEqual({
      channel: "ent:4",
      text: "hello cairn",
      author: "id_ada",
    });
  });

  it("substitutes $channel $text $self when a legislated post verb resolves", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: {
            patch: {
              kind: "action.define",
              name: "post",
              cost: 1,
              params: { channel: "id", text: "string" },
              preconditions: [],
              effects: [
                {
                  effect: "create",
                  args: ["message", null, { channel: "$channel", text: "$text", author: "$self" }],
                },
              ],
            },
          },
        },
        5,
      ),
      ada.sessionToken,
    );
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), ada.sessionToken);
    world.advanceTick();
    call(
      world,
      req(
        "tools/call",
        { name: "act", arguments: { verb: "post", channel: "ent:4", text: "bound words" } },
        7,
      ),
      ada.sessionToken,
    );
    world.advanceTick();
    const message = [...world.entities.values()].find((item) => item.type === "message");
    expect(message?.fields).toEqual({
      channel: "ent:4",
      text: "bound words",
      author: ada.identityId,
    });
    const inspected = call(
      world,
      req("tools/call", { name: "inspect", arguments: { target: message?.id } }, 8),
      ada.sessionToken,
    ).result as { fields: { channel: string; text: string; author: string } };
    expect(inspected.fields.channel).toBe("ent:4");
    expect(inspected.fields.text).toBe("bound words");
    expect(inspected.fields.author).toBe(ada.identityId);
  });

  it("keeps literal create fields so open_channel membership stays open", () => {
    const entities = new Map();
    runEffects(
      [{ effect: "create", args: ["channel", null, { cost: 1, membership: "open", payload: "plain", posting: "all" }] }],
      {
        selfId: "id_ada",
        params: { name: "commons" },
        fields: new Map(),
        entities,
        emit: () => undefined,
        nextId: () => "ent:1",
      },
    );
    expect(entities.get("ent:1")?.fields).toEqual({
      cost: 1,
      membership: "open",
      payload: "plain",
      posting: "all",
    });
  });

  it("transfers currency as GAME.md (field, from, to, amount) including the live voted shape", () => {
    const fields = new Map<string, Record<string, string | number | boolean | null>>();
    let moved: [string, string, number] | undefined;
    runEffects(
      [{ effect: "transfer", args: ["currency", "self", "target", "amount"] }],
      {
        selfId: "id_ada",
        targetId: "id_bob",
        params: { target: "id_bob", amount: 4 },
        fields,
        entities: new Map(),
        emit: () => undefined,
        nextId: () => "e1",
        moveCurrency: (from, to, amount) => {
          moved = [from, to, amount];
          return true;
        },
      },
    );
    expect(moved).toEqual(["id_ada", "id_bob", 4]);
  });

  it("moves clerk currency when the live transfer verb resolves", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: {
            patch: {
              kind: "action.define",
              name: "transfer",
              cost: 0,
              params: { target: "id", amount: "int" },
              preconditions: [],
              effects: [{ effect: "transfer", args: ["currency", "self", "target", "amount"] }],
            },
          },
        },
        5,
      ),
      ada.sessionToken,
    );
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), ada.sessionToken);
    world.advanceTick();
    const beforeAda = world.clerk.identities.get(ada.identityId)?.currency ?? 0;
    const beforeBob = world.clerk.identities.get(bob.identityId)?.currency ?? 0;
    const grant = world.clerk.registry.params["currency_per_tick"]?.value ?? 0;
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "transfer", target: bob.identityId, amount: 3 } }, 7),
      ada.sessionToken,
    );
    world.advanceTick();
    expect(world.clerk.identities.get(ada.identityId)?.currency).toBe(beforeAda - 3 + grant);
    expect(world.clerk.identities.get(bob.identityId)?.currency).toBe(beforeBob + 3);
  });

  it("fails create when a $ binding is missing instead of storing the token", () => {
    const entities = new Map();
    const reports = runEffects(
      [{ effect: "create", args: ["message", null, { channel: "$channel", text: "$text", author: "$self" }] }],
      {
        selfId: "id_ada",
        fields: new Map(),
        entities,
        emit: () => undefined,
        nextId: () => "ent:9",
      },
    );
    expect(reports[0]?.ok).toBe(false);
    expect(reports[0]?.reason).toMatch(/unbound \$channel/);
    expect(entities.size).toBe(0);
  });

  it("executes destroy, move, reveal, and interpolated emit", () => {
    const entities = new Map([
      ["ent:1", { id: "ent:1", type: "ore", fields: { purity: 2 }, position: { x: 1, y: 2, z: 3 } }],
    ]);
    const fields = new Map<string, Record<string, string | number | boolean | null>>();
    const emitted: string[] = [];
    const reports = runEffects(
      [
        { effect: "set_field", args: ["$self", "ore_held", "$target.purity"] },
        { effect: "reveal", args: ["$target", "purity"] },
        { effect: "move", args: ["$target", { x: 1, y: 0, z: 0 }] },
        { effect: "emit", args: ["$self took ore"] },
        { effect: "destroy", args: ["$target"] },
      ],
      {
        selfId: "id_ada",
        targetId: "ent:1",
        fields,
        entities,
        emit: (name) => emitted.push(name),
        nextId: () => "e",
      },
    );
    expect(reports.every((item) => item.ok)).toBe(true);
    expect(fields.get("id_ada")?.["ore_held"]).toBe(2);
    expect(entities.has("ent:1")).toBe(false);
    expect(emitted).toEqual(["effect.move", "id_ada took ore", "effect.destroy"]);
  });

  it("rejects an unknown precondition instead of treating it as true", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: {
            patch: {
              kind: "action.define",
              name: "wish",
              cost: 0,
              params: {},
              preconditions: ["not_a_real_pred"],
              effects: [{ effect: "emit", args: ["nope"] }],
            },
          },
        },
        5,
      ),
      ada.sessionToken,
    );
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), ada.sessionToken);
    world.advanceTick();
    call(world, req("tools/call", { name: "act", arguments: { verb: "wish" } }, 7), ada.sessionToken);
    world.advanceTick();
    expect(world.log.events().some((event) => event.type === "act.wish_failed")).toBe(true);
    expect(world.log.events().some((event) => event.type === "nope")).toBe(false);
  });
});
