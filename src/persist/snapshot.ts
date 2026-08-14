import type { Identity, Proposal, VotePosition } from "../engine/clerk.ts";
import type { Entity } from "../engine/effects.ts";
import type { Drift } from "../engine/geography.ts";
import type { LedgerRow, Standing } from "../engine/standing.ts";
import type { Position } from "../engine/tick.ts";
import type { Patch } from "../engine/validate.ts";

export interface SerializedBallot {
  identityId: string;
  position: VotePosition;
  weightMilli: string;
}

export interface SerializedProposal {
  id: number;
  authorId: string;
  patch: Patch;
  tier: 1 | 2;
  resolutionTick: number;
  status: Proposal["status"];
  ballots: SerializedBallot[];
  failReason?: string;
  provisional?: boolean;
  ratification?: boolean;
}

export interface WorldSnapshot {
  v: 1;
  tipHash: string | null;
  clerk: {
    tick: number;
    nextId: number;
    identities: Identity[];
    proposals: SerializedProposal[];
    applied: Array<{ id: number; patch: Patch }>;
    resolved: SerializedProposal[];
  };
  bodies: Array<[string, Position]>;
  budgets: Array<[string, number]>;
  marks: Array<[string, { text: string; authorId: string; tick: number; position: Position }]>;
  standing: Array<[string, Standing]>;
  ledger: LedgerRow[];
  fields: Array<[string, Record<string, string | number | boolean | null>]>;
  entities: Array<[string, Entity]>;
  entitySeq: number;
  drifts: Drift[];
  driftSeq: number;
  stewardId: string | null;
  halted: boolean;
  haltReason: string | null;
  provisionals: number[];
  residencyLeft: number | null;
  dormant: boolean;
  everTicked?: boolean;
  record: Array<{ tick: number; type: string; payload: Record<string, unknown> }>;
}
