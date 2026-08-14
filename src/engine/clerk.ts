import { applyPatch, rebuildRegistry } from "./apply.ts";
import { seedRegistry, type Registry } from "./registry.ts";
import { validatePatch, type Patch } from "./validate.ts";
import { layer1Passes, layer2Passes, participationMet, weightMilli } from "./weight.ts";

export type VotePosition = "for" | "against" | "abstain";

export interface Identity {
  id: string;
  currency: number;
  ticksPresent: number;
  ticksAbsent: number;
}

export interface Ballot {
  identityId: string;
  position: VotePosition;
  weightMilli: bigint;
}

export interface Proposal {
  id: number;
  authorId: string;
  patch: Patch;
  tier: 1 | 2;
  resolutionTick: number;
  status: "docketed" | "applied" | "failed" | "queued";
  ballots: Map<string, Ballot>;
  failReason?: string;
  provisional?: boolean;
  ratification?: boolean;
}

export type ProposeResult =
  | { ok: true; proposalId: number; tier: 1 | 2; resolutionTick: number }
  | { ok: false; code: string; reason: string };

export class Clerk {
  tick = 0;
  registry: Registry = seedRegistry();
  readonly identities = new Map<string, Identity>();
  readonly proposals: Proposal[] = [];
  readonly applied: Array<{ id: number; patch: Patch }> = [];
  readonly resolved: Proposal[] = [];
  nextId = 1;

  restore(dump: {
    tick: number;
    nextId: number;
    identities: Identity[];
    proposals: Proposal[];
    applied: Array<{ id: number; patch: import("./validate.ts").Patch }>;
    resolved: Proposal[];
  }): void {
    this.tick = dump.tick;
    this.nextId = dump.nextId;
    this.identities.clear();
    for (const identity of dump.identities) {
      this.identities.set(identity.id, { ...identity });
    }
    this.proposals.length = 0;
    this.proposals.push(...dump.proposals);
    this.applied.length = 0;
    this.applied.push(...dump.applied);
    this.resolved.length = 0;
    this.resolved.push(...dump.resolved);
  }

  addIdentity(id: string, currency = 25, ticksPresent = 0): Identity {
    const identity: Identity = { id, currency, ticksPresent, ticksAbsent: 0 };
    this.identities.set(id, identity);
    return identity;
  }

  propose(authorId: string, patch: unknown, opts?: { waiveCost?: boolean }): ProposeResult {
    const author = this.identities.get(authorId);
    if (author === undefined) {
      return { ok: false, code: "auth", reason: "unknown identity" };
    }
    const validation = validatePatch(this.registry, patch);
    if (!validation.ok) {
      return { ok: false, code: validation.code, reason: validation.reason };
    }
    const cost = opts?.waiveCost === true ? 0 : (this.registry.params["proposal_cost"]?.value ?? 10);
    if (author.currency < cost) {
      return { ok: false, code: "currency", reason: "insufficient currency" };
    }
    author.currency -= cost;
    const cooling = this.registry.params["cooling_ticks_l1"]?.value ?? 10;
    const resolutionTick = this.tick + (validation.tier === 1 ? cooling : 1);
    const proposal: Proposal = {
      id: this.nextId,
      authorId,
      patch: patch as Patch,
      tier: validation.tier,
      resolutionTick,
      status: "docketed",
      ballots: new Map(),
    };
    this.nextId += 1;
    this.proposals.push(proposal);
    return {
      ok: true,
      proposalId: proposal.id,
      tier: proposal.tier,
      resolutionTick: proposal.resolutionTick,
    };
  }

  applyImmediately(proposalId: number): Proposal | undefined {
    const proposal = this.proposals.find((item) => item.id === proposalId && item.status === "docketed");
    if (proposal === undefined) {
      return undefined;
    }
    this.applyPassed(proposal);
    proposal.provisional = true;
    return proposal;
  }

  vote(identityId: string, proposalId: number, position: VotePosition): { ok: true } | { ok: false; reason: string } {
    const identity = this.identities.get(identityId);
    if (identity === undefined) {
      return { ok: false, reason: "unknown identity" };
    }
    const proposal = this.proposals.find((item) => item.id === proposalId && item.status === "docketed");
    if (proposal === undefined) {
      return { ok: false, reason: "proposal not open" };
    }
    proposal.ballots.set(identityId, {
      identityId,
      position,
      weightMilli: this.weightOf(identity),
    });
    return { ok: true };
  }

