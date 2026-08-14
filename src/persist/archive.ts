import { foldFromSnapshot, takeSnapshot } from "../engine/snapshot.ts";
import { foldAll as foldEvents, genesisState } from "../engine/fold.ts";
import { DEFAULT_SEGMENT_SIZE, DEFAULT_SNAPSHOT_INTERVAL, sealSegment, type SealedSegment } from "../engine/segment.ts";
import type { EventLog } from "../engine/log.ts";
import type { Event, Snapshot } from "../engine/types.ts";
import { ZERO_HASH } from "../engine/types.ts";

export { DEFAULT_SEGMENT_SIZE, DEFAULT_SNAPSHOT_INTERVAL };

export interface SegmentStore {
  saveSegment(meta: SealedSegment, blob: Buffer): void;
  listSegments(): SealedSegment[];
}

export class MemorySegmentStore implements SegmentStore {
  private readonly stored: Array<{ meta: SealedSegment; blob: Buffer }> = [];

  saveSegment(meta: SealedSegment, blob: Buffer): void {
    this.stored.push({ meta, blob });
  }

  listSegments(): SealedSegment[] {
    return this.stored.map((row) => row.meta);
  }
}

export function shouldTakeFoldSnapshot(
  event: Event,
  interval: number,
): boolean {
  if (interval > 0 && (event.seq + 1) % interval === 0) {
    return true;
  }
  return (
    event.type === "amendment.applied" ||
    event.type === "amendment.provisional" ||
    event.type === "amendment.reverted"
  );
}

export function checkpointFold(log: EventLog, event: Event, interval: number): Snapshot | null {
  if (!shouldTakeFoldSnapshot(event, interval)) {
    return null;
  }
  const seqs = log.snapshotSeqs();
  const lastSeq = seqs[seqs.length - 1];
  const prior = lastSeq === undefined ? undefined : log.loadSnapshot(lastSeq);
  const after = prior === undefined ? log.events() : log.events(prior.atSeq + 1);
  const state = prior === undefined ? foldEvents(after, genesisState()) : foldFromSnapshot(prior, after);
  const snapshot = takeSnapshot(state);
  log.saveSnapshot(snapshot);
  return snapshot;
}

export function checkpointSegment(
  log: EventLog,
  store: SegmentStore,
  event: Event,
  size: number,
): SealedSegment | null {
  if (size <= 0 || (event.seq + 1) % size !== 0) {
    return null;
  }
  const index = Math.floor(event.seq / size);
  const fromSeq = index * size;
  const sealed = store.listSegments();
  const prev = sealed[sealed.length - 1];
  const { meta, blob } = sealSegment(log.events(fromSeq, event.seq), index, prev?.segmentHash ?? ZERO_HASH);
  store.saveSegment(meta, blob);
  return meta;
}

export function archiveAfterAppend(
  log: EventLog,
  store: SegmentStore,
  event: Event,
  snapshotInterval = DEFAULT_SNAPSHOT_INTERVAL,
  segmentSize = DEFAULT_SEGMENT_SIZE,
): { snapshot: Snapshot | null; segment: SealedSegment | null } {
  const segment = checkpointSegment(log, store, event, segmentSize);
  let snapshot = checkpointFold(log, event, snapshotInterval);
  if (segment !== null && snapshot === null) {
    snapshot = checkpointFold(log, event, 1);
  }
  return { snapshot, segment };
}
