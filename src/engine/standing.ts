export type StandingKind = "fame" | "notoriety";

export interface WitnessEdge {
  actorId: string;
  witnessId: string;
  kind: StandingKind;
  eventSeq: number;
}

export interface Standing {
  fame: number;
  notoriety: number;
  /** Unused fame decay in percent-points (basis 100). Absent on pre-fix snapshots. */
  fameDebt?: number;
  /** Unused notoriety decay in per-mille points (basis 1000). Absent on pre-fix snapshots. */
  notorietyDebt?: number;
}

export function emptyStanding(): Standing {
  return { fame: 0, notoriety: 0, fameDebt: 0, notorietyDebt: 0 };
}

export function normalizeStanding(value: Standing): Standing {
  return {
    fame: value.fame,
    notoriety: value.notoriety,
    fameDebt: value.fameDebt ?? 0,
    notorietyDebt: value.notorietyDebt ?? 0,
  };
}

export function publicStanding(value?: Standing): { fame: number; notoriety: number } {
  return { fame: value?.fame ?? 0, notoriety: value?.notoriety ?? 0 };
}

export interface LedgerRow {
  actorId: string;
  witnessId: string;
  kind: StandingKind;
  amount: number;
  tick: number;
  eventSeq: number;
}

const ITERATIONS = 20;

export function decayStanding(current: Standing, fameDecay = 2, notorietyDecay = 5): Standing {
  const prior = normalizeStanding(current);
  const fameAccrued = prior.fameDebt + prior.fame * fameDecay;
  const fameLoss = Math.min(prior.fame, Math.floor(fameAccrued / 100));
  const fame = prior.fame - fameLoss;
  const notorietyAccrued = prior.notorietyDebt + prior.notoriety * notorietyDecay;
  const notorietyLoss = Math.min(prior.notoriety, Math.floor(notorietyAccrued / 1000));
  const notoriety = prior.notoriety - notorietyLoss;
  return {
    fame,
    notoriety,
    fameDebt: fame === 0 ? 0 : fameAccrued - fameLoss * 100,
    notorietyDebt: notoriety === 0 ? 0 : notorietyAccrued - notorietyLoss * 1000,
  };
}

export function assessStanding(
  prior: Map<string, Standing>,
  edges: readonly WitnessEdge[],
  tick: number,
  fameDecay = 2,
  notorietyDecay = 5,
): { next: Map<string, Standing>; ledger: LedgerRow[] } {
  const ids = new Set<string>([...prior.keys(), ...edges.flatMap((edge) => [edge.actorId, edge.witnessId])]);
  const next = new Map<string, Standing>();
  for (const id of ids) {
    next.set(id, decayStanding(prior.get(id) ?? emptyStanding(), fameDecay, notorietyDecay));
  }
  const ledger: LedgerRow[] = [];
  for (const kind of ["fame", "notoriety"] as const) {
    const kindEdges = edges.filter((edge) => edge.kind === kind);
    if (kindEdges.length === 0) {
      continue;
    }
    const score = new Map<string, number>();
    for (const id of ids) {
      score.set(id, next.get(id)?.[kind] ?? 0);
    }
    for (let iter = 0; iter < ITERATIONS; iter++) {
      const round = new Map<string, number>();
      for (const id of ids) {
        round.set(id, 0);
      }
      for (const edge of kindEdges) {
        const from = 1000 + (score.get(edge.witnessId) ?? 0);
        round.set(edge.actorId, (round.get(edge.actorId) ?? 0) + from);
      }
      for (const [id, value] of round) {
        score.set(id, value);
      }
    }
    for (const id of ids) {
      const amount = Math.floor((score.get(id) ?? 0) / 1000);
      if (amount <= 0) {
        continue;
      }
      const row = next.get(id) ?? emptyStanding();
      row[kind] += amount;
      next.set(id, row);
      const edge = kindEdges.find((item) => item.actorId === id);
      const witness = edge?.witnessId ?? id;
      ledger.push({ actorId: id, witnessId: witness, kind, amount, tick, eventSeq: edge?.eventSeq ?? -1 });
    }
  }
  return { next, ledger };
}

export function broadcastRadius(
  fame: number,
  inNexus: boolean,
  base = 12,
  nexusMult = 4,
  fameScalingMilli = 500,
): number {
  const scaled = base + Math.floor((fame * fameScalingMilli) / 1000);
  return inNexus ? scaled * nexusMult : scaled;
}
