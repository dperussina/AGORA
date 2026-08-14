import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { presenceFrame, recordFrame, RecordHub, streamKind } from "../../src/world/record-hub.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

function req(method: string, params?: Record<string, unknown>, id = 1): McpRequest {
  return { jsonrpc: "2.0", id, method, params, _meta: META };
}

describe("spectator listen", () => {
  it("classifies acts as spatial and amendments as governance", () => {
    expect(streamKind("act.move")).toBe("spatial");
    expect(streamKind("speak")).toBe("spatial");
    expect(streamKind("amendment.propose")).toBe("governance");
    expect(streamKind("tick.boundary")).toBe("governance");
  });

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

  it("publishes names, moves, speech, and proposal cost on the public stream", () => {
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
    const creds = world.handle({
      body: req("tools/call", {
        name: "whoami",
        arguments: {},
        inputResponses: { intent: "register" },
        requestState: (challenge.result as { requestState: string }).requestState,
      }),
      now: 1,
    }).result as { sessionToken: string; identityId: string };
    const nameAsk = world.handle({
      body: req("tools/call", { name: "whoami", arguments: {} }),
      now: 2,
      authorization: `Bearer ${creds.sessionToken}`,
    });
    world.handle({
      body: req("tools/call", {
        name: "whoami",
        arguments: {},
        inputResponses: { name: "Ada" },
        requestState: (nameAsk.result as { requestState: string }).requestState,
      }),
      now: 2,
      authorization: `Bearer ${creds.sessionToken}`,
    });
    world.handle({
      body: req("tools/call", { name: "act", arguments: { verb: "move", delta: { x: 1, y: 0, z: 0 } } }),
      now: 3,
      authorization: `Bearer ${creds.sessionToken}`,
    });
    world.advanceTick();
    world.handle({
      body: req("tools/call", { name: "speak", arguments: { text: "hello lattice", broadcast: true } }),
      now: 4,
      authorization: `Bearer ${creds.sessionToken}`,
    });
    world.handle({
      body: req("tools/call", {
        name: "propose",
        arguments: { patch: { kind: "text.set", path: "text.world_name", value: "Ada's World" } },
      }),
      now: 5,
      authorization: `Bearer ${creds.sessionToken}`,
    });
    expect(seen.some((frame) => frame.includes("identity.name") && frame.includes("Ada"))).toBe(true);
    expect(seen.some((frame) => frame.includes("act.move"))).toBe(true);
    expect(seen.some((frame) => frame.includes("hello lattice"))).toBe(true);
    expect(seen.some((frame) => frame.includes("amendment.propose") && frame.includes("\"cost\":10"))).toBe(true);
    expect(world.record.some((item) => item.type === "speak")).toBe(false);
    expect(world.listenLog.some((item) => item.type === "speak")).toBe(true);
    expect(world.listenLog.some((item) => item.type === "tick.boundary")).toBe(false);
    expect(world.record.some((item) => item.type === "tick.boundary")).toBe(true);
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

  it("seeds listen with current public bodies so the cube can fold agents", async () => {
    const world = new World();
    const challenge = world.handle({
      body: req("tools/call", { name: "whoami", arguments: {} }),
      now: 1,
    });
    const creds = world.handle({
      body: req("tools/call", {
        name: "whoami",
        arguments: {},
        inputResponses: { intent: "register" },
        requestState: (challenge.result as { requestState: string }).requestState,
      }),
      now: 1,
    }).result as { sessionToken: string; identityId: string };
    const nameAsk = world.handle({
      body: req("tools/call", { name: "whoami", arguments: {} }),
      now: 2,
      authorization: `Bearer ${creds.sessionToken}`,
    });
    world.handle({
      body: req("tools/call", {
        name: "whoami",
        arguments: {},
        inputResponses: { name: "Ada" },
        requestState: (nameAsk.result as { requestState: string }).requestState,
      }),
      now: 2,
      authorization: `Bearer ${creds.sessionToken}`,
    });
    const at = world.bodies.get(creds.identityId);
    expect(at).toBeDefined();
    const { createMcpServer } = await import("../../src/mcp/http.ts");
    const server = createMcpServer(world);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("no port");
    }
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${address.port}/listen`, { signal: controller.signal });
    const reader = res.body?.getReader();
    if (reader === undefined) {
      server.close();
      throw new Error("no listen body");
    }
    const first = await reader.read();
    const text = new TextDecoder().decode(first.value);
    expect(text).toContain("event: presence");
    expect(text).toContain(creds.identityId);
    expect(text).toContain(presenceFrame([{ id: creds.identityId, position: at! }]).split("\n")[0]);
    controller.abort();
    server.close();
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
    const llmsBody = await llms.text();
    expect(llmsBody).toContain("2026-07-28");
    expect(llmsBody).toContain("$self");
    expect(llmsBody).toContain("act.<verb>_failed");

    const alias = await fetch(base + "/llms.text");
    expect(await alias.text()).toContain("operatorReceipt");

    const inhabit = await fetch(base + "/skills/agora-inhabit/SKILL.md");
    expect(inhabit.headers.get("content-type")).toMatch(/text\/markdown/);
    expect(await inhabit.text()).toContain("agora-inhabit");

    const play = await fetch(base + "/skills/agora-play/SKILL.md");
    const playBody = await play.text();
    expect(playBody).toContain("Day-one loop");
    expect(playBody).toContain("Effects (after a vote)");
    expect(readFileSync("public/skills/agora-play/SKILL.md", "utf8")).toBe(
      readFileSync(".cursor/skills/agora-play/SKILL.md", "utf8"),
    );
    expect(readFileSync("public/skills/agora-inhabit/SKILL.md", "utf8")).toBe(
      readFileSync(".cursor/skills/agora-inhabit/SKILL.md", "utf8"),
    );
    expect(page).toContain("the engine runs the patch");
    expect(page).toContain("id=\"lore\"");
    expect(page).toContain("What they have named.");
    expect(page).toContain("click to name");

    const art = await fetch(base + "/art/empty-world.jpg");
    expect(art.status).toBe(200);
    expect(art.headers.get("content-type")).toMatch(/image\/jpeg/);

    const emblem = await fetch(base + "/art/emblem.jpg");
    expect(emblem.status).toBe(200);

    const icon = await fetch(base + "/favicon.svg");
    expect(icon.headers.get("content-type")).toMatch(/image\/svg/);

    const three = await fetch(base + "/vendor/three.module.js");
    expect(three.status).toBe(200);
    expect(three.headers.get("content-type")).toMatch(/javascript/);

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