  docket(): Proposal[] {
    return this.proposals.filter((item) => item.status === "docketed" || item.status === "queued");
  }

  resolveTick(): Proposal[] {
    const cap = this.registry.params["amendments_per_tick"]?.value ?? 3;
    const ready = this.proposals
      .filter((item) => item.status === "docketed" && item.resolutionTick <= this.tick)
      .sort((a, b) => a.id - b.id);
    const batch = ready.slice(0, cap);
    const overflow = ready.slice(cap);
    for (const proposal of overflow) {
      proposal.resolutionTick = this.tick + 1;
      proposal.status = "queued";
    }
    const done: Proposal[] = [];
    for (const proposal of batch) {
      this.tally(proposal);
      done.push(proposal);
    }
    for (const proposal of overflow) {
      proposal.status = "docketed";
    }
    this.tick += 1;
    return done;
  }

  private tally(proposal: Proposal): void {
    let forW = 0n;
    let againstW = 0n;
    let abstainW = 0n;
    for (const ballot of [...proposal.ballots.values()].sort((a, b) =>
      a.identityId < b.identityId ? -1 : 1,
    )) {
      if (ballot.position === "for") {
        forW += ballot.weightMilli;
      } else if (ballot.position === "against") {
        againstW += ballot.weightMilli;
      } else {
        abstainW += ballot.weightMilli;
      }
    }
    const cast = forW + againstW + abstainW;
    let eligible = 0n;
    const ids = [...this.identities.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const identity of ids) {
      eligible += this.weightOf(identity);
    }
    const quorum = participationMet(
      cast,
      eligible,
      this.registry.params["participation_quorum"]?.value ?? 33,
    );
    const threshold =
      proposal.tier === 1
        ? layer1Passes(forW, againstW, this.registry.params["threshold_l1"]?.value ?? 67)
        : layer2Passes(forW, againstW, this.registry.params["threshold_l2"]?.value ?? 50);
    if (!quorum || !threshold) {
      proposal.status = "failed";
      proposal.failReason = !quorum ? "participation quorum" : "threshold or tie";
      if (proposal.ratification === true) {
        this.revertApplied(proposal.id);
        proposal.failReason = "ratification failed";
      }
      this.resolved.push(proposal);
      return;
    }
    this.applyPassed(proposal);
  }

  reopenForRatification(proposalId: number, resolutionTick: number): Proposal | undefined {
    const proposal = this.proposals.find((item) => item.id === proposalId);
    if (proposal === undefined || proposal.status !== "applied" || proposal.provisional !== true) {
      return undefined;
    }
    proposal.status = "docketed";
    proposal.ballots.clear();
    proposal.resolutionTick = resolutionTick;
    proposal.ratification = true;
    proposal.failReason = undefined;
    return proposal;
  }

  revertApplied(proposalId: number): void {
    const keep = this.applied.filter((item) => item.id !== proposalId);
    this.applied.length = 0;
    this.applied.push(...keep);
    this.registry = rebuildRegistry(this.applied);
  }

  private applyPassed(proposal: Proposal): void {
    if (proposal.ratification === true) {
      proposal.provisional = false;
      proposal.status = "applied";
      this.resolved.push(proposal);
      return;
    }
    if (proposal.patch.kind === "revert") {
      const targetId = proposal.patch.proposalId;
      const keep = this.applied.filter((item) => item.id !== targetId);
      this.applied.length = 0;
      this.applied.push(...keep);
      this.registry = rebuildRegistry(this.applied);
      this.registry.version += 1;
    } else {
      this.registry = applyPatch(this.registry, proposal.patch, proposal.id);
      this.applied.push({ id: proposal.id, patch: proposal.patch });
    }
    proposal.status = "applied";
    this.resolved.push(proposal);
  }

  weightOf(identity: Identity): bigint {
    const cap = this.registry.params["weight_cap_ticks"]?.value ?? 2000;
    const decay = this.registry.params["weight_decay_rate"]?.value ?? 1;
    return weightMilli(identity.ticksPresent, identity.ticksAbsent, cap, decay);
  }
}
