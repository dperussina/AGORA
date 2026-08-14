import { createHash } from "node:crypto";
import type { Event, FoldState, Hash } from "./types.ts";
import { ZERO_HASH } from "./types.ts";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isInteger(value)) {
      throw new Error("canonical JSON forbids non-integer numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const item = obj[key];
    if (item === undefined) {
      continue;
    }
    out[key] = sortValue(item);
  }
  return out;
}

export function sha256Hex(bytes: string): Hash {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

export function hashEvent(event: Omit<Event, "hash">): Hash {
  return sha256Hex(canonicalJson(event));
}

export function hashState(state: FoldState): Hash {
  return sha256Hex(canonicalJson(state));
}

export function verifyChain(events: readonly Event[]): { ok: true } | { ok: false; atSeq: number; reason: string } {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event === undefined) {
      return { ok: false, atSeq: i, reason: "missing event" };
    }
    if (event.seq !== i) {
      return { ok: false, atSeq: event.seq, reason: "sequence gap" };
    }
    const expectedPrev = i === 0 ? ZERO_HASH : events[i - 1]?.hash;
    if (event.prevHash !== expectedPrev) {
      return { ok: false, atSeq: event.seq, reason: "prevHash mismatch" };
    }
    const recomputed = hashEvent({
      seq: event.seq,
      tick: event.tick,
      actor: event.actor,
      type: event.type,
      payload: event.payload,
      ruleId: event.ruleId,
      prevHash: event.prevHash,
    });
    if (recomputed !== event.hash) {
      return { ok: false, atSeq: event.seq, reason: "hash mismatch" };
    }
  }
  return { ok: true };
}
