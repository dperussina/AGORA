import { World } from "../world/world.ts";
import { AgoraStore } from "./sqlite.ts";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? fallback : Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function openPersistedWorld(filename: string): { world: World; store: AgoraStore } {
  const store = new AgoraStore(filename);
  const existed = store.log.tip() !== undefined;
  const world = new World(store.log, Buffer.from(store.serverKey()), {
    segments: store,
    snapshotInterval: envInt("AGORA_SNAPSHOT_INTERVAL", 1_000),
    segmentSize: envInt("AGORA_SEGMENT_SIZE", 1_000_000),
  });
  world.identities.importRecords(store.loadIdentities());
  if (existed) {
    world.hydrate(store.loadSnapshot());
  }
  world.onPersist = () => {
    store.saveIdentities(world.identities.exportRecords());
    store.saveSnapshot(world.capture());
  };
  world.persist();
  return { world, store };
}
