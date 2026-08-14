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
});
