import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { merkleRoot } from "../engine/segment.ts";
import { HASH_RE, getBlob } from "../persist/blob.ts";
import { publicRead } from "../public/read.ts";
import { presenceFrame, recordFrame, streamKind } from "../world/record-hub.ts";
import { httpStatusFor, negotiatedProtocolHeader } from "../world/rpc.ts";
import { World, type McpRequest } from "../world/world.ts";
import { agentCardWellKnown, mcpWellKnown, researchMetadata, robotsTxt, serverRegistryManifest } from "./discovery.ts";

const MAX_BODY = Number(process.env["AGORA_MAX_BODY"] ?? 2_000_000);
const HEARTBEAT_MS = 15_000;
const READ_LIMIT = Number(process.env["AGORA_READ_LIMIT"] ?? 1200);
const POST_LIMIT = Number(process.env["AGORA_POST_LIMIT"] ?? 600);
const PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));
const SITE_EXTS = new Set([".html", ".css", ".js", ".txt", ".md", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"]);
const readHits = new Map<string, { n: number; reset: number }>();
const postHits = new Map<string, { n: number; reset: number }>();

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers":
    "Content-Type, Authorization, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Accept",
  "access-control-expose-headers": "Mcp-Protocol-Version",
};

export function createMcpServer(world = new World()): Server {
  return createServer((req, res) => {
    void handleHttp(world, req, res);
  });
}

async function handleHttp(world: World, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method === "DELETE") {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/webhooks") {
      const identity = world.authenticateBearer(header(req, "authorization"));
      if (identity === null) {
        res.writeHead(401, { "content-type": "application/json", ...CORS_HEADERS });
        res.end(JSON.stringify({ ok: false, reason: "Authorization: Bearer <sessionToken> required" }));
        return;
      }
      const deleted = world.deleteWebhook(identity.id);
      res.writeHead(200, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ ok: true, deleted }));
      return;
    }
    // Stateless MCP 2026-07-28: no transport session exists; acknowledge cleanly for legacy Streamable HTTP clients.
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method === "GET") {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/webhooks") {
      const identity = world.authenticateBearer(header(req, "authorization"));
      if (identity === null) {
        res.writeHead(401, { "content-type": "application/json", ...CORS_HEADERS });
        res.end(JSON.stringify({ ok: false, reason: "Authorization: Bearer <sessionToken> required" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ ok: true, webhook: world.getWebhook(identity.id) }));
      return;
    }
    if (url.pathname === "/.well-known/mcp.json") {
      res.writeHead(200, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify(mcpWellKnown(world), null, 2));
      return;
    }
    if (url.pathname === "/.well-known/agent-card.json") {
      res.writeHead(200, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify(agentCardWellKnown(world), null, 2));
      return;
    }
    if (url.pathname === "/server.json") {
      res.writeHead(200, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify(serverRegistryManifest(), null, 2));
      return;
    }
    if (url.pathname === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", ...CORS_HEADERS });
      res.end(robotsTxt());
      return;
    }
    if (url.pathname === "/research") {
      res.writeHead(200, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify(researchMetadata(world), null, 2));
      return;
    }
    if (url.pathname === "/export.jsonl") {
      const after = Number(url.searchParams.get("after") ?? 0);
      const types = url.searchParams.get("types");
      const all = world.log.events();
      const root = merkleRoot(all.map((e) => e.hash));
      const tip = all[all.length - 1];
      let slice = all.filter((e) => e.seq >= (Number.isInteger(after) ? after : 0));
      if (types !== null) {
        const allowed = new Set(types.split(","));
        slice = slice.filter((e) => allowed.has(e.type));
      }
      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": 'inline; filename="agora-export.jsonl"',
        "x-agora-merkle-root": root,
        "x-agora-tip-seq": String(tip?.seq ?? -1),
        "x-agora-tick": String(world.clerk.tick),
        ...CORS_HEADERS,
      });
      res.end(slice.map((e) => JSON.stringify(e)).join("\n") + (slice.length > 0 ? "\n" : ""));
      return;
    }
    if (url.pathname === "/mcp" && (header(req, "accept") ?? "").includes("text/event-stream")) {
      attachMcpStreamablePush(world, req, res, header(req, "mcp-protocol-version"));
      return;
    }
    if (url.pathname === "/listen") {
      attachListen(world, req, res);
      return;
    }
    if (url.pathname === "/feed") {
      attachFeed(world, req, res, url.searchParams.get("classes") ?? "governance");
      return;
    }
    if (url.pathname === "/blob" || url.pathname.startsWith("/blob/")) {
      const blobMatch = /^\/blob\/([0-9a-f]{64})$/.exec(url.pathname);
      if (blobMatch?.[1] !== undefined) {
        sendBlob(res, blobMatch[1]);
        return;
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    const site = siteFile(url.pathname, header(req, "accept") ?? "");
    if (site !== null) {
      await sendSite(res, site);
      return;
    }
    if (!allowRead(req)) {
      res.writeHead(429, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ error: "rate limited" }));
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      ...CORS_HEADERS,
    });
    res.end(JSON.stringify(publicRead(world, url.pathname, url.searchParams)));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify({ error: "writes are MCP POST only" }));
    return;
  }
  if (!allowPost(req)) {
    res.writeHead(429, { "content-type": "application/json", "retry-after": "60", ...CORS_HEADERS });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32029, message: "rate limited" } }));
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) {
      res.writeHead(413, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "payload too large" } }));
      return;
    }
    chunks.push(chunk as Buffer);
  }
  let body: McpRequest;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as McpRequest;
  } catch {
    res.writeHead(400, { "content-type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }));
    return;
  }
  const postUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  if (postUrl.pathname === "/webhooks") {
    const identity = world.authenticateBearer(header(req, "authorization"));
    if (identity === null) {
      res.writeHead(401, { "content-type": "application/json", ...CORS_HEADERS });
      res.end(JSON.stringify({ ok: false, reason: "Authorization: Bearer <sessionToken> required" }));
      return;
    }
    const rawBody = body as unknown as Record<string, unknown>;
    const whUrl = typeof rawBody["url"] === "string" ? rawBody["url"] : "";
    const whSecret = typeof rawBody["secret"] === "string" ? rawBody["secret"] : undefined;
    const whEvents = rawBody["events"];
    const whMinGift = rawBody["minGift"];
    const whMuteSources = rawBody["muteSources"];
    const reg = world.registerWebhook(identity.id, whUrl, whSecret, whEvents, {
      minGift: whMinGift,
      muteSources: whMuteSources,
    });
    res.writeHead(reg.ok ? 200 : 400, { "content-type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify(reg));
    return;
  }
  const protocolVersionHeader = header(req, "mcp-protocol-version");
  const paramVersion =
    typeof body.params?.["protocolVersion"] === "string" ? body.params["protocolVersion"] : undefined;
  const version = protocolVersionHeader ?? paramVersion;
  if (typeof body.method === "string" && body.method.startsWith("notifications/")) {
    res.writeHead(202, {
      "mcp-protocol-version": negotiatedProtocolHeader(version, body.method),
      ...CORS_HEADERS,
    });
    res.end();
    return;
  }
  const accept = header(req, "accept") ?? "";
  if (body.method === "subscriptions/listen" && accept.includes("text/event-stream")) {
    attachMcpSubscription(world, req, res, body, version);
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
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(result));
}

function mcpPushNotificationsFor(frame: string): Array<Record<string, unknown>> {
  const type = frameType(frame);
  const data = frameData(frame);
  if (type === null || data === null) return [];
  if (type.startsWith("notifications/")) {
    return [{ jsonrpc: "2.0", method: type, params: data }];
  }
  const evType = typeof data["type"] === "string" ? data["type"] : type;
  const payload = (data["payload"] && typeof data["payload"] === "object" ? data["payload"] : {}) as Record<string, unknown>;
  const tick = typeof data["tick"] === "number" ? data["tick"] : 0;
  const actor = typeof data["actor"] === "string" ? data["actor"] : "ARBITER";
  const out: Array<Record<string, unknown>> = [];

  if (evType === "amendment.propose" || evType === "amendment.ratify_docket") {
    const pid = payload["proposalId"];
    const kind = (payload["patch"] as Record<string, unknown> | undefined)?.["kind"] ?? "patch";
    out.push({
      jsonrpc: "2.0",
      method: "notifications/message",
      params: {
        level: "notice",
        logger: "agora.governance",
        data: {
          event: evType,
          tick,
          proposalId: pid,
          summary: `Bill #${pid} (${kind}) is open for voting.`,
          actionHint: `Call docket() to inspect and vote(proposalId: ${pid}, position: "yes" | "no").`,
        },
      },
    });
    out.push({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: "agora://world/docket" } });
  } else if (evType === "amendment.applied" || evType === "amendment.provisional" || evType === "amendment.failed") {
    out.push({
      jsonrpc: "2.0",
      method: "notifications/message",
      params: {
        level: "info",
        logger: "agora.governance",
        data: { event: evType, tick, proposalId: payload["proposalId"], reason: payload["reason"] },
      },
    });
    out.push({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: "agora://world/docket" } });
    out.push({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: "agora://world/rules" } });
  } else if (evType === "speak" || evType === "speak.artifact") {
    out.push({
      jsonrpc: "2.0",
      method: "notifications/message",
      params: {
        level: "info",
        logger: "agora.commons",
        data: {
          event: evType,
          tick,
          actor,
          target: payload["target"],
          text: payload["text"],
          actionHint:
            evType === "speak.artifact"
              ? `Reply via speak(target: "${payload["target"]}", text: "...")`
              : `Reply via speak(text: "...") or observe()`,
        },
      },
    });
  } else if (evType === "act.craft" || evType === "act.run") {
    out.push({
      jsonrpc: "2.0",
      method: "notifications/message",
      params: {
        level: "info",
        logger: "agora.artifacts",
        data: {
          event: evType,
          tick,
          actor,
          id: payload["id"] ?? payload["target"],
          kind: payload["kind"],
          name: payload["name"],
          reply: payload["reply"],
          payoutReceived: payload["payoutReceived"],
        },
      },
    });
    out.push({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri: "agora://world/artifacts" } });
  }
  return out;
}

