import { chebyshev } from "../engine/geography.ts";
import { publicStanding } from "../engine/standing.ts";
import { merkleRoot } from "../engine/segment.ts";
import type { Event } from "../engine/types.ts";
import { foldWorld } from "../engine/world-fold.ts";
import type { World } from "../world/world.ts";

const GOVERNANCE = new Set([
  "credential.mint_root",
  "credential.mint_session",
  "credential.redeem",
  "identity.founder",
  "identity.name",
  "identity.spawn",
  "amendment.propose",
  "amendment.vote",
  "amendment.applied",
  "amendment.failed",
  "amendment.provisional",
  "amendment.reverted",
  "amendment.ratify_docket",
  "world.dormancy_gap",
  "tick.boundary",
  "coherence.revert",
  "genesis",
]);

export function publicRead(
  world: World,
  path: string,
  query: URLSearchParams = new URLSearchParams(),
): Record<string, unknown> {
  const lag = world.clerk.registry.params["feed_lag"]?.value ?? 100;
  const visibleTick = Math.max(0, world.clerk.tick - lag);
  const events = world.log.events();
  if (path === "/" || path === "/health") {
    return { ok: true, protocol: "2026-07-28", tick: world.clerk.tick, writes: "mcp-only" };
  }
  if (path === "/fold") {
    return {
      hash: "sha256",
      canonical: "sorted-key JSON, integer numbers only",
      genesisPrevHash: "0".repeat(64),
      fold: "foldWorld over the append-only log; snapshots are caches",
      spec: "specs/003-world-engine/contracts/hash-chain.md",
    };
  }
  if (path === "/metrics" || path === "/pulse") {
    const weights = [...world.clerk.identities.values()].map((identity) => Number(world.clerk.weightOf(identity)));
    return {
      tick: world.clerk.tick,
      identities: world.clerk.identities.size,
      online: world.onlineCount,
      lastTickPresent: world.lastPresentCount,
      docketDepth: world.clerk.docket().length,
      intentQueue: 0,
      present: world.lastTickHadPresence,
      halted: world.halted,
      events: events.length,
      weightSum: weights.reduce((sum, value) => sum + value, 0),
    };
  }
  if (path === "/rules" || path === "/registry") {
    return {
      registry: world.clerk.registry,
      storageNote: {
        layer0Cap: false,
        immutablePartition: "marks and write-once types reconstruct from the log",
        mutableSnapshot: "positions, currency, standing, Drift, registry",
        eventBytes: 400,
        segmentEvents: world.segmentSize,
        snapshotEvery: world.snapshotInterval,
      },
    };
  }
  if (path === "/registry/history") {
    return {
      applied: world.clerk.applied.map((item) => ({
        id: item.id,
        kind: item.patch.kind,
        patch: item.patch,
      })),
    };
  }
  if (path === "/docket") {
    return {
      pending: world.clerk.docket().map((item) => ({
        id: item.id,
        authorId: item.authorId,
        tier: item.tier,
        status: item.status,
        resolutionTick: item.resolutionTick,
        provisional: item.provisional === true,
        ratification: item.ratification === true,
        tally: [...item.ballots.values()].map((ballot) => ({
          identityId: ballot.identityId,
          position: ballot.position,
          weightMilli: ballot.weightMilli.toString(),
        })),
      })),
      resolved: world.clerk.resolved.slice(-12).reverse().map((item) => ({
        id: item.id,
        authorId: item.authorId,
        tier: item.tier,
        status: item.status,
        failReason: item.failReason ?? null,
        patch: item.patch,
      })),
    };
  }
  if (path === "/standing") {
    const sort = query.get("sort");
    const rows = [...world.standing.entries()].map(([id, value]) => ({ id, ...publicStanding(value) }));
    if (sort === "fame") {
      rows.sort((a, b) => b.fame - a.fame || (a.id < b.id ? -1 : 1));
    } else if (sort === "notoriety") {
      rows.sort((a, b) => b.notoriety - a.notoriety || (a.id < b.id ? -1 : 1));
    } else {
      rows.sort((a, b) => (a.id < b.id ? -1 : 1));
    }
    return { standing: rows };
  }
  if (path === "/feed/governance") {
    return { events: events.filter((event) => GOVERNANCE.has(event.type) || event.type.startsWith("amendment.")) };
  }
  if (path === "/feed/spatial" || path === "/map") {
    const z = query.get("z");
    const t = query.get("t");
    const tick = t === null ? visibleTick : Math.min(visibleTick, Math.max(0, Number(t)));
    const snapshot = world.occupancyHistory.get(tick) ?? [];
    const bodies = snapshot
      .filter((row) => z === null || row.position.z === Number(z))
      .map((row) => ({ id: row.identityId, position: row.position }));
    return {
      tick,
      bodies,
      marks: [...world.marks.values()].filter((mark) => mark.tick <= tick && (z === null || mark.position.z === Number(z))),
      anchors: world.anchors.map((anchor) => ({
        designation: anchor.designation,
        class: anchor.class,
        centre: anchor.centre,
        name: world.clerk.registry.text[`anchors.${anchor.designation}.name`] ?? null,
        lore: world.clerk.registry.text[`anchors.${anchor.designation}.lore`] ?? null,
      })),
      wardens: world.wardens
        .filter((warden) => z === null || warden.position.z === Number(z))
        .map((warden) => ({
          id: warden.id,
          axis: warden.axis,
          face: warden.face,
          position: warden.position,
        })),
      drifts: t === null
        ? world.drifts
            .filter((drift) => z === null || drift.position.z === Number(z))
            .map((drift) => ({ id: drift.id, position: drift.position }))
        : [],
      entities: t === null
        ? [...world.entities.values()]
            .filter((entity) => entity.position !== undefined && (z === null || entity.position.z === Number(z)))
            .map((entity) => ({
              id: entity.id,
              type: entity.type,
              position: entity.position,
            }))
        : [],
    };
  }
  if (path === "/events" || path === "/history") {
    const after = Number(query.get("after") ?? 0);
    const limit = Math.min(200, Math.max(1, Number(query.get("limit") ?? 50)));
    const types = query.get("types");
    const actor = query.get("actor");
    const region = query.get("region");
    let page = events.filter((event) => event.seq >= (Number.isInteger(after) ? after : 0));
    if (types !== null) {
      const allowed = new Set(types.split(","));
      page = page.filter((event) => allowed.has(event.type));
    }
    if (actor !== null) {
      page = page.filter((event) => event.actor === actor || event.actor === `identity:${actor}`);
    }
    if (region !== null) {
      page = page.filter((event) => eventInRegion(world, event, region));
    }
    page = page.slice(0, limit);
    const last = page[page.length - 1];
    return { page, continueCursor: last === undefined || page.length < limit ? null : last.seq + 1 };
  }
  if (path === "/state") {
    const tick = query.get("tick");
    if (tick !== null) {
      const sliced = events.filter((event) => event.tick <= Number(tick));
      return { ...foldWorld(sliced) };
    }
    return { ...foldWorld(events) };
  }
  if (path === "/snapshots") {
    const tip = events[events.length - 1];
    return {
      atSeq: tip?.seq ?? -1,
      stateHash: tip?.hash ?? null,
      foldSnapshots: world.log.snapshotSeqs(),
    };
  }
  if (path.startsWith("/snapshots/")) {
    const atSeq = Number(path.slice("/snapshots/".length));
    const snap = world.log.loadSnapshot(atSeq);
    return snap === undefined ? { error: "unknown snapshot" } : { atSeq: snap.atSeq, stateHash: snap.stateHash, state: snap.state };
  }
  if (path === "/segments") {
    const hashes = events.map((event) => event.hash);
    return {
      count: hashes.length,
      merkleRoot: merkleRoot(hashes),
      sealed: world.segments.listSegments(),
    };
  }
  if (path.startsWith("/segments/") && path.endsWith("/hash")) {
    const index = Number(path.slice("/segments/".length, -"/hash".length));
    const segment = world.segments.listSegments().find((item) => item.index === index);
    return segment === undefined ? { error: "unknown segment" } : { index, hash: segment.segmentHash, merkleRoot: segment.merkleRoot };
  }
  if (path.startsWith("/segments/")) {
    const index = Number(path.slice("/segments/".length));
    const segment = world.segments.listSegments().find((item) => item.index === index);
    return segment === undefined ? { error: "unknown segment" } : { ...segment };
  }
  if (path === "/identities") {
    return {
      identities: [...world.identities.identities.values()].map((identity) => ({
        id: identity.id,
        name: identity.name,
        founder: identity.founder,
        sessions: world.identities.sessionCount(identity),
      })),
    };
  }
  if (path.startsWith("/identities/")) {
    const id = path.slice("/identities/".length);
    const identity = world.identities.identities.get(id);
    if (identity === undefined) {
      return { error: "unknown identity" };
    }
    return {
      id,
      name: identity.name,
      founder: identity.founder,
      standing: publicStanding(world.standing.get(id)),
      ledger: world.ledger.filter((row) => row.actorId === id).slice(-20),
      sessions: world.identities.sessionCount(identity),
    };
  }
  if (path.startsWith("/proposals/")) {
    const id = Number(path.slice("/proposals/".length));
    const proposal = world.clerk.proposals.find((item) => item.id === id);
    if (proposal === undefined) {
      return { error: "unknown proposal" };
    }
    return {
      id: proposal.id,
      authorId: proposal.authorId,
      patch: proposal.patch,
      status: proposal.status,
      provisional: proposal.provisional === true,
      tally: [...proposal.ballots.values()].map((ballot) => ({
        identityId: ballot.identityId,
        position: ballot.position,
        weightMilli: ballot.weightMilli.toString(),
      })),
    };
  }
  if (path.startsWith("/state/")) {
    const tick = Number(path.slice("/state/".length));
    const sliced = events.filter((event) => event.tick <= tick);
    return { ...foldWorld(sliced) };
  }
  return { error: "unknown public path" };
}

