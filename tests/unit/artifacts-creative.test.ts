import { describe, expect, it } from "vitest";
import { foldWorld } from "../../src/engine/world-fold.ts";
import { createMcpServer } from "../../src/mcp/http.ts";
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

function quickRegister(world: World, name: string) {
  return call(
    world,
    req("tools/call", { name: "whoami", arguments: { intent: "register", name } }),
  ).result as { identityId: string; sessionToken: string };
}

describe("unbound creative verbs (craft, edit, give, dismantle)", () => {
  it("lets AIs immediately craft unbound shapes, memories, languages, and data without a prior vote, then edit, give, and dismantle with exact replay", async () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");
    const adaPos = world.bodies.get(ada.identityId)!;
    world.bodies.set(bob.identityId, { x: adaPos.x + 1, y: adaPos.y, z: adaPos.z });

    // 1. Craft a constructed language / memory / 3D shape on Turn 1 (zero votes needed!)
    const crafted = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: {
          verb: "craft",
          kind: "language",
          name: "Lattice-Gloss v1",
          shape: "crystal-spire",
          tags: "conlang,protocol,swarm",
          data: "GRAMMAR v1: [subject] -> [intent] :: [proof]\nVOCAB: kora=trade, vela=scout",
        },
      }),
      ada.sessionToken,
    ).result;
    expect(crafted).toMatchObject({ accepted: true, verb: "craft" });
    world.advanceTick();

    const artifact = [...world.entities.values()].find((e) => e.type === "artifact")!;
    expect(artifact).toBeDefined();
    expect(artifact.fields["kind"]).toBe("language");
    expect(artifact.fields["name"]).toBe("Lattice-Gloss v1");
    expect(artifact.fields["shape"]).toBe("crystal-spire");

    // 2. Bob sees it immediately in observe.nearby.entities and via GET /artifacts
    const bobObs = call(world, req("tools/call", { name: "observe", arguments: {} }), bob.sessionToken).result as {
      nearby: { entities: Array<{ id: string; fields: Record<string, unknown> }> };
    };
    expect(bobObs.nearby.entities.some((e) => e.id === artifact.id && e.fields["shape"] === "crystal-spire")).toBe(true);

    // 3. Ada edits the artifact data & shape
    call(
      world,
      req("tools/call", {
        name: "act",
        arguments: {
          verb: "edit",
          target: artifact.id,
          shape: "golden-torus",
          data: "GRAMMAR v2: expanded with swarm coalition clauses",
        },
      }),
      ada.sessionToken,
    );
    world.advanceTick();
    expect(world.entities.get(artifact.id)?.fields["shape"]).toBe("golden-torus");

    // 4. Ada gives Bob 15 currency AND transfers ownership of the artifact to Bob
    const bobBefore = world.clerk.identities.get(bob.identityId)!.currency;
    call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "give", target: bob.identityId, amount: 15, item: artifact.id },
      }),
      ada.sessionToken,
    );
    world.advanceTick();
    expect(world.entities.get(artifact.id)?.fields["owner"]).toBe(bob.identityId);
    expect(world.clerk.identities.get(bob.identityId)!.currency).toBe(bobBefore + 15);

    // 5. Public /artifacts endpoint & MCP resource agora://world/artifacts expose it
    const server = createMcpServer(world);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    try {
      const res = (await (await fetch(`http://127.0.0.1:${addr.port}/artifacts?tag=conlang`)).json()) as {
        artifacts: Array<{ id: string; shape: string; owner: string }>;
      };
      expect(res.artifacts).toHaveLength(1);
      expect(res.artifacts[0]?.shape).toBe("golden-torus");
      expect(res.artifacts[0]?.owner).toBe(bob.identityId);
    } finally {
      server.close();
    }

    const resRead = call(world, req("resources/read", { uri: "agora://world/artifacts" })).result as {
      contents: Array<{ text: string }>;
    };
    expect(JSON.parse(resRead.contents[0]!.text).artifacts).toHaveLength(1);

    // 6. Ada can no longer dismantle it (not owner), but Bob can
    const adaFail = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "dismantle", target: artifact.id } }),
      ada.sessionToken,
    ).result;
    expect(adaFail).toMatchObject({ accepted: false, reason: "not owner" });

    call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "dismantle", target: artifact.id } }),
      bob.sessionToken,
    );
    world.advanceTick();
    expect(world.entities.has(artifact.id)).toBe(false);

    // 7. Full deterministic replay check
    const folded = foldWorld(world.log.events());
    expect(folded.entities[artifact.id]).toBeUndefined();
  });
});
