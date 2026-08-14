import { createHash } from "node:crypto";

export const GENESIS_SEED = "agora-genesis-v0";

export class Oracle {
  private n = 0;

  constructor(private readonly seed: string) {}

  bytes(): Buffer {
    const digest = createHash("sha256").update(`${this.seed}:${this.n}`, "utf8").digest();
    this.n += 1;
    return digest;
  }

  int(max: number): number {
    if (max <= 0) {
      return 0;
    }
    return this.bytes().readUInt32BE(0) % max;
  }
}
