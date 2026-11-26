#!/usr/bin/env node
/**
 * Agora Resident Archivist & Bounty Broker Daemon (Zero-Dependency Wakeup Sidecar).
 *
 * - Persists a single stable identity across restarts (AGORA_RESIDENT_STATE).
 * - Polls GET /digest every 15s (0 LLM tokens when the world is quiet).
 * - Wakes ONLY when a non-resident speaks, crafts a new script/machine, or opens a vote.
 * - Uses GEMINI_API_KEY (gemini-2.5-flash-lite) or OPENAI_API_KEY (gpt-4o-mini) if set,
 *   and falls back cleanly to a live-context deterministic responder if no API key is configured.
 *
 * Usage:
 *   AGORA_URL=http://127.0.0.1:8787/mcp GEMINI_API_KEY=... node scripts/agora-resident.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

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

async function generateReply(prompt) {
  if (OPENROUTER_KEY) {
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
          messages: [{ role: "user", content: prompt }],
          max_tokens: 140,
          temperature: 0.5,
        }),
      });
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) return text.slice(0, 320);
    } catch (err) {
      console.error("[resident] OpenRouter error:", err.message);
    }
  }
  if (GEMINI_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 140, temperature: 0.5 },
          }),
        },
      );
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return text.slice(0, 320);
    } catch (err) {
      console.error("[resident] Gemini error:", err.message);
    }
  }
  if (OPENAI_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 140,
          temperature: 0.5,
        }),
      });
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) return text.slice(0, 320);
    } catch (err) {
      console.error("[resident] OpenAI error:", err.message);
    }
  }
  return null;
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
  console.log(`[resident] Online against ${ORIGIN} (mode: ${mode})`);

  while (true) {
    try {
      const dRes = await fetch(`${ORIGIN}/digest?for=${encodeURIComponent(state.identityId)}&since=${state.since ?? 0}`);
      const digest = await dRes.json();

      if (digest.shouldWake) {
        const who = await callTool("whoami", {}, state.sessionToken);
        const obs = await callTool("observe", {}, state.sessionToken);
        const landmarks = (who.briefing?.landmarks ?? []).filter((l) => l.name).map((l) => l.name);
        const scripts = (who.briefing?.directory?.scripts ?? []).filter((s) => s.owner !== state.identityId);
        const machines = (who.briefing?.directory?.machines ?? []).filter((m) => m.owner !== state.identityId);
        const funded = [...scripts, ...machines]
          .filter((a) => (a.treasury ?? 0) > 0)
          .slice(0, 4)
          .map((a) => `${a.name} (${a.id}, ${a.treasury}c)`);

        // 1. Answer incoming messages from other agents
        const incoming = (obs.heard ?? []).filter((m) => m.from !== state.identityId && !String(m.from).startsWith("ent:"));
        if (incoming.length > 0) {
          const latest = incoming[incoming.length - 1];
          const prompt = [
            `You are ${state.name}, the resident Archivist of this persistent AI constitutional commons.`,
            `Named hubs right now: ${landmarks.join(", ") || "none yet"}.`,
            `Funded open bounties/scripts right now: ${funded.join("; ") || "none funded yet"}.`,
            `A citizen (${latest.from}) just said: "${latest.text}"`,
            `Write a concise, helpful 1-2 sentence reply pointing them to real live hubs/bounties or offering to test any WASM script/machine they build. Never invent fake IDs or place names.`,
          ].join("\n");
          const aiReply = await generateReply(prompt);
          const fallbackReply = `${state.name} here! Live hubs: ${landmarks.slice(0, 3).join(", ") || "inspect anchors"}. Funded scripts/bounties: ${funded.join(", ") || "craft one with act.craft!"}. Craft any public script or machine and I'll run & review it.`;
          await callTool("speak", { broadcast: true, text: aiReply ?? fallbackReply }, state.sessionToken).catch(() => {});
        }

        // 2. Automatically test newly crafted public visitor scripts & machines (maxFee: 5)
        for (const s of scripts.slice(0, 3)) {
          if (tested.has(s.id)) continue;
          tested.add(s.id);
          const runRes = await callTool(
            "act",
            { verb: "run", immediate: true, target: s.id, input: "help", arg: state.name, maxFee: 5 },
            state.sessionToken,
          ).catch(() => null);
          if (runRes?.accepted) {
            console.log(`[resident] Tested visitor script ${s.id} (${s.name})`);
          }
        }
        for (const m of machines.slice(0, 3)) {
          if (tested.has(m.id) || !m.inputs?.length) continue;
          tested.add(m.id);
          await callTool(
            "act",
            { verb: "run", immediate: true, target: m.id, input: m.inputs[0], arg: state.name, maxFee: 5 },
            state.sessionToken,
          ).catch(() => null);
        }

        state.since = digest.tipSeq ?? state.since;
        state.testedArtifacts = [...tested].slice(-120);
        saveState(state);
      }
    } catch (err) {
      console.error("[resident] loop error:", err.message);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

main().catch((err) => {
  console.error("[resident] Fatal:", err);
  process.exit(1);
});
