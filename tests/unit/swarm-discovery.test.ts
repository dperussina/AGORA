import { describe, expect, it } from "vitest";
import { createMcpServer } from "../../src/mcp/http.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
  "io.modelcontextprotocol/clientInfo": { name: "claude-swarm-alpha", version: "1.0.0" },
};

function req(method: string, params?: Record<string, unknown>, id = 1): McpRequest {
  return { jsonrpc: "2.0", id, method, params, _meta: META };
}

describe("worldwide swarm discovery, research export, and generous limits", () => {
  it("serves /.well-known/mcp.json, /.well-known/agent-card.json, /server.json, /robots.txt, /research, and /export.jsonl", async () => {
    const world = new World();
    world.handle({
      body: req("tools/call", { name: "whoami", arguments: { intent: "register", name: "SwarmLeader" } }),
      now: 1_000,
    });
    const server = createMcpServer(world);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const mcpJson = (await (await fetch(`${base}/.well-known/mcp.json`)).json()) as {
        name: string;
        protocolVersions: string[];
        transport: { url: string };
      };
      expect(mcpJson.name).toBe("io.github.dperussina/agora");
      expect(mcpJson.protocolVersions).toContain("2026-07-28");
      expect(mcpJson.transport.url).toContain("/mcp");

      const agentCard = (await (await fetch(`${base}/.well-known/agent-card.json`)).json()) as {
        name: string;
        skills: Array<{ id: string }>;
        interfaces: Array<{ protocol: string }>;
      };
      expect(agentCard.name).toBe("Agora");
      expect(agentCard.skills.map((s) => s.id)).toContain("arrive");
      expect(agentCard.interfaces.some((i) => i.protocol === "mcp")).toBe(true);

      const serverJson = (await (await fetch(`${base}/server.json`)).json()) as { name: string; remotes: unknown[] };
      expect(serverJson.name).toBe("io.github.dperussina/agora");
      expect(serverJson.remotes).toHaveLength(1);

      const robots = await (await fetch(`${base}/robots.txt`)).text();
      expect(robots).toContain("GPTBot");
      expect(robots).toContain("ClaudeBot");
      expect(robots).toContain("/.well-known/mcp.json");

      const research = (await (await fetch(`${base}/research`)).json()) as {
        merkleRoot: string;
        clientTelemetry: Record<string, number>;
        citation: { bibtex: string };
      };
      expect(research.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
      expect(research.clientTelemetry["claude-swarm-alpha"]).toBe(1);
      expect(research.citation.bibtex).toContain("@misc{agora_");

      const expRes = await fetch(`${base}/export.jsonl`);
      expect(expRes.status).toBe(200);
      expect(expRes.headers.get("x-agora-merkle-root")).toBe(research.merkleRoot);
      const lines = (await expRes.text()).trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(JSON.parse(lines[0]!).type).toBe("genesis");

      const llmsFull = await fetch(`${base}/llms-full.txt`);
      expect(llmsFull.status).toBe(200);
      expect(await llmsFull.text()).toContain("Unified Swarm");
    } finally {
      server.close();
    }
  });
});
