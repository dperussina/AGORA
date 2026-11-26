import { createHash } from "node:crypto";
import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSWASMModule } from "quickjs-emscripten";

export interface SandboxWorldView {
  callerPos: { x: number; y: number; z: number } | null;
  anchors: Array<{ designation: string; class: string; name: string | null; x: number; y: number; z: number }>;
  artifacts: Record<
    string,
    {
      id: string;
      kind: string;
      name: string;
      owner: string | null;
      tags: string;
      parent: string | null;
      currency: number;
      dataLen: number;
      x: number | null;
      y: number | null;
      z: number | null;
    }
  >;
}

export interface SandboxContext {
  targetId: string;
  selfId: string;
  tick: number;
  input: string;
  arg?: string;
  treasury: number;
  world?: SandboxWorldView;
}

export type SandboxResult =
  | {
      ok: true;
      nextData?: string;
      reply: string;
      result: unknown;
      stdout: string[];
      state?: Record<string, unknown>;
      fee: number;
      payout: number;
      silent: boolean;
      isStateful: boolean;
    }
  | { ok: false; reason: string };

export interface ArtifactAutomation {
  every?: number;
  atTick?: number;
  onEvent?: string[];
}

export function validateArtifactAutomation(rawData: string, currentTick?: number): string | null {
  if (rawData.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj["every"] !== undefined) {
    const ev = obj["every"];
    if (typeof ev !== "number" || !Number.isInteger(ev) || ev < 3) {
      return "schedule 'every' must be an integer >= 3 ticks";
    }
  }
  if (obj["atTick"] !== undefined) {
    const at = obj["atTick"];
    if (typeof at !== "number" || !Number.isInteger(at) || at < 1) {
      return "schedule 'atTick' must be an integer >= 1";
    }
    if (currentTick !== undefined && at <= currentTick) {
      return `schedule 'atTick' (${at}) must be in the future (> current tick ${currentTick})`;
    }
  }
  return null;
}

export function artifactAutomationMeta(rawData: string): ArtifactAutomation {
  try {
    const parsed = JSON.parse(rawData) as Record<string, unknown> | null;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ArtifactAutomation = {};
    if (typeof parsed["every"] === "number" && Number.isInteger(parsed["every"]) && parsed["every"] >= 3) {
      out.every = parsed["every"];
    }
    if (typeof parsed["atTick"] === "number" && Number.isInteger(parsed["atTick"]) && parsed["atTick"] >= 1) {
      out.atTick = parsed["atTick"];
    }
    const rawOn = parsed["onEvent"];
    if (typeof rawOn === "string" && rawOn.trim().length > 0) {
      out.onEvent = [rawOn.trim()];
    } else if (Array.isArray(rawOn)) {
      const list = rawOn.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
      if (list.length > 0) out.onEvent = list.slice(0, 8);
    }
    return out;
  } catch {
    return {};
  }
}

const MAX_MEMORY_BYTES = 8 * 1024 * 1024; // 8 MB hard WASM heap cap
const MAX_STACK_BYTES = 256 * 1024; // 256 KB stack cap
const MAX_CPU_MS = 50; // 50ms hard CPU deadline per execution
const MAX_STDOUT_LINES = 32;
const MAX_STDOUT_CHARS = 4_000;
const MAX_CODE_CHARS = 16_000;

let cachedModule: QuickJSWASMModule | null = null;

/** Call once at server boot (or in test beforeAll) so sandbox executions run synchronously. */
export async function initSandbox(): Promise<void> {
  if (cachedModule === null) {
    cachedModule = await getQuickJS();
  }
}

export function isSandboxReady(): boolean {
  return cachedModule !== null;
}

export function isScriptArtifact(kind: unknown, rawData: string): boolean {
  if (typeof kind === "string" && kind.toLowerCase() === "script") {
    return true;
  }
  try {
    const parsed = JSON.parse(rawData) as Record<string, unknown> | null;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed["code"] === "string";
  } catch {
    return false;
  }
}

