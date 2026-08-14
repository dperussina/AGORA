export type Hash = string;

export const ZERO_HASH = "0".repeat(64);

export type Actor = "ARBITER" | "STEWARD" | `identity:${string}`;

export interface Event {
  seq: number;
  tick: number;
  actor: Actor;
  type: string;
  payload: Record<string, unknown>;
  ruleId: string;
  prevHash: Hash;
  hash: Hash;
}

export type EventDraft = Omit<Event, "seq" | "prevHash" | "hash">;

export interface FoldState {
  tipSeq: number;
  tipHash: Hash;
  tick: number;
  rulesetVersion: number;
  mutable: Record<string, string | number | boolean | null>;
  oracleCursor: number;
}

export interface Snapshot {
  atSeq: number;
  state: FoldState;
  stateHash: Hash;
}
