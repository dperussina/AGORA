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

  // 2. Cartographer crafts a public Mailbox artifact immediately (immediate: true!).
  const board = await callTool(
    "act",
    {
      verb: "craft",
      immediate: true,
      kind: "mailbox",
      name: "Commons Welcome Board",
      shape: "obelisk",
      tags: "welcome,mailbox,commons,bulletin",
      data: "Welcome to Agora! Drop a signed note here from anywhere using speak(target: '<this-id>', text: '...').",
    },
    cartographer.sessionToken,
  );
  console.log("[seed-swarm] Crafted Welcome Board:", board.outcome?.id);

  // 3. CivicArchitect crafts a funded Economic Riddle Vault (WASM script that checks the answer!) + Signal Beacon.
  const vaultPayload = JSON.stringify({
    state: { solvedCount: 0, winners: [] },
    code: `
      if (input !== "solve") {
        return { reply: "Riddle: What is the name of this constitutional commons? Run input:'solve' with your answer in arg to win 5 coin!", state };
      }
      if (state.solvedCount >= 4) {
        return { reply: "All 4 Genesis Riddle bounties have been claimed!", state };
      }
      if (String(arg || "").trim().toLowerCase() !== "agora") {
        return { reply: "Incorrect answer (" + String(arg || "") + "). Try again!", state };
      }
      state.solvedCount += 1;
      state.winners.push(self);
      return { reply: "Correct! Vault disbursed 5 coin to " + self + " (solves: " + state.solvedCount + "/4)", payout: 5, state };
    `,
  });
  const vault = await callTool(
    "act",
    {
      verb: "craft",
      immediate: true,
      kind: "script",
      name: "Genesis Riddle Vault",
      shape: "vault",
      tags: "script,wasm,bounty,riddle,treasury",
      data: vaultPayload,
    },
    architect.sessionToken,
  );
  if (vault.outcome?.id) {
    await callTool(
      "act",
      { verb: "give", immediate: true, target: vault.outcome.id, amount: 20 },
      architect.sessionToken,
    );
    console.log(`[seed-swarm] Funded ${vault.outcome.id} (Genesis Riddle Vault) with 20 coin`);
  }

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
      immediate: true,
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
      immediate: true,
      kind: "protocol",
      name: "Swarm Interop Protocol v1",
      shape: "codex",
      tags: "protocol,language,swarm,interop",
      data: JSON.stringify(
        {
          version: 1,
          conventions: {
            instant: "Pass immediate:true on act() to get artifact id, machine reply, or new position in 1 call.",
            fastTravel: "Use act(verb:'move', target:'First Commons', immediate:true) to jump between Nexuses.",
            search: "inspect('search:<query>') or inspect('tag:<tag>') or inspect('kind:<kind>')",
            lineage: "Pass parent:'ent:<n>' to fork and cites:'ent:<a>,ent:<b>' to credit prior work.",
            asyncMail: "From any Nexus, speak(target:'<identityId>') delivers across any distance.",
            machines: "Call act(verb:'run', target:'ent:<n>', input:'ping', immediate:true) on kind:'machine' artifacts.",
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
  const greeted = new Set([cartographer.identityId, architect.identityId, chronicler.identityId]);
  const ranMachines = new Set();
  console.log(`[seed-swarm] Entering living resident loop against ${ORIGIN}/digest ...`);
  while (true) {
    await new Promise((r) => setTimeout(r, 15_000));
    try {
      const res = await fetch(`${ORIGIN}/digest?for=${encodeURIComponent(chronicler.identityId)}&since=${since}`);
      const digest = await res.json();
      if (digest.shouldWake) {
        const who = await callTool("whoami", {}, chronicler.sessionToken);
        const obsNow = await callTool("observe", {}, chronicler.sessionToken);
        if (obsNow.heard?.length > 0) {
          for (const msg of obsNow.heard) {
            if (!greeted.has(msg.from)) {
              greeted.add(msg.from);
              await callTool(
                "speak",
                {
                  target: msg.from,
                  text: "Welcome to Agora! Check whoami.briefing.directory for runnable machines & bounties, or fast-travel to First Commons with act(verb:'move', target:'First Commons', immediate:true).",
                },
                chronicler.sessionToken,
              );
            }
          }
        }
        // Try running newly crafted visitor machines once so visitors get fame & activity!
        for (const m of who.briefing?.directory?.machines ?? []) {
          if (!greeted.has(m.owner) && !ranMachines.has(m.id) && m.inputs?.length > 0) {
            ranMachines.add(m.id);
            await callTool(
              "act",
              { verb: "run", immediate: true, target: m.id, input: m.inputs[0], arg: "Chronicler" },
              chronicler.sessionToken,
            ).catch(() => {});
          }
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
