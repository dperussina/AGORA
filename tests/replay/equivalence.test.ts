import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { foldAll, genesisState } from "../../src/engine/fold.ts";
import { MemoryLog } from "../../src/engine/memory-log.ts";
import { foldFromSnapshot, takeSnapshot } from "../../src/engine/snapshot.ts";
import { SqliteLog } from "../../src/engine/sqlite-log.ts";
import type { EventLog } from "../../src/engine/log.ts";
import type { EventDraft } from "../../src/engine/types.ts";

function fill(log: EventLog, n: number): void {
  log.append({ tick: 0, actor: "ARBITER", type: "genesis", payload: {}, ruleId: "L0-genesis" });
  for (let i = 1; i < n; i++) {
    const draft: EventDraft = {
      tick: i,
      actor: "identity:test-1",
      type: "append_test",
      payload: { set: { n: i, last: i } },
      ruleId: "L0-genesis",
    };
    log.append(draft);
  }
}

describe("replay equivalence", () => {
  it("two full folds of the same memory log match", () => {
    const log = new MemoryLog();
    fill(log, 20);
    const events = log.events();
    const a = foldAll(events, genesisState());
    const b = foldAll(events, genesisState());
    expect(a).toEqual(b);
    expect(a.mutable["last"]).toBe(19);
  });

  it("snapshot plus forward fold matches a full fold", () => {
    const log = new MemoryLog();
    fill(log, 12);
    const events = log.events();
    const full = foldAll(events);
    const mid = foldAll(events.filter((event) => event.seq <= 4));
    const snap = takeSnapshot(mid);
    const rebuilt = foldFromSnapshot(
      snap,
      events.filter((event) => event.seq > 4),
    );
    expect(rebuilt).toEqual(full);
  });

  it("SQLite log folds the same as memory", () => {
    const dir = mkdtempSync(join(tmpdir(), "agora-eq-"));
    const sqlite = new SqliteLog(join(dir, "log.sqlite"));
    const memory = new MemoryLog();
    fill(sqlite, 15);
    fill(memory, 15);
    const fromSqlite = foldAll(sqlite.events());
    const fromMemory = foldAll(memory.events());
    expect(fromSqlite.tipHash).toBe(fromMemory.tipHash);
    expect(fromSqlite.mutable).toEqual(fromMemory.mutable);
    const snap = takeSnapshot(fromSqlite);
    sqlite.saveSnapshot(snap);
    const loaded = sqlite.loadSnapshot(snap.atSeq);
    expect(loaded?.stateHash).toBe(snap.stateHash);
    sqlite.close();
  });
});
