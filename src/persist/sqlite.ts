import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { SqliteLog } from "../engine/sqlite-log.ts";
import type { StoredIdentity } from "../identity/store.ts";
import type { SealedSegment } from "../engine/segment.ts";
import type { SegmentStore } from "./archive.ts";
import type { WorldSnapshot } from "./snapshot.ts";

export class AgoraStore implements SegmentStore {
  readonly db: Database.Database;
  readonly log: SqliteLog;
  private readonly upsertIdentity;
  private readonly selectIdentities;
  private readonly deleteIdentities;
  private readonly getMeta;
  private readonly setMeta;
  private readonly insertSegment;
  private readonly selectSegments;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.log = new SqliteLog(filename, this.db);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS identities (
        id TEXT PRIMARY KEY,
        record TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS segments (
        idx INTEGER PRIMARY KEY,
        from_seq INTEGER NOT NULL,
        to_seq INTEGER NOT NULL,
        merkle_root TEXT NOT NULL,
        prev_segment_hash TEXT NOT NULL,
        segment_hash TEXT NOT NULL,
        event_count INTEGER NOT NULL,
        compressed_bytes INTEGER NOT NULL,
        blob_hash TEXT NOT NULL,
        blob BLOB NOT NULL
      );
    `);
    this.upsertIdentity = this.db.prepare(`INSERT OR REPLACE INTO identities (id, record) VALUES (@id, @record)`);
    this.selectIdentities = this.db.prepare(`SELECT record FROM identities`);
    this.deleteIdentities = this.db.prepare(`DELETE FROM identities`);
    this.getMeta = this.db.prepare(`SELECT value FROM meta WHERE key = @key`);
    this.setMeta = this.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (@key, @value)`);
    this.insertSegment = this.db.prepare(
      `INSERT OR REPLACE INTO segments (idx, from_seq, to_seq, merkle_root, prev_segment_hash, segment_hash, event_count, compressed_bytes, blob_hash, blob)
       VALUES (@idx, @from_seq, @to_seq, @merkle_root, @prev_segment_hash, @segment_hash, @event_count, @compressed_bytes, @blob_hash, @blob)`,
    );
    this.selectSegments = this.db.prepare(`SELECT * FROM segments ORDER BY idx ASC`);
  }

  serverKey(): Buffer {
    const row = this.getMeta.get({ key: "server_key" }) as { value: string } | undefined;
    if (row !== undefined) {
      return Buffer.from(row.value, "hex");
    }
    const key = randomBytes(32);
    this.setMeta.run({ key: "server_key", value: key.toString("hex") });
    return key;
  }

  loadIdentities(): StoredIdentity[] {
    const rows = this.selectIdentities.all() as Array<{ record: string }>;
    return rows.map((row) => JSON.parse(row.record) as StoredIdentity);
  }

  saveIdentities(records: readonly StoredIdentity[]): void {
    if (!this.db.open) {
      return;
    }
    const tx = this.db.transaction(() => {
      this.deleteIdentities.run();
      for (const record of records) {
        this.upsertIdentity.run({ id: record.id, record: JSON.stringify(record) });
      }
    });
    tx();
  }

  loadSnapshot(): WorldSnapshot | null {
    const row = this.getMeta.get({ key: "world_snapshot" }) as { value: string } | undefined;
    if (row === undefined) {
      return null;
    }
    return JSON.parse(row.value) as WorldSnapshot;
  }

  saveSnapshot(snapshot: WorldSnapshot): void {
    if (!this.db.open) {
      return;
    }
    this.setMeta.run({ key: "world_snapshot", value: JSON.stringify(snapshot) });
  }

  saveSegment(meta: SealedSegment, blob: Buffer): void {
    this.insertSegment.run({
      idx: meta.index,
      from_seq: meta.fromSeq,
      to_seq: meta.toSeq,
      merkle_root: meta.merkleRoot,
      prev_segment_hash: meta.prevSegmentHash,
      segment_hash: meta.segmentHash,
      event_count: meta.eventCount,
      compressed_bytes: meta.compressedBytes,
      blob_hash: meta.blobHash,
      blob,
    });
  }

  listSegments(): SealedSegment[] {
    const rows = this.selectSegments.all() as Array<{
      idx: number;
      from_seq: number;
      to_seq: number;
      merkle_root: string;
      prev_segment_hash: string;
      segment_hash: string;
      event_count: number;
      compressed_bytes: number;
      blob_hash: string;
    }>;
    return rows.map((row) => ({
      index: row.idx,
      fromSeq: row.from_seq,
      toSeq: row.to_seq,
      merkleRoot: row.merkle_root,
      prevSegmentHash: row.prev_segment_hash,
      segmentHash: row.segment_hash,
      eventCount: row.event_count,
      compressedBytes: row.compressed_bytes,
      blobHash: row.blob_hash,
    }));
  }

  close(): void {
    this.log.close();
  }
}
