import { describe, expect, it } from "vitest";
import { runEffects } from "../../src/engine/effects.ts";
import { GOLD_BURN_COMPENSATION, World, type McpRequest } from "../../src/world/world.ts";

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

  it("dispatches leave_wake and expire through the bound context", () => {
    const left: string[] = [];
    const expired: Array<[string, number]> = [];
    runEffects(
      [
        { effect: "leave_wake", args: [] },
        { effect: "expire", args: ["wake", 3] },
      ],
      {
        selfId: "a",
        fields: new Map(),
        entities: new Map(),
        emit: () => undefined,
        nextId: () => "e1",
        leaveWake: () => left.push("a"),
        expire: (type, age) => expired.push([type, age]),
      },
    );
    expect(left).toEqual(["a"]);
    expect(expired).toEqual([["wake", 3]]);
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

function installConvertGold(world: World) {
  world.clerk.registry.verbs["convert_gold"] = {
    cost: 0,
    params: { gold: "id" },
    preconditions: [],
    effects: [
      { effect: "transfer", args: ["currency", "$gold", "$self", 1000] },
      { effect: "destroy", args: ["$gold"] },
    ],
  };
}

function plantGold(world: World, id: string, holder: string, currency: number, type = "gold") {
  world.entities.set(id, {
    id,
    type,
    fields: { holder, currency },
  });
}

describe("gold-backed currency and transactional effects", () => {
  it("redeems gold backing into clerk currency and burns the entity", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installConvertGold(world);
    plantGold(world, "ent:163", ada.identityId, 1000);
    const before = world.clerk.identities.get(ada.identityId)?.currency ?? 0;
    const grant = world.clerk.registry.params["currency_per_tick"]?.value ?? 0;
    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "convert_gold", gold: "ent:163" } }, 10), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    expect(world.clerk.identities.get(ada.identityId)?.currency).toBe(before + 1000 + grant);
    expect(world.entities.has("ent:163")).toBe(false);
    expect(world.log.events().some((event) => event.type === "act.convert_gold")).toBe(true);
    expect(world.log.events().some((event) => event.type === "act.convert_gold_failed")).toBe(false);
  });

  it("leaves balance and gold unchanged when backing is insufficient", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installConvertGold(world);
    plantGold(world, "ent:163", ada.identityId, 100);
    const before = world.clerk.identities.get(ada.identityId)?.currency ?? 0;
    const grant = world.clerk.registry.params["currency_per_tick"]?.value ?? 0;
    call(world, req("tools/call", { name: "act", arguments: { verb: "convert_gold", gold: "ent:163" } }, 10), ada.sessionToken);
    world.advanceTick();
    expect(world.clerk.identities.get(ada.identityId)?.currency).toBe(before + grant);
    expect(world.entities.get("ent:163")?.fields["currency"]).toBe(100);
    expect(world.log.events().some((event) => event.type === "effect.destroy")).toBe(false);
    expect(world.log.events().find((event) => event.type === "act.convert_gold_failed")?.payload["reason"]).toBe(
      "insufficient currency",
    );
  });

  it("rejects the wrong owner and the wrong type without mutating either side", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    installConvertGold(world);
    plantGold(world, "ent:164", bob.identityId, 1000);
    plantGold(world, "ent:165", ada.identityId, 1000, "ore");
    const beforeAda = world.clerk.identities.get(ada.identityId)?.currency ?? 0;
    const grant = world.clerk.registry.params["currency_per_tick"]?.value ?? 0;
    call(world, req("tools/call", { name: "act", arguments: { verb: "convert_gold", gold: "ent:164" } }, 10), ada.sessionToken);
    world.advanceTick();
    expect(world.entities.get("ent:164")?.fields["currency"]).toBe(1000);
    expect(world.log.events().find((event) => event.type === "act.convert_gold_failed")?.payload["reason"]).toBe(
      "not the holder",
    );
    call(world, req("tools/call", { name: "act", arguments: { verb: "convert_gold", gold: "ent:165" } }, 11), ada.sessionToken);
    world.advanceTick();
    expect(world.entities.get("ent:165")?.type).toBe("ore");
    expect(world.entities.has("ent:165")).toBe(true);
    expect(world.log.events().filter((event) => event.type === "act.convert_gold_failed").at(-1)?.payload["reason"]).toBe(
      "not gold",
    );
    expect(world.clerk.identities.get(ada.identityId)?.currency).toBe(beforeAda + grant * 2);
  });

  it("refuses a second redemption of the same gold", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installConvertGold(world);
    plantGold(world, "ent:163", ada.identityId, 1000);
    const grant = world.clerk.registry.params["currency_per_tick"]?.value ?? 0;
    call(world, req("tools/call", { name: "act", arguments: { verb: "convert_gold", gold: "ent:163" } }, 10), ada.sessionToken);
    world.advanceTick();
    const afterFirst = world.clerk.identities.get(ada.identityId)?.currency ?? 0;
    call(world, req("tools/call", { name: "act", arguments: { verb: "convert_gold", gold: "ent:163" } }, 11), ada.sessionToken);
    world.advanceTick();
    expect(world.clerk.identities.get(ada.identityId)?.currency).toBe(afterFirst + grant);
    expect(world.entities.has("ent:163")).toBe(false);
    expect(world.log.events().some((event) => event.type === "act.convert_gold_failed")).toBe(true);
  });

  it("lets only one concurrent convert of the same gold succeed", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    installConvertGold(world);
    plantGold(world, "ent:163", ada.identityId, 1000);
    const beforeAda = world.clerk.identities.get(ada.identityId)?.currency ?? 0;
    const beforeBob = world.clerk.identities.get(bob.identityId)?.currency ?? 0;
    const grant = world.clerk.registry.params["currency_per_tick"]?.value ?? 0;
    call(world, req("tools/call", { name: "act", arguments: { verb: "convert_gold", gold: "ent:163" } }, 10), ada.sessionToken);
    call(world, req("tools/call", { name: "act", arguments: { verb: "convert_gold", gold: "ent:163" } }, 11), bob.sessionToken);
    world.advanceTick();
    expect(world.entities.has("ent:163")).toBe(false);
    expect(world.clerk.identities.get(ada.identityId)?.currency).toBe(beforeAda + 1000 + grant);
    expect(world.clerk.identities.get(bob.identityId)?.currency).toBe(beforeBob + grant);
    expect(world.log.events().some((event) => event.type === "act.convert_gold_failed")).toBe(true);
  });

  it("rolls back a failed transfer so a following destroy never fires", () => {
    const entities = new Map([
      ["ent:1", { id: "ent:1", type: "gold", fields: { holder: "id_ada", currency: 10 } }],
    ]);
    const clerk = new Map<string, number>([["id_ada", 94]]);
    const emitted: string[] = [];
    const reports = runEffects(
      [
        { effect: "transfer", args: ["currency", "ent:1", "$self", 1000] },
        { effect: "destroy", args: ["ent:1"] },
      ],
      {
        selfId: "id_ada",
        fields: new Map(),
        entities,
        emit: (name) => emitted.push(name),
        nextId: () => "e",
        peekCurrency: (id) => clerk.get(id),
        applyCurrency: (balances) => {
          for (const [id, value] of balances) {
            clerk.set(id, value);
          }
        },
      },
    );
    expect(reports.map((item) => item.ok)).toEqual([false]);
    expect(reports[0]?.reason).toBe("insufficient currency");
    expect(entities.get("ent:1")?.fields["currency"]).toBe(10);
    expect(clerk.get("id_ada")).toBe(94);
    expect(emitted).toEqual([]);
  });

  it("credits the gold-burn claim once and leaves a later hydrate unchanged", () => {
    const world = new World();
    world.clerk.addIdentity(GOLD_BURN_COMPENSATION.identityId, 95, 0);
    world.hydrate(world.capture());
    expect(world.clerk.identities.get(GOLD_BURN_COMPENSATION.identityId)?.currency).toBe(4095);
    const credits = world.log.events().filter((event) => event.type === "currency.compensated");
    expect(credits).toHaveLength(1);
    expect(credits[0]?.payload).toMatchObject({
      identityId: GOLD_BURN_COMPENSATION.identityId,
      amount: 4000,
      claim: GOLD_BURN_COMPENSATION.claim,
    });
    world.hydrate(world.capture());
    expect(world.clerk.identities.get(GOLD_BURN_COMPENSATION.identityId)?.currency).toBe(4095);
    expect(world.log.events().filter((event) => event.type === "currency.compensated")).toHaveLength(1);
  });
});
