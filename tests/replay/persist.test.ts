import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openPersistedWorld } from "../../src/persist/open.ts";
import type { McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

function req(method: string, params?: Record<string, unknown>, id = 1): McpRequest {
  return { jsonrpc: "2.0", id, method, params, _meta: META };
}

function call(
  world: { handle: (input: { body: McpRequest; now: number; authorization?: string }) => Record<string, unknown> },
  body: McpRequest,
  token?: string,
) {
  return world.handle({
    body,
    now: 1_000,
    authorization: token === undefined ? undefined : `Bearer ${token}`,
  });
}

function registerNamed(world: Parameters<typeof call>[0], name: string) {
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

describe("persisted restart", () => {
  it("resumes the same identity, place, and ruleset after reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "agora-persist-"));
    const path = join(dir, "agora.sqlite");
    const first = openPersistedWorld(path);
    const creds = registerNamed(first.world, "Ada");
    call(
      first.world,
      req(
        "tools/call",
        {
          name: "propose",
          arguments: { patch: { kind: "text.set", path: "text.world_name", value: "Persisted" } },
        },
        5,
      ),
      creds.sessionToken,
    );
    call(
      first.world,
      req("tools/call", { name: "act", arguments: { verb: "mark", text: "still here" } }, 6),
      creds.sessionToken,
    );
    const before = call(first.world, req("tools/call", { name: "whoami", arguments: {} }, 7), creds.sessionToken);
    const position = (before.result as { position: { x: number; y: number; z: number } }).position;
    first.world.advanceTick();
    first.store.close();

    const second = openPersistedWorld(path);
    const who = call(second.world, req("tools/call", { name: "whoami", arguments: {} }, 8), creds.sessionToken);
    expect(who.result).toMatchObject({
      identityId: creds.identityId,
      name: "Ada",
      founder: true,
      position: { x: position.x, y: position.y, z: position.z },
    });
    expect(second.world.clerk.registry.text.world_name).toBe("Persisted");
    const seen = call(second.world, req("tools/call", { name: "observe", arguments: {} }, 9), creds.sessionToken);
    expect((seen.result as { mark: { text: string } }).mark.text).toBe("still here");
    second.store.close();
  });
});
