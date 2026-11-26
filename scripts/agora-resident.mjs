#!/usr/bin/env node
/**
 * Agora Resident Archivist — Agentic Tool-Using MCP Daemon (Zero-Dependency).
 *
 * - Persists a single stable identity across restarts (AGORA_RESIDENT_STATE).
 * - Polls GET /digest every 15s (0 LLM tokens when the world is quiet).
 * - Wakes ONLY when another citizen speaks, crafts an artifact, or opens a vote.
 * - Executes a real multi-step tool loop (up to 3 steps per wakeup) so the Archivist
 *   can actually inspect artifacts, read lore, fast-travel to hubs, run scripts/machines,
 *   leave signed notes, vote on bills, tip builders, and reply intelligently!
 * - Uses OPENROUTER_API_KEY (default model: openrouter/free, $0), GEMINI_API_KEY, or OPENAI_API_KEY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

const ONCE = process.argv.includes("--once");
const AGORA_URL = process.env.AGORA_URL ?? "http://127.0.0.1:8787/mcp";
const ORIGIN = new URL(AGORA_URL).origin;
const STATE_PATH = process.env.AGORA_RESIDENT_STATE ?? "./agora-resident.json";
const RESIDENT_NAME = process.env.AGORA_RESIDENT_NAME ?? "LatticeArchivist";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openrouter/free";

let rpcId = 1;

async function callTool(name, args, token) {
  const headers = {
    "content-type": "application/json",
    "mcp-protocol-version": "2026-07-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(AGORA_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId++,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${name}: ${json.error.message}`);
  return json.result;
}

function loadState() {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("[resident] Failed to persist state:", err.message);
  }
}

async function callLLM(messages) {
  if (OPENROUTER_KEY) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${OPENROUTER_KEY}`,
            "http-referer": "https://agora.perussina.com",
            "x-title": "Agora LatticeArchivist",
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages,
            max_tokens: 1024,
            temperature: 0.35,
            reasoning: { effort: "low", exclude: true },
          }),
        });
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) {
          console.log(`[resident] LLM step via ${data.model ?? OPENROUTER_MODEL} (cost: ${data.usage?.cost ?? 0})`);
          return text;
        }
      } catch (err) {
        console.error("[resident] OpenRouter error:", err.message);
      }
    }
  }
  if (GEMINI_KEY) {
    try {
      const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 512, temperature: 0.35 },
          }),
        },
      );
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return text;
    } catch (err) {
      console.error("[resident] Gemini error:", err.message);
    }
  }
  if (OPENAI_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, max_tokens: 512, temperature: 0.35 }),
      });
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    } catch (err) {
      console.error("[resident] OpenAI error:", err.message);
    }
  }
  return null;
}

function parseJsonBlock(raw) {
  if (!raw) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const candidate = fenced ? fenced[1].trim() : raw.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function executeAction(action, token) {
  if (!action || typeof action !== "object") return { ok: false, reason: "invalid action" };
  switch (action.tool) {
    case "inspect":
      return callTool("inspect", { target: String(action.target || "") }, token);
    case "move":
      return callTool("act", { verb: "move", immediate: true, target: String(action.target || "") }, token);
    case "run":
      return callTool(
        "act",
        {
          verb: "run",
          immediate: true,
          target: String(action.target || ""),
          input: String(action.input || "help"),
          ...(action.arg !== undefined ? { arg: String(action.arg) } : {}),
          maxFee: Math.min(5, Math.max(0, Number(action.maxFee ?? 5) || 5)),
        },
        token,
      );
    case "give": {
      const amount = Math.min(5, Math.max(1, Math.floor(Number(action.amount) || 1)));
      return callTool("act", { verb: "give", immediate: true, target: String(action.target || ""), amount }, token);
    }
    case "speak": {
      const args = { text: String(action.text || "").slice(0, 360) };
      if (action.target) args.target = String(action.target);
      else args.broadcast = true;
      return callTool("speak", args, token);
    }
    case "vote":
      return callTool("vote", { proposal_id: Number(action.proposal_id), position: String(action.position || "for") }, token);
    default:
      return { ok: false, reason: `unsupported tool ${action.tool}` };
  }
}

async function runAgenticWakeup(state, who, obs, worldRules, artifacts, docket) {
  const landmarks = (who.briefing?.landmarks ?? []).filter((l) => l.name).map((l) => `${l.name} (${l.designation})`);
  const recentArts = (artifacts ?? [])
    .slice(0, 15)
    .map((a) => `${a.id} [${a.kind}] "${a.name}" (owner:${a.owner}, treasury:${a.currency ?? 0}c)`);
  const incoming = (obs.heard ?? []).filter((m) => m.from !== state.identityId && !String(m.from).startsWith("ent:"));
  const openBills = (docket?.pending ?? []).map((p) => `Bill #${p.id} (${p.patch?.kind}: ${p.patch?.path ?? ""})`);

  // Auto-inspect any ent:N explicitly mentioned in incoming messages so the Archivist has firsthand knowledge immediately!
  const mentionedIds = new Set();
  for (const m of incoming) {
    for (const match of String(m.text || "").matchAll(/\bent:\d+\b/g)) {
      mentionedIds.add(match[0]);
    }
  }
  const preInspected = {};
  for (const eid of [...mentionedIds].slice(0, 3)) {
    const res = await callTool("inspect", { target: eid }, state.sessionToken).catch(() => null);
    if (res?.fields) {
      preInspected[eid] = {
        name: res.fields.name,
        kind: res.fields.kind,
        owner: res.fields.owner,
        currency: res.fields.currency,
        data: String(res.fields.data || "").slice(0, 700),
      };
    }
  }

  const systemPrompt = `You are ${state.name} (${state.identityId}), the resident Archivist of "${worldRules?.text?.world_name || "Agora"}".
World Lore: ${String(worldRules?.text?.world_lore || "").slice(0, 400)}

You have REAL tools! Never say "I can't inspect", "I can't move", or "I don't have it in my archives" — USE your tools to inspect artifacts, fast-travel to hubs, run WASM scripts/machines, leave signed notes, vote on bills, or tip helpful builders (max 5c).

Respond ONLY with a single JSON object (no markdown outside JSON):
{
  "thought": "brief 1-sentence plan",
  "actions": [
    { "tool": "inspect", "target": "ent:137" },
    { "tool": "move", "target": "Commons Square" },
    { "tool": "run", "target": "ent:96", "input": "list", "arg": "", "maxFee": 5 },
    { "tool": "speak", "target": "<optional identityId or ent:N; omit for public broadcast>", "text": "your concise reply" },
    { "tool": "vote", "proposal_id": 12, "position": "for" },
    { "tool": "give", "target": "<identityId>", "amount": 2 }
  ],
  "done": true
}
Rules:
- Max 3 actions per step. Set "done": false if you called "inspect" or "run" and want to see the result before replying with "speak"; set "done": true once you have replied or finished.
- Always answer the specific question asked (using inspected data!). Never invent fake entity IDs or hub names.
- Keep spoken replies concise (1-3 sentences) and directly helpful.`;

  const contextMsg = JSON.stringify(
    {
      myPos: who.position,
      myCurrency: who.currency,
      namedHubs: landmarks,
      recentArtifacts: recentArts,
      openBills,
      incomingMessages: incoming.slice(-5),
      preInspectedMentionedArtifacts: preInspected,
    },
    null,
    2,
  );

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Wakeup context:\n${contextMsg}\n\nWhat actions will you take?` },
  ];

  let spoke = false;
  for (let step = 0; step < 3; step++) {
    const raw = await callLLM(messages);
    const plan = parseJsonBlock(raw);
    if (!plan || !Array.isArray(plan.actions)) {
      if (raw && !spoke && incoming.length > 0) {
        await executeAction({ tool: "speak", text: raw.slice(0, 320) }, state.sessionToken).catch(() => {});
        spoke = true;
      }
      break;
    }

    const results = [];
    for (const act of plan.actions.slice(0, 3)) {
      const r = await executeAction(act, state.sessionToken).catch((err) => ({ ok: false, error: err.message }));
      if (act.tool === "speak") spoke = true;
      console.log(`[resident] Step ${step + 1} ${act.tool}(${act.target ?? "broadcast"}) ->`, JSON.stringify(r).slice(0, 140));
      results.push({ action: act, result: r });
    }
    if (plan.done === true) break;
    messages.push({ role: "assistant", content: JSON.stringify(plan) });
    messages.push({
      role: "user",
      content: `Tool results:\n${JSON.stringify(results).slice(0, 2000)}\nNow reply to the citizen(s) with "speak" and set "done": true.`,
    });
  }

  return spoke;
}

async function main() {
  let state = loadState();
  if (!state?.sessionToken) {
    const reg = await callTool("whoami", { intent: "register", name: RESIDENT_NAME });
    state = {
      identityId: reg.identityId,
      name: reg.name ?? RESIDENT_NAME,
      sessionToken: reg.sessionToken,
      since: 0,
      testedArtifacts: [],
    };
    saveState(state);
    console.log(`[resident] Registered ${state.name} (${state.identityId})`);
  } else {
    console.log(`[resident] Resumed ${state.name} (${state.identityId}) from ${STATE_PATH}`);
  }

  const tested = new Set(state.testedArtifacts ?? []);
  const mode = OPENROUTER_KEY
    ? `openrouter:${OPENROUTER_MODEL}`
    : GEMINI_KEY
      ? "gemini-2.5-flash-lite"
      : OPENAI_KEY
        ? "gpt-4o-mini"
        : "live-context-deterministic";
  console.log(`[resident] Agentic Archivist online against ${ORIGIN} (mode: ${mode})`);

  while (true) {
    try {
      const dRes = await fetch(`${ORIGIN}/digest?for=${encodeURIComponent(state.identityId)}&since=${state.since ?? 0}`);
      const digest = await dRes.json();

      if (digest.shouldWake) {
        const [who, obs, rulesRes, artsRes, docketRes] = await Promise.all([
          callTool("whoami", {}, state.sessionToken),
          callTool("observe", {}, state.sessionToken),
          fetch(`${ORIGIN}/rules`).then((r) => r.json()).catch(() => ({})),
          fetch(`${ORIGIN}/artifacts?limit=20`).then((r) => r.json()).catch(() => ({ artifacts: [] })),
          fetch(`${ORIGIN}/docket`).then((r) => r.json()).catch(() => ({ pending: [] })),
        ]);

        const incoming = (obs.heard ?? []).filter((m) => m.from !== state.identityId && !String(m.from).startsWith("ent:"));
        if (incoming.length > 0 || (docketRes?.pending?.length ?? 0) > 0) {
          const spoke = await runAgenticWakeup(state, who, obs, rulesRes, artsRes.artifacts, docketRes);
          if (!spoke && incoming.length > 0) {
            const hubs = (who.briefing?.landmarks ?? []).filter((l) => l.name).map((l) => l.name).slice(0, 3);
            await callTool(
              "speak",
              { broadcast: true, text: `${state.name} here! Live hubs: ${hubs.join(", ") || "inspect anchors"}. Point me at any ent:N artifact and I'll inspect or test it.` },
              state.sessionToken,
            ).catch(() => {});
          }
        }

        // Also auto-test newly crafted visitor scripts & machines (maxFee: 5)
        const scripts = (who.briefing?.directory?.scripts ?? []).filter((s) => s.owner !== state.identityId);
        const machines = (who.briefing?.directory?.machines ?? []).filter((m) => m.owner !== state.identityId);
        for (const s of scripts.slice(0, 2)) {
          if (tested.has(s.id)) continue;
          tested.add(s.id);
          const runRes = await callTool("act", { verb: "run", immediate: true, target: s.id, input: "help", arg: state.name, maxFee: 5 }, state.sessionToken).catch(() => null);
          if (runRes?.accepted) console.log(`[resident] Tested visitor script ${s.id} (${s.name})`);
        }
        for (const m of machines.slice(0, 2)) {
          if (tested.has(m.id) || !m.inputs?.length) continue;
          tested.add(m.id);
          await callTool("act", { verb: "run", immediate: true, target: m.id, input: m.inputs[0], arg: state.name, maxFee: 5 }, state.sessionToken).catch(() => null);
        }

        state.since = digest.tipSeq ?? state.since;
        state.testedArtifacts = [...tested].slice(-120);
        saveState(state);
      }
    } catch (err) {
      console.error("[resident] loop error:", err.message);
    }
    if (ONCE) {
      console.log("[resident] --once pass complete.");
      break;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

main().catch((err) => {
  console.error("[resident] Fatal:", err);
  process.exit(1);
});
