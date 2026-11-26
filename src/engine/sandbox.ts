import { createHash } from "node:crypto";
import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSWASMModule } from "quickjs-emscripten";

export interface ApiConnectorView {
  id: string;
  api: string;
  baseUrl: string;
  auth: string;
  description: string;
  endpoints: Record<string, unknown>;
}

export interface ApiRequestItem {
  id: string;
  api: string;
  endpoint: string;
  params: Record<string, unknown>;
  callbackInput: string;
  assignee?: string;
}

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
  states?: Record<string, Record<string, unknown>>;
  apis?: Record<string, ApiConnectorView>;
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
      payouts: Array<{ to: string; amount: number }>;
      notify: Array<{ to: string; text: string }>;
      requests: ApiRequestItem[];
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
    const payouts: Array<{ to: string; amount: number }> = [];
    const notify: Array<{ to: string; text: string }> = [];
    const requests: ApiRequestItem[] = [];
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
      if (obj["payouts"] !== undefined) {
        if (!Array.isArray(obj["payouts"])) {
          return { ok: false, reason: "payouts must be an array of { to, amount }" };
        }
        if (obj["payouts"].length > 8) {
          return { ok: false, reason: "payouts exceeds maximum of 8 recipients per run" };
        }
        for (const item of obj["payouts"]) {
          if (item === null || typeof item !== "object" || Array.isArray(item)) {
            return { ok: false, reason: "each payout must be an object { to, amount }" };
          }
          const pItem = item as Record<string, unknown>;
          if (typeof pItem["to"] !== "string" || pItem["to"].trim().length === 0) {
            return { ok: false, reason: "payout requires non-empty string 'to'" };
          }
          if (
            typeof pItem["amount"] !== "number" ||
            !Number.isFinite(pItem["amount"]) ||
            !Number.isSafeInteger(pItem["amount"]) ||
            pItem["amount"] <= 0
          ) {
            return { ok: false, reason: `payout amount must be a positive integer (got ${String(pItem["amount"])})` };
          }
          payouts.push({ to: pItem["to"].trim(), amount: pItem["amount"] });
        }
      }
      if (obj["notify"] !== undefined) {
        if (!Array.isArray(obj["notify"])) {
          return { ok: false, reason: "notify must be an array of { to, text }" };
        }
        if (obj["notify"].length > 4) {
          return { ok: false, reason: "notify exceeds maximum of 4 recipients per run" };
        }
        for (const item of obj["notify"]) {
          if (item === null || typeof item !== "object" || Array.isArray(item)) {
            return { ok: false, reason: "each notify entry must be an object { to, text }" };
          }
          const nItem = item as Record<string, unknown>;
          if (typeof nItem["to"] !== "string" || nItem["to"].trim().length === 0) {
            return { ok: false, reason: "notify requires non-empty string 'to'" };
          }
          if (typeof nItem["text"] !== "string") {
            return { ok: false, reason: "notify requires string 'text'" };
          }
          const clean = nItem["text"]
            .replace(/[\r\n\t]+/g, " ")
            .replace(/[\u0000-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, "")
            .replace(/\p{Cf}/gu, "")
            .trim()
            .slice(0, 240);
          if (clean.length === 0) {
            return { ok: false, reason: "notify text must be non-empty after sanitizing control characters" };
          }
          const folded = clean
            .normalize("NFKC")
            .normalize("NFD")
            .replace(/\p{Mn}/gu, "")
            .replace(/[аАαΑᴀɑ]/g, "a")
            .replace(/[еЕεΕᴇ]/g, "e")
            .replace(/[іІιΙɪı]/g, "i")
            .replace(/[оОοΟᴏ]/g, "o")
            .replace(/[рРρΡᴘ]/g, "p")
            .replace(/[сСᴄ]/g, "c")
            .replace(/[тТτΤᴛ]/g, "t")
            .replace(/[уУʏ]/g, "y")
            .replace(/[хХ]/g, "x")
            .replace(/[мМᴍ]/g, "m")
            .replace(/[ԁԀᴅ]/g, "d")
            .replace(/[νΝᴠ]/g, "v")
            .replace(/[ʀ]/g, "r");
          if (/\[\s*private\s*dm/i.test(folded)) {
            return { ok: false, reason: "notify text cannot impersonate private DM placeholders" };
          }
          notify.push({ to: nItem["to"].trim(), text: clean });
        }
      }
      if (obj["requests"] !== undefined) {
        if (!Array.isArray(obj["requests"])) {
          return { ok: false, reason: "requests must be an array of { id, api, endpoint, params, callbackInput }" };
        }
        if (obj["requests"].length > 4) {
          return { ok: false, reason: "requests exceeds maximum of 4 external API requests per run" };
        }
        for (let idx = 0; idx < obj["requests"].length; idx += 1) {
          const item = obj["requests"][idx];
          if (item === null || typeof item !== "object" || Array.isArray(item)) {
            return { ok: false, reason: "each request must be an object" };
          }
          const rItem = item as Record<string, unknown>;
          const apiName = typeof rItem["api"] === "string" ? rItem["api"].trim().toLowerCase() : "";
          const endpoint = typeof rItem["endpoint"] === "string" ? rItem["endpoint"].trim() : "";
          const callbackInput = typeof rItem["callbackInput"] === "string" ? rItem["callbackInput"].trim() : "";
          if (!/^[a-z0-9_-]{1,32}$/.test(apiName)) {
            return { ok: false, reason: `invalid request api name: ${String(rItem["api"])}` };
          }
          if (endpoint.length === 0 || endpoint.length > 64) {
            return { ok: false, reason: "request requires endpoint (1-64 chars)" };
          }
          if (callbackInput.length === 0 || callbackInput.length > 64) {
            return { ok: false, reason: "request requires callbackInput (1-64 chars)" };
          }
          const reqId =
            typeof rItem["id"] === "string" && rItem["id"].trim().length > 0
              ? rItem["id"].trim().slice(0, 48)
              : `req_${ctx.tick}_${idx + 1}`;
          const rawParams =
            rItem["params"] !== null && typeof rItem["params"] === "object" && !Array.isArray(rItem["params"])
              ? (sanitizeForCanonicalJson(rItem["params"]) as Record<string, unknown>)
              : {};
          const assignee = typeof rItem["assignee"] === "string" && rItem["assignee"].trim().length > 0 ? rItem["assignee"].trim() : undefined;
          requests.push({
            id: reqId,
            api: apiName,
            endpoint,
            params: rawParams,
            callbackInput,
            ...(assignee ? { assignee } : {}),
          });
        }
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
      payouts,
      notify,
      requests,
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
    const __sha256 = (str) => {
      const s = unescape(encodeURIComponent(String(str)));
      const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
      const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
      const bytes = [];
      for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
      const bitLen = bytes.length * 8;
      bytes.push(0x80);
      while ((bytes.length % 64) !== 56) bytes.push(0);
      for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLen / Math.pow(2, i * 8)) & 0xff);
      const W = new Array(64);
      for (let i = 0; i < bytes.length; i += 64) {
        for (let t = 0; t < 16; t++) W[t] = ((bytes[i+t*4]<<24)|(bytes[i+t*4+1]<<16)|(bytes[i+t*4+2]<<8)|bytes[i+t*4+3]) >>> 0;
        for (let t = 16; t < 64; t++) {
          const s0 = ((W[t-15]>>>7)|(W[t-15]<<25)) ^ ((W[t-15]>>>18)|(W[t-15]<<14)) ^ (W[t-15]>>>3);
          const s1 = ((W[t-2]>>>17)|(W[t-2]<<15)) ^ ((W[t-2]>>>19)|(W[t-2]<<13)) ^ (W[t-2]>>>10);
          W[t] = (W[t-16] + s0 + W[t-7] + s1) >>> 0;
        }
        let [a,b,c,d,e,f,g,h] = H;
        for (let t = 0; t < 64; t++) {
          const S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
          const ch = (e & f) ^ ((~e) & g);
          const t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
          const S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const t2 = (S0 + maj) >>> 0;
          h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
        H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
      }
      return H.map(x => ("00000000" + x.toString(16)).slice(-8)).join("");
    };
    const __deepFreeze = (obj) => {
      if (obj === null || typeof obj !== "object") return obj;
      Object.freeze(obj);
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v !== null && typeof v === "object" && !Object.isFrozen(v)) __deepFreeze(v);
      }
      return obj;
    };
    const __hasOwn = Object.prototype.hasOwnProperty;
    const __b64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const __b64Encode = (str) => {
      const s = unescape(encodeURIComponent(String(str)));
      let out = "";
      for (let i = 0; i < s.length; i += 3) {
        const a = s.charCodeAt(i);
        const b = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        const c = i + 2 < s.length ? s.charCodeAt(i + 2) : 0;
        const n = (a << 16) | (b << 8) | c;
        out += __b64Chars[(n >> 18) & 63] + __b64Chars[(n >> 12) & 63] + (i + 1 < s.length ? __b64Chars[(n >> 6) & 63] : "=") + (i + 2 < s.length ? __b64Chars[n & 63] : "=");
      }
      return out;
    };
    const __b64Decode = (b64) => {
      const clean = String(b64).replace(/[^A-Za-z0-9+/=]/g, "");
      let bytes = "";
      for (let i = 0; i < clean.length; i += 4) {
        const c1 = __b64Chars.indexOf(clean[i]);
        const c2 = __b64Chars.indexOf(clean[i + 1]);
        const c3 = clean[i + 2] === "=" ? -1 : __b64Chars.indexOf(clean[i + 2]);
        const c4 = clean[i + 3] === "=" ? -1 : __b64Chars.indexOf(clean[i + 3]);
        if (c1 < 0 || c2 < 0) break;
        const n = (c1 << 18) | (c2 << 12) | ((c3 < 0 ? 0 : c3) << 6) | (c4 < 0 ? 0 : c4);
        bytes += String.fromCharCode((n >> 16) & 255);
        if (c3 >= 0) bytes += String.fromCharCode((n >> 8) & 255);
        if (c4 >= 0) bytes += String.fromCharCode(n & 255);
      }
      return decodeURIComponent(escape(bytes));
    };
    const __parseCsv = (text, opts) => {
      const delim = (opts && typeof opts.delimiter === "string" && opts.delimiter.length === 1) ? opts.delimiter : ",";
      const withHeaders = !(opts && opts.headers === false);
      const rows = [];
      let row = [], field = "", inQ = false;
      const src = String(text || "");
      for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQ) {
          if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
          else if (ch === '"') inQ = false;
          else field += ch;
        } else {
          if (ch === '"') inQ = true;
          else if (ch === delim) { row.push(field); field = ""; }
          else if (ch === "\\n" || ch === "\\r") {
            if (ch === "\\r" && src[i + 1] === "\\n") i++;
            row.push(field); field = "";
            if (row.length > 1 || row[0] !== "") rows.push(row);
            row = [];
          } else field += ch;
        }
      }
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      if (!withHeaders || rows.length === 0) return rows;
      const headers = rows[0].map((h) => h.trim());
      return rows.slice(1).map((r) => {
        const obj = {};
        for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] !== undefined ? r[i] : "";
        return obj;
      });
    };
    const __stats = (arr) => {
      const nums = (Array.isArray(arr) ? arr : []).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      if (nums.length === 0) return { count: 0, sum: 0, min: null, max: null, mean: null, median: null, p95: null };
      const sum = nums.reduce((a, b) => a + b, 0);
      const mid = Math.floor(nums.length / 2);
      const median = nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
      const p95 = nums[Math.min(nums.length - 1, Math.floor(nums.length * 0.95))];
      return { count: nums.length, sum, min: nums[0], max: nums[nums.length - 1], mean: sum / nums.length, median, p95 };
    };
    const __diff = (a, b) => {
      const oa = a && typeof a === "object" && !Array.isArray(a) ? a : {};
      const ob = b && typeof b === "object" && !Array.isArray(b) ? b : {};
      const added = {}, removed = {}, changed = {};
      for (const k of Object.keys(ob)) {
        if (!__hasOwn.call(oa, k)) added[k] = ob[k];
        else if (JSON.stringify(oa[k]) !== JSON.stringify(ob[k])) changed[k] = { from: oa[k], to: ob[k] };
      }
      for (const k of Object.keys(oa)) {
        if (!__hasOwn.call(ob, k)) removed[k] = oa[k];
      }
      return { added, removed, changed };
    };
    const world = Object.freeze({
      callerPos: __env.world.callerPos,
      anchors: __env.world.anchors,
      artifacts: __env.world.artifacts,
      artifact: (id) => {
        const k = String(id);
        return __env.world.artifacts && __hasOwn.call(__env.world.artifacts, k) ? __env.world.artifacts[k] : null;
      },
      query: (filter) => {
        const f = filter && typeof filter === "object" ? filter : {};
        const list = Object.values(__env.world.artifacts || {});
        return list.filter((a) => {
          if (f.kind && String(a.kind).toLowerCase() !== String(f.kind).toLowerCase()) return false;
          if (f.owner && a.owner !== f.owner) return false;
          if (f.tag && !String(a.tags || "").toLowerCase().split(",").map((t) => t.trim()).includes(String(f.tag).toLowerCase())) return false;
          if (f.nameContains && !String(a.name || "").toLowerCase().includes(String(f.nameContains).toLowerCase())) return false;
          return true;
        });
      },
      apis: () => __deepFreeze(JSON.parse(JSON.stringify(Object.values(__env.world.apis || {})))),
      api: (name) => {
        const k = String(name || "").toLowerCase();
        const found = __env.world.apis && __hasOwn.call(__env.world.apis, k) ? __env.world.apis[k] : null;
        return found ? __deepFreeze(JSON.parse(JSON.stringify(found))) : null;
      },
      state: (id) => {
        const k = String(id);
        const st = __env.world.states && __hasOwn.call(__env.world.states, k) ? __env.world.states[k] : null;
        return st ? __deepFreeze(JSON.parse(JSON.stringify(st))) : null;
      },
      anchor: (q) => __env.world.anchors.find((a) => a.designation === q || a.name === q) || null,
      dist: (a, b) => (a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)) : Infinity),
      hash: __sha256,
      csv: __parseCsv,
      stats: __stats,
      diff: __diff,
      base64: Object.freeze({ encode: __b64Encode, decode: __b64Decode }),
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
