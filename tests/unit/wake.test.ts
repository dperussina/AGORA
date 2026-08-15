import { describe, expect, it } from "vitest";
import { cellsInVolume } from "../../src/engine/geography.ts";
import { Oracle } from "../../src/engine/oracle.ts";
import { wakeKind, wakeRate } from "../../src/engine/wake.ts";
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

function stepOnto(
  world: World,
  creds: { identityId: string; sessionToken: string },
  dest: { x: number; y: number; z: number },
) {
  const from = {
    x: dest.x > 0 ? dest.x - 1 : dest.x + 1,
    y: dest.y,
    z: dest.z,
  };
  world.bodies.set(creds.identityId, from);
  call(
    world,
    req("tools/call", {
      name: "act",
      arguments: { verb: "move", delta: { x: dest.x - from.x, y: 0, z: 0 } },
    }),
    creds.sessionToken,
  );
  world.advanceTick();
}

describe("wake hook", () => {
  it("maps kind from the destination class", () => {
    expect(wakeKind("place", "hollow")).toBe("stirring");
    expect(wakeKind("place", "nexus")).toBe("guestmark");
    expect(wakeKind("place", "vantage")).toBe("thinning");
    expect(wakeKind("place", "cairn")).toBe("thinning");
    expect(wakeKind("kept", null)).toBe("thinning");
    expect(wakeKind("empty", null)).toBe("thinning");
    expect(wakeRate("place")).toBe(90);
    expect(wakeRate("kept")).toBe(12);
    expect(wakeRate("empty")).toBe(4);
  });

  it("can leave a wake on a place and keeps move.effects empty", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    expect(world.clerk.registry.verbs["move"]?.effects).toEqual([]);
    const hollow = world.anchors.find((item) => item.class === "hollow");
    expect(hollow).toBeDefined();
    const dest = cellsInVolume(hollow!.centre, 2).find((cell) => cell.x > 0) ?? hollow!.centre;
    stepOnto(world, ada, dest);
    const tip = world.log.events().find((event) => event.type === "act.move");
    expect(tip).toBeDefined();
    const oracle = new Oracle(`${tip!.hash}:wake:${ada.identityId}:${dest.x},${dest.y},${dest.z}:${tip!.tick}`);
    const hit = oracle.int(100) < 90;
    const wakes = [...world.entities.values()].filter((item) => item.type === "wake");
    if (hit) {
      expect(wakes).toHaveLength(1);
      expect(wakes[0]?.fields["kind"]).toBe("stirring");
      expect(wakes[0]?.fields["traveler"]).toBe(ada.identityId);
      expect(wakes[0]?.fields["position"]).toBe(`${dest.x},${dest.y},${dest.z}`);
      expect(world.log.events().some((event) => event.type === "wake.left")).toBe(true);
      const seen = call(
        world,
        req("tools/call", { name: "observe", arguments: {} }, 20),
        ada.sessionToken,
      ).result as { wake: { kind: string; traveler: string } | null; narration: string };
      expect(seen.wake?.kind).toBe("stirring");
      expect(seen.wake?.traveler).toBe(ada.identityId);
      expect(seen.narration).toContain("wake");
      const inspected = call(
        world,
        req("tools/call", { name: "inspect", arguments: { target: `${dest.x},${dest.y},${dest.z}` } }, 21),
        ada.sessionToken,
      ).result as { fields: { wake: { kind: string } } };
      expect(inspected.fields.wake.kind).toBe("stirring");
    } else {
      expect(wakes).toHaveLength(0);
    }
  });

  it("does not stack a second wake for the same traveler and cell", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const nexus = world.anchors.find((item) => item.class === "nexus");
    expect(nexus).toBeDefined();
    const dest = cellsInVolume(nexus!.centre, 2).find((cell) => cell.x > 0) ?? nexus!.centre;
    stepOnto(world, ada, dest);
    stepOnto(world, ada, dest);
    const wakes = [...world.entities.values()].filter(
      (item) =>
        item.type === "wake" &&
        item.fields["traveler"] === ada.identityId &&
        item.fields["position"] === `${dest.x},${dest.y},${dest.z}`,
    );
    expect(wakes.length).toBeLessThanOrEqual(1);
  });

  it("expires a wake after three ticks", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const nexus = world.anchors.find((item) => item.class === "nexus");
    const dest = cellsInVolume(nexus!.centre, 2).find((cell) => cell.x > 0) ?? nexus!.centre;
    stepOnto(world, ada, dest);
    const created = [...world.entities.values()].find((item) => item.type === "wake");
    if (created === undefined) {
      return;
    }
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 30), ada.sessionToken);
    world.advanceTick();
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 31), ada.sessionToken);
    world.advanceTick();
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 32), ada.sessionToken);
    world.advanceTick();
    expect(world.entities.get(created.id)).toBeUndefined();
  });

  it("fires a voted move.end emit after a successful move", () => {
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
              kind: "rule.define_trigger",
              id: "cheer",
              when: "move.end",
              condition: null,
              effects: [{ effect: "emit", args: ["stepped"] }],
            },
          },
        },
        5,
      ),
      ada.sessionToken,
    );
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), ada.sessionToken);
    world.advanceTick();
    const at = world.bodies.get(ada.identityId) ?? { x: 32, y: 32, z: 32 };
    stepOnto(world, ada, { x: Math.min(63, at.x + 1), y: at.y, z: at.z });
    expect(world.log.events().some((event) => event.type === "stepped")).toBe(true);
  });
});
