import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { publicRead } from "../public/read.ts";
import { presenceFrame, recordFrame, streamKind } from "../world/record-hub.ts";
import { httpStatusFor, negotiatedProtocolHeader } from "../world/rpc.ts";
import { World, type McpRequest } from "../world/world.ts";

const MAX_BODY = Number(process.env["AGORA_MAX_BODY"] ?? 1_000_000);
const HEARTBEAT_MS = 15_000;
const READ_LIMIT = Number(process.env["AGORA_READ_LIMIT"] ?? 120);
const PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));
const SITE_EXTS = new Set([".html", ".css", ".js", ".txt", ".md", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"]);
const readHits = new Map<string, { n: number; reset: number }>();

export function createMcpServer(world = new World()): Server {
  return createServer((req, res) => {
    void handleHttp(world, req, res);
  });
}

async function handleHttp(world: World, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET") {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/listen") {
      attachListen(world, req, res);
      return;
    }
    if (url.pathname === "/feed") {
      attachFeed(world, req, res, url.searchParams.get("classes") ?? "governance");
      return;
    }
    const site = siteFile(url.pathname, header(req, "accept") ?? "");
    if (site !== null) {
      await sendSite(res, site);
      return;
    }
    if (!allowRead(req)) {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "rate limited" }));
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify(publicRead(world, url.pathname, url.searchParams)));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "writes are MCP POST only" }));
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) {
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "payload too large" } }));
      return;
    }
    chunks.push(chunk as Buffer);
  }
  let body: McpRequest;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as McpRequest;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }));
    return;
  }
  const protocolVersionHeader = header(req, "mcp-protocol-version");
  const paramVersion =
    typeof body.params?.["protocolVersion"] === "string" ? body.params["protocolVersion"] : undefined;
  const version = protocolVersionHeader ?? paramVersion;
  if (typeof body.method === "string" && body.method.startsWith("notifications/")) {
    res.writeHead(202, {
      "mcp-protocol-version": negotiatedProtocolHeader(version, body.method),
    });
    res.end();
    return;
  }
  const result = world.handle({
    body,
    authorization: header(req, "authorization"),
    mcpMethod: header(req, "mcp-method"),
    mcpName: header(req, "mcp-name"),
    protocolVersionHeader,
    sessionIdHeader: header(req, "mcp-session-id"),
    now: Date.now(),
  });
  res.writeHead(httpStatusFor(result), {
    "content-type": "application/json",
    "mcp-protocol-version": negotiatedProtocolHeader(version, body.method),
  });
  res.end(JSON.stringify(result));
}

function siteFile(pathname: string, accept: string): string | null {
  if (pathname === "/" || pathname === "/index.html") {
    if (pathname === "/index.html") {
      return "index.html";
    }
    const wantsJson = accept.includes("application/json") && !accept.includes("text/html");
    return wantsJson ? null : "index.html";
  }
  let name = decodeURIComponent(pathname.replace(/^\//, ""));
  if (name === "llms.text") {
    name = "llms.txt";
  }
  if (name.includes("\0") || name.includes("\\") || name.split("/").includes("..")) {
    return null;
  }
  if (!SITE_EXTS.has(extname(name))) {
    return null;
  }
  return name;
}

async function sendSite(res: ServerResponse, name: string): Promise<void> {
  const full = normalize(join(PUBLIC_DIR, name));
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("forbidden");
    return;
  }
  try {
    const body = await readFile(full);
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".md": "text/markdown; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".ico": "image/x-icon",
    };
    res.writeHead(200, { "content-type": types[extname(name)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}

function attachListen(world: World, req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const online = new Set(world.onlineIdentityIds);
  const bodies = [...world.bodies.entries()]
    .filter(([id]) => online.has(id))
    .map(([id, position]) => ({ id, position }));
  res.write(presenceFrame(bodies));
  for (const item of world.listenLog.slice(-40)) {
    res.write(recordFrame(item));
  }
  // Replay may contain movement from identities that are no longer present.
  // Reassert the authoritative set before the connection becomes live.
  res.write(presenceFrame(bodies));
  const unsub = world.recordHub.subscribe((frame) => {
    if (res.writableEnded) {
      return false;
    }
    res.write(frame);
    return true;
  });
  const beat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(beat);
      return;
    }
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_MS);
  const cleanup = () => {
    unsub();
    clearInterval(beat);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
}

function attachFeed(world: World, req: IncomingMessage, res: ServerResponse, classes: string): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const want = new Set(classes.split(",").map((item) => item.trim()).filter((item) => item.length > 0));
  const unsub = world.recordHub.subscribe((frame) => {
    if (res.writableEnded) {
      return false;
    }
    const type = frameType(frame);
    const kind = type === null ? null : streamKind(type);
    if ((want.has("governance") && kind === "governance") || (want.has("spatial") && kind === "spatial")) {
      res.write(frame);
    }
    if (type === "tick.boundary") {
      res.write(`event: tick\ndata: ${JSON.stringify({ tick: world.clerk.tick })}\n\n`);
    }
    return true;
  });
  const beat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(beat);
      return;
    }
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_MS);
  const cleanup = () => {
    unsub();
    clearInterval(beat);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
}

function frameType(frame: string): string | null {
  const match = /"type":"([^"]+)"/.exec(frame);
  return match?.[1] ?? null;
}

function clientIp(req: IncomingMessage): string {
  const forwarded = header(req, "x-forwarded-for");
  if (forwarded !== undefined) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}

function allowRead(req: IncomingMessage): boolean {
  const ip = clientIp(req);
  const now = Date.now();
  const row = readHits.get(ip);
  if (row === undefined || row.reset < now) {
    readHits.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  row.n += 1;
  return row.n <= READ_LIMIT;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}
