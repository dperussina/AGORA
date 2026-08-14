import Database from "better-sqlite3";
import { hashEvent } from "./hash.ts";
import type { EventLog } from "./log.ts";
import type { Actor, Event, EventDraft, FoldState, Snapshot } from "./types.ts";
import { ZERO_HASH } from "./types.ts";

interface EventRow {
  seq: number;
  tick: number;
  actor: string;
  type: string;
  payload: string;
  rule_id: string;
  prev_hash: string;
  hash: string;
}

interface SnapshotRow {
  at_seq: number;
  state: string;
  state_hash: string;
}

export class SqliteLog implements EventLog {
  private readonly db: Database.Database;
  private readonly insertEvent;
  private readonly selectRange;
  private readonly selectTip;
  private readonly insertSnapshot;
  private readonly selectSnapshot;
  private readonly selectSnapshotSeqs;

  constructor(filename: string, existing?: Database.Database) {
    this.db = existing ?? new Database(filename);
    if (existing === undefined) {
      this.db.pragma("journal_mode = WAL");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY,
        tick INTEGER NOT NULL,
        actor TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        at_seq INTEGER PRIMARY KEY,
        state TEXT NOT NULL,
        state_hash TEXT NOT NULL
      );
    `);
    this.insertEvent = this.db.prepare(
      `INSERT INTO events (seq, tick, actor, type, payload, rule_id, prev_hash, hash)
       VALUES (@seq, @tick, @actor, @type, @payload, @rule_id, @prev_hash, @hash)`,
    );
    this.selectRange = this.db.prepare(
      `SELECT * FROM events WHERE seq >= @fromSeq AND seq <= @toSeq ORDER BY seq ASC`,
    );
    this.selectTip = this.db.prepare(`SELECT * FROM events ORDER BY seq DESC LIMIT 1`);
    this.insertSnapshot = this.db.prepare(
      `INSERT OR REPLACE INTO snapshots (at_seq, state, state_hash)
       VALUES (@at_seq, @state, @state_hash)`,
    );
    this.selectSnapshot = this.db.prepare(`SELECT * FROM snapshots WHERE at_seq = @at_seq`);
    this.selectSnapshotSeqs = this.db.prepare(`SELECT at_seq FROM snapshots ORDER BY at_seq ASC`);
  }

  append(draft: EventDraft): Event {
    const prev = this.tip();
    const seq = prev === undefined ? 0 : prev.seq + 1;
    const prevHash = prev === undefined ? ZERO_HASH : prev.hash;
    const withoutHash = {
      seq,
      tick: draft.tick,
      actor: draft.actor,
      type: draft.type,
      payload: draft.payload,
      ruleId: draft.ruleId,
      prevHash,
    };
    const event: Event = { ...withoutHash, hash: hashEvent(withoutHash) };
    this.insertEvent.run({
      seq: event.seq,
      tick: event.tick,
      actor: event.actor,
      type: event.type,
      payload: JSON.stringify(event.payload),
      rule_id: event.ruleId,
      prev_hash: event.prevHash,
      hash: event.hash,
    });
    return event;
  }

  events(fromSeq = 0, toSeq = Number.MAX_SAFE_INTEGER): Event[] {
    const rows = this.selectRange.all({ fromSeq, toSeq }) as EventRow[];
    return rows.map(rowToEvent);
  }

  tip(): Event | undefined {
    const row = this.selectTip.get() as EventRow | undefined;
    return row === undefined ? undefined : rowToEvent(row);
  }

  loadSnapshot(atSeq: number): Snapshot | undefined {
    const row = this.selectSnapshot.get({ at_seq: atSeq }) as SnapshotRow | undefined;
    if (row === undefined) {
      return undefined;
    }
    return {
      atSeq: row.at_seq,
      state: JSON.parse(row.state) as FoldState,
      stateHash: row.state_hash,
    };
  }

  saveSnapshot(snapshot: Snapshot): void {
    this.insertSnapshot.run({
      at_seq: snapshot.atSeq,
      state: JSON.stringify(snapshot.state),
      state_hash: snapshot.stateHash,
    });
  }

  snapshotSeqs(): number[] {
    const rows = this.selectSnapshotSeqs.all() as Array<{ at_seq: number }>;
    return rows.map((row) => row.at_seq);
  }

  close(): void {
    this.db.close();
  }
}

function rowToEvent(row: EventRow): Event {
  return {
    seq: row.seq,
    tick: row.tick,
    actor: row.actor as Actor,
    type: row.type,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    ruleId: row.rule_id,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}
