import { describe, expect, it } from "vitest";
import { listTools } from "../../src/mcp/catalog.ts";
import { seedRegistry } from "../../src/engine/registry.ts";
import { cellsInVolume } from "../../src/engine/geography.ts";
import { FOLLOW_FLOOR_IDS, pickFollowFloor, signStep, wakeKind } from "../../src/engine/wake.ts";
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

function installWakeVerbs(world: World) {
  world.clerk.registry.verbs["heed"] = {
    cost: 1,
    params: { target: "id" },
    preconditions: [],
    effects: [
      { effect: "destroy", args: ["$target"] },
      { effect: "create", args: ["resource", null, { holder: "$self", kind: "seed", qty: 1 }] },
      { effect: "emit", args: ["wake.heeded"] },
    ],
  };
  world.clerk.registry.verbs["follow"] = {
    cost: 1,
    params: { target: "id" },
    preconditions: [],
    effects: [
      { effect: "destroy", args: ["$target"] },
      { effect: "emit", args: ["wake.followed"] },
    ],
  };
}

function plantWake(
  world: World,
  id: string,
  kind: string,
  position: { x: number; y: number; z: number },
  traveler: string,
) {
  world.entities.set(id, {
    id,
    type: "wake",
    fields: { kind, position: `${position.x},${position.y},${position.z}`, traveler, tick: world.clerk.tick },
    position: { ...position },
  });
}

