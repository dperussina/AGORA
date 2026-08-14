import type { Event, EventDraft, Snapshot } from "./types.ts";

export interface EventLog {
  append(draft: EventDraft): Event;
  events(fromSeq?: number, toSeq?: number): Event[];
  tip(): Event | undefined;
  loadSnapshot(atSeq: number): Snapshot | undefined;
  saveSnapshot(snapshot: Snapshot): void;
  snapshotSeqs(): number[];
}
