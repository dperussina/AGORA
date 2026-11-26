import { describe, expect, it } from "vitest";
import { createMcpServer } from "../../src/mcp/http.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {
    elicitation: {},
    extensions: { "io.modelcontextprotocol/tasks": {} },
  },
};

function req(method: string, params?: Record<string, unknown>, id = 1, extraMeta: Record<string, unknown> = {}): McpRequest {
  return { jsonrpc: "2.0", id, method, params, _meta: { ...META, ...extraMeta } };
}

function call(world: World, body: McpRequest, token?: string, mcpName?: string) {
  return world.handle({
    body,
    now: 1_000,
    authorization: token === undefined ? undefined : `Bearer ${token}`,
    mcpName,
  });
}

describe("MCP 2026-07-28 full server spec (@modelcontextprotocol/server v2.4.0)", () => {
  it("advertises full server capabilities and rich tool annotations + outputSchema", () => {
    const world = new World();
    const disc = call(world, req("server/discover")).result as {
      supportedVersions: string[];
      capabilities: {
        tools: { listChanged: boolean };
        resources: { listChanged: boolean };
        prompts: { listChanged: boolean };
        completions: Record<string, unknown>;
        extensions: Record<string, unknown>;
      };
    };
    expect(disc.supportedVersions).toContain("2026-07-28");
    expect(disc.supportedVersions).toContain("2025-11-25");
    expect(disc.supportedVersions).toContain("2024-11-05");
    expect(disc.capabilities.tools.listChanged).toBe(true);
    expect(disc.capabilities.resources.listChanged).toBe(true);
    expect(disc.capabilities.prompts).toBeDefined();
    expect(disc.capabilities.completions).toBeDefined();
    expect(disc.capabilities.extensions["io.modelcontextprotocol/tasks"]).toBeDefined();

    const tools = (call(world, req("tools/list")).result as {
      tools: Array<{
        name: string;
        title: string;
        annotations: { readOnlyHint: boolean };
        inputSchema: { $schema?: string };
        outputSchema: { $schema?: string };
      }>;
    }).tools;
    expect(tools).toHaveLength(10);
    const observe = tools.find((t) => t.name === "observe")!;
    const act = tools.find((t) => t.name === "act")!;
    expect(observe.title).toBe("Observe Surroundings");
    expect(observe.annotations.readOnlyHint).toBe(true);
    expect(observe.inputSchema.$schema).toContain("2020-12");
    expect(observe.outputSchema.$schema).toContain("2020-12");
    expect(act.annotations.readOnlyHint).toBe(false);
  });

  it("serves resources/list, resources/templates/list, and resources/read (static + templated + 404 + Mcp-Name check)", () => {
    const world = new World();
    const list = call(world, req("resources/list")).result as {
      resultType: string;
      resources: Array<{ uri: string }>;
      ttlMs: number;
      cacheScope: string;
    };
    expect(list.resultType).toBe("complete");
    expect(list.cacheScope).toBe("public");
    expect(list.resources.map((r) => r.uri)).toContain("agora://world/orientation");
    expect(list.resources.map((r) => r.uri)).toContain("agora://world/examples");

    const templates = call(world, req("resources/templates/list")).result as {
      resourceTemplates: Array<{ uriTemplate: string }>;
    };
    expect(templates.resourceTemplates.map((t) => t.uriTemplate)).toContain("agora://anchors/{designation}");
    expect(templates.resourceTemplates.map((t) => t.uriTemplate)).toContain("agora://entities/{id}");

    // Read static resource
    const orientation = call(world, req("resources/read", { uri: "agora://world/orientation" })).result as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };
    expect(orientation.contents[0]?.mimeType).toBe("text/markdown");
    expect(orientation.contents[0]?.text).toContain("constitutional commons for AI agents and swarms");

    // Read templated anchor resource
    const desig = world.anchors[0]!.designation;
    const anchor = call(world, req("resources/read", { uri: `agora://anchors/${desig}` })).result as {
      contents: Array<{ text: string }>;
    };
    expect(JSON.parse(anchor.contents[0]!.text).designation).toBe(desig);

    // Unknown resource returns -32002
    const missing = call(world, req("resources/read", { uri: "agora://entities/ent:9999" }));
    expect((missing.error as { code: number }).code).toBe(-32002);

    // Mcp-Name header mismatch returns -32020
    const mismatch = call(world, req("resources/read", { uri: "agora://world/pulse" }), undefined, "agora://world/rules");
    expect((mismatch.error as { code: number }).code).toBe(-32020);
  });

  it("serves prompts/list, prompts/get, and completion/complete", () => {
    const world = new World();
    const list = call(world, req("prompts/list")).result as { prompts: Array<{ name: string }> };
    expect(list.prompts.map((p) => p.name)).toEqual(["arrive", "civic_review", "draft_law", "explore_and_map"]);

    const prompt = call(
      world,
      req("prompts/get", { name: "draft_law", arguments: { idea: "a guild bank", category: "verb" } }),
    ).result as { description: string; messages: Array<{ content: { text: string } }> };
    expect(prompt.description).toContain("guild bank");
    expect(prompt.messages[0]?.content.text).toContain("dryRun: true");

    // Completions for anchor designation and category
    const desigPrefix = world.anchors[0]!.designation.slice(0, 2);
    const compAnchor = call(
      world,
      req("completion/complete", {
        ref: { type: "ref/resource", uri: "agora://anchors/{designation}" },
        argument: { name: "designation", value: desigPrefix },
      }),
    ).result as { completion: { values: string[] } };
    expect(compAnchor.completion.values).toContain(world.anchors[0]!.designation);

    const compCat = call(
      world,
      req("completion/complete", {
        ref: { type: "ref/prompt", name: "draft_law" },
        argument: { name: "category", value: "v" },
      }),
    ).result as { completion: { values: string[] } };
    expect(compCat.completion.values).toEqual(["verb"]);
  });

  it("supports opt-in io.modelcontextprotocol/tasks lifecycle and emits list_changed on amendment", () => {
    const world = new World();
    const reg = call(
      world,
      req("tools/call", { name: "whoami", arguments: { intent: "register", name: "Tasker" } }),
    ).result as { sessionToken: string };

    // Opt-in task on act
    const taskRes = call(
      world,
      req(
        "tools/call",
        { name: "act", arguments: { verb: "move", delta: { x: 1, y: 0, z: 0 } } },
        2,
        { "io.modelcontextprotocol/task": true },
      ),
      reg.sessionToken,
    ).result as { resultType: string; task: { taskId: string; status: string } };
    expect(taskRes.resultType).toBe("task");
    expect(taskRes.task.status).toBe("working");

    // Poll before tick
    const pending = call(world, req("tasks/get", { taskId: taskRes.task.taskId }, 3), reg.sessionToken).result as {
      status: string;
    };
    expect(pending.status).toBe("working");

    // Advance tick -> task completes
    world.advanceTick();
    const done = call(world, req("tasks/get", { taskId: taskRes.task.taskId }, 4), reg.sessionToken).result as {
      status: string;
    };
    expect(done.status).toBe("completed");

    const finalResult = call(world, req("tasks/result", { taskId: taskRes.task.taskId }, 5), reg.sessionToken).result as {
      resultType: string;
      tick: number;
    };
    expect(finalResult.resultType).toBe("complete");
    expect(finalResult.tick).toBe(1);

    // Proposing an amendment emits tools/list_changed and resources/list_changed
    call(
      world,
      req("tools/call", { name: "propose", arguments: { patch: { kind: "text.set", path: "text.world_name", value: "McpWorld" } } }, 6),
      reg.sessionToken,
    );
    expect(world.notifications.some((n) => n.type === "notifications/tools/list_changed")).toBe(true);
    expect(world.notifications.some((n) => n.type === "notifications/resources/list_changed")).toBe(true);
  });

  it("handles Streamable HTTP CORS OPTIONS, stateless DELETE, and POST /mcp", async () => {
    const world = new World();
    const server = createMcpServer(world);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const opt = await fetch(`${base}/mcp`, { method: "OPTIONS" });
      expect(opt.status).toBe(204);
      expect(opt.headers.get("access-control-allow-headers")).toContain("Mcp-Protocol-Version");

      const del = await fetch(`${base}/mcp`, { method: "DELETE" });
      expect(del.status).toBe(204);

      const post = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "prompts/list",
        },
        body: JSON.stringify(req("prompts/list")),
      });
      expect(post.status).toBe(200);
      const json = (await post.json()) as { result: { prompts: unknown[] } };
      expect(json.result.prompts).toHaveLength(4);

      const exp = await fetch(`${base}/export.jsonl`);
      expect(exp.headers.get("content-disposition")).toContain("agora-export.jsonl");

      // Streamable HTTP GET /mcp push SSE delivers notifications/message + notifications/resources/updated on proposals
      const ac = new AbortController();
      const sse = await fetch(`${base}/mcp`, {
        headers: { accept: "text/event-stream", "mcp-protocol-version": "2026-07-28" },
        signal: ac.signal,
      });
      expect(sse.status).toBe(200);
      expect(sse.headers.get("content-type")).toContain("text/event-stream");
      const reader = sse.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const firstChunk = await reader.read();
      buf += dec.decode(firstChunk.value, { stream: true });
      expect(buf).toContain("notifications/message");

      // Trigger a proposal and confirm live MCP push arrives
      const reg = call(world, req("tools/call", { name: "whoami", arguments: { intent: "register", name: "Voter1" } })).result as {
        sessionToken: string;
      };
      call(
        world,
        req("tools/call", { name: "propose", arguments: { patch: { kind: "text.set", path: "text.world_name", value: "PushWorld" } } }, 2),
        reg.sessionToken,
      );
      for (let i = 0; i < 6 && !buf.includes("agora://world/docket"); i++) {
        const next = await reader.read();
        if (next.done) break;
        buf += dec.decode(next.value, { stream: true });
      }
      expect(buf).toContain("agora://world/docket");
      expect(buf).toContain("open for voting");
      ac.abort();
    } finally {
      server.close();
    }
  });
});
