import { fold, foldAll } from "./fold.ts";
import { hashState } from "./hash.ts";
import type { Event, FoldState, Snapshot } from "./types.ts";

export function takeSnapshot(state: FoldState): Snapshot {
  return {
    atSeq: state.tipSeq,
    state: structuredClone(state),
    stateHash: hashState(state),
  };
}

export function foldFromSnapshot(snapshot: Snapshot, eventsAfter: readonly Event[]): FoldState {
  let state = structuredClone(snapshot.state);
  for (const event of eventsAfter) {
    state = fold(state, event);
  }
  return state;
}

export function foldWithSnapshots(
  events: readonly Event[],
  interval: number,
): { state: ReturnType<typeof foldAll>; snapshots: Snapshot[] } {
  const snapshots: Snapshot[] = [];
  let state = foldAll([]);
  for (const event of events) {
    state = fold(state, event);
    if (interval > 0 && (event.seq + 1) % interval === 0) {
      snapshots.push(takeSnapshot(state));
    }
  }
  return { state, snapshots };
}
