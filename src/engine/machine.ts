export type MachineScalar = string | number | boolean | null;

export interface MachineRule {
  on: string;
  when?: { field: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; value: MachineScalar };
  set?: Record<string, MachineScalar>;
  fee?: number;
  payout?: number;
  reply?: string;
}

export interface MachineSpec {
  state: Record<string, MachineScalar>;
  rules: MachineRule[];
}

export interface MachineRunContext {
  input: string;
  selfId: string;
  tick: number;
  arg?: string;
}

export type MachineRunResult =
  | {
      ok: true;
      nextData: string;
      reply: string;
      state: Record<string, MachineScalar>;
      matchedRule: number;
      fee: number;
      payout: number;
    }
  | { ok: false; reason: string };

export function machineInputs(rawData: string): string[] {
  try {
    const parsed = JSON.parse(rawData) as { machine?: { rules?: Array<{ on?: unknown }> } };
    const rules = parsed?.machine?.rules;
    if (!Array.isArray(rules)) return [];
    const seen = new Set<string>();
    for (const r of rules.slice(0, MAX_RULES)) {
      if (typeof r?.on === "string" && r.on.length > 0) seen.add(r.on);
    }
    return [...seen];
  } catch {
    return [];
  }
}

const MAX_RULES = 32;
const MAX_SETS = 16;

export function runArtifactMachine(rawData: string, ctx: MachineRunContext): MachineRunResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return { ok: false, reason: "artifact data is not valid JSON" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "artifact data must be a JSON object with a machine block" };
  }
  const container = parsed as Record<string, unknown>;
  const machine = container["machine"];
  if (machine === null || typeof machine !== "object" || Array.isArray(machine)) {
    return { ok: false, reason: "artifact has no machine definition" };
  }
  const spec = machine as { state?: unknown; rules?: unknown };
  if (!Array.isArray(spec.rules)) {
    return { ok: false, reason: "machine.rules must be an array" };
  }
  const state: Record<string, MachineScalar> =
    spec.state !== null && typeof spec.state === "object" && !Array.isArray(spec.state)
      ? { ...(spec.state as Record<string, MachineScalar>) }
      : {};

  const rules = spec.rules.slice(0, MAX_RULES);
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i] as MachineRule | null | undefined;
    if (rule === null || rule === undefined || typeof rule !== "object" || typeof rule.on !== "string") {
      continue;
    }
    if (rule.on !== ctx.input && rule.on !== "*") {
      continue;
    }
    if (rule.when !== undefined && !whenMatches(rule.when, state, ctx)) {
      continue;
    }
    if (rule.set !== undefined && typeof rule.set === "object" && !Array.isArray(rule.set)) {
      const entries = Object.entries(rule.set).slice(0, MAX_SETS);
      for (const [k, rawExpr] of entries) {
        const val = evalMachineValue(rawExpr, state, ctx);
        if (!val.ok) {
          return { ok: false, reason: val.reason };
        }
        state[k] = val.value;
      }
    }
    const fee = typeof rule.fee === "number" && Number.isInteger(rule.fee) && rule.fee > 0 ? rule.fee : 0;
    const payout = typeof rule.payout === "number" && Number.isInteger(rule.payout) && rule.payout > 0 ? rule.payout : 0;
    const reply = interpolateReply(typeof rule.reply === "string" ? rule.reply : `ran ${ctx.input}`, state, ctx);
    const nextContainer = { ...container, machine: { ...spec, state } };
    return {
      ok: true,
      nextData: JSON.stringify(nextContainer),
      reply,
      state,
      matchedRule: i,
      fee,
      payout,
    };
  }
  return { ok: false, reason: `no matching machine rule for input "${ctx.input}"` };
}

function whenMatches(
  when: NonNullable<MachineRule["when"]>,
  state: Record<string, MachineScalar>,
  ctx: MachineRunContext,
): boolean {
  const actual = state[when.field];
  const expectedRes = evalMachineValue(when.value, state, ctx);
  if (!expectedRes.ok) {
    return false;
  }
  const expected = expectedRes.value;
  switch (when.op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    default:
      return false;
  }
}

function evalMachineValue(
  raw: unknown,
  state: Record<string, MachineScalar>,
  ctx: MachineRunContext,
): { ok: true; value: MachineScalar } | { ok: false; reason: string } {
  if (typeof raw === "number" || typeof raw === "boolean" || raw === null) {
    if (typeof raw === "number" && !Number.isInteger(raw)) {
      return { ok: false, reason: "non-integer number" };
    }
    return { ok: true, value: raw };
  }
  if (typeof raw !== "string") {
    return { ok: false, reason: "unsupported machine value" };
  }
  const trimmed = raw.trim();
  const bin = /^(.+?)\s+(\+|-|\*|\/)\s+(.+)$/.exec(trimmed);
  if (bin?.[1] !== undefined && bin[2] !== undefined && bin[3] !== undefined) {
    const left = lookupToken(bin[1], state, ctx);
    const right = lookupToken(bin[3], state, ctx);
    if (typeof left !== "number" || typeof right !== "number") {
      return { ok: false, reason: "machine arithmetic requires integers" };
    }
    if (bin[2] === "+") return { ok: true, value: left + right };
    if (bin[2] === "-") return { ok: true, value: left - right };
    if (bin[2] === "*") return { ok: true, value: left * right };
    if (bin[2] === "/") {
      if (right === 0) return { ok: false, reason: "division by zero" };
      return { ok: true, value: Math.trunc(left / right) };
    }
  }
  return { ok: true, value: lookupToken(trimmed, state, ctx) };
}

function lookupToken(token: string, state: Record<string, MachineScalar>, ctx: MachineRunContext): MachineScalar {
  const t = token.trim();
  if (/^-?\d+$/.test(t)) return Number(t);
  if (t === "$self") return ctx.selfId;
  if (t === "$tick") return ctx.tick;
  if (t === "$input") return ctx.input;
  if (t === "$arg") return ctx.arg ?? "";
  const st = /^\$state\.(\w+)$/.exec(t);
  if (st?.[1] !== undefined) {
    return state[st[1]] ?? 0;
  }
  return t;
}

function interpolateReply(template: string, state: Record<string, MachineScalar>, ctx: MachineRunContext): string {
  return template.replace(/(\$state\.\w+|\$self|\$tick|\$input|\$arg)/g, (tok) => {
    const v = lookupToken(tok, state, ctx);
    return v === null ? "" : String(v);
  });
}
