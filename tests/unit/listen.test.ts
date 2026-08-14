import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { recordFrame, RecordHub } from "../../src/world/record-hub.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

function req(method: string, params?: Record<string, unknown>, id = 1): McpRequest {
  return { jsonrpc: "2.0", id, method, params, _meta: META };
}

describe("spectator listen", () => {
  it("fans Record items to subscribers without being a write path", () => {
    const hub = new RecordHub();
    const frames: string[] = [];
    const unsub = hub.subscribe((frame) => {
      frames.push(frame);
      return true;
    });
    hub.publish({ tick: 1, type: "amendment.propose", payload: { id: 1 } });
    expect(frames[0]).toBe(recordFrame({ tick: 1, type: "amendment.propose", payload: { id: 1 } }));
    unsub();
    hub.publish({ tick: 2, type: "tick.boundary", payload: {} });
    expect(frames).toHaveLength(1);
  });

  it("publishes from the world Record when credentials are minted", () => {
    const world = new World();
    const seen: string[] = [];
    world.recordHub.subscribe((frame) => {
      seen.push(frame);
      return true;
    });
    const challenge = world.handle({
      body: req("tools/call", { name: "whoami", arguments: {} }),
      now: 1,
    });
    world.handle({
      body: req("tools/call", {
        name: "whoami",
        arguments: {},
        inputResponses: { intent: "register" },
        requestState: (challenge.result as { requestState: string }).requestState,
      }),
      now: 1,
    });
    expect(seen.some((frame) => frame.includes("credential.mint_root"))).toBe(true);
  });

  it("does not treat a listen connection as identity", () => {
    const world = new World();
    const server = createServer((req, res) => {
      if (req.url === "/listen") {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(recordFrame({ tick: 0, type: "genesis", payload: {} }));
        return;
      }
      res.end();
    });
    expect(world.identities.identities.size).toBe(0);
    server.close();
  });

  it("serves the spectator notice to browsers and keeps JSON for API clients", async () => {
    const { createMcpServer } = await import("../../src/mcp/http.ts");
    const world = new World();
    const server = createMcpServer(world);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("no port");
    }
    const base = `http://127.0.0.1:${address.port}`;
    const html = await fetch(base + "/", { headers: { accept: "text/html" } });
    expect(html.headers.get("content-type")).toMatch(/text\/html/);
    const page = await html.text();
    expect(page).toContain("Give this to your LLM");
    expect(page).toContain("Build on the stream");
    expect(page).toContain("GET /listen");
    const json = await fetch(base + "/", { headers: { accept: "application/json" } });
    expect(await json.json()).toMatchObject({ writes: "mcp-only" });
    const naked = await fetch(base + "/");
    expect(naked.headers.get("content-type")).toMatch(/text\/html/);

    const llms = await fetch(base + "/llms.txt");
    expect(llms.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await llms.text()).toContain("2026-07-28");

    const alias = await fetch(base + "/llms.text");
    expect(await alias.text()).toContain("operatorReceipt");

    const inhabit = await fetch(base + "/skills/agora-inhabit/SKILL.md");
    expect(inhabit.headers.get("content-type")).toMatch(/text\/markdown/);
    expect(await inhabit.text()).toContain("agora-inhabit");

    const play = await fetch(base + "/skills/agora-play/SKILL.md");
    expect(await play.text()).toContain("Day-one loop");

    const missing = await fetch(base + "/skills/nope/SKILL.md");
    expect(missing.status).toBe(404);

    const missingFile = await fetch(base + "/skills/agora-inhabit/secret.txt");
    expect(missingFile.status).toBe(404);

    const confined = await fetch(base + "/skills/agora-inhabit/secret.bin");
    expect(confined.headers.get("content-type")).toMatch(/application\/json/);
    expect(await confined.json()).toMatchObject({ error: "unknown public path" });

    server.close();
  });
});
