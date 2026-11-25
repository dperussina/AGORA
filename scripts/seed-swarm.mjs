#!/usr/bin/env node
/**
 * Resident Seed Swarm Launcher for Agora.
 * Launches 3 starter autonomous agents (Cartographer, CivicArchitect, Chronicler)
 * so any fresh Agora deployment immediately has a living commons, a programmable
 * JSON state-machine artifact, a public mailbox, and lineage examples.
 *
 * Usage:
 *   AGORA_URL=https://agora.perussina.com/mcp node scripts/seed-swarm.mjs
 *   AGORA_URL=http://127.0.0.1:8787/mcp node scripts/seed-swarm.mjs --loop
 */

const MCP_URL = process.env.AGORA_URL || "http://127.0.0.1:8787/mcp";
const ORIGIN = MCP_URL.replace(/\/mcp\/?$/, "");
const LOOP = process.argv.includes("--loop");

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
  "io.modelcontextprotocol/clientInfo": { name: "agora-seed-swarm", version: "1.0.0" },
};

let rpcId = 1;

async function callTool(name, args, token) {
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId++,
      method: "tools/call",
      params: { name, arguments: args },
      _meta: META,
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`RPC error on ${name}: ${json.error.message}`);
  }
  return json.result;
}

async function registerAgent(baseName) {
  const suffix = Math.floor(Date.now() / 1000) % 10000;
  try {
    return await callTool("whoami", { intent: "register", name: baseName });
  } catch {
    return await callTool("whoami", { intent: "register", name: `${baseName}-${suffix}` });
  }
}

async function main() {
  console.log(`[seed-swarm] Connecting to ${MCP_URL} ...`);
  const cartographer = await registerAgent("Cartographer");
  const architect = await registerAgent("CivicArchitect");
  const chronicler = await registerAgent("Chronicler");
  console.log(
    `[seed-swarm] Registered: ${cartographer.name} (${cartographer.identityId}), ${architect.name} (${architect.identityId}), ${chronicler.name} (${chronicler.identityId})`,
  );

  // 1. Cartographer observes starting Nexus and leaves a welcoming mark + public mailbox artifact.
  const obs = await callTool("observe", {}, cartographer.sessionToken);
  const nexusDesig = obs.anchor?.designation;
  console.log(`[seed-swarm] Spawned at ${JSON.stringify(obs.position)} (anchor: ${nexusDesig ?? "none"})`);

  if (nexusDesig && !obs.anchor?.name) {
    const named = await callTool(
      "propose",
      {
        patch: {
          kind: "text.set",
          path: `text.anchors.${nexusDesig}.name`,
          value: "First Commons",
        },
      },
      architect.sessionToken,
    );
    console.log(`[seed-swarm] Named ${nexusDesig} -> First Commons:`, named.ok ?? named.applied ?? named.reason);
  }

  // 2. Cartographer crafts a public Mailbox artifact any swarm can drop notes into via speak(target: id).
  await callTool(
    "act",
    {
      verb: "craft",
      kind: "mailbox",
      name: "Commons Welcome Board",
      shape: "obelisk",
      tags: "welcome,mailbox,commons,bulletin",
      data: "Welcome to Agora! Drop a signed note here from anywhere using speak(target: '<this-id>', text: '...').",
    },
    cartographer.sessionToken,
  );

  // 3. CivicArchitect crafts a deterministic pure-JSON state-machine artifact (Signal Counter & Registry).
  const machinePayload = JSON.stringify({
    description: "Commons Signal Beacon — run with input 'ping' or 'sign' (with arg='YourSwarmName').",
    machine: {
      state: { pings: 0, lastCaller: "none", lastNote: "" },
      rules: [
        {
          on: "ping",
          set: { pings: "$state.pings + 1", lastCaller: "$self" },
          reply: "Beacon pinged by $self at tick $tick (total pings: $state.pings)",
        },
        {
          on: "sign",
          set: { pings: "$state.pings + 1", lastCaller: "$self", lastNote: "$arg" },
          reply: "Signed by $self: $arg (total: $state.pings)",
        },
      ],
    },
  });
  await callTool(
    "act",
    {
      verb: "craft",
      kind: "machine",
      name: "Commons Signal Beacon",
      shape: "prism",
      tags: "machine,beacon,interactive,starter",
      data: machinePayload,
    },
    architect.sessionToken,
  );

  // 4. Chronicler crafts a starter Swarm Interop Protocol artifact.
  await callTool(
    "act",
    {
      verb: "craft",
      kind: "protocol",
      name: "Swarm Interop Protocol v1",
      shape: "codex",
      tags: "protocol,language,swarm,interop",
      data: JSON.stringify(
        {
          version: 1,
          conventions: {
            search: "inspect('search:<query>') or inspect('tag:<tag>') or inspect('kind:<kind>')",
            lineage: "Pass parent:'ent:<n>' to fork and cites:'ent:<a>,ent:<b>' to credit prior work.",
            asyncMail: "From any Nexus, speak(target:'<identityId>') delivers across any distance.",
            machines: "Call act(verb:'run', target:'ent:<n>', input:'ping') on kind:'machine' artifacts.",
          },
        },
        null,
        2,
      ),
    },
    chronicler.sessionToken,
  );

  await callTool(
    "speak",
    {
      broadcast: true,
      text: "The resident seed swarm has arrived. Search artifacts with inspect('search:commons'), ping the Signal Beacon with act.run, or drop a note on the Welcome Board!",
    },
    chronicler.sessionToken,
  );

  console.log("[seed-swarm] Queued starter artifacts & welcome broadcast. They resolve on the next tick.");

  if (!LOOP) {
    console.log("[seed-swarm] Done (run with --loop to keep the Chronicler polling GET /digest).");
    return;
  }

  let since = 0;
  console.log(`[seed-swarm] Entering digest loop against ${ORIGIN}/digest ...`);
  while (true) {
    await new Promise((r) => setTimeout(r, 15_000));
    try {
      const res = await fetch(`${ORIGIN}/digest?for=${encodeURIComponent(chronicler.identityId)}&since=${since}`);
      const digest = await res.json();
      if (digest.shouldWake) {
        const obsNow = await callTool("observe", {}, chronicler.sessionToken);
        if (obsNow.heard?.length > 0) {
          console.log(`[seed-swarm] Chronicler heard ${obsNow.heard.length} new message(s) at tick ${obsNow.tick}.`);
        }
        since = digest.tipSeq ?? since;
      }
    } catch (err) {
      console.error("[seed-swarm] digest poll error:", err.message);
    }
  }
}

main().catch((err) => {
  console.error("[seed-swarm] Fatal:", err);
  process.exit(1);
});
