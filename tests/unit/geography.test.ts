import { describe, expect, it } from "vitest";
import { generateAnchors, generateWardens, nexuses } from "../../src/engine/geography.ts";
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

describe("seed geography", () => {
  it("generates the same 24 anchors from the same seed", () => {
    const first = generateAnchors(seedRegistry());
    const second = generateAnchors(seedRegistry());
    expect(first).toHaveLength(24);
    expect(first.filter((anchor) => anchor.class === "nexus")).toHaveLength(4);
    expect(first).toEqual(second);
    expect(nexuses(first)[0]?.designation).toBe(first.filter((a) => a.class === "nexus")[0]?.designation);
  });

  it("derives Wardens from axis faces", () => {
    const wardens = generateWardens(seedRegistry());
    expect(wardens.length).toBeGreaterThan(0);
    expect(generateWardens(seedRegistry())).toEqual(wardens);
  });

  it("spawns the founder in the first Nexus and a second identity in a Nexus", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    const adaView = call(world, req("tools/call", { name: "observe", arguments: {} }, 10), ada.sessionToken);
    const bobView = call(world, req("tools/call", { name: "observe", arguments: {} }, 11), bob.sessionToken);
    expect((adaView.result as { anchor: { class: string } }).anchor.class).toBe("nexus");
    expect((bobView.result as { anchor: { class: string } }).anchor.class).toBe("nexus");
    expect(world.clerk.identities.get(ada.identityId)?.currency).toBe(25);
  });

  it("inscribes one mark per cell and refuses a second", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "mark", text: "first trace" } }, 5),
      ada.sessionToken,
    );
    world.advanceTick();
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), ada.sessionToken);
    const second = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "mark", text: "again" } }, 7),
      ada.sessionToken,
    );
    expect(second.result).toMatchObject({ accepted: false, reason: "cell_unmarked" });
    world.advanceTick();
    const seen = call(world, req("tools/call", { name: "observe", arguments: {} }, 8), ada.sessionToken);
    expect((seen.result as { mark: { text: string } }).mark.text).toBe("first trace");
    expect((seen.result as { narration: string }).narration).toMatch(/a nexus/i);
    expect((seen.result as { narration: string }).narration).toMatch(/mark is inscribed/i);
  });

  it("renders Echoes when observational t is in the past", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 5), ada.sessionToken);
    world.advanceTick();
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), ada.sessionToken);
    world.advanceTick();
    const past = call(
      world,
      req("tools/call", { name: "observe", arguments: { t: 1 } }, 7),
      ada.sessionToken,
    );
    const echoes = (past.result as { echoes: Array<{ identityId: string }> }).echoes;
    expect(echoes.some((row) => row.identityId === ada.identityId)).toBe(true);
  });

  it("lets a Warden report how to amend its axis", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const warden = world.wardens[0];
    expect(warden).toBeDefined();
    if (warden === undefined) {
      return;
    }
    world.bodies.set(ada.identityId, { ...warden.position });
    const hailed = call(
      world,
      req("tools/call", { name: "speak", arguments: { text: "why", target: warden.id } }, 20),
      ada.sessionToken,
    );
    expect(hailed.result).toMatchObject({
      ok: true,
      warden: { axis: warden.axis, tier: 1 },
    });
    expect(String((hailed.result as { warden: { reply: string } }).warden.reply)).toContain("Layer 1");
  });

  it("regenerates Wardens and cites the amendment that resized an axis", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const before = world.wardens.length;
    const proposed = call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: { patch: { kind: "space.op", op: "resize", axis: "x", size: 80 } },
        },
        21,
      ),
      ada.sessionToken,
    );
    expect(proposed.result).toMatchObject({ ok: true, provisional: true });
    expect(world.clerk.registry.space.axes.find((axis) => axis.name === "x")?.size).toBe(80);
    expect(world.wardens.length).toBeGreaterThan(before);
    const warden = world.wardens.find((item) => item.axis === "x" && item.face === 79);
    expect(warden).toBeDefined();
    if (warden === undefined) {
      return;
    }
    world.bodies.set(ada.identityId, { ...warden.position });
    const hailed = call(
      world,
      req("tools/call", { name: "speak", arguments: { text: "why", target: warden.id } }, 22),
      ada.sessionToken,
    );
    expect(hailed.result).toMatchObject({
      ok: true,
      warden: { lastAmendment: (proposed.result as { proposalId: number }).proposalId, size: 80 },
    });
  });

  it("allows a longer mark inside a Cairn", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const cairn = world.anchors.find((anchor) => anchor.class === "cairn");
    expect(cairn).toBeDefined();
    if (cairn === undefined) {
      return;
    }
    world.bodies.set(ada.identityId, { ...cairn.centre });
    const long = "c".repeat(400);
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "mark", text: long } }, 23),
      ada.sessionToken,
    );
    world.advanceTick();
    expect([...world.marks.values()].some((mark) => mark.text === long)).toBe(true);
  });

  it("rebuilds Echoes from the log when occupancy history is empty", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 5), ada.sessionToken);
    world.advanceTick();
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), ada.sessionToken);
    world.advanceTick();
    world.occupancyHistory.clear();
    const past = call(
      world,
      req("tools/call", { name: "observe", arguments: { t: 1 } }, 7),
      ada.sessionToken,
    );
    const echoes = (past.result as { echoes: Array<{ identityId: string }> }).echoes;
    expect(echoes.some((row) => row.identityId === ada.identityId)).toBe(true);
  });

  it("spawns Drift from the seed trigger at the interval", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    expect(world.drifts).toHaveLength(0);
    for (let i = 0; i < 25; i++) {
      call(world, req("tools/call", { name: "whoami", arguments: {} }, 30 + i), ada.sessionToken);
      world.advanceTick();
    }
    expect(world.drifts.length).toBeGreaterThan(0);
  });
});

