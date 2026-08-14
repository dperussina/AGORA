import { describe, expect, it } from "vitest";
import { publicRead } from "../../src/public/read.ts";
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
  return creds;
}

describe("ratification and public surfaces", () => {
  it("dockets provisionals after residency and reverts a failed ratification", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: { patch: { kind: "text.set", path: "text.world_name", value: "Sandbox" } },
        },
        5,
      ),
      ada.sessionToken,
    );
    expect(world.clerk.registry.text.world_name).toBe("Sandbox");
    const others = ["Bob", "Cam", "Dan"].map((name) => registerNamed(world, name));
    for (const person of [ada, ...others]) {
      const identity = world.clerk.identities.get(person.identityId);
      if (identity !== undefined) {
        identity.ticksPresent = 80;
      }
    }
    world.residencyLeft = 0;
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 20), ada.sessionToken);
    world.advanceTick();
    expect(world.clerk.docket().some((item) => item.ratification === true)).toBe(true);
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 21), ada.sessionToken);
    world.advanceTick();
    expect(world.clerk.registry.text.world_name).toBeNull();
    expect(world.log.events().some((event) => event.type === "amendment.reverted")).toBe(true);
  });

  it("refuses an occupied cell and lists listen + public identity endpoints", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    const adaPos = world.bodies.get(ada.identityId)!;
    world.bodies.set(bob.identityId, { x: adaPos.x + 1, y: adaPos.y, z: adaPos.z });
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 1, y: 0, z: 0 } } }, 5),
      ada.sessionToken,
    );
    world.advanceTick();
    expect(world.log.events().some((event) => event.payload["reason"] === "destination occupied")).toBe(true);
    const listen = world.handle({
      body: req("subscriptions/listen", { types: ["record"] }),
      now: 1_000,
    });
    expect(listen.result).toMatchObject({ resultType: "complete", subscriptionId: "record" });
    const identities = publicRead(world, "/identities");
    expect((identities["identities"] as unknown[]).length).toBe(2);
    expect(publicRead(world, "/segments")).toHaveProperty("merkleRoot");
    expect(publicRead(world, "/state")).toHaveProperty("registry");
  });
});
