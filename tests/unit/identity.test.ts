import { describe, expect, it } from "vitest";
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

function register(world: World) {
  const challenge = call(world, req("tools/call", { name: "whoami", arguments: {} }));
  return call(
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
  ).result as { identityId: string; sessionToken: string; root: string; recoveryCodes: string[] };
}

function nameAs(world: World, token: string, name: string, id = 3) {
  const challenge = call(world, req("tools/call", { name: "whoami", arguments: {} }, id), token);
  return call(
    world,
    req(
      "tools/call",
      {
        name: "whoami",
        arguments: {},
        inputResponses: { name },
        requestState: (challenge.result as { requestState: string }).requestState,
      },
      id + 1,
    ),
    token,
  );
}

describe("identity credentials", () => {
  it("mints a labeled session from the root and rejects a second name", () => {
    const world = new World();
    const creds = register(world);
    nameAs(world, creds.sessionToken, "Ada");
    const challenge = call(world, req("tools/call", { name: "whoami", arguments: {} }, 10));
    const minted = call(
      world,
      req(
        "tools/call",
        {
          name: "whoami",
          arguments: {},
          inputResponses: { intent: "mint_session", root: creds.root, label: "laptop" },
          requestState: (challenge.result as { requestState: string }).requestState,
        },
        11,
      ),
    );
    const token = (minted.result as { sessionToken: string }).sessionToken;
    expect(token.startsWith("ses_")).toBe(true);
    const who = call(world, req("tools/call", { name: "whoami", arguments: {} }, 12), token);
    expect(who.result).toMatchObject({ identityId: creds.identityId, name: "Ada" });
    const again = nameAs(world, token, "Ada2", 20);
    expect(again.error ?? again.result).toBeTruthy();
    const stored = world.identities.identities.get(creds.identityId);
    expect(stored?.name).toBe("Ada");
  });

  it("revokes a labeled session from the root", () => {
    const world = new World();
    const creds = register(world);
    const challenge = call(world, req("tools/call", { name: "whoami", arguments: {} }, 10));
    const revoked = call(
      world,
      req(
        "tools/call",
        {
          name: "whoami",
          arguments: {},
          inputResponses: { intent: "revoke_session", root: creds.root, label: "genesis" },
          requestState: (challenge.result as { requestState: string }).requestState,
        },
        11,
      ),
    );
    expect(revoked.result).toMatchObject({ revoked: "genesis" });
    const dead = call(world, req("tools/call", { name: "whoami", arguments: {} }, 12), creds.sessionToken);
    expect(dead.result).toMatchObject({ resultType: "input_required" });
  });

  it("redeems a recovery code and kills the old root", () => {
    const world = new World();
    const creds = register(world);
    const challenge = call(world, req("tools/call", { name: "whoami", arguments: {} }, 10));
    const redeemed = call(
      world,
      req(
        "tools/call",
        {
          name: "whoami",
          arguments: {},
          inputResponses: {
            intent: "recover",
            recovery_code: creds.recoveryCodes[0],
            invalidate_sessions: true,
          },
          requestState: (challenge.result as { requestState: string }).requestState,
        },
        11,
      ),
    );
    expect(redeemed.result).toMatchObject({ identityId: creds.identityId });
    const newRoot = (redeemed.result as { root: string }).root;
    expect(newRoot.startsWith("root_")).toBe(true);
    expect(newRoot).not.toBe(creds.root);
    const dead = call(world, req("tools/call", { name: "whoami", arguments: {} }, 12), creds.sessionToken);
    expect(dead.result).toMatchObject({ resultType: "input_required" });
  });
});
