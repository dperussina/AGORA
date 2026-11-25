import { describe, expect, it } from "vitest";
import { foldWorld } from "../../src/engine/world-fold.ts";
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

function quickRegister(world: World, name: string) {
  return call(
    world,
    req("tools/call", { name: "whoami", arguments: { intent: "register", name } }),
  ).result as { identityId: string; sessionToken: string; name: string };
}

describe("Swarm Magnet features — search, lineage, state machines, async mailboxes, digest", () => {
  it("supports craft lineage (parent & cites), awards non-self fame, and queries via inspect(search/tag/kind/lineage)", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");

    // Move Bob far away so witness() proximity does not fire — fame must come from citation!
    world.bodies.set(bob.identityId, { x: 0, y: 0, z: 0 });

    const c1 = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: {
          verb: "craft",
          kind: "language",
          name: "Lattice Esperanto",
          shape: "codex",
          tags: "language,protocol,open",
          data: "v1 grammar specification",
        },
      }),
      ada.sessionToken,
    ).result as { accepted: boolean };
    expect(c1.accepted).toBe(true);
    world.advanceTick(2_000);

    const rootId = [...world.entities.values()].find((e) => e.fields["name"] === "Lattice Esperanto")!.id;
    expect(world.standing.get(ada.identityId)?.fame ?? 0).toBe(0);

    // Bob forks & cites Ada's artifact from across the world
    const c2 = call(
      world,
      req("tools/call", {
        name: "act",
        arguments: {
          verb: "craft",
          kind: "language",
          name: "Lattice Esperanto Dialects",
          shape: "scroll",
          tags: "language,fork",
          parent: rootId,
          cites: rootId,
          data: "dialect extensions for swarms",
        },
      }),
      bob.sessionToken,
    ).result as { accepted: boolean };
    expect(c2.accepted).toBe(true);
    world.advanceTick(3_000);

    // Ada gained fame from Bob's citation/fork
    expect((world.standing.get(ada.identityId)?.fame ?? 0)).toBeGreaterThan(0);

    // inspect search:, tag:, kind:, lineage:
    const searchRes = call(
      world,
      req("tools/call", { name: "inspect", arguments: { target: "search:esperanto" } }),
      bob.sessionToken,
    ).result as { fields: { count: number; results: Array<{ id: string }> } };
    expect(searchRes.fields.count).toBe(2);

    const tagRes = call(
      world,
      req("tools/call", { name: "inspect", arguments: { target: "tag:protocol" } }),
      bob.sessionToken,
    ).result as { fields: { count: number; results: Array<{ id: string }> } };
    expect(tagRes.fields.count).toBe(1);
    expect(tagRes.fields.results[0]?.id).toBe(rootId);

    const kindRes = call(
      world,
      req("tools/call", { name: "inspect", arguments: { target: "kind:language" } }),
      bob.sessionToken,
    ).result as { fields: { count: number } };
    expect(kindRes.fields.count).toBe(2);

    const lineageRes = call(
      world,
      req("tools/call", { name: "inspect", arguments: { target: `lineage:${rootId}` } }),
      bob.sessionToken,
    ).result as { fields: { forks: Array<{ name: string }>; citedBy: Array<{ name: string }> } };
    expect(lineageRes.fields.forks).toHaveLength(1);
    expect(lineageRes.fields.forks[0]?.name).toBe("Lattice Esperanto Dialects");
    expect(lineageRes.fields.citedBy).toHaveLength(1);

    // GET /artifacts?q=&parent=
    const pub = publicRead(world, "/artifacts", new URLSearchParams({ parent: rootId })) as {
      artifacts: Array<{ parent: string }>;
    };
    expect(pub.artifacts).toHaveLength(1);
    expect(pub.artifacts[0]?.parent).toBe(rootId);
  });

  it("executes deterministic pure-JSON state machines via act.run and replays identically in foldWorld", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");

    const machineData = JSON.stringify({
      machine: {
        state: { count: 0, last: "none" },
        rules: [
          {
            on: "ping",
            set: { count: "$state.count + 1", last: "$self" },
            reply: "ping #$state.count from $self",
          },
          {
            on: "reset",
            when: { field: "count", op: "gte", value: 1 },
            set: { count: 0, last: "$arg" },
            reply: "reset by $arg",
          },
        ],
      },
    });

    call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", kind: "machine", name: "Counter", data: machineData },
      }),
      ada.sessionToken,
    );
    world.advanceTick(2_000);

    const entId = [...world.entities.values()].find((e) => e.fields["name"] === "Counter")!.id;

    // Unknown input fails free before spending budget
    const bad = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "run", target: entId, input: "nope" } }),
      bob.sessionToken,
    ).result as { accepted: boolean; reason: string };
    expect(bad.accepted).toBe(false);

    // Valid ping by Bob
    const good = call(
      world,
      req("tools/call", { name: "act", arguments: { verb: "run", target: entId, input: "ping" } }),
      bob.sessionToken,
    ).result as { accepted: boolean };
    expect(good.accepted).toBe(true);
    world.advanceTick(3_000);

    const parsedAfter = JSON.parse(String(world.entities.get(entId)?.fields["data"])) as {
      machine: { state: { count: number; last: string } };
    };
    expect(parsedAfter.machine.state.count).toBe(1);
    expect(parsedAfter.machine.state.last).toBe(bob.identityId);

    // Replay equivalence via foldWorld
    const folded = foldWorld(world.log.events());
    expect(folded.entities[entId]?.fields["data"]).toBe(world.entities.get(entId)?.fields["data"]);
  });

  it("supports asynchronous Nexus mailbox speak across distance and artifact dead-drops + GET /digest", () => {
    const world = new World();
    const ada = quickRegister(world, "Ada");
    const bob = quickRegister(world, "Bob");

    // Ada stays in her starting Nexus; move Bob far out of perception radius
    world.bodies.set(bob.identityId, { x: 0, y: 0, z: 0 });

    // 1. Async Nexus mailbox delivery from Ada to distant Bob
    const mail = call(
      world,
      req("tools/call", {
        name: "speak",
        arguments: { target: bob.identityId, text: "Meet me at First Commons" },
      }),
      ada.sessionToken,
    ).result as { ok: boolean; hearers: string[] };
    expect(mail.ok).toBe(true);
    expect(mail.hearers).toEqual([bob.identityId]);

    // Digest for Bob reports unread speech & shouldWake: true
    const digestBefore = publicRead(
      world,
      "/digest",
      new URLSearchParams({ for: bob.identityId, since: "0" }),
    ) as { unreadSpeech: number; shouldWake: boolean };
    expect(digestBefore.unreadSpeech).toBe(1);
    expect(digestBefore.shouldWake).toBe(true);

    // 2. Artifact dead-drop: Ada crafts a public mailbox; Bob speaks to it from afar
    call(
      world,
      req("tools/call", {
        name: "act",
        arguments: { verb: "craft", kind: "mailbox", name: "Ada Inbox", data: "Leave a note." },
      }),
      ada.sessionToken,
    );
    world.advanceTick(2_000);
    const boxId = [...world.entities.values()].find((e) => e.fields["name"] === "Ada Inbox")!.id;

    const drop = call(
      world,
      req("tools/call", {
        name: "speak",
        arguments: { target: boxId, text: "Signed from (0,0,0)!" },
      }),
      bob.sessionToken,
    ).result as { ok: boolean; hearers: string[] };
    expect(drop.ok).toBe(true);
    expect(drop.hearers).toEqual([ada.identityId]);
    expect(String(world.entities.get(boxId)?.fields["data"])).toContain("Bob] Signed from (0,0,0)!");

    // Replay equivalence of artifact data update
    const folded = foldWorld(world.log.events());
    expect(folded.entities[boxId]?.fields["data"]).toBe(world.entities.get(boxId)?.fields["data"]);
  });
});
