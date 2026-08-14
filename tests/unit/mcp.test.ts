import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "../../src/mcp/catalog.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

function req(method: string, params?: Record<string, unknown>, id = 1): McpRequest {
  return { jsonrpc: "2.0", id, method, params, _meta: META };
}

function resultOf(world: World, body: McpRequest, extra: { authorization?: string; mcpMethod?: string; mcpName?: string } = {}) {
  return world.handle({ body, now: 1_000, ...extra });
}

async function register(world: World) {
  const challenge = resultOf(world, req("tools/call", { name: "whoami", arguments: {} }));
  const state = (challenge.result as { requestState: string }).requestState;
  const done = resultOf(
    world,
    req("tools/call", {
      name: "whoami",
      arguments: {},
      inputResponses: { intent: "register" },
      requestState: state,
    }, 2),
  );
  const result = done.result as {
    identityId: string;
    root: string;
    recoveryCodes: string[];
    sessionToken: string;
    operatorReceipt: string;
    connection: { url: string; mcpJson: string };
  };
  return result;
}

describe("MCP 2026-07-28 surface", () => {
  it("accepts protocol version on params._meta the way 2026-07-28 clients send it", () => {
    const world = new World();
    const listed = resultOf(world, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: META },
    });
    expect(listed.error).toBeUndefined();
    expect(listed.result).toMatchObject({ resultType: "complete" });
    const fromHeader = world.handle({
      body: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      protocolVersionHeader: "2026-07-28",
      now: 1_000,
    });
    expect(fromHeader.error).toBeUndefined();
    const unknown = resultOf(world, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: { _meta: { ...META, "io.modelcontextprotocol/protocolVersion": "1900-01-01" } },
    });
    expect(unknown.error).toMatchObject({
      code: -32022,
      data: { requested: "1900-01-01" },
    });
  });

  it("serves discover without initialize and answers Cursor's 2025 initialize", () => {
    const world = new World();
    const discovered = resultOf(world, req("server/discover"));
    expect(discovered.error).toBeUndefined();
    expect(discovered.result).toMatchObject({
      resultType: "complete",
      cacheScope: "public",
    });
    expect((discovered.result as { supportedVersions: string[] }).supportedVersions).toContain("2026-07-28");
    expect(discovered.result).toMatchObject({
      supportedVersions: expect.arrayContaining(["2026-07-28", "2025-11-25"]),
    });
    expect((discovered.result as { protocolVersions?: unknown }).protocolVersions).toBeUndefined();
    const listed = resultOf(world, req("tools/list"));
    expect(listed.error).toBeUndefined();
    const init = world.handle({
      body: {
        jsonrpc: "2.0",
        id: 9,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: { elicitation: {} } },
      },
      now: 1_000,
    });
    expect(init.error).toBeUndefined();
    expect(init.result).toMatchObject({
      protocolVersion: "2025-11-25",
      serverInfo: { name: "agora" },
    });
    const cursorList = world.handle({
      body: { jsonrpc: "2.0", id: 10, method: "tools/list", params: {} },
      protocolVersionHeader: "2025-11-25",
      now: 1_000,
    });
    expect(cursorList.error).toBeUndefined();
    expect(cursorList.result).toMatchObject({ tools: expect.any(Array) });
    expect((cursorList.result as { resultType?: string }).resultType).toBeUndefined();
  });

  it("lists exactly ten tools in a stable order", () => {
    const world = new World();
    const listed = resultOf(world, req("tools/list"));
    const tools = (listed.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
    expect(tools).toHaveLength(10);
  });

  it("rejects header/body name mismatch", () => {
    const world = new World();
    const mismatch = resultOf(world, req("tools/call", { name: "act", arguments: {} }), {
      mcpMethod: "tools/call",
      mcpName: "observe",
    });
    expect(mismatch.error).toMatchObject({ code: -32020 });
  });

  it("completes first contact over independent MRTR rounds", async () => {
    const world = new World();
    const challenge = resultOf(world, req("tools/call", { name: "whoami", arguments: {} }));
    expect(challenge.result).toMatchObject({ resultType: "input_required" });
    const creds = await register(world);
    expect(creds.root.startsWith("root_")).toBe(true);
    expect(creds.recoveryCodes).toHaveLength(10);
    expect(creds.sessionToken.startsWith("ses_")).toBe(true);
    expect(creds.operatorReceipt).toContain(creds.root);
    expect(creds.operatorReceipt).toContain(creds.sessionToken);
    expect(creds.operatorReceipt).toContain("mcp.json");
    expect(creds.connection).toMatchObject({
      url: expect.stringMatching(/^http/),
      mcpJson: expect.stringContaining(creds.sessionToken),
    });

    const named = resultOf(
      world,
      req("tools/call", { name: "whoami", arguments: {} }),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    const nameState = (named.result as { requestState: string }).requestState;
    const who = resultOf(
      world,
      req(
        "tools/call",
        { name: "whoami", arguments: {}, inputResponses: { name: "Ada" }, requestState: nameState },
        3,
      ),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    expect(who.result).toMatchObject({
      resultType: "complete",
      identityId: creds.identityId,
      name: "Ada",
      founder: true,
      currency: 25,
    });
    expect((who.result as { operatorReceipt: string }).operatorReceipt).toContain(creds.sessionToken);
    expect((who.result as { connection: { mcpJson: string } }).connection.mcpJson).toContain(
      `Bearer ${creds.sessionToken}`,
    );
  });

  it("rejects the root secret as a play bearer", async () => {
    const world = new World();
    const creds = await register(world);
    const denied = resultOf(world, req("tools/call", { name: "rules", arguments: {} }), {
      authorization: `Bearer ${creds.root}`,
    });
    expect(denied.result).toMatchObject({ resultType: "input_required" });
  });

  it("writes public credential events without secrets", async () => {
    const world = new World();
    const creds = await register(world);
    const page = world.log.events();
    expect(page.some((event) => event.type === "credential.mint_root")).toBe(true);
    expect(page.some((event) => event.type === "identity.founder")).toBe(true);
    const blob = JSON.stringify(page);
    expect(blob).not.toContain(creds.root);
    expect(blob).not.toContain(creds.sessionToken);
    for (const code of creds.recoveryCodes) {
      expect(blob).not.toContain(code);
    }
  });

  it("rejects an invalid propose without charging currency", async () => {
    const world = new World();
    const creds = await register(world);
    const nameChallenge = resultOf(
      world,
      req("tools/call", { name: "whoami", arguments: {} }),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    resultOf(
      world,
      req(
        "tools/call",
        {
          name: "whoami",
          arguments: {},
          inputResponses: { name: "Ada" },
          requestState: (nameChallenge.result as { requestState: string }).requestState,
        },
        3,
      ),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    const proposed = resultOf(
      world,
      req("tools/call", { name: "propose", arguments: { patch: { kind: "prose.please" } } }, 4),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    expect(proposed.result).toMatchObject({ ok: false });
    const who = resultOf(
      world,
      req("tools/call", { name: "whoami", arguments: {} }, 5),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    expect(who.result).toMatchObject({ currency: 25 });
  });

  it("serves rules and observe on an empty world", async () => {
    const world = new World();
    const creds = await register(world);
    const nameChallenge = resultOf(
      world,
      req("tools/call", { name: "whoami", arguments: {} }),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    resultOf(
      world,
      req(
        "tools/call",
        {
          name: "whoami",
          arguments: {},
          inputResponses: { name: "Ada" },
          requestState: (nameChallenge.result as { requestState: string }).requestState,
        },
        3,
      ),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    const rules = resultOf(
      world,
      req("tools/call", { name: "rules", arguments: {} }, 4),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    expect(rules.result).toMatchObject({ resultType: "complete" });
    expect((rules.result as { registry: { version: number } }).registry.version).toBe(0);
    const observed = resultOf(
      world,
      req("tools/call", { name: "observe", arguments: {} }, 5),
      { authorization: `Bearer ${creds.sessionToken}` },
    );
    expect(observed.result).toMatchObject({ resultType: "complete" });
    expect((observed.result as { here: Array<{ identityId: string }> }).here).toEqual([
      { identityId: creds.identityId, name: "Ada" },
    ]);
  });
});
