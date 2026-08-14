import { describe, expect, it } from "vitest";
import { assessStanding, broadcastRadius, decayStanding } from "../../src/engine/standing.ts";
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

describe("standing", () => {
  it("decays in integer math and does not use standing as vote weight", () => {
    expect(decayStanding({ fame: 100, notoriety: 1000 })).toEqual({ fame: 98, notoriety: 995 });
    const assessed = assessStanding(
      new Map([["a", { fame: 0, notoriety: 0 }]]),
      [{ actorId: "a", witnessId: "b", kind: "fame", eventSeq: 1 }],
      1,
    );
    expect((assessed.next.get("a")?.fame ?? 0) > 0).toBe(true);
    expect(broadcastRadius(10, true, 12, 4)).toBe((12 + 5) * 4);
  });

  it("requires a witness and records a ledger", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    const adaPos = world.bodies.get(ada.identityId)!;
    world.bodies.set(bob.identityId, { x: adaPos.x + 1, y: adaPos.y, z: adaPos.z });
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "mark", text: "seen" } }, 5),
      ada.sessionToken,
    );
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), bob.sessionToken);
    world.advanceTick();
    expect((world.standing.get(ada.identityId)?.fame ?? 0) > 0).toBe(true);
    expect(world.ledger.some((row) => row.actorId === ada.identityId && row.kind === "fame" && row.eventSeq >= 0)).toBe(
      true,
    );
  });

  it("delivers positional speech and refuses channels", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    const adaPos = world.bodies.get(ada.identityId)!;
    world.bodies.set(bob.identityId, { x: adaPos.x + 1, y: adaPos.y, z: adaPos.z });
    const denied = call(
      world,
      req("tools/call", { name: "speak", arguments: { text: "hi", channel: "general" } }, 5),
      ada.sessionToken,
    );
    expect(denied.result).toMatchObject({ ok: false });
    const spoken = call(
      world,
      req("tools/call", { name: "speak", arguments: { text: "hello", broadcast: true } }, 6),
      ada.sessionToken,
    );
    expect(spoken.result).toMatchObject({ ok: true, budgetSpent: 0 });
    const heard = call(world, req("tools/call", { name: "observe", arguments: {} }, 7), bob.sessionToken);
    expect((heard.result as { heard: Array<{ text: string }> }).heard.some((row) => row.text === "hello")).toBe(true);
    expect((heard.result as { record: unknown[] }).record.length).toBeGreaterThan(0);
    const seen = call(world, req("tools/call", { name: "observe", arguments: {} }, 8), ada.sessionToken);
    const nearby = (seen.result as { nearby: Array<{ name: string }> }).nearby;
    expect(nearby.some((row) => row.name === "an agent")).toBe(true);
  });
});
