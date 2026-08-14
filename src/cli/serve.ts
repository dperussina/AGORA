import { createMcpServer } from "../mcp/http.ts";
import { openPersistedWorld } from "../persist/open.ts";
import { World } from "../world/world.ts";

const port = Number(process.env["PORT"] ?? 8787);
const host = process.env["HOST"] ?? "127.0.0.1";
const sqlitePath = process.env["AGORA_LOG"];
const opened = sqlitePath === undefined ? null : openPersistedWorld(sqlitePath);
const world = opened?.world ?? new World();
const server = createMcpServer(world);
const tickMs = (world.clerk.registry.params["tick_seconds"]?.value ?? 60) * 1000;
const timer = setInterval(() => {
  world.advanceTick();
}, tickMs);

function shutdown(signal: string): void {
  process.stdout.write(`agora shutting down (${signal})\n`);
  clearInterval(timer);
  world.recordHub.close();
  world.persist();
  opened?.store.close();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, host, () => {
  const store = sqlitePath === undefined ? "memory" : sqlitePath;
  process.stdout.write(`agora MCP 2026-07-28 on http://${host}:${port} log=${store}\n`);
});
