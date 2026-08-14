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

describe("public API and Steward", () => {
  it("applies below-floor amendments as provisional", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    const proposed = call(
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
    expect(proposed.result).toMatchObject({ ok: true, provisional: true });
    expect(world.clerk.registry.text.world_name).toBe("Sandbox");
    expect(world.provisionals).toHaveLength(1);
  });

  it("publishes the exact typed patch for an open motion", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    registerNamed(world, "Babbage");
    registerNamed(world, "Curie");
    registerNamed(world, "Dijkstra");
    call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: { patch: { kind: "param.set", path: "action_budget", value: 4 } },
        },
        5,
      ),
      ada.sessionToken,
    );
    const docket = publicRead(world, "/docket") as {
      pending: Array<{ patch: { kind: string; path: string; value: number } }>;
    };
    expect(docket.pending[0]?.patch).toEqual({ kind: "param.set", path: "action_budget", value: 4 });
  });

  it("exposes governance immediately and lags spatial positions", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    call(
      world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: { patch: { kind: "text.set", path: "text.world_name", value: "Named" } },
        },
        5,
      ),
      ada.sessionToken,
    );
    const governance = publicRead(world, "/feed/governance");
    expect((governance["events"] as Array<{ type: string }>).some((event) => event.type === "amendment.propose")).toBe(
      true,
    );
    const map = publicRead(world, "/map") as {
      tick: number;
      bodies: unknown[];
      anchors: Array<{ designation: string; name: string | null; lore: string | null }>;
      wardens: unknown[];
      drifts: unknown[];
      entities: unknown[];
    };
    expect(map.tick).toBe(0);
    expect(map.bodies).toEqual([]);
    expect(map.anchors.length).toBe(24);
    expect(map.anchors[0]).toHaveProperty("name");
    expect(map.anchors[0]).toHaveProperty("lore");
    expect(map.wardens.length).toBeGreaterThan(0);
    expect(map.drifts).toEqual([]);
    expect(map.entities).toEqual([]);
    expect(publicRead(world, "/rules")).toHaveProperty("registry");
    expect(publicRead(world, "/fold")).toMatchObject({ hash: "sha256" });
    expect(publicRead(world, "/registry/history")).toHaveProperty("applied");
    const history = publicRead(world, "/registry/history") as { applied: Array<{ id: number; kind: string; patch: { kind: string } }> };
    expect(Array.isArray(history.applied)).toBe(true);
    if (history.applied.length > 0) {
      expect(history.applied[0]).toHaveProperty("patch");
      expect(history.applied[0]?.patch).toHaveProperty("kind");
    }
    expect(publicRead(world, "/metrics")).toMatchObject({ identities: 1, online: 1 });
    expect(publicRead(world, "/pulse")).toMatchObject({ identities: 1, online: 1 });
    const events = publicRead(world, "/events", new URLSearchParams("limit=2&types=genesis"));
    expect((events["page"] as unknown[]).length).toBeLessThanOrEqual(2);
    const body = world.bodies.get(ada.identityId);
    expect(body).toBeDefined();
    if (body !== undefined) {
      const nearby = publicRead(
        world,
        "/events",
        new URLSearchParams(`region=${body.x},${body.y},${body.z},2&types=identity.spawn`),
      );
      expect((nearby["page"] as unknown[]).length).toBeGreaterThan(0);
      const elsewhere = publicRead(world, "/events", new URLSearchParams("region=0,0,0,0&types=identity.spawn"));
      expect((elsewhere["page"] as unknown[]).length).toBe(0);
    }
  });

  it("lets the Steward halt ticks and refuses Steward votes", () => {
    const world = new World();
    const ada = registerNamed(world, "Ada");
    world.designateSteward(ada.identityId);
    const halted = call(
      world,
      req("tools/call", { name: "speak", arguments: { text: "pause", halt: true } }, 5),
      ada.sessionToken,
    );
    expect(halted.result).toMatchObject({ halted: true, tagged: "STEWARD" });
    call(world, req("tools/call", { name: "whoami", arguments: {} }, 6), ada.sessionToken);
    expect(world.advanceTick().ticked).toBe(false);
    const vote = call(
      world,
      req("tools/call", { name: "vote", arguments: { proposal_id: 1, position: "for" } }, 7),
      ada.sessionToken,
    );
    expect(vote.result).toMatchObject({ ok: false, reason: "Steward cannot vote" });
  });
});
