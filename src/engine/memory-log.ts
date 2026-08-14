import { hashEvent } from "./hash.ts";
import type { EventLog } from "./log.ts";
import type { Event, EventDraft, Snapshot } from "./types.ts";
import { ZERO_HASH } from "./types.ts";

export class MemoryLog implements EventLog {
  private readonly stored: Event[] = [];
  private readonly snapshots = new Map<number, Snapshot>();

  append(draft: EventDraft): Event {
    const prev = this.stored[this.stored.length - 1];
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
    this.stored.push(event);
    return event;
  }

  events(fromSeq = 0, toSeq = Number.MAX_SAFE_INTEGER): Event[] {
    return this.stored.filter((event) => event.seq >= fromSeq && event.seq <= toSeq);
  }

  tip(): Event | undefined {
    return this.stored[this.stored.length - 1];
  }

  loadSnapshot(atSeq: number): Snapshot | undefined {
    return this.snapshots.get(atSeq);
  }

  saveSnapshot(snapshot: Snapshot): void {
    this.snapshots.set(snapshot.atSeq, snapshot);
  }

  snapshotSeqs(): number[] {
    return [...this.snapshots.keys()].sort((a, b) => a - b);
  }
}