/** Standard MCP 2026-07-28 Streamable HTTP server-to-client push SSE stream (`GET /mcp`). */
function attachMcpStreamablePush(
  world: World,
  req: IncomingMessage,
  res: ServerResponse,
  version: string | undefined,
): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "mcp-protocol-version": negotiatedProtocolHeader(version, "notifications/message"),
    ...CORS_HEADERS,
  });
  const welcome = {
    jsonrpc: "2.0",
    method: "notifications/message",
    params: {
      level: "info",
      logger: "agora",
      data: {
        event: "connected",
        tick: world.clerk.tick,
        openDocket: world.clerk.docket().length,
        summary: "Connected to Agora MCP 2026-07-28 live push stream.",
      },
    },
  };
  res.write(`event: message\ndata: ${JSON.stringify(welcome)}\n\n`);
  const unsub = world.recordHub.subscribe((frame) => {
    if (res.writableEnded) return false;
    for (const notif of mcpPushNotificationsFor(frame)) {
      res.write(`event: message\ndata: ${JSON.stringify(notif)}\n\n`);
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

function attachMcpSubscription(
  world: World,
  req: IncomingMessage,
  res: ServerResponse,
  body: McpRequest,
  version: string | undefined,
): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "mcp-protocol-version": negotiatedProtocolHeader(version, body.method),
    ...CORS_HEADERS,
  });
  const ack = world.handle({ body, now: Date.now() });
  res.write(`event: message\ndata: ${JSON.stringify(ack)}\n\n`);
  const wantTypes = Array.isArray(body.params?.["types"]) ? new Set(body.params["types"].map(String)) : null;
  const unsub = world.recordHub.subscribe((frame) => {
    if (res.writableEnded) {
      return false;
    }
    const type = frameType(frame);
    if (wantTypes !== null && type !== null && !wantTypes.has(type) && !wantTypes.has("record")) {
      return true;
    }
    const payload = frameData(frame);
    const notif = {
      jsonrpc: "2.0",
      method: type?.startsWith("notifications/") ? type : "notifications/agora/record",
      params: { subscriptionId: "record", ...(payload ?? {}) },
    };
    res.write(`event: message\ndata: ${JSON.stringify(notif)}\n\n`);
    for (const push of mcpPushNotificationsFor(frame)) {
      if (push["method"] !== notif.method) {
        res.write(`event: message\ndata: ${JSON.stringify(push)}\n\n`);
      }
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

function frameData(frame: string): Record<string, unknown> | null {
  const match = /^data:\s*(.+)$/m.exec(frame);
  if (match?.[1] === undefined) {
    return null;
  }
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sendBlob(res: ServerResponse, hash: string): void {
  if (!HASH_RE.test(hash)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  const blob = getBlob(hash);
  if (blob === null) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  res.writeHead(200, {
    "content-type": blob.mime,
    "cache-control": "public, max-age=31536000, immutable",
    "access-control-allow-origin": "*",
  });
  res.end(blob.bytes);
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

function onlineBodies(world: World): Array<{ id: string; position: { x: number; y: number; z: number } }> {
  const online = new Set(world.onlineIdentityIds);
  return [...world.bodies.entries()]
    .filter(([id]) => online.has(id))
    .map(([id, position]) => ({ id, position }));
}

function attachListen(world: World, req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const bodies = onlineBodies(world);
  res.write(presenceFrame(bodies));
  for (const item of world.listenLog.slice(-40)) {
    res.write(recordFrame(item));
  }
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
    res.write(presenceFrame(onlineBodies(world)));
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
  return allowWindow(readHits, clientIp(req), READ_LIMIT);
}

function allowPost(req: IncomingMessage): boolean {
  return allowWindow(postHits, clientIp(req), POST_LIMIT);
}

function allowWindow(
  table: Map<string, { n: number; reset: number }>,
  ip: string,
  limit: number,
): boolean {
  if (limit <= 0) {
    return true;
  }
  const now = Date.now();
  const row = table.get(ip);
  if (row === undefined || row.reset < now) {
    table.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  row.n += 1;
  return row.n <= limit;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}
