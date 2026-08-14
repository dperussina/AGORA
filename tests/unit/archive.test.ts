import { describe, expect, it } from "vitest";
import { MemoryLog } from "../../src/engine/memory-log.ts";
import { foldFromSnapshot } from "../../src/engine/snapshot.ts";
import { openSegmentBlob, sealSegment } from "../../src/engine/segment.ts";
import { ZERO_HASH } from "../../src/engine/types.ts";
import { MemorySegmentStore, archiveAfterAppend } from "../../src/persist/archive.ts";
import { World, type McpRequest } from "../../src/world/world.ts";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
};

function req(method: string, params?: Record<string, unknown>, id = 1): McpRequest {
  return { jsonrpc: "2.0", id, method, params, _meta: META };
}

describe("fold snapshots and segments", () => {
  it("takes a reconstructible fold snapshot on interval and version bump", () => {
    const log = new MemoryLog();
    const store = new MemorySegmentStore();
    log.append({ tick: 0, actor: "ARBITER", type: "genesis", payload: {}, ruleId: "genesis" });
    for (let i = 0; i < 4; i++) {
      const event = log.append({
        tick: 0,
        actor: "ARBITER",
        type: "append_test",
        payload: { set: { [`k${i}`]: i } },
        ruleId: "append_test",
      });
      archiveAfterAppend(log, store, event, 5, 100);
    }
    const bump = log.append({
      tick: 1,
      actor: "ARBITER",
      type: "amendment.applied",
      payload: {},
      ruleId: "amendment.applied",
    });
    archiveAfterAppend(log, store, bump, 5, 100);
    expect(log.snapshotSeqs().length).toBeGreaterThanOrEqual(1);
    const last = log.snapshotSeqs()[log.snapshotSeqs().length - 1];
    expect(last).toBeDefined();
    const snap = log.loadSnapshot(last ?? -1);
    expect(snap).toBeDefined();
    const after = log.events((snap?.atSeq ?? 0) + 1);
    const fromSnap = foldFromSnapshot(snap!, after);
    expect(fromSnap.tipSeq).toBe(log.tip()?.seq);
    expect(fromSnap.rulesetVersion).toBe(1);
  });

  it("seals a gzipped merkle-chained segment at the size boundary", () => {
    const log = new MemoryLog();
    const store = new MemorySegmentStore();
    for (let i = 0; i < 4; i++) {
      const event = log.append({
        tick: 0,
        actor: "ARBITER",
        type: "append_test",
        payload: { set: { [`s${i}`]: i } },
        ruleId: "append_test",
      });
      archiveAfterAppend(log, store, event, 100, 4);
    }
    const sealed = store.listSegments();
    expect(sealed).toHaveLength(1);
    expect(sealed[0]?.fromSeq).toBe(0);
    expect(sealed[0]?.toSeq).toBe(3);
    expect(sealed[0]?.prevSegmentHash).toBe(ZERO_HASH);
    const again = sealSegment(log.events(0, 3), 0, ZERO_HASH);
    expect(again.meta.segmentHash).toBe(sealed[0]?.segmentHash);
    expect(openSegmentBlob(again.blob)).toHaveLength(4);
  });

  it("archives from the live world at a small interval", () => {
    const world = new World(undefined, undefined, { snapshotInterval: 2, segmentSize: 8 });
    const challenge = world.handle({
      body: req("tools/call", { name: "whoami", arguments: {} }),
      now: 1,
    });
    world.handle({
      body: req("tools/call", {
        name: "whoami",
        arguments: {},
        inputResponses: { intent: "register" },
        requestState: (challenge.result as { requestState: string }).requestState,
      }),
      now: 1,
    });
    expect(world.log.snapshotSeqs().length).toBeGreaterThan(0);
  });
});
