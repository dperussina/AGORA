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
  return {
    fame: Math.max(0, Math.floor((current.fame * (100 - fameDecay)) / 100)),
    notoriety: Math.max(0, Math.floor((current.notoriety * (1000 - notorietyDecay)) / 1000)),
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
    next.set(id, decayStanding(prior.get(id) ?? { fame: 0, notoriety: 0 }, fameDecay, notorietyDecay));
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
      const row = next.get(id) ?? { fame: 0, notoriety: 0 };
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