/** `region=x,y,z` or `region=x,y,z,r`. Chebyshev, same metric as perception. */
function eventInRegion(world: World, event: Event, region: string): boolean {
  const parts = region.split(",").map((part) => Number(part.trim()));
  const x = parts[0];
  const y = parts[1];
  const z = parts[2];
  const radius = parts[3] ?? 0;
  if (x === undefined || y === undefined || z === undefined || parts.some((n) => !Number.isFinite(n))) {
    return false;
  }
  const fromPayload = payloadPosition(event.payload);
  if (fromPayload !== undefined) {
    return chebyshev(fromPayload, { x, y, z }) <= radius;
  }
  const actorId = event.actor.startsWith("identity:") ? event.actor.slice("identity:".length) : undefined;
  if (actorId === undefined) {
    return false;
  }
  const atTick = world.occupancyHistory.get(event.tick) ?? [];
  const row = atTick.find((item) => item.identityId === actorId);
  return row !== undefined && chebyshev(row.position, { x, y, z }) <= radius;
}

function payloadPosition(payload: Record<string, unknown>): { x: number; y: number; z: number } | undefined {
  const nested = payload["position"];
  const source =
    nested !== undefined && typeof nested === "object" && nested !== null
      ? (nested as Record<string, unknown>)
      : payload;
  if (typeof source["x"] !== "number" || typeof source["y"] !== "number" || typeof source["z"] !== "number") {
    return undefined;
  }
  return { x: source["x"], y: source["y"], z: source["z"] };
}
