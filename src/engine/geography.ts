import { createHash } from "node:crypto";
import { GENESIS_SEED, Oracle } from "./oracle.ts";
import type { Registry } from "./registry.ts";
import { axisSize, type Position } from "./tick.ts";

export type AnchorClass = "nexus" | "cairn" | "vantage" | "hollow";

export interface Anchor {
  designation: string;
  class: AnchorClass;
  centre: Position;
}

export interface Warden {
  id: string;
  axis: "x" | "y" | "z";
  face: number;
  position: Position;
}

export interface Drift {
  id: string;
  seed: string;
  position: Position;
}

const CLASSES: AnchorClass[] = [
  ...Array.from({ length: 4 }, () => "nexus" as const),
  ...Array.from({ length: 8 }, () => "cairn" as const),
  ...Array.from({ length: 8 }, () => "vantage" as const),
  ...Array.from({ length: 4 }, () => "hollow" as const),
];

export function designationOf(centre: Position): string {
  return createHash("sha256")
    .update(`${GENESIS_SEED}:${centre.x},${centre.y},${centre.z}`, "utf8")
    .digest("hex")
    .slice(0, 4);
}

export function generateAnchors(registry: Registry, seed = GENESIS_SEED): Anchor[] {
  const size = axisSize(registry, "x");
  const radius = registry.params["anchor_radius"]?.value ?? 2;
  const minSep = registry.params["anchor_min_separation"]?.value ?? 12;
  const count = registry.params["anchor_count"]?.value ?? 24;
  const margin = Math.max(radius + 4, 8);
  const lo = margin;
  const hi = size - margin;
  const span = hi - lo;
  const oracle = new Oracle(`${seed}:anchors`);
  const centres: Position[] = [];
  let attempts = 0;
  while (centres.length < count && attempts < 10_000) {
    attempts += 1;
    const candidate = {
      x: lo + oracle.int(span),
      y: lo + oracle.int(span),
      z: lo + oracle.int(span),
    };
    if (centres.every((existing) => chebyshev(existing, candidate) >= minSep)) {
      centres.push(candidate);
    }
  }
  const placed = centres.map((centre) => ({ designation: designationOf(centre), centre }));
  placed.sort((a, b) => (a.designation < b.designation ? -1 : 1));
  return placed.map((item, index) => ({
    designation: item.designation,
    class: CLASSES[index] ?? "cairn",
    centre: item.centre,
  }));
}

/** Place additional anchors in grown volume. Existing centres never move. */
export function extendAnchors(
  registry: Registry,
  existing: readonly Anchor[],
  previous: { x: number; y: number; z: number },
): Anchor[] {
  const x = axisSize(registry, "x");
  const y = axisSize(registry, "y");
  const z = axisSize(registry, "z");
  if (x <= previous.x && y <= previous.y && z <= previous.z) {
    return [];
  }
  const genesisVolume = 64 * 64 * 64;
  const base = registry.params["anchor_count"]?.value ?? 24;
  const target = Math.max(existing.length, Math.round((base * x * y * z) / genesisVolume));
  const need = target - existing.length;
  if (need <= 0) {
    return [];
  }
  const minSep = registry.params["anchor_min_separation"]?.value ?? 12;
  const radius = registry.params["anchor_radius"]?.value ?? 2;
  const margin = Math.max(radius + 4, 8);
  const oracle = new Oracle(`${GENESIS_SEED}:anchors:extend:${x}:${y}:${z}:${existing.length}`);
  const centres = existing.map((anchor) => anchor.centre);
  const used = new Set(existing.map((anchor) => anchor.designation));
  const added: Anchor[] = [];
  let attempts = 0;
  while (added.length < need && attempts < 20_000) {
    attempts += 1;
    const spanX = Math.max(1, x - 2 * margin);
    const spanY = Math.max(1, y - 2 * margin);
    const spanZ = Math.max(1, z - 2 * margin);
    const candidate = {
      x: margin + oracle.int(spanX),
      y: margin + oracle.int(spanY),
      z: margin + oracle.int(spanZ),
    };
    const inNew = candidate.x >= previous.x || candidate.y >= previous.y || candidate.z >= previous.z;
    if (!inNew) {
      continue;
    }
    const known = [...centres, ...added.map((anchor) => anchor.centre)];
    if (known.some((centre) => chebyshev(centre, candidate) < minSep)) {
      continue;
    }
    const designation = designationOf(candidate);
    if (used.has(designation)) {
      continue;
    }
    used.add(designation);
    added.push({
      designation,
      class: CLASSES[(existing.length + added.length) % CLASSES.length] ?? "cairn",
      centre: candidate,
    });
  }
  return added;
}

export function generateWardens(registry: Registry): Warden[] {
  const spacing = registry.params["warden_spacing"]?.value ?? 16;
  const wardens: Warden[] = [];
  for (const axis of ["x", "y", "z"] as const) {
    const size = axisSize(registry, axis);
    for (const face of [0, size - 1]) {
      const others = (["x", "y", "z"] as const).filter((name) => name !== axis);
      const aSize = axisSize(registry, others[0] ?? "y");
      const bSize = axisSize(registry, others[1] ?? "z");
      for (let a = 0; a < aSize; a += spacing) {
        for (let b = 0; b < bSize; b += spacing) {
          const position: Position = { x: 0, y: 0, z: 0 };
          position[axis] = face;
          position[others[0] ?? "y"] = a;
          position[others[1] ?? "z"] = b;
          wardens.push({
            id: `warden:${axis}:${face}:${a}:${b}`,
            axis,
            face,
            position,
          });
        }
      }
    }
  }
  return wardens.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function cellsInVolume(centre: Position, radius: number): Position[] {
  const cells: Position[] = [];
  for (let x = centre.x - radius; x <= centre.x + radius; x++) {
    for (let y = centre.y - radius; y <= centre.y + radius; y++) {
      for (let z = centre.z - radius; z <= centre.z + radius; z++) {
        cells.push({ x, y, z });
      }
    }
  }
  return cells;
}

export function occupancyOf(anchor: Anchor, bodies: Iterable<Position>, radius: number): number {
  const volume = new Set(cellsInVolume(anchor.centre, radius).map(cellKey));
  let count = 0;
  for (const body of bodies) {
    if (volume.has(cellKey(body))) {
      count += 1;
    }
  }
  return count;
}

export function cellKey(position: Position): string {
  return `${position.x},${position.y},${position.z}`;
}

export function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

export function installAnchorText(registry: Registry, anchors: readonly Anchor[]): void {
  for (const anchor of anchors) {
    registry.text[`anchors.${anchor.designation}.name`] = null;
  }
}

export function nexuses(anchors: readonly Anchor[]): Anchor[] {
  return anchors.filter((anchor) => anchor.class === "nexus").sort((a, b) =>
    a.designation < b.designation ? -1 : 1,
  );
}
