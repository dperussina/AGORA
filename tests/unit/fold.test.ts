import { describe, expect, it } from "vitest";
import { fold, foldAll, genesisState } from "../../src/engine/fold.ts";
import { MemoryLog } from "../../src/engine/memory-log.ts";

describe("fold", () => {
  it("does not mutate the prior state", () => {
    const log = new MemoryLog();
    const event = log.append({
      tick: 0,
      actor: "ARBITER",
      type: "append_test",
      payload: { set: { k: 1 } },
      ruleId: "L0-genesis",
    });
    const before = genesisState();
    const after = fold(before, event);
    expect(before.mutable).toEqual({});
    expect(after.mutable).toEqual({ k: 1 });
    expect(after.tipSeq).toBe(0);
  });

  it("ignores unknown types except tip advancement", () => {
    const log = new MemoryLog();
    const event = log.append({
      tick: 3,
      actor: "ARBITER",
      type: "future_kind",
      payload: { nope: true },
      ruleId: "L0-genesis",
    });
    const after = fold(genesisState(), event);
    expect(after.mutable).toEqual({});
    expect(after.tick).toBe(3);
    expect(after.tipHash).toBe(event.hash);
  });

  it("applies append_test keys in sorted order", () => {
    const log = new MemoryLog();
    const event = log.append({
      tick: 0,
      actor: "ARBITER",
      type: "append_test",
      payload: { set: { z: 1, a: 2 } },
      ruleId: "L0-genesis",
    });
    expect(foldAll([event]).mutable).toEqual({ a: 2, z: 1 });
  });
});
