import { describe, expect, it } from "vitest";
import { verifyChain } from "../../src/engine/hash.ts";
import { MemoryLog } from "../../src/engine/memory-log.ts";

describe("tamper detection", () => {
  it("fails verify when a payload is changed", () => {
    const log = new MemoryLog();
    log.append({ tick: 0, actor: "ARBITER", type: "genesis", payload: {}, ruleId: "L0-genesis" });
    log.append({
      tick: 1,
      actor: "ARBITER",
      type: "append_test",
      payload: { set: { n: 1 } },
      ruleId: "L0-genesis",
    });
    log.append({
      tick: 2,
      actor: "ARBITER",
      type: "append_test",
      payload: { set: { n: 2 } },
      ruleId: "L0-genesis",
    });
    const events = log.events();
    const victim = events[1];
    if (victim === undefined) {
      throw new Error("expected event");
    }
    victim.payload = { set: { n: 99 } };
    const result = verifyChain(events);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.atSeq).toBe(1);
      expect(result.reason).toBe("hash mismatch");
    }
  });

  it("fails verify when prevHash is rewritten", () => {
    const log = new MemoryLog();
    log.append({ tick: 0, actor: "ARBITER", type: "genesis", payload: {}, ruleId: "L0-genesis" });
    log.append({
      tick: 1,
      actor: "ARBITER",
      type: "append_test",
      payload: { set: { n: 1 } },
      ruleId: "L0-genesis",
    });
    const events = log.events();
    const second = events[1];
    if (second === undefined) {
      throw new Error("expected event");
    }
    second.prevHash = "ab".repeat(32);
    const result = verifyChain(events);
    expect(result.ok).toBe(false);
  });
});
