import { gzipSync, gunzipSync } from "node:zlib";
import { canonicalJson, sha256Hex } from "./hash.ts";
import { ZERO_HASH, type Event, type Hash } from "./types.ts";

export const DEFAULT_SNAPSHOT_INTERVAL = 1_000;
export const DEFAULT_SEGMENT_SIZE = 1_000_000;

export interface SealedSegment {
  index: number;
  fromSeq: number;
  toSeq: number;
  merkleRoot: Hash;
  prevSegmentHash: Hash;
  segmentHash: Hash;
  eventCount: number;
  compressedBytes: number;
  blobHash: Hash;
}

export function merkleRoot(leafHashes: readonly Hash[]): Hash {
  if (leafHashes.length === 0) {
    return sha256Hex("");
  }
  let layer = [...leafHashes];
  while (layer.length > 1) {
    const next: Hash[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? left;
      if (left === undefined || right === undefined) {
        throw new Error("merkle layer gap");
      }
      next.push(sha256Hex(left + right));
    }
    layer = next;
  }
  const root = layer[0];
  if (root === undefined) {
    throw new Error("empty merkle root");
  }
  return root;
}

export function sealSegment(
  events: readonly Event[],
  index: number,
  prevSegmentHash: Hash = ZERO_HASH,
): { meta: SealedSegment; blob: Buffer } {
  if (events.length === 0) {
    throw new Error("cannot seal an empty segment");
  }
  const first = events[0];
  const last = events[events.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error("cannot seal an empty segment");
  }
  const root = merkleRoot(events.map((event) => event.hash));
  const blob = gzipSync(Buffer.from(canonicalJson(events), "utf8"));
  const blobHash = sha256Hex(blob.toString("base64"));
  const segmentHash = sha256Hex(
    canonicalJson({
      index,
      fromSeq: first.seq,
      toSeq: last.seq,
      merkleRoot: root,
      prevSegmentHash,
      blobHash,
    }),
  );
  return {
    meta: {
      index,
      fromSeq: first.seq,
      toSeq: last.seq,
      merkleRoot: root,
      prevSegmentHash,
      segmentHash,
      eventCount: events.length,
      compressedBytes: blob.length,
      blobHash,
    },
    blob,
  };
}

export function openSegmentBlob(blob: Buffer): Event[] {
  return JSON.parse(gunzipSync(blob).toString("utf8")) as Event[];
}