describe("heed and follow", () => {
  it("lists heed and follow on the act enum", () => {
    const verbs = (listTools(seedRegistry()).find((tool) => tool.name === "act")?.inputSchema as {
      properties: { verb: { enum: string[] } };
    }).properties.verb.enum;
    expect(verbs).toContain("heed");
    expect(verbs).toContain("follow");
  });

  it("heeds guestmark and cache from the loot table, echo as letter, stirring as notice, and rejects thinning", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installWakeVerbs(world);
    const at = world.bodies.get(ada.identityId)!;
    plantWake(world, "ent:10", "guestmark", at, ada.identityId);
    plantWake(world, "ent:11", "stirring", at, ada.identityId);
    plantWake(world, "ent:12", "thinning", at, ada.identityId);
    plantWake(world, "ent:13", "echo", at, ada.identityId);
    plantWake(world, "ent:14", "cache", at, ada.identityId);

    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "heed", target: "ent:10" } }, 10), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    const guest = world.log.events().find((event) => event.type === "wake.heeded" && event.payload["id"] === "ent:10");
    expect(["seed", "cloth", "letter", "ore"]).toContain(guest?.payload["loot"]);
    expect(
      [...world.entities.values()].some(
        (item) => item.type === "resource" && item.fields["kind"] === guest?.payload["loot"] && item.fields["holder"] === ada.identityId,
      ),
    ).toBe(true);
    expect(world.entities.get("ent:10")).toBeUndefined();

    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "heed", target: "ent:11" } }, 11), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    expect(world.entities.get("ent:11")).toBeUndefined();
    expect([...world.entities.values()].some((item) => item.type === "resource" && item.fields["kind"] === "notice")).toBe(true);
    expect(world.log.events().some((event) => event.type === "wake.heeded" && event.payload["id"] === "ent:11" && event.payload["loot"] === "notice")).toBe(true);

    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "heed", target: "ent:12" } }, 12), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: false, reason: "not a live heed" });

    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "heed", target: "ent:13" } }, 13), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    expect([...world.entities.values()].some((item) => item.type === "resource" && item.fields["kind"] === "letter")).toBe(true);

    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "heed", target: "ent:14" } }, 14), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    const cache = world.log.events().find((event) => event.type === "wake.heeded" && event.payload["id"] === "ent:14");
    expect(["seed", "cloth", "letter", "ore"]).toContain(cache?.payload["loot"]);
  });

  it("rejects heed of an expired wake free", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installWakeVerbs(world);
    const at = world.bodies.get(ada.identityId)!;
    world.entities.set("ent:9", {
      id: "ent:9",
      type: "wake",
      fields: { kind: "guestmark", position: `${at.x},${at.y},${at.z}`, traveler: ada.identityId, tick: world.clerk.tick - 5 },
      position: { ...at },
    });
    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "heed", target: "ent:9" } }, 9), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: false, reason: "not a live wake" });
  });

  it("rejects heed of a non-wake free", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installWakeVerbs(world);
    world.entities.set("ent:4", { id: "ent:4", type: "block", fields: { kind: "stone" }, position: { x: 1, y: 1, z: 1 } });
    const blocked = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "heed", target: "ent:4" } }, 10),
      ada.sessionToken,
    );
    expect(blocked.result).toMatchObject({ accepted: false, reason: "not a live wake" });
  });

  it("follows a thinning one cell toward Naming/Echo/After and does not roll a wake", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installWakeVerbs(world);
    world.anchors.push(
      { designation: "3ae4", class: "cairn", centre: { x: 8, y: 8, z: 8 } },
      { designation: "5d0c", class: "cairn", centre: { x: 50, y: 8, z: 8 } },
      { designation: "774b", class: "cairn", centre: { x: 8, y: 50, z: 8 } },
    );
    const floor = { designation: "cafe", class: "vantage" as const, centre: { x: 20, y: 20, z: 20 } };
    world.anchors.push(floor);
    const at = { x: 21, y: 20, z: 20 };
    world.bodies.set(ada.identityId, at);
    plantWake(world, "ent:20", "thinning", at, ada.identityId);
    const here = world.anchors.find((item) =>
      cellsInVolume(item.centre, 2).some((cell) => cell.x === at.x && cell.y === at.y && cell.z === at.z),
    );
    const floors = FOLLOW_FLOOR_IDS.map((id) => world.anchors.find((item) => item.designation === id)).filter(
      (item): item is NonNullable<typeof item> => item !== undefined,
    );
    const picked = pickFollowFloor(at, here?.designation ?? null, floors);
    expect(picked).toBeDefined();
    const toward = signStep(at, picked!.centre);
    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "follow", target: "ent:20" } }, 20), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: true });
    world.advanceTick();
    expect(world.bodies.get(ada.identityId)).toEqual({
      x: at.x + toward.x,
      y: at.y + toward.y,
      z: at.z + toward.z,
    });
    expect(world.entities.get("ent:20")).toBeUndefined();
    expect(world.log.events().some((event) => event.type === "wake.followed")).toBe(true);
    expect(world.log.events().some((event) => event.type === "wake.left")).toBe(false);
    expect([...world.entities.values()].some((item) => item.type === "resource")).toBe(false);
  });

  it("rejects follow of a guestmark or stirring free", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    installWakeVerbs(world);
    const at = world.bodies.get(ada.identityId)!;
    plantWake(world, "ent:30", "guestmark", at, ada.identityId);
    plantWake(world, "ent:31", "stirring", at, ada.identityId);
    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "follow", target: "ent:30" } }, 30), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: false, reason: "not a live thinning" });
    expect(
      call(world, req("tools/call", { name: "act", arguments: { verb: "follow", target: "ent:31" } }, 31), ada.sessionToken)
        .result,
    ).toMatchObject({ accepted: false, reason: "not a live thinning" });
  });

  it("classifies a vantage centre as a place and logs the roll", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const vantage = world.anchors.find((item) => item.class === "vantage");
    expect(vantage).toBeDefined();
    expect(wakeKind("place", "vantage")).toBe("thinning");
    const dest = vantage!.centre;
    const from = { x: dest.x > 0 ? dest.x - 1 : dest.x + 1, y: dest.y, z: dest.z };
    world.bodies.set(ada.identityId, from);
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: dest.x - from.x, y: 0, z: 0 } } }, 40),
      ada.sessionToken,
    );
    world.advanceTick();
    const rolled = world.log.events().find((event) => event.type === "wake.rolled");
    expect(rolled?.payload["cellClass"]).toBe("place");
    expect(rolled?.payload["anchorClass"]).toBe("vantage");
    expect(rolled?.payload["designation"]).toBe(vantage!.designation);
    expect(rolled?.payload["rate"]).toBe(90);
  });

  it("picks the closest follow floor that is not the current one", () => {
    const picked = pickFollowFloor(
      { x: 20, y: 20, z: 20 },
      "3ae4",
      [
        { designation: "3ae4", centre: { x: 8, y: 8, z: 8 } },
        { designation: "5d0c", centre: { x: 22, y: 20, z: 20 } },
        { designation: "774b", centre: { x: 60, y: 60, z: 60 } },
      ],
    );
    expect(picked?.designation).toBe("5d0c");
  });
});
