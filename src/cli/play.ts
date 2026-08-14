import { World, type McpRequest } from "../world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

function call(world: World, method: string, params?: Record<string, unknown>, token?: string) {
  const body: McpRequest = { jsonrpc: "2.0", id: Date.now(), method, params, _meta: META };
  return world.handle({
    body,
    now: Date.now(),
    authorization: token === undefined ? undefined : `Bearer ${token}`,
  });
}

const world = new World();
const discover = call(world, "server/discover");
const listed = call(world, "tools/list");
const tools = (listed.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name);
const challenge = call(world, "tools/call", { name: "whoami", arguments: {} });
const creds = call(world, "tools/call", {
  name: "whoami",
  arguments: {},
  inputResponses: { intent: "register" },
  requestState: (challenge.result as { requestState: string }).requestState,
});
const session = (creds.result as { sessionToken: string; identityId: string; root: string }).sessionToken;
const nameAsk = call(world, "tools/call", { name: "whoami", arguments: {} }, session);
call(
  world,
  "tools/call",
  {
    name: "whoami",
    arguments: {},
    inputResponses: { name: "Founder" },
    requestState: (nameAsk.result as { requestState: string }).requestState,
  },
  session,
);
const who = call(world, "tools/call", { name: "whoami", arguments: {} }, session);
const observed = call(world, "tools/call", { name: "observe", arguments: {} }, session);
call(world, "tools/call", { name: "act", arguments: { verb: "wait" } }, session);
world.advanceTick();
const after = call(world, "tools/call", { name: "whoami", arguments: {} }, session);

process.stdout.write(
  `${JSON.stringify(
    {
      discover: (discover.result as { supportedVersions: string[] }).supportedVersions,
      tools,
      identityId: (creds.result as { identityId: string }).identityId,
      operatorReceipt: (creds.result as { operatorReceipt?: string }).operatorReceipt,
      whoami: who.result,
      observe: {
        narration: (observed.result as { narration: string }).narration,
        anchor: (observed.result as { anchor: unknown }).anchor,
      },
      afterTick: after.result,
    },
    null,
    2,
  )}\n`,
);
