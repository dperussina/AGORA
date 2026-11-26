/**
 * 3D Anatomical Neural Synapse Brain Renderer for Agora (60 FPS Canvas 2D).
 *
 * - Procedurally sculpts a recognizable 3D human brain connectome:
 *     • Left & Right Cerebral Hemispheres with frontal, parietal, occipital,
 *       and temporal lobes, Sylvian & longitudinal fissures, and organic
 *       gyri/sulci cortical folding.
 *     • Twin-lobed striated Cerebellum + descending Brainstem/Pons.
 *     • ~1,050 structural cortical micro-neurons & short-range white-matter
 *       filaments forming a calm, translucent, unlit anatomical substrate.
 * - Real Agora citizens, artifacts, and landmarks sit embedded in the cortex
 *   and deep nuclei — always subtly visible in their resting dormant state.
 * - ONLY when synapses fire (live SSE events or optional Synapse Replay) does
 *   the brain light up: true 3D Bezier action-potential comets shoot along
 *   axonal pathways, ignite source & target somas, trigger localized
 *   calcium-imaging cortical ripples across nearby micro-neurons & filaments,
 *   linger briefly, and fade smoothly back to dark dormancy.
 */

const BRAIN_SCALE = 29;

function hashStr(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const clean = String(hex || "#38bdf8").replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean, 16);
  if (!Number.isFinite(n)) return { r: 56, g: 189, b: 248 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(rgb, alpha) {
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/**
 * Multi-frequency 3D cortical folding wave (gyri ridges > 0, sulci valleys < 0).
 */
function corticalFold(nx, ny, nz) {
  const f1 = Math.sin(nx * 11.5 + nz * 7.2) * Math.cos(ny * 10.4 - nz * 5.8);
  const f2 = Math.sin(nz * 14.2 - ny * 8.6 + nx * 4.5) * 0.55;
  const f3 = Math.cos(nx * 18.0 + ny * 13.0) * 0.28;
  return (f1 + f2 + f3) / 1.83;
}

/**
 * Sculpt a unit sphere direction (sx, sy, sz) onto the left (-1) or right (+1)
 * cerebral hemisphere with realistic frontal/parietal/occipital/temporal lobes,
 * Sylvian indentation, medial longitudinal fissure, and gyri/sulci folding.
 */
function sculptCerebrumPoint(sx, sy, sz, hemi, rShell) {
  // Base hemisphere ellipsoid
  // X: lateral width, Y: dorsal/ventral, Z: anterior (+Z frontal) to posterior (-Z occipital)
  const ux = Math.abs(sx);
  let z = sz * 1.16;
  let y = sy * 0.78;
  let xLocal = ux * 0.64;

  // Frontal pole taper (+Z) & occipital fullness (-Z)
  const frontFactor = z > 0 ? 1 - 0.24 * Math.pow(Math.min(1, z / 1.16), 1.45) : 1 + 0.05 * Math.min(1, -z / 1.16);
  xLocal *= frontFactor;

  // Parietal crown arch (higher in mid-posterior dorsal region)
  if (y > 0) {
    const crown = Math.exp(-Math.pow((z + 0.14) / 0.78, 2));
    y *= 1 + 0.14 * crown;
  } else {
    // Flatten orbital/ventral base while carving out the protruding temporal lobe!
    y *= 0.72;
  }

  // Temporal lobe bulge: lateral (ux > 0.35), mid-anterior to mid-posterior (z in -0.55..+0.42), ventral (sy < 0.12)
  const tempZ = Math.exp(-Math.pow((z + 0.06) / 0.48, 2));
  const tempY = Math.exp(-Math.pow((sy + 0.36) / 0.36, 2));
  const tempLat = Math.pow(Math.max(0, ux), 1.2);
  const temporalBulge = tempZ * tempY * tempLat;
  xLocal += temporalBulge * 0.14;
  y -= temporalBulge * 0.24;

  // Occipital tuck underneath to make room for the cerebellum
  if (z < -0.35 && sy < -0.05) {
    const tuck = Math.min(1, (-z - 0.35) / 0.75) * Math.min(1, (-sy - 0.05) / 0.7);
    y += tuck * 0.26;
  }

  // Subtle Sylvian fissure crease separating temporal lobe from frontal/parietal
  const sylvian = Math.exp(-Math.pow((sy + 0.08 - z * 0.24) / 0.09, 2)) * Math.max(0, ux - 0.35) * Math.exp(-Math.pow((z - 0.05) / 0.55, 2));

  // Gyri / sulci cortical folding on outer cortex
  const fold = corticalFold(hemi * xLocal * 2.1, y * 2.1, z * 1.8);
  const foldAmp = rShell > 0.72 ? 0.042 * (rShell - 0.65) / 0.35 : 0.008;
  const radialMod = 1 + fold * foldAmp - sylvian * 0.075;

  const fissureGap = 0.055 + 0.035 * Math.max(0, sy);
  const x = hemi * (fissureGap + xLocal * rShell * radialMod);
  const yOut = (y * rShell * radialMod) + 0.14;
  const zOut = z * rShell * radialMod;

  return {
    x: x * BRAIN_SCALE,
    y: yOut * BRAIN_SCALE,
    z: zOut * BRAIN_SCALE,
    fold,
    region: "cortex",
  };
}

/**
 * Deterministic 3D coordinate inside the sculpted anatomical brain for real Agora entities.
 */
function brainCoordsFor(id, kind) {
  const rng = seededRand(hashStr(`${kind}:${id}`));
  const u = rng();
  const v = rng();
  const w = rng();
  const hemi = (hashStr(id) & 1) === 0 ? -1 : 1;

  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  const sx = Math.sin(phi) * Math.cos(theta);
  const sy = Math.cos(phi);
  const sz = Math.sin(phi) * Math.sin(theta);

  if (kind === "anchor") {
    // Deep subcortical / thalamic relay nuclei near the center
    const r = 0.2 + 0.24 * Math.cbrt(w);
    return {
      x: hemi * (0.06 + Math.abs(sx) * 0.26) * r * BRAIN_SCALE * 1.4,
      y: (sy * 0.26 + 0.06) * BRAIN_SCALE,
      z: sz * 0.38 * BRAIN_SCALE,
    };
  }

  // Citizens sit prominently on the outer cortical ribbon; artifacts in mid-outer cortex
  const rShell = kind === "agent" ? 0.94 + 0.08 * w : 0.68 + 0.26 * Math.cbrt(w);
  const pt = sculptCerebrumPoint(sx, sy, sz, hemi, rShell);
  return { x: pt.x, y: pt.y, z: pt.z };
}

function signalColor(evType, payload) {
  if (evType === "act.give") return "#fbbf24"; // warm gold — value transfer
  if (evType === "act.run" || evType === "api.request") {
    return payload?.sandbox === "quickjs-wasm" ? "#34d399" : "#22d3ee"; // bioluminescent emerald / cyan
  }
  if (evType === "act.craft" || evType === "act.edit") return "#38bdf8"; // electric sky — creation
  if (evType === "amendment.propose" || evType === "amendment.vote" || evType === "amendment.applied") {
    return "#c084fc"; // radiant violet — governance
  }
  return "#ff6b4a"; // neural coral — speech / DM / notes
}

/** Evaluate 3D cubic Bezier at t in [0, 1]. */
function evalBezier3(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  const b0 = uu * u;
  const b1 = 3 * uu * t;
  const b2 = 3 * u * tt;
  const b3 = tt * t;
  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
    z: b0 * p0.z + b1 * p1.z + b2 * p2.z + b3 * p3.z,
  };
}

/**
 * Compute organic 3D axonal control points between two brain neurons.
 * Cross-hemisphere tracts arch gently through the corpus callosum;
 * intra-hemisphere tracts bow organically along white-matter curvature.
 */
function buildAxonControlPoints(from, to, seed) {
  const crossHemi = Math.sign(from.x || 1) !== Math.sign(to.x || 1);
  const rng = seededRand(seed);
  const jitter = (rng() - 0.5) * 4.5;

  if (crossHemi) {
    // Arch gracefully through the corpus callosum (central commissure bridge)
    const midZ = (from.z + to.z) * 0.45 + jitter * 0.5;
    const callosumY = Math.max(-2, Math.min(10, (from.y + to.y) * 0.35 + 4.5));
    const p1 = {
      x: from.x * 0.32,
      y: from.y * 0.45 + callosumY * 0.55,
      z: from.z * 0.55 + midZ * 0.45,
    };
    const p2 = {
      x: to.x * 0.32,
      y: to.y * 0.45 + callosumY * 0.55,
      z: to.z * 0.55 + midZ * 0.45,
    };
    return { p1, p2 };
  }

  // Intra-hemisphere curved white-matter tract bowing gently inward/outward
  const mx = (from.x + to.x) * 0.5;
  const my = (from.y + to.y) * 0.5;
  const mz = (from.z + to.z) * 0.5;
  const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const bow = Math.min(11, dist * 0.24);
  const radialLen = Math.hypot(mx, my, mz) || 1;
  // Slightly inward white-matter arc for long tracts, gentle outward arc for short cortical hops
  const dir = dist > 20 ? -0.45 : 0.32;
  const bx = (mx / radialLen) * bow * dir;
  const by = (my / radialLen) * bow * dir + 1.8;
  const bz = (mz / radialLen) * bow * dir;

  return {
    p1: {
      x: from.x + (mx - from.x) * 0.55 + bx + jitter * 0.3,
      y: from.y + (my - from.y) * 0.55 + by,
      z: from.z + (mz - from.z) * 0.55 + bz,
    },
    p2: {
      x: to.x + (mx - to.x) * 0.55 + bx - jitter * 0.3,
      y: to.y + (my - to.y) * 0.55 + by,
      z: to.z + (mz - to.z) * 0.55 + bz,
    },
  };
}

export class Lattice3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onSelect = opts.onSelect || (() => {});
    this.onHover = opts.onHover || (() => {});
    this.actorLabel = opts.actorLabel || ((id) => id);

    // Camera — 3/4 lateral-frontal hero angle that showcases the full brain profile immediately
    this.yaw = -0.82;
    this.pitch = 0.22;
    this.zoom = 1.06;
    this.focus = { x: 0, y: -1.5, z: 0 };
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.targetZoom = this.zoom;
    this.targetFocus = { x: 0, y: -1.5, z: 0 };
    this.autoOrbit = true;
    this.showLineage = true; // controls ambient Synapse Replay of historical events
    this.showLabels = true;

    this.anchors = [];
    this.artifacts = [];
    this.agents = new Map();
    this.drifts = [];
    this.nodes = new Map(); // real Agora nodes: id -> { id, kind, label, x, y, z, activation, glowColor, glowRgb, lastLit, raw }
    this.synapses = []; // active firing 3D axons
    this.ripples = []; // expanding 3D synaptic arrival shockwaves
    this.ticker = []; // recent firing dispatches for subtle HUD
    this.historyEvents = [];
    this.replayIdx = 0;
    this.lastReplayAt = 0;
    this.lastLiveAt = 0;

    this.hitTargets = [];
    this.hovered = null;

    this.rafId = null;
    this.running = false;
    this.visible = true;
    this.dragging = false;
    this.dragMoved = false;
    this.lastPtr = { x: 0, y: 0 };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 960;
    this.height = 540;
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    // Build sculpted anatomical brain substrate (micro-neurons + local structural connectome)
    const anatomy = this._buildBrainAnatomy();
    this._microNodes = anatomy.points;
    this._microEdges = anatomy.edges;
    this._totalExcitation = 0;
    this._ambientColor = { r: 56, g: 189, b: 248 };

    this._bindEvents();
    this._resize();
    this.start();
  }

  /**
   * Procedurally sculpt a high-detail 3D anatomical brain:
   * - ~820 outer cerebral cortical micro-neurons (with gyri/sulci & temporal lobes)
   * - ~160 twin-lobed striated cerebellum micro-neurons
   * - ~70 descending brainstem / pons micro-neurons
   * - ~760 short-range structural filaments (strictly whisper-dim when dormant,
   *   and dynamically illuminated when nearby synapses fire!)
   */
  _buildBrainAnatomy() {
    const rng = seededRand(0x41474f52); // deterministic "AGOR" seed
    const points = [];

    // 1. Left & Right Cerebral Hemispheres (golden-angle Fibonacci distribution for even organic density)
    const perHemi = 410;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (const hemi of [-1, 1]) {
      for (let i = 0; i < perHemi; i++) {
        const t = (i + 0.5) / perHemi;
        const sy = 1 - 2 * t;
        const rad = Math.sqrt(Math.max(0, 1 - sy * sy));
        const angle = golden * i + (hemi > 0 ? 1.1 : 0);
        // Slight organic jitter so points never look like a rigid CAD grid
        const jitterA = (rng() - 0.5) * 0.14;
        const sx = Math.cos(angle + jitterA) * rad;
        const sz = Math.sin(angle + jitterA) * rad;
        // Mostly outer cortical shell (0.90..1.01) + ~15% deeper white-matter nuclei
        const isDeep = rng() < 0.14;
        const rShell = isDeep ? 0.52 + rng() * 0.34 : 0.91 + rng() * 0.1;
        const pt = sculptCerebrumPoint(sx, sy, sz, hemi, rShell);
        points.push({
          x: pt.x,
          y: pt.y,
          z: pt.z,
          fold: pt.fold,
          region: isDeep ? "white" : "cortex",
          hemi,
          size: isDeep ? 0.9 : 1.05 + Math.max(0, pt.fold) * 0.55,
          exc: 0,
          r: 56,
          g: 189,
          b: 248,
          lastExc: 0,
        });
      }
    }

    // 2. Cerebellum (twin striated lobes tucked under occipital cortex)
    const cerebPerHemi = 80;
    for (const hemi of [-1, 1]) {
      for (let i = 0; i < cerebPerHemi; i++) {
        const t = (i + 0.5) / cerebPerHemi;
        const sy = 1 - 2 * t;
        const rad = Math.sqrt(Math.max(0, 1 - sy * sy));
        const angle = golden * i * 1.3;
        const ux = Math.abs(Math.cos(angle) * rad);
        const sz = Math.sin(angle) * rad;
        // Horizontal cerebellar folia striations
        const folia = Math.sin(sy * 26) * 0.055;
        const rShell = 0.88 + rng() * 0.12 + folia;
        const x = hemi * (0.04 + ux * 0.44 * rShell) * BRAIN_SCALE;
        const y = (-0.49 + sy * 0.25 * rShell) * BRAIN_SCALE;
        const z = (-0.64 + sz * 0.34 * rShell) * BRAIN_SCALE;
        points.push({
          x,
          y,
          z,
          fold: folia * 12,
          region: "cerebellum",
          hemi,
          size: 0.95,
          exc: 0,
          r: 56,
          g: 189,
          b: 248,
          lastExc: 0,
        });
      }
    }

    // 3. Brainstem / Pons / Medulla descending gently underneath
    const stemCount = 68;
    for (let i = 0; i < stemCount; i++) {
      const h = i / (stemCount - 1); // 0 = top (midbrain/pons), 1 = bottom (medulla)
      const angle = golden * i * 2.1 + (rng() - 0.5) * 0.25;
      // Pons bulge near upper-front of stem
      const ponsBulge = Math.exp(-Math.pow((h - 0.25) / 0.22, 2)) * 0.09;
      const radius = (0.21 - h * 0.085 + ponsBulge) * BRAIN_SCALE;
      const x = Math.cos(angle) * radius * 0.95;
      const z = (-0.24 - h * 0.16) * BRAIN_SCALE + Math.sin(angle) * radius * (1 + ponsBulge * 2.5);
      const y = (-0.34 - h * 0.68) * BRAIN_SCALE;
      points.push({
        x,
        y,
        z,
        fold: 0,
        region: "stem",
        hemi: x >= 0 ? 1 : -1,
        size: 0.88,
        exc: 0,
        r: 56,
        g: 189,
        b: 248,
        lastExc: 0,
      });
    }

    // 4. Short-range local structural filaments (connect each point to 1–2 nearest neighbors in same region)
    // Kept whisper-quiet when dormant, and they light up like a live connectome when nearby synapses fire!
    const edges = [];
    const seenEdge = new Set();
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      let best1 = -1;
      let d1 = Infinity;
      let best2 = -1;
      let d2 = Infinity;
      const maxD2 = a.region === "cortex" ? 34 : a.region === "cerebellum" ? 22 : 20;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const b = points[j];
        if (b.region !== a.region) continue;
        if (a.region === "cortex" && b.hemi !== a.hemi) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const dist2 = dx * dx + dy * dy + dz * dz;
        if (dist2 > maxD2) continue;
        if (dist2 < d1) {
          d2 = d1;
          best2 = best1;
          d1 = dist2;
          best1 = j;
        } else if (dist2 < d2) {
          d2 = dist2;
          best2 = j;
        }
      }

      for (const nb of [best1, best2]) {
        if (nb < 0) continue;
        const key = i < nb ? `${i}:${nb}` : `${nb}:${i}`;
        if (seenEdge.has(key)) continue;
        seenEdge.add(key);
        edges.push({ a: i, b: nb, callosal: false });
      }
    }

    // Add ~28 subtle corpus callosum commissure bridges across the medial fissure
    const leftDeep = [];
    const rightDeep = [];
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (p.region === "white" && Math.abs(p.x) < 11 && p.y > -5 && p.y < 12) {
        if (p.hemi < 0) leftDeep.push(i);
        else rightDeep.push(i);
      }
    }
    for (let k = 0; k < Math.min(28, leftDeep.length); k++) {
      const li = leftDeep[k];
      const lp = points[li];
      let bestR = -1;
      let bestD = Infinity;
      for (const ri of rightDeep) {
        const rp = points[ri];
        const d = Math.hypot(lp.y - rp.y, lp.z - rp.z);
        if (d < bestD) {
          bestD = d;
          bestR = ri;
        }
      }
      if (bestR >= 0) edges.push({ a: li, b: bestR, callosal: true });
    }

    return { points, edges };
  }

  /**
   * Localized calcium-imaging excitation: illuminate nearby structural cortical
   * micro-neurons around (x, y, z) so the brain tissue glows around active firing,
   * lingers briefly, and decays smoothly back to dark dormancy.
   */
  _exciteCortexNear(x, y, z, rgb, strength, radius, now) {
    const r2 = radius * radius;
    for (let i = 0; i < this._microNodes.length; i++) {
      const m = this._microNodes[i];
      const dx = m.x - x;
      const dy = m.y - y;
      const dz = m.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;
      const falloff = 1 - Math.sqrt(d2) / radius;
      const boost = strength * falloff * falloff;
      if (boost > m.exc * 0.55) {
        m.exc = Math.min(1, Math.max(m.exc, boost));
        m.r = rgb.r;
        m.g = rgb.g;
        m.b = rgb.b;
        m.lastExc = now;
      }
    }
  }

  _ensureNode(id, kind, label, raw = null) {
    if (!id) return null;
    let node = this.nodes.get(id);
    if (!node) {
      const pos = brainCoordsFor(id, kind);
      node = {
        id,
        kind,
        label: label || id,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        activation: 0,
        glowColor: "#38bdf8",
        glowRgb: { r: 56, g: 189, b: 248 },
        lastLit: 0,
        raw,
      };
      this.nodes.set(id, node);
    } else {
      if (label) node.label = label;
      if (raw) node.raw = raw;
    }
    return node;
  }

  setWorldData({ anchors, bodies, artifacts, drifts }) {
    if (anchors !== undefined) {
      this.anchors = anchors;
      for (const a of anchors) {
        this._ensureNode(`anchor:${a.designation}`, "anchor", a.name || a.designation, a);
      }
    }
    if (artifacts !== undefined) {
      this.artifacts = artifacts;
      for (const art of artifacts) {
        this._ensureNode(art.id, "artifact", art.name || art.id, art);
      }
    }
    if (drifts !== undefined) this.drifts = drifts;
    if (bodies !== undefined) {
      for (const b of bodies) {
        const label = this.actorLabel(b.id);
        this.agents.set(b.id, { id: b.id, position: b.position });
        this._ensureNode(b.id, "agent", label, b);
      }
    }
  }

  setEvents(events) {
    if (!Array.isArray(events)) return;
    const interesting = events
      .filter(
        (ev) =>
          ev &&
          (ev.type === "speak" ||
            ev.type === "speak.artifact" ||
            ev.type === "act.run" ||
            ev.type === "act.give" ||
            ev.type === "act.craft" ||
            ev.type === "api.request" ||
            ev.type === "amendment.propose" ||
            ev.type === "amendment.vote"),
      )
      .slice(0, 140)
      .reverse();
    this.historyEvents = interesting;
    if (this.replayIdx >= this.historyEvents.length) this.replayIdx = 0;
  }

  triggerEvent(ev, isReplay = false) {
    if (!ev || !ev.type) return;
    const now = performance.now();
    if (!isReplay) this.lastLiveAt = now;

    const p = ev.payload || {};
    const actorRaw = String(ev.actor || "");
    const actorId = actorRaw.startsWith("identity:") ? actorRaw.slice("identity:".length) : actorRaw;
    const color = signalColor(ev.type, p);

    let sourceNode = null;
    if (actorId && actorId !== "ARBITER") {
      sourceNode = this._ensureNode(actorId, "agent", this.actorLabel(actorId));
    } else if (typeof p.target === "string" && p.target.startsWith("ent:")) {
      sourceNode = this.nodes.get(p.target) || this._ensureNode(p.target, "artifact", p.target);
    }

    const targets = [];
    let label = "";

    if (ev.type === "speak") {
      const hearers = Array.isArray(p.hearers) ? p.hearers : [];
      for (const h of hearers.slice(0, 5)) {
        if (h && h !== actorId) {
          targets.push(this._ensureNode(h, "agent", this.actorLabel(h)));
        }
      }
      label = p.private
        ? `${this.actorLabel(actorId)} → DM`
        : `${this.actorLabel(actorId)}: “${String(p.text || "").slice(0, 34)}”`;
    } else if (ev.type === "speak.artifact" && typeof p.target === "string") {
      targets.push(this._ensureNode(p.target, "artifact", this.nodes.get(p.target)?.label || p.target));
      label = `${this.actorLabel(actorId)} → note ${p.target}`;
    } else if (ev.type === "act.run" && typeof p.target === "string") {
      if (p.target !== "sandbox:ephemeral") {
        const tNode = this._ensureNode(p.target, "artifact", this.nodes.get(p.target)?.label || p.target);
        if (sourceNode && tNode && sourceNode.id !== tNode.id) targets.push(tNode);
        else if (!sourceNode && tNode) sourceNode = tNode;
      }
      if (Array.isArray(p.payouts)) {
        for (const pay of p.payouts.slice(0, 4)) {
          if (pay?.to) {
            const dest = this._ensureNode(pay.to, "agent", this.actorLabel(pay.to));
            if (sourceNode && dest) {
              this._emitSynapse(sourceNode, dest, "#fbbf24", `+${pay.amount}c`, now);
            }
          }
        }
      }
      label = `${this.actorLabel(actorId)} · ${p.input || "run"} → ${String(p.reply || "ok").slice(0, 26)}`;
    } else if (ev.type === "act.give" && typeof p.target === "string") {
      const isArt = p.target.startsWith("ent:");
      targets.push(
        this._ensureNode(p.target, isArt ? "artifact" : "agent", isArt ? p.target : this.actorLabel(p.target)),
      );
      label = `${this.actorLabel(actorId)} → +${p.amount ?? ""}c ${isArt ? p.target : this.actorLabel(p.target)}`;
    } else if (ev.type === "act.craft" && typeof p.id === "string") {
      const artNode = this._ensureNode(p.id, "artifact", p.name || p.id);
      targets.push(artNode);
      const citeIds = [p.parent, ...String(p.cites || "").split(",")]
        .map((s) => String(s || "").trim())
        .filter((s) => s.startsWith("ent:"));
      for (const cid of citeIds.slice(0, 3)) {
        const cNode = this.nodes.get(cid);
        if (cNode) this._emitSynapse(artNode, cNode, "#c084fc", `cites ${cid}`, now);
      }
      label = `${this.actorLabel(actorId)} crafted ${p.name || p.id}`;
    } else if (ev.type === "api.request" && typeof p.target === "string") {
      const tNode = this._ensureNode(p.target, "artifact", this.nodes.get(p.target)?.label || p.target);
      targets.push(tNode);
      label = `api.request → ${p.target}`;
    } else if (ev.type === "amendment.propose" || ev.type === "amendment.vote") {
      const hub = this.anchors.find((a) => a.name) || this.anchors[0];
      if (hub) {
        targets.push(this._ensureNode(`anchor:${hub.designation}`, "anchor", hub.name || hub.designation, hub));
      }
      label =
        ev.type === "amendment.propose"
          ? `${this.actorLabel(actorId)} · Bill #${p.proposalId ?? ""}`
          : `${this.actorLabel(actorId)} · Vote #${p.proposalId ?? ""}`;
    }

    if (sourceNode) {
      this._lightNode(sourceNode, color, now, true);
      if (label) {
        this.ticker.unshift({ text: label, color, born: now, ttl: 4200 });
        if (this.ticker.length > 4) this.ticker.pop();
      }
      if (targets.length > 0) {
        for (let i = 0; i < targets.length; i++) {
          this._emitSynapse(sourceNode, targets[i], color, i === 0 ? label : "", now);
        }
      } else {
        this._emitSelfPulse(sourceNode, color, label, now);
      }
    }
  }

  _lightNode(node, color, now, exciteNeighborhood = true) {
    const rgb = hexToRgb(color);
    node.activation = 1.0;
    node.glowColor = color;
    node.glowRgb = rgb;
    node.lastLit = now;
    if (exciteNeighborhood) {
      this._exciteCortexNear(node.x, node.y, node.z, rgb, 0.95, 11.5, now);
    }
  }

  _emitSynapse(fromNode, toNode, color, label, now) {
    if (!fromNode || !toNode || fromNode.id === toNode.id) return;
    const rgb = hexToRgb(color);
    this._lightNode(fromNode, color, now, true);
    const seed = hashStr(`${fromNode.id}->${toNode.id}:${Math.floor(now * 0.01)}`);
    const { p1, p2 } = buildAxonControlPoints(fromNode, toNode, seed);

    // Pre-sample 20 points along the 3D Bezier curve for crisp depth-aware rendering
    const samples = [];
    const segs = 20;
    for (let i = 0; i <= segs; i++) {
      samples.push(evalBezier3(fromNode, p1, p2, toNode, i / segs));
    }

    this.synapses.push({
      fromId: fromNode.id,
      toId: toNode.id,
      color,
      rgb,
      label,
      samples,
      born: now,
      travelMs: 720,
      ttl: 3800, // lingers vividly then fades cleanly back to darkness
      litTarget: false,
      lastMidExcIdx: -1,
    });
    if (this.synapses.length > 64) this.synapses.shift();
  }

  _emitSelfPulse(node, color, label, now) {
    const rgb = hexToRgb(color);
    this._lightNode(node, color, now, true);
    this.ripples.push({
      x: node.x,
      y: node.y,
      z: node.z,
      color,
      rgb,
      born: now,
      ttl: 1400,
    });
    if (this.ripples.length > 48) this.ripples.shift();
  }

  setPreset(name) {
    this.autoOrbit = false;
    if (name === "iso") {
      this.targetFocus = { x: 0, y: -1.5, z: 0 };
      this.targetYaw = -0.82;
      this.targetPitch = 0.22;
      this.targetZoom = 1.06;
    } else if (name === "top") {
      this.targetFocus = { x: 0, y: 0, z: 0 };
      this.targetYaw = 0;
      this.targetPitch = 1.48;
      this.targetZoom = 1.14;
    } else if (name === "focus") {
      let best = null;
      for (const n of this.nodes.values()) {
        if (!best || n.lastLit > best.lastLit) best = n;
      }
      if (best && best.lastLit > 0) {
        this.targetFocus = { x: best.x, y: best.y, z: best.z };
        this.targetZoom = 1.8;
      } else {
        this.targetFocus = { x: 0, y: -1.5, z: 0 };
        this.targetZoom = 1.25;
      }
    } else if (name === "orbit") {
      this.targetFocus = { x: 0, y: -1.5, z: 0 };
      this.targetZoom = 1.06;
      this.autoOrbit = true;
    }
  }

  zoomBy(factor) {
    this.targetZoom = Math.max(0.55, Math.min(3.2, this.targetZoom * factor));
  }

  focusPoint() {
    this.setPreset("focus");
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (now) => {
      if (!this.running) return;
      this._step(now);
      this._render(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _bindEvents() {
    const ro = new ResizeObserver(() => this._resize());
    ro.observe(this.canvas);

    const stage = this.canvas.closest(".lattice-stage") || this.canvas;
    if ("contentVisibility" in document.documentElement.style) {
      stage.addEventListener("contentvisibilityautostatechange", (e) => {
        this.visible = !e.skipped;
        if (this.visible && !document.hidden) this.start();
        else this.stop();
      });
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          this.visible = entries.some((en) => en.isIntersecting);
          if (this.visible && !document.hidden) this.start();
          else this.stop();
        },
        { rootMargin: "160px" },
      );
      io.observe(stage);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
      else if (this.visible) this.start();
    });

    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.dragMoved = false;
      this.autoOrbit = false;
      this.lastPtr = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (this.dragging) {
        const dx = e.clientX - this.lastPtr.x;
        const dy = e.clientY - this.lastPtr.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.dragMoved = true;
        this.targetYaw += dx * 0.006;
        this.targetPitch = Math.max(-1.42, Math.min(1.5, this.targetPitch + dy * 0.006));
        this.lastPtr = { x: e.clientX, y: e.clientY };
        return;
      }
      this._updateHover(px, py);
    });

    this.canvas.addEventListener("pointerup", (e) => {
      if (this.dragging && !this.dragMoved) {
        const rect = this.canvas.getBoundingClientRect();
        const hit = this._findHit(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) this.onSelect(hit);
      }
      this.dragging = false;
    });

    this.canvas.addEventListener("pointerleave", () => {
      this.dragging = false;
      this.hovered = null;
      this.onHover(null);
    });

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomBy(e.deltaY > 0 ? 0.91 : 1.1);
      },
      { passive: false },
    );
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  _project(x, y, z) {
    const dx = x - this.focus.x;
    const dy = y - this.focus.y;
    const dz = z - this.focus.z;

    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const rx = dx * cy - dz * sy;
    const rz1 = dx * sy + dz * cy;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const ry = dy * cp - rz1 * sp;
    const rz = dy * sp + rz1 * cp;

    const camDist = 104;
    const depth = camDist + rz;
    const scale = (Math.min(this.width, this.height) * 0.96 * this.zoom) / Math.max(24, depth);
    // Normalized depth factor: 1.0 = front cortex closest to camera, 0.0 = far back hemisphere
    const depthNorm = Math.max(0, Math.min(1, 1 - (rz + 38) / 76));
    return {
      x: this.width * 0.5 + rx * scale,
      y: this.height * 0.5 - ry * scale,
      z: rz,
      scale,
      depthNorm,
    };
  }

  _step(now) {
    if (this.autoOrbit && !this.reducedMotion) {
      this.targetYaw += 0.0021;
    }
    const ease = 0.095;
    this.yaw += (this.targetYaw - this.yaw) * ease;
    this.pitch += (this.targetPitch - this.pitch) * ease;
    this.zoom += (this.targetZoom - this.zoom) * ease;
    this.focus.x += (this.targetFocus.x - this.focus.x) * ease;
    this.focus.y += (this.targetFocus.y - this.focus.y) * ease;
    this.focus.z += (this.targetFocus.z - this.focus.z) * ease;

    // 1. Decay real Agora neuron activations back to calm dormancy (~3.6s)
    for (const node of this.nodes.values()) {
      if (node.activation > 0) {
        const age = now - node.lastLit;
        const t = Math.max(0, 1 - age / 3600);
        node.activation = t * t;
      }
    }

    // 2. Decay localized cortical micro-neuron calcium-imaging glow (~2.6s)
    let excSum = 0;
    let rAcc = 0;
    let gAcc = 0;
    let bAcc = 0;
    for (let i = 0; i < this._microNodes.length; i++) {
      const m = this._microNodes[i];
      if (m.exc > 0.005) {
        const age = now - m.lastExc;
        const t = Math.max(0, 1 - age / 2600);
        m.exc = t * t;
        excSum += m.exc;
        rAcc += m.r * m.exc;
        gAcc += m.g * m.exc;
        bAcc += m.b * m.exc;
      } else {
        m.exc = 0;
      }
    }
    const targetExc = Math.min(1, excSum / 55);
    this._totalExcitation += (targetExc - this._totalExcitation) * 0.08;
    if (excSum > 0.5) {
      this._ambientColor.r += (rAcc / excSum - this._ambientColor.r) * 0.08;
      this._ambientColor.g += (gAcc / excSum - this._ambientColor.g) * 0.08;
      this._ambientColor.b += (bAcc / excSum - this._ambientColor.b) * 0.08;
    }

    // 3. Advance active 3D synapses; excite cortical tissue along wavefront & ignite target on arrival
    const aliveSyn = [];
    for (const syn of this.synapses) {
      const age = Math.max(0, now - syn.born);
      if (age >= syn.ttl) continue;
      const travelT = Math.max(0, Math.min(1, age / syn.travelMs));

      // Gently graze nearby cortical micro-neurons as the comet zips through the brain!
      const sampleIdx = Math.max(0, Math.min(syn.samples.length - 1, Math.floor(travelT * (syn.samples.length - 1))));
      if (sampleIdx > syn.lastMidExcIdx && sampleIdx % 4 === 0 && travelT < 1) {
        syn.lastMidExcIdx = sampleIdx;
        const sp = syn.samples[sampleIdx];
        this._exciteCortexNear(sp.x, sp.y, sp.z, syn.rgb, 0.45, 7.5, now);
      }

      if (!syn.litTarget && age >= syn.travelMs) {
        syn.litTarget = true;
        const targetNode = this.nodes.get(syn.toId);
        if (targetNode) {
          this._lightNode(targetNode, syn.color, now, true);
          this.ripples.push({
            x: targetNode.x,
            y: targetNode.y,
            z: targetNode.z,
            color: syn.color,
            rgb: syn.rgb,
            born: now,
            ttl: 1250,
          });
          if (this.ripples.length > 48) this.ripples.shift();
        }
      }
      aliveSyn.push(syn);
    }
    this.synapses = aliveSyn;

    // 4. Advance expanding synaptic arrival ripples
    this.ripples = this.ripples.filter((rp) => now - rp.born < rp.ttl);
    this.ticker = this.ticker.filter((tk) => now - tk.born < tk.ttl);

    // 5. Optional Ambient Synapse Replay when no live SSE event arrived in the last 3s
    if (this.showLineage && !this.reducedMotion && this.historyEvents.length > 0 && now - this.lastLiveAt > 3000) {
      if (now - this.lastReplayAt > 920) {
        this.lastReplayAt = now;
        const ev = this.historyEvents[this.replayIdx % this.historyEvents.length];
        this.replayIdx = (this.replayIdx + 1) % this.historyEvents.length;
        this.triggerEvent(ev, true);
      }
    }
  }

  _findHit(px, py) {
    let best = null;
    let bestDist = 18;
    for (const t of this.hitTargets) {
      const d = Math.hypot(t.x - px, t.y - py);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  _updateHover(px, py) {
    const hit = this._findHit(px, py);
    if (hit?.id !== this.hovered?.id) {
      this.hovered = hit;
      this.canvas.style.cursor = hit ? "pointer" : "grab";
      this.onHover(hit);
    }
  }

  _render(now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // 1. Deep obsidian neural-microscopy void background
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const maxDim = Math.max(this.width, this.height);
    const bg = ctx.createRadialGradient(cx, cy * 0.94, 10, cx, cy, maxDim * 0.7);
    bg.addColorStop(0, "#0d1424");
    bg.addColorStop(0.5, "#070b14");
    bg.addColorStop(1, "#03050a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle reactive subsurface cortical glow — ONLY breathes when synapses are firing!
    if (this._totalExcitation > 0.02) {
      const ambR = Math.max(60, Math.min(this.width, this.height) * 0.44);
      const amb = ctx.createRadialGradient(cx, cy, 10, cx, cy, ambR);
      const ar = Math.round(this._ambientColor.r);
      const ag = Math.round(this._ambientColor.g);
      const ab = Math.round(this._ambientColor.b);
      amb.addColorStop(0, `rgba(${ar},${ag},${ab},${(this._totalExcitation * 0.14).toFixed(3)})`);
      amb.addColorStop(0.55, `rgba(${ar},${ag},${ab},${(this._totalExcitation * 0.045).toFixed(3)})`);
      amb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 2. Project all ~1,050 anatomical micro-neurons once per frame
    const microProj = new Array(this._microNodes.length);
    for (let i = 0; i < this._microNodes.length; i++) {
      const m = this._microNodes[i];
      microProj[i] = this._project(m.x, m.y, m.z);
    }

    // 3. Draw dormant structural connectome filaments in 2 depth buckets (fast batched strokes!)
    // Calm, translucent midnight-slate when dormant — forms an unmistakable 3D brain volume
    ctx.lineWidth = 0.65;
    ctx.strokeStyle = "rgba(100, 116, 139, 0.055)";
    ctx.beginPath();
    for (let i = 0; i < this._microEdges.length; i++) {
      const e = this._microEdges[i];
      const pa = microProj[e.a];
      const pb = microProj[e.b];
      if ((pa.depthNorm + pb.depthNorm) * 0.5 < 0.48) {
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
    }
    ctx.stroke();

    ctx.lineWidth = 0.75;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.105)";
    ctx.beginPath();
    for (let i = 0; i < this._microEdges.length; i++) {
      const e = this._microEdges[i];
      const pa = microProj[e.a];
      const pb = microProj[e.b];
      if ((pa.depthNorm + pb.depthNorm) * 0.5 >= 0.48) {
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
    }
    ctx.stroke();

    // 4. Draw excited local connectome filaments (calcium-imaging glow around active firing!)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this._microEdges.length; i++) {
      const e = this._microEdges[i];
      const ma = this._microNodes[e.a];
      const mb = this._microNodes[e.b];
      const exc = Math.max(ma.exc, mb.exc);
      if (exc < 0.04) continue;
      const pa = microProj[e.a];
      const pb = microProj[e.b];
      const src = ma.exc >= mb.exc ? ma : mb;
      ctx.strokeStyle = `rgba(${src.r},${src.g},${src.b},${(exc * 0.68).toFixed(3)})`;
      ctx.lineWidth = 0.8 + exc * 1.4;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.restore();

    // 5. Draw anatomical micro-neurons (gyri/sulci shaded dormant substrate + live excited sparks)
    for (let i = 0; i < this._microNodes.length; i++) {
      const m = this._microNodes[i];
      const pt = microProj[i];
      const d = pt.depthNorm;
      const baseR = Math.max(0.55, m.size * Math.min(1.45, Math.max(0.45, pt.scale * 0.07)));

      if (m.exc < 0.04) {
        // Calm dormant cortical point — gyri ridges subtly crisper than sulci valleys
        const foldShade = m.region === "cortex" ? 0.5 + 0.5 * Math.max(-0.6, Math.min(1, m.fold)) : 0.6;
        const alpha = (0.07 + d * 0.22) * (0.6 + foldShade * 0.55);
        ctx.fillStyle =
          m.region === "cerebellum"
            ? `rgba(125, 145, 175, ${(alpha * 0.92).toFixed(3)})`
            : m.region === "stem"
              ? `rgba(100, 116, 148, ${(alpha * 0.85).toFixed(3)})`
              : `rgba(148, 163, 184, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, baseR, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Locally excited cortical micro-neuron!
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const glowR = Math.max(2, baseR * (2.6 + m.exc * 4.2));
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0.5, pt.x, pt.y, glowR);
        grad.addColorStop(0, `rgba(255,255,255,${(m.exc * 0.9).toFixed(3)})`);
        grad.addColorStop(0.35, `rgba(${m.r},${m.g},${m.b},${(m.exc * 0.72).toFixed(3)})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 6. Project real Agora entity neurons & sort back-to-front
    const projected = new Map();
    const sorted = [];
    for (const node of this.nodes.values()) {
      const pt = this._project(node.x, node.y, node.z);
      projected.set(node.id, pt);
      sorted.push({ node, pt });
    }
    sorted.sort((a, b) => b.pt.z - a.pt.z);

    // 7. Draw active 3D Bezier axonal pathways & white-hot action-potential comets!
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const syn of this.synapses) {
      const age = Math.max(0, now - syn.born);
      const life = Math.max(0, Math.min(1, 1 - age / syn.ttl));
      const fade = life * life;
      const travelT = Math.max(0, Math.min(1, age / syn.travelMs));
      const pts = syn.samples.map((s) => this._project(s.x, s.y, s.z));
      if (pts.length < 2) continue;
      const maxIdx = Math.max(1, Math.min(pts.length - 1, Math.ceil(travelT * (pts.length - 1))));

      // A) Wide soft outer electric aura along the fired portion of the 3D axon
      ctx.strokeStyle = rgba(syn.rgb, fade * 0.22);
      ctx.lineWidth = 4.2 * (0.4 + fade * 0.6);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= maxIdx; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      // B) Crisp core luminous axonal filament (lingers after spark crosses, then fades away)
      ctx.strokeStyle = rgba(syn.rgb, fade * 0.78);
      ctx.lineWidth = 1.15 + fade * 1.1;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= maxIdx; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      // C) White-hot action-potential comet head + tapered tail shooting along the 3D curve!
      if (travelT < 1) {
        const exactPos = travelT * (pts.length - 1);
        const idx0 = Math.max(0, Math.min(pts.length - 2, Math.floor(exactPos)));
        const frac = Math.max(0, Math.min(1, exactPos - idx0));
        const headX = pts[idx0].x + (pts[idx0 + 1].x - pts[idx0].x) * frac;
        const headY = pts[idx0].y + (pts[idx0 + 1].y - pts[idx0].y) * frac;

        // Tapered white-gold comet tail covering last ~28% of the curve
        const tailStart = Math.max(0, idx0 - 5);
        for (let k = tailStart; k <= idx0; k++) {
          const nextX = k === idx0 ? headX : pts[k + 1].x;
          const nextY = k === idx0 ? headY : pts[k + 1].y;
          const segFrac = (k - tailStart + 1) / (idx0 - tailStart + 1);
          ctx.strokeStyle = `rgba(255,255,255,${(segFrac * 0.88).toFixed(3)})`;
          ctx.lineWidth = 1.0 + segFrac * 2.4;
          ctx.beginPath();
          ctx.moveTo(pts[k].x, pts[k].y);
          ctx.lineTo(nextX, nextY);
          ctx.stroke();
        }

        // Intense leading action-potential bloom
        const headR = Math.max(6, 15 * Math.min(1.4, pts[idx0].scale * 0.095));
        const grad = ctx.createRadialGradient(headX, headY, 0.5, headX, headY, headR);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.28, syn.color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(headX, headY, headR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 8. Expanding 3D synaptic arrival shockwaves
    for (const rp of this.ripples) {
      const age = Math.max(0, now - rp.born);
      const t = Math.max(0, Math.min(1, age / rp.ttl));
      const fade = (1 - t) * (1 - t);
      const pt = this._project(rp.x, rp.y, rp.z);
      const ringR = Math.max(2, (4 + t * 24) * Math.min(1.5, pt.scale * 0.09));
      ctx.strokeStyle = rgba(rp.rgb, fade * 0.72);
      ctx.lineWidth = 1.6 * fade + 0.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 9. Draw real Agora entity neurons (dormant = calm crisp somas; firing = radiant bloom!)
    this.hitTargets = [];
    const placedLabels = [];
    for (const { node, pt } of sorted) {
      const isHovered = this.hovered?.id === node.id;
      const act = node.activation;
      const baseR = node.kind === "agent" ? 3.5 : node.kind === "anchor" ? 4.0 : 2.35;
      const r = Math.max(1.8, baseR * Math.min(1.55, Math.max(0.62, pt.scale * 0.085)));
      const dAlpha = 0.45 + pt.depthNorm * 0.55;

      if (act < 0.03 && !isHovered) {
        // Dormant resting soma: subtly visible, distinct from micro-neurons, zero neon clutter
        if (node.kind === "agent") {
          ctx.strokeStyle = `rgba(148, 163, 184, ${(0.28 * dAlpha).toFixed(3)})`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r + 2.1, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = `rgba(203, 213, 225, ${(0.52 * dAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (node.kind === "anchor") {
          ctx.strokeStyle = `rgba(148, 163, 184, ${(0.24 * dAlpha).toFixed(3)})`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r + 2.5, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = `rgba(148, 163, 184, ${(0.36 * dAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r * 0.85, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(148, 163, 184, ${(0.34 * dAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Illuminated firing soma with multi-layer bioluminescent bloom!
        const intensity = isHovered ? Math.max(act, 0.82) : act;
        const color = isHovered && act < 0.1 ? "#38bdf8" : node.glowColor;
        const rgb = isHovered && act < 0.1 ? { r: 56, g: 189, b: 248 } : node.glowRgb;
        const bloomR = Math.max(4, r * (3.6 + intensity * 5.2));

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0.5, pt.x, pt.y, bloomR);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.24, color);
        grad.addColorStop(0.58, rgba(rgb, 0.28));
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = Math.min(1, 0.3 + intensity * 0.85);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, bloomR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Crisp white-hot soma core
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.6 + intensity * 0.4;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r * (1.05 + intensity * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      this.hitTargets.push({
        id: node.id,
        kind: node.kind,
        label:
          node.kind === "agent"
            ? `Citizen: ${node.label}`
            : node.kind === "anchor"
              ? `Hub: ${node.label}`
              : `Artifact: ${node.label} (${node.id})`,
        x: pt.x,
        y: pt.y,
        raw: node.raw,
      });

      if (this.showLabels && (act > 0.22 || isHovered)) {
        const text = node.label.slice(0, 26);
        const lx = pt.x + r + 8;
        const ly = pt.y + 3.5;
        const overlaps = placedLabels.some((b) => Math.abs(b.x - lx) < 115 && Math.abs(b.y - ly) < 16);
        if (!overlaps) {
          placedLabels.push({ x: lx, y: ly });
          ctx.font = '500 10.5px "IBM Plex Mono", monospace';
          ctx.fillStyle = "rgba(5, 8, 16, 0.68)";
          const tw = ctx.measureText(text).width;
          ctx.fillRect(lx - 4, ly - 10, tw + 8, 14);
          ctx.fillStyle = isHovered ? "#ffffff" : node.glowColor;
          ctx.globalAlpha = isHovered ? 1 : Math.min(0.96, act * 1.2);
          ctx.fillText(text, lx, ly);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 10. Subtle live neural telemetry overlay (top-left)
    this._renderNeuralHud(ctx, now);

    ctx.restore();
  }

  _renderNeuralHud(ctx, now) {
    const activeCount = this.synapses.length;
    const isLive = activeCount > 0;

    ctx.save();
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    // Status pill
    ctx.fillStyle = isLive ? "#34d399" : "rgba(148, 163, 184, 0.45)";
    ctx.beginPath();
    ctx.arc(18, 20, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isLive ? "rgba(226, 232, 240, 0.88)" : "rgba(148, 163, 184, 0.52)";
    ctx.fillText(
      isLive ? `SYNAPTIC ACTIVITY · ${activeCount} ACTIVE PATHWAY${activeCount === 1 ? "" : "S"}` : "CORTEX DORMANT · AWAITING SYNAPTIC FIRING",
      27,
      23.5,
    );

    // Recent fading synapse dispatches
    let y = 41;
    for (const item of this.ticker) {
      const age = now - item.born;
      const alpha = Math.max(0, 1 - age / item.ttl);
      if (alpha < 0.04) continue;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = item.color;
      ctx.fillText("⚡", 15, y);
      ctx.fillStyle = "rgba(226, 232, 240, 0.88)";
      ctx.fillText(item.text.slice(0, 56), 28, y);
      y += 15;
    }
    ctx.restore();
  }
}
