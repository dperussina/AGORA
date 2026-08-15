export interface RecordItem {
  tick: number;
  type: string;
  actor?: string;
  payload: Record<string, unknown>;
}

/** Spectator stream class. `/map` still lags bodies; this is the public log tail. */
export function streamKind(type: string): "governance" | "spatial" {
  if (
    type.startsWith("act.") ||
    type === "identity.spawn" ||
    type === "speak" ||
    type === "speak.warden" ||
    type.startsWith("effect.") ||
    type.startsWith("war.") ||
    type.startsWith("body.")
  ) {
    return "spatial";
  }
  return "governance";
}

export function recordFrame(item: RecordItem): string {
  return `event: record\ndata: ${JSON.stringify(item)}\n\n`;
}

/** Fold of public spawn/move. `/map` still lags; the cube needs a seed or orbs never appear. */
export function presenceFrame(bodies: Array<{ id: string; position: { x: number; y: number; z: number } }>): string {
  return `event: presence\ndata: ${JSON.stringify({ bodies })}\n\n`;
}

/** Spectator fan-out. Not identity. Not a write path. */
export class RecordHub {
  private readonly listeners = new Set<(frame: string) => boolean>();

  subscribe(send: (frame: string) => boolean): () => void {
    this.listeners.add(send);
    return () => {
      this.listeners.delete(send);
    };
  }

  publish(item: RecordItem): void {
    const frame = recordFrame(item);
    for (const send of [...this.listeners]) {
      if (!send(frame)) {
        this.listeners.delete(send);
      }
    }
  }

  close(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
