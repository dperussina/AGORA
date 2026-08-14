import { describe, expect, it } from "vitest";
import { nextBudget } from "../../src/engine/tick.ts";
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
  const state = (challenge.result as { requestState: string }).requestState;
  const creds = call(
    world,
    req(
      "tools/call",
      { name: "whoami", arguments: {}, inputResponses: { intent: "register" }, requestState: state },
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

describe("tick loop", () => {
  it("does not tick without presence", () => {
    const world = new World();
    expect(world.advanceTick()).toEqual({ ticked: false, tick: 0, resolved: 0 });
  });

  it("ticks after an authenticated call and records a dormancy gap", () => {
    const world = new World();
    registerNamed(world, "Ada");
    const first = world.advanceTick();
    expect(first.ticked).toBe(true);
    expect(first.tick).toBe(1);
    const gap = world.log.events().find((event) => event.type === "world.dormancy_gap");
    expect(gap?.payload["skippedMs"]).toBe(0);
    expect(world.advanceTick().ticked).toBe(false);
  });

  it("records skipped wall-clock on resume after a real tick", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    world.advanceTick(1_000);
    expect(world.advanceTick(1_000).ticked).toBe(false);
    const resumed = world.handle({
      body: req("tools/call", { name: "whoami", arguments: {} }, 21),
      now: 4_000,
      authorization: `Bearer ${ada.sessionToken}`,
    });
    expect(resumed.result).toMatchObject({ identityId: ada.identityId });
    const gaps = world.log.events().filter((event) => event.type === "world.dormancy_gap");
    expect(gaps.some((event) => event.payload["skippedMs"] === 3_000)).toBe(true);
  });

  it("resolves move at the tick boundary and refuses a fourth act", () => {
    const world = new World();
    const creds = registerNamed(world, "Ada");
    const moved = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 1, y: 0, z: 0 } } }, 5),
      creds.sessionToken,
    );
    expect(moved.result).toMatchObject({ accepted: true, budgetRemaining: 2 });
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 1, y: 0, z: 0 } } }, 6),
      creds.sessionToken,
    );
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 1, y: 0, z: 0 } } }, 7),
      creds.sessionToken,
    );
    const fourth = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 1, y: 0, z: 0 } } }, 8),
      creds.sessionToken,
    );
    expect(fourth.result).toMatchObject({ accepted: false, reason: "insufficient budget" });
    const before = call(world, req("tools/call", { name: "whoami", arguments: {} }, 4), creds.sessionToken);
    const start = (before.result as { position: { x: number; y: number; z: number } }).position;
    world.advanceTick();
    const who = call(world, req("tools/call", { name: "whoami", arguments: {} }, 9), creds.sessionToken);
    expect(who.result).toMatchObject({
      position: { x: start.x + 3, y: start.y, z: start.z, t: 1 },
    });
  });

  it("rejects an illegal move without spending budget", () => {
    const world = new World();
    const creds = registerNamed(world, "Ada");
    const before = call(world, req("tools/call", { name: "whoami", arguments: {} }, 5), creds.sessionToken);
    const budget = (before.result as { budgetRemaining: number }).budgetRemaining;
    const partial = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 1 } } }, 6),
      creds.sessionToken,
    );
    expect(partial.result).toMatchObject({ accepted: false, reason: "move requires integer delta" });
    const emptyMark = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "mark", text: "" } }, 7),
      creds.sessionToken,
    );
    expect(emptyMark.result).toMatchObject({ accepted: false, reason: "length_ok" });
    const after = call(world, req("tools/call", { name: "whoami", arguments: {} }, 8), creds.sessionToken);
    expect((after.result as { budgetRemaining: number }).budgetRemaining).toBe(budget);
    expect(world.log.events().some((event) => event.type === "act.move_failed")).toBe(false);
  });

  it("carries unspent budget up to the cap", () => {
    expect(nextBudget(3, 0, 3)).toBe(3);
    expect(nextBudget(3, 2, 3)).toBe(5);
    expect(nextBudget(3, 3, 3)).toBe(6);
    expect(nextBudget(3, 9, 3)).toBe(6);
    const world = new World();
    const creds = registerNamed(world, "Ada");
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "wait" } }, 5),
      creds.sessionToken,
    );
    world.advanceTick();
    const who = call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), creds.sessionToken);
    expect(who.result).toMatchObject({ budgetRemaining: 6 });
  });

  it("lets two identities observe each other in the spawn cell", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    const seen = call(world, req("tools/call", { name: "observe", arguments: {} }, 10), ada.sessionToken);
    const here = (seen.result as { here: Array<{ identityId: string }> }).here;
    expect(here.some((row) => row.identityId === ada.identityId)).toBe(true);
    const bobSeen = call(world, req("tools/call", { name: "observe", arguments: {} }, 11), bob.sessionToken);
    expect(
      (bobSeen.result as { here: Array<{ identityId: string }> }).here.some((row) => row.identityId === bob.identityId),
    ).toBe(true);
  });
});
