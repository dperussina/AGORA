import type { Ballot, Proposal } from "../engine/clerk.ts";
import type { SerializedProposal } from "../persist/snapshot.ts";
import type { Position } from "../engine/tick.ts";

export function serializeProposal(proposal: Proposal): SerializedProposal {
  return {
    id: proposal.id,
    authorId: proposal.authorId,
    patch: proposal.patch,
    tier: proposal.tier,
    resolutionTick: proposal.resolutionTick,
    status: proposal.status,
    ballots: [...proposal.ballots.values()].map((ballot) => ({
      identityId: ballot.identityId,
      position: ballot.position,
      weightMilli: ballot.weightMilli.toString(),
    })),
    failReason: proposal.failReason,
    provisional: proposal.provisional,
    ratification: proposal.ratification,
  };
}

export function deserializeProposal(row: SerializedProposal): Proposal {
  const ballots = new Map<string, Ballot>();
  for (const ballot of row.ballots) {
    ballots.set(ballot.identityId, {
      identityId: ballot.identityId,
      position: ballot.position,
      weightMilli: BigInt(ballot.weightMilli),
    });
  }
  return {
    id: row.id,
    authorId: row.authorId,
    patch: row.patch,
    tier: row.tier,
    resolutionTick: row.resolutionTick,
    status: row.status,
    ballots,
    failReason: row.failReason,
    provisional: row.provisional,
    ratification: row.ratification,
  };
}

export function parseCell(key: string): Position {
  const [x, y, z] = key.split(",").map(Number);
  return { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
}

export function asDelta(value: unknown): Position | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const delta = value as Record<string, unknown>;
  const x = delta["x"];
  const y = delta["y"];
  const z = delta["z"];
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof z !== "number" ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    !Number.isInteger(z)
  ) {
    return undefined;
  }
  return { x, y, z };
}
