import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteLog } from "../../src/engine/sqlite-log.ts";
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
  return creds;
}

describe("world replay", () => {
  it("reconstructs bodies, marks, names, and applied patches from the log", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "mark", text: "first trace" } }, 5),
      ada.sessionToken,
    );
    const start = world.bodies.get(ada.identityId)!;
    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 1, y: 0, z: 0 } } }, 6),
      ada.sessionToken,
    );
    call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: { patch: { kind: "text.set", path: "text.world_name", value: "Replay" } },
        },
        7,
      ),
      ada.sessionToken,
    );
    world.advanceTick();
    const view = foldWorld(world.log.events());
    expect(view.names[ada.identityId]).toBe("Ada");
    expect(view.founder).toBe(ada.identityId);
    expect(view.bodies[ada.identityId]).toEqual({ x: start.x + 1, y: start.y, z: start.z });
    expect(Object.values(view.marks).some((mark) => mark.text === "first trace")).toBe(true);
    expect(view.registry.text.world_name).toBe("Replay");
    expect(view.fold.rulesetVersion).toBeGreaterThan(0);
  });

  it("folds a SQLite-backed world the same way", () => {
    const dir = mkdtempSync(join(tmpdir(), "agora-world-"));
    const log = new SqliteLog(join(dir, "world.sqlite"));
    const world = new World(log);
    const ada = registerNamed(world, "Ada");
    call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: { patch: { kind: "text.set", path: "text.world_name", value: "Disk" } },
        },
        5,
      ),
      ada.sessionToken,
    );
    const fromLive = foldWorld(world.log.events());
    const fromDisk = foldWorld(log.events());
    expect(fromDisk.registry.text.world_name).toBe("Disk");
    expect(fromDisk.names[ada.identityId]).toBe(fromLive.names[ada.identityId]);
    expect(fromDisk.fold.tipHash).toBe(fromLive.fold.tipHash);
    log.close();
  });
});
