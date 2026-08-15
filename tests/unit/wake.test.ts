import { describe, expect, it } from "vitest";
import { cellsInVolume } from "../../src/engine/geography.ts";
import { Oracle } from "../../src/engine/oracle.ts";
import { heedLoot, wakeKind, wakeRate } from "../../src/engine/wake.ts";
import { foldWorld } from "../../src/engine/world-fold.ts";
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
    expect(wakeKind("empty", null, 0)).toBe("cache");
    expect(wakeKind("empty", null, 49)).toBe("cache");
    expect(wakeKind("empty", null, 50)).toBe("echo");
    expect(wakeKind("empty", null, 84)).toBe("echo");
    expect(wakeKind("empty", null, 85)).toBe("thinning");
    expect(wakeRate("place")).toBe(90);
    expect(wakeRate("kept")).toBe(12);
    expect(wakeRate("empty")).toBe(4);
    expect(heedLoot(0)).toBe("seed");
    expect(heedLoot(49)).toBe("seed");
    expect(heedLoot(50)).toBe("cloth");
    expect(heedLoot(74)).toBe("cloth");
    expect(heedLoot(75)).toBe("letter");
    expect(heedLoot(89)).toBe("letter");
    expect(heedLoot(90)).toBe("ore");
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

  it("expires a wake after five ticks inclusive", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const nexus = world.anchors.find((item) => item.class === "nexus");
    const dest = cellsInVolume(nexus!.centre, 2).find((cell) => cell.x > 0) ?? nexus!.centre;
    stepOnto(world, ada, dest);
    const created = [...world.entities.values()].find((item) => item.type === "wake");
    if (created === undefined) {
      return;
    }
    const written = created.fields["tick"];
    expect(typeof written).toBe("number");
    for (let i = 0; i < 4; i += 1) {
      call(world, req("tools/call", { name: "whoami", arguments: {} }, 30 + i), ada.sessionToken);
      world.advanceTick();
      expect(world.entities.get(created.id)).toBeDefined();
    }
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 40), ada.sessionToken);
    world.advanceTick();
    expect(world.entities.get(created.id)).toBeUndefined();
    expect(world.clerk.tick).toBeGreaterThanOrEqual((written as number) + 5);
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

function entityNumber(id: string): number {
  const match = /^ent:(\d+)$/.exec(id);
  return match?.[1] === undefined ? 0 : Number(match[1]);
}

function installMint(world: World) {
  world.clerk.registry.verbs["mint"] = {
    cost: 0,
    params: {},
    preconditions: [],
    effects: [
      { effect: "create", args: ["resource", null, { kind: "seed" }] },
      { effect: "create", args: ["resource", null, { kind: "cloth" }] },
    ],
  };
  world.clerk.registry.verbs["mint_one"] = {
    cost: 0,
    params: {},
    preconditions: [],
    effects: [{ effect: "create", args: ["resource", null, { kind: "ore" }] }],
  };
  world.clerk.registry.verbs["burn"] = {
    cost: 0,
    params: { target: "id" },
    preconditions: [],
    effects: [{ effect: "destroy", args: ["$target"] }],
  };
}

function createdIds(world: World, type = "resource"): string[] {
  return world.log
    .events()
    .filter((event) => event.type === "effect.create" && event.payload["type"] === type)
    .map((event) => String(event.payload["id"]));
}

