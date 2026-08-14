import { describe, expect, it } from "vitest";
import { canonicalJson, hashEvent, merkleRoot, sha256Hex, verifyChain } from "../../src/engine/index.ts";
import { MemoryLog } from "../../src/engine/memory-log.ts";
import { ZERO_HASH } from "../../src/engine/types.ts";

describe("canonicalJson", () => {
  it("sorts keys at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("rejects non-integer numbers", () => {
    expect(() => canonicalJson({ x: 1.5 })).toThrow(/non-integer/);
  });
});

describe("hashEvent", () => {
  it("is stable for the same fields", () => {
    const body = {
      seq: 0,
      tick: 0,
      actor: "ARBITER" as const,
      type: "genesis",
      payload: {},
      ruleId: "L0-genesis",
      prevHash: ZERO_HASH,
    };
    expect(hashEvent(body)).toBe(hashEvent({ ...body }));
    expect(hashEvent(body)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyChain", () => {
  it("accepts a memory log chain", () => {
    const log = new MemoryLog();
    log.append({ tick: 0, actor: "ARBITER", type: "genesis", payload: {}, ruleId: "L0-genesis" });
    log.append({
      tick: 1,
      actor: "identity:test-1",
      type: "append_test",
      payload: { set: { n: 1 } },
      ruleId: "L0-genesis",
    });
    expect(verifyChain(log.events())).toEqual({ ok: true });
  });
});

describe("merkleRoot", () => {
  it("is deterministic", () => {
    const a = sha256Hex("a");
    const b = sha256Hex("b");
    expect(merkleRoot([a, b])).toBe(merkleRoot([a, b]));
    expect(merkleRoot([])).toBe(sha256Hex(""));
  });
});
