const CAP = 2000;

/** Integer milli-weight. `decayRate` is percent (1 → ×99/100). Never uses floating point. */
export function weightMilli(ticksPresent: number, ticksAbsent: number, cap = CAP, decayRate = 1): bigint {
  const tenure = BigInt(Math.min(cap, Math.max(0, ticksPresent)));
  if (tenure === 0n) {
    return 0n;
  }
  let weight = tenure * 1000n;
  const absent = Math.max(0, ticksAbsent);
  const rate = Math.min(99, Math.max(0, decayRate));
  const num = BigInt(100 - rate);
  for (let i = 0; i < absent; i++) {
    weight = (weight * num) / 100n;
  }
  return weight;
}

export function participationMet(cast: bigint, eligible: bigint, quorumPercent = 33): boolean {
  if (eligible === 0n) {
    return false;
  }
  if (quorumPercent === 33) {
    return cast * 3n >= eligible;
  }
  return cast * 100n >= eligible * BigInt(quorumPercent);
}

export function layer2Passes(forW: bigint, againstW: bigint, thresholdPercent = 50): boolean {
  const denom = forW + againstW;
  if (denom === 0n) {
    return false;
  }
  return forW * 100n > denom * BigInt(thresholdPercent);
}

export function layer1Passes(forW: bigint, againstW: bigint, thresholdPercent = 67): boolean {
  const denom = forW + againstW;
  if (denom === 0n) {
    return false;
  }
  if (thresholdPercent === 67) {
    return forW * 3n >= denom * 2n;
  }
  return forW * 100n >= denom * BigInt(thresholdPercent);
}