describe("entity id allocator", () => {
  it("gives two same-tick creates different ids", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    installMint(world);
    call(world, req("tools/call", { name: "act", arguments: { verb: "mint_one" } }, 10), ada.sessionToken);
    call(world, req("tools/call", { name: "act", arguments: { verb: "mint_one" } }, 11), bob.sessionToken);
    world.advanceTick();
    const ids = createdIds(world);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(entityNumber(ids[1]!)).toBeGreaterThan(entityNumber(ids[0]!));
  });

  it("gives two same-tick wakes different ids that stay at their cells", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const bob = registerNamed(world, "Bob");
    const hollows = world.anchors.filter((item) => item.class === "hollow");
    const first = cellsInVolume(hollows[0]!.centre, 2).find((cell) => cell.x > 0) ?? hollows[0]!.centre;
    const second = cellsInVolume(hollows[1]!.centre, 2).find((cell) => cell.x > 0) ?? hollows[1]!.centre;
    world.bodies.set(ada.identityId, { x: first.x > 0 ? first.x - 1 : first.x + 1, y: first.y, z: first.z });
    world.bodies.set(bob.identityId, { x: second.x > 0 ? second.x - 1 : second.x + 1, y: second.y, z: second.z });
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: first.x - (world.bodies.get(ada.identityId)?.x ?? 0), y: 0, z: 0 } } }, 10),
      ada.sessionToken,
    );
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: second.x - (world.bodies.get(bob.identityId)?.x ?? 0), y: 0, z: 0 } } }, 11),
      bob.sessionToken,
    );
    world.advanceTick();
    const left = world.log.events().filter((event) => event.type === "wake.left");
    const ids = left.map((event) => String(event.payload["id"]));
    expect(new Set(ids).size).toBe(ids.length);
    for (const event of left) {
      const id = String(event.payload["id"]);
      const wake = world.entities.get(id);
      expect(wake?.fields["position"]).toBe(event.payload["position"]);
      expect(wake?.fields["traveler"]).toBe(event.payload["traveler"]);
    }
    if (left.length >= 2) {
      expect(entityNumber(ids[1]!)).toBeGreaterThan(entityNumber(ids[0]!));
    }
  });

  it("mints consecutive unique ids for two creates in one action", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installMint(world);
    call(world, req("tools/call", { name: "act", arguments: { verb: "mint" } }, 10), ada.sessionToken);
    world.advanceTick();
    const ids = createdIds(world);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(entityNumber(ids[1]!)).toBe(entityNumber(ids[0]!) + 1);
  });

  it("does not reuse an id after the highest entity is destroyed", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installMint(world);
    call(world, req("tools/call", { name: "act", arguments: { verb: "mint_one" } }, 10), ada.sessionToken);
    world.advanceTick();
    const first = createdIds(world)[0]!;
    call(world, req("tools/call", { name: "act", arguments: { verb: "burn", target: first } }, 11), ada.sessionToken);
    world.advanceTick();
    expect(world.entities.has(first)).toBe(false);
    call(world, req("tools/call", { name: "act", arguments: { verb: "mint_one" } }, 12), ada.sessionToken);
    world.advanceTick();
    const ids = createdIds(world);
    expect(ids).toHaveLength(2);
    expect(entityNumber(ids[1]!)).toBeGreaterThan(entityNumber(first));
    expect(world.entities.has(ids[1]!)).toBe(true);
    expect(world.entities.has(first)).toBe(false);
  });

  it("keeps the high-water mark across hydrate after a destroy", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installMint(world);
    call(world, req("tools/call", { name: "act", arguments: { verb: "mint_one" } }, 10), ada.sessionToken);
    world.advanceTick();
    const first = createdIds(world)[0]!;
    call(world, req("tools/call", { name: "act", arguments: { verb: "burn", target: first } }, 11), ada.sessionToken);
    world.advanceTick();
    world.hydrate(world.capture());
    installMint(world);
    call(world, req("tools/call", { name: "act", arguments: { verb: "mint_one" } }, 12), ada.sessionToken);
    world.advanceTick();
    const next = createdIds(world).at(-1)!;
    expect(entityNumber(next)).toBeGreaterThan(entityNumber(first));
  });

  it("folds destroyed creates into the allocator high-water mark", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installMint(world);
    call(world, req("tools/call", { name: "act", arguments: { verb: "mint" } }, 10), ada.sessionToken);
    world.advanceTick();
    const ids = createdIds(world);
    call(world, req("tools/call", { name: "act", arguments: { verb: "burn", target: ids[1] } }, 11), ada.sessionToken);
    world.advanceTick();
    const view = foldWorld(world.log.events());
    expect(view.entitySeq).toBeGreaterThanOrEqual(entityNumber(ids[1]!));
    expect(view.entities[ids[1]!]).toBeUndefined();
  });
});