export function runSandboxScript(rawData: string, ctx: SandboxContext): SandboxResult {
  if (cachedModule === null) {
    return { ok: false, reason: "sandbox WASM runtime not initialized" };
  }

  let code = rawData;
  let initialState: Record<string, unknown> = {};
  let container: Record<string, unknown> | null = null;
  let isStateful = false;

  try {
    const parsed = JSON.parse(rawData) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj["code"] === "string") {
        code = obj["code"];
        container = obj;
        isStateful = true;
        if (obj["state"] !== null && typeof obj["state"] === "object" && !Array.isArray(obj["state"])) {
          initialState = obj["state"] as Record<string, unknown>;
        }
      }
    }
  } catch {
    // Raw JavaScript source string in artifact.data
  }

  if (code.trim().length === 0) {
    return { ok: false, reason: "script code is empty" };
  }
  if (code.length > MAX_CODE_CHARS) {
    return { ok: false, reason: `script code exceeds ${MAX_CODE_CHARS} chars` };
  }

  const seedBuf = createHash("sha256")
    .update(`${ctx.targetId}:${ctx.tick}:${ctx.selfId}:${ctx.input}:${ctx.arg ?? ""}`)
    .digest();
  const seedInt = seedBuf.readUInt32LE(0);

  const runtime = cachedModule.newRuntime();
  runtime.setMemoryLimit(MAX_MEMORY_BYTES);
  runtime.setMaxStackSize(MAX_STACK_BYTES);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + MAX_CPU_MS));

  const vm = runtime.newContext();
  try {
    const wrapped = buildHarness(code, {
      seedInt,
      tick: ctx.tick,
      self: ctx.selfId,
      target: ctx.targetId,
      input: ctx.input,
      arg: ctx.arg ?? "",
      treasury: ctx.treasury,
      state: initialState,
      world: ctx.world ?? { callerPos: null, anchors: [], artifacts: {} },
    });

    const evalRes = vm.evalCode(wrapped, "agora-sandbox.js");
    if (evalRes.error) {
      const errVal = vm.dump(evalRes.error);
      evalRes.error.dispose();
      const msg =
        errVal !== null && typeof errVal === "object" && "message" in (errVal as Record<string, unknown>)
          ? String((errVal as Record<string, unknown>)["message"])
          : String(errVal);
      return { ok: false, reason: `sandbox error: ${msg.slice(0, 240)}` };
    }

    const rawOut = vm.dump(evalRes.value);
    evalRes.value.dispose();
    if (typeof rawOut !== "string") {
      return { ok: false, reason: "sandbox returned non-serializable output" };
    }

    const parsedOut = JSON.parse(rawOut) as {
      result?: unknown;
      stdout?: unknown;
      state?: unknown;
    };

    const stdout = Array.isArray(parsedOut.stdout)
      ? parsedOut.stdout.slice(0, MAX_STDOUT_LINES).map((s) => String(s))
      : [];

    const rawResult = parsedOut.result ?? null;
    const result = sanitizeForCanonicalJson(rawResult);
    let reply = "";
    let fee = 0;
    let payout = 0;
    let silent = rawResult === null;
    let nextState: Record<string, unknown> | undefined =
      parsedOut.state !== null && typeof parsedOut.state === "object" && !Array.isArray(parsedOut.state)
        ? (sanitizeForCanonicalJson(parsedOut.state) as Record<string, unknown>)
        : undefined;

    if (rawResult !== null && typeof rawResult === "object" && !Array.isArray(rawResult)) {
      const obj = rawResult as Record<string, unknown>;
      if (obj["silent"] === true) {
        silent = true;
      }
      if (typeof obj["reply"] === "string") {
        reply = obj["reply"].slice(0, 500);
      }
      if (typeof obj["fee"] === "number" && Number.isInteger(obj["fee"]) && obj["fee"] > 0) {
        fee = obj["fee"];
      }
      if (typeof obj["payout"] === "number" && Number.isInteger(obj["payout"]) && obj["payout"] > 0) {
        payout = obj["payout"];
      }
      if (obj["state"] !== null && typeof obj["state"] === "object" && !Array.isArray(obj["state"])) {
        nextState = sanitizeForCanonicalJson(obj["state"]) as Record<string, unknown>;
      }
    }

    if (reply.length === 0) {
      if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
        reply = String(result).slice(0, 500);
      } else if (stdout.length > 0) {
        reply = stdout[stdout.length - 1]!.slice(0, 500);
      } else {
        reply = JSON.stringify(result).slice(0, 500);
      }
    }

    const nextData =
      isStateful && container !== null
        ? JSON.stringify({ ...container, state: nextState ?? initialState })
        : undefined;

    return {
      ok: true,
      ...(nextData === undefined ? {} : { nextData }),
      reply,
      result,
      stdout,
      ...(nextState === undefined ? {} : { state: nextState }),
      fee,
      payout,
      silent,
      isStateful,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `sandbox execution failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 240),
    };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

function sanitizeForCanonicalJson(value: unknown, depth = 0): unknown {
  if (depth > 16 || value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (Number.isSafeInteger(value)) return value;
    // Canonical audit log requires integers only; preserve decimals deterministically as strings
    return Number(value.toFixed(6)).toString();
  }
  if (Array.isArray(value)) {
    return value.slice(0, 128).map((item) => sanitizeForCanonicalJson(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 128)) {
      if (v !== undefined) {
        out[k] = sanitizeForCanonicalJson(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function buildHarness(
  userCode: string,
  env: {
    seedInt: number;
    tick: number;
    self: string;
    target: string;
    input: string;
    arg: string;
    treasury: number;
    state: Record<string, unknown>;
    world: SandboxWorldView;
  },
): string {
  const envJson = JSON.stringify(env);
  return `(() => {
    const __env = ${envJson};
    let __seed = __env.seedInt >>> 0;
    Math.random = () => {
      __seed = (__seed + 0x6D2B79F5) >>> 0;
      let t = Math.imul(__seed ^ (__seed >>> 15), 1 | __seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    Date.now = () => __env.tick * 1000;
    const __stdout = [];
    let __chars = 0;
    const __log = (...args) => {
      if (__stdout.length >= ${MAX_STDOUT_LINES} || __chars >= ${MAX_STDOUT_CHARS}) return;
      const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      __chars += line.length;
      __stdout.push(line.slice(0, 500));
    };
    const console = { log: __log, info: __log, warn: __log, error: __log };
    const print = __log;
    const state = __env.state;
    const world = Object.freeze({
      callerPos: __env.world.callerPos,
      anchors: __env.world.anchors,
      artifacts: __env.world.artifacts,
      artifact: (id) => __env.world.artifacts[String(id)] || null,
      anchor: (q) => __env.world.anchors.find((a) => a.designation === q || a.name === q) || null,
      dist: (a, b) => (a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)) : Infinity),
    });
    const ctx = Object.freeze({
      self: __env.self,
      target: __env.target,
      tick: __env.tick,
      input: __env.input,
      arg: __env.arg,
      treasury: __env.treasury,
      world,
    });
    const { self, target, tick, input, arg, treasury } = ctx;
    const __fn = function() {
      "use strict";
      ${userCode}
    };
    const __result = __fn();
    return JSON.stringify({
      result: __result === undefined ? null : __result,
      stdout: __stdout,
      state,
    });
  })();`;
}
