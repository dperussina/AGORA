/**
 * 3D Neural Synapse Brain Renderer for Agora (Zero WebGL, 60 FPS Canvas 2D).
 *
 * - Maps citizens, artifacts, and landmarks deterministically onto a sculpted
 *   3D dual-hemisphere neural cortex (no rigid cube wireframe).
 * - Dormant state: every neuron is subtly visible, calm, and unlit — zero clutter.
 * - Active firing: when agents interact (DM, speak, act.run, act.give, craft, vote),
 *   a glowing action-potential pulse shoots along a curved 3D axon from source -> target,
 *   lighting up both neurons and the synaptic pathway, lingering briefly, then fading
 *   smoothly back to dormancy.
 * - Live SSE events fire immediately; optional Synapse Replay steps gently through
 *   real historical interactions so the cortex comes alive on demand.
 */

const BRAIN_SCALE = 28; // world radius in normalized 3D units

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

/** Deterministic 3D coordinate inside a sculpted dual-hemisphere brain cortex. */
function brainCoordsFor(id, kind) {
  const rng = seededRand(hashStr(`${kind}:${id}`));
  const u = rng();
  const v = rng();
  const w = rng();

  // Left (-1) or Right (+1) cerebral hemisphere
  const hemi = (hashStr(id) & 1) === 0 ? -1 : 1;

  // Spherical coordinates on a lobe shell
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);

  // Radial shell depth: citizens on outer cortex, artifacts in mid-cortex, anchors in deep nuclei
  let rShell;
  if (kind === "agent") {
    rShell = 0.78 + 0.22 * Math.cbrt(w);
  } else if (kind === "anchor") {
    rShell = 0.22 + 0.28 * Math.cbrt(w);
  } else {
    rShell = 0.45 + 0.48 * Math.cbrt(w);
  }

  let sx = Math.sin(phi) * Math.cos(theta);
  let sy = Math.cos(phi);
  let sz = Math.sin(phi) * Math.sin(theta);

  // Sculpt into two realistic cerebral hemispheres separated by a medial fissure
  // X: left/right width, Y: dorsal/ventral height, Z: anterior/posterior length
  const lobeWidth = 0.56;
  const lobeHeight = 0.74;
  const lobeLength = 1.08;

  // Flatten medial wall facing the fissure + offset each hemisphere outward
  const xLocal = Math.abs(sx) * lobeWidth;
  const fissureGap = kind === "anchor" ? 0.04 : 0.11;
  let x = hemi * (fissureGap + xLocal * rShell);
  // Slight frontal taper (z > 0) and occipital fullness (z < 0)
  let z = sz * lobeLength * rShell;
  const frontalTaper = z > 0 ? 1 - 0.18 * (z / lobeLength) : 1 + 0.06 * (-z / lobeLength);
  x *= frontalTaper;

  // Arch dorsal cortex slightly higher in the middle, gentle temporal dip on underside
  let y = sy * lobeHeight * rShell;
  if (y < 0) y *= 0.78;
  y += 0.1 * Math.cos((z / lobeLength) * Math.PI * 0.5);

  return {
    x: x * BRAIN_SCALE,
    y: y * BRAIN_SCALE,
    z: z * BRAIN_SCALE,
  };
}

function signalColor(evType, payload) {
  if (evType === "act.give") return "#fbbf24"; // gold — value transfer
  if (evType === "act.run" || evType === "api.request") {
    return payload?.sandbox === "quickjs-wasm" ? "#34d399" : "#22d3ee"; // emerald / cyan — code execution
  }
  if (evType === "act.craft" || evType === "act.edit") return "#38bdf8"; // sky — creation
  if (evType === "amendment.propose" || evType === "amendment.vote" || evType === "amendment.applied") {
    return "#a78bfa"; // violet — governance
  }
  return "#ff6b4a"; // warm coral — speech / DM / notes
}

export class Lattice3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onSelect = opts.onSelect || (() => {});
    this.onHover = opts.onHover || (() => {});
    this.actorLabel = opts.actorLabel || ((id) => id);

    // Camera (centered at brain origin 0,0,0)
    this.yaw = -0.58;
    this.pitch = 0.28;
    this.zoom = 1.08;
    this.focus = { x: 0, y: 0, z: 0 };
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.targetZoom = this.zoom;
    this.targetFocus = { x: 0, y: 0, z: 0 };
    this.autoOrbit = true;
    this.showLineage = true; // controls ambient Synapse Replay of historical events
    this.showLabels = true;

    this.anchors = [];
    this.artifacts = [];
    this.agents = new Map();
    this.drifts = [];
    this.nodes = new Map(); // id -> { id, kind, label, x, y, z, activation, glowColor, lastLit, raw }
    this.synapses = []; // active firing arcs: { fromId, toId, color, label, born, travelMs, ttl }
    this.historyEvents = []; // real interaction events for gentle ambient synapse replay
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

    // Precompute subtle cortical silhouette guide points (2 faint wireframe-free hemisphere shells)
    this._cortexShell = this._buildCortexShell();

    this._bindEvents();
    this._resize();
    this.start();
  }

  _buildCortexShell() {
    const rings = [];
    for (const hemi of [-1, 1]) {
      // 3 gentle longitudinal contour ribbons per hemisphere (whisper-faint brain outline)
      for (const tilt of [-0.55, 0, 0.55]) {
        const pts = [];
        for (let i = 0; i <= 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          const sx = Math.cos(tilt) * Math.abs(Math.sin(a));
          const sy = Math.sin(a) * Math.sin(tilt) * 0.65 + Math.cos(a) * 0.72;
          const sz = Math.sin(a) * 1.06;
          const z = sz * BRAIN_SCALE;
          const taper = z > 0 ? 1 - 0.16 * (z / (BRAIN_SCALE * 1.06)) : 1 + 0.05 * (-z / (BRAIN_SCALE * 1.06));
          const x = hemi * (0.1 + 0.54 * sx) * BRAIN_SCALE * taper;
          let y = sy * 0.74 * BRAIN_SCALE;
          if (y < 0) y *= 0.76;
          pts.push({ x, y, z });
        }
        rings.push(pts);
      }
    }
    return rings;
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
    // Keep meaningful interaction events in chronological order for ambient synapse replay
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
      .reverse(); // oldest -> newest
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

    // Ensure source neuron exists
    let sourceNode = null;
    if (actorId && actorId !== "ARBITER") {
      sourceNode = this._ensureNode(actorId, "agent", this.actorLabel(actorId));
    } else if (typeof p.target === "string" && p.target.startsWith("ent:")) {
      sourceNode = this.nodes.get(p.target) || this._ensureNode(p.target, "artifact", p.target);
    }

    // Resolve target neurons for this interaction
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
      // If multi-recipient payouts happened, fire golden synapses to each recipient!
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
      label = `${p.input || "run"} → ${String(p.reply || "ok").slice(0, 30)}`;
    } else if (ev.type === "act.give" && typeof p.target === "string") {
      const isArt = p.target.startsWith("ent:");
      targets.push(this._ensureNode(p.target, isArt ? "artifact" : "agent", isArt ? p.target : this.actorLabel(p.target)));
      label = `+${p.amount ?? ""}c → ${isArt ? p.target : this.actorLabel(p.target)}`;
    } else if (ev.type === "act.craft" && typeof p.id === "string") {
      const artNode = this._ensureNode(p.id, "artifact", p.name || p.id);
      targets.push(artNode);
      // Also fire citation synapses to cited/parent artifacts!
      const citeIds = [p.parent, ...String(p.cites || "").split(",")].map((s) => String(s || "").trim()).filter((s) => s.startsWith("ent:"));
      for (const cid of citeIds.slice(0, 3)) {
        const cNode = this.nodes.get(cid);
        if (cNode) this._emitSynapse(artNode, cNode, "#a78bfa", `cites ${cid}`, now);
      }
      label = `+ ${p.name || p.id}`;
    } else if (ev.type === "api.request" && typeof p.target === "string") {
      const tNode = this._ensureNode(p.target, "artifact", this.nodes.get(p.target)?.label || p.target);
      targets.push(tNode);
      label = `api.request ${p.target}`;
    } else if (ev.type === "amendment.propose" || ev.type === "amendment.vote") {
      // Governance fires toward the central subcortical anchor (Commons Square / first named anchor)
      const hub = this.anchors.find((a) => a.name) || this.anchors[0];
      if (hub) {
        targets.push(this._ensureNode(`anchor:${hub.designation}`, "anchor", hub.name || hub.designation, hub));
      }
      label = ev.type === "amendment.propose" ? `Bill #${p.proposalId ?? ""}` : `Vote #${p.proposalId ?? ""}`;
    }

    if (sourceNode) {
      this._lightNode(sourceNode, color, now);
      if (targets.length > 0) {
        for (let i = 0; i < targets.length; i++) {
          this._emitSynapse(sourceNode, targets[i], color, i === 0 ? label : "", now);
        }
      } else {
        // Self-firing neuron (e.g. scheduled script or ephemeral WASM run)
        this._emitSelfPulse(sourceNode, color, label, now);
      }
    }
  }

  _lightNode(node, color, now) {
    node.activation = 1.0;
    node.glowColor = color;
    node.lastLit = now;
  }

  _emitSynapse(fromNode, toNode, color, label, now) {
    if (!fromNode || !toNode || fromNode.id === toNode.id) return;
    this._lightNode(fromNode, color, now);
    this.synapses.push({
      fromId: fromNode.id,
      toId: toNode.id,
      color,
      label,
      born: now,
      travelMs: 650,
      ttl: 3400, // lingers brightly then fades away cleanly
      litTarget: false,
    });
    if (this.synapses.length > 60) this.synapses.shift();
  }

  _emitSelfPulse(node, color, label, now) {
    this._lightNode(node, color, now);
    this.synapses.push({
      fromId: node.id,
      toId: node.id,
      color,
      label,
      born: now,
      travelMs: 500,
      ttl: 2800,
      litTarget: true,
    });
    if (this.synapses.length > 60) this.synapses.shift();
  }

  setPreset(name) {
    this.autoOrbit = false;
    if (name === "iso") {
      this.targetFocus = { x: 0, y: 0, z: 0 };
      this.targetYaw = -0.58;
      this.targetPitch = 0.28;
      this.targetZoom = 1.08;
    } else if (name === "top") {
      this.targetFocus = { x: 0, y: 0, z: 0 };
      this.targetYaw = 0;
      this.targetPitch = 1.48;
      this.targetZoom = 1.15;
    } else if (name === "focus") {
      // Focus on the most recently illuminated neuron
      let best = null;
      for (const n of this.nodes.values()) {
        if (!best || n.lastLit > best.lastLit) best = n;
      }
      if (best && best.lastLit > 0) {
        this.targetFocus = { x: best.x, y: best.y, z: best.z };
        this.targetZoom = 1.75;
      } else {
        this.targetFocus = { x: 0, y: 0, z: 0 };
        this.targetZoom = 1.3;
      }
    } else if (name === "orbit") {
      this.targetFocus = { x: 0, y: 0, z: 0 };
      this.targetZoom = 1.08;
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

    const camDist = 96;
    const depth = camDist + rz;
    const scale = (Math.min(this.width, this.height) * 0.98 * this.zoom) / Math.max(24, depth);
    return {
      x: this.width * 0.5 + rx * scale,
      y: this.height * 0.5 - ry * scale,
      z: rz,
      scale,
    };
  }

  _step(now) {
    if (this.autoOrbit && !this.reducedMotion) {
      this.targetYaw += 0.0022;
    }
    const ease = 0.1;
    this.yaw += (this.targetYaw - this.yaw) * ease;
    this.pitch += (this.targetPitch - this.pitch) * ease;
    this.zoom += (this.targetZoom - this.zoom) * ease;
    this.focus.x += (this.targetFocus.x - this.focus.x) * ease;
    this.focus.y += (this.targetFocus.y - this.focus.y) * ease;
    this.focus.z += (this.targetFocus.z - this.focus.z) * ease;

    // Smoothly decay every neuron's activation back to dormant (0) over ~3.4s
    for (const node of this.nodes.values()) {
      if (node.activation > 0) {
        const age = now - node.lastLit;
        const next = Math.max(0, 1 - age / 3400);
        node.activation = next * next; // crisp linger, smooth fade
      }
    }

    // Advance active synapses; light up target neuron when the action-potential arrives!
    const alive = [];
    for (const syn of this.synapses) {
      const age = now - syn.born;
      if (age >= syn.ttl) continue;
      if (!syn.litTarget && age >= syn.travelMs) {
        syn.litTarget = true;
        const targetNode = this.nodes.get(syn.toId);
        if (targetNode) this._lightNode(targetNode, syn.color, now);
      }
      alive.push(syn);
    }
    this.synapses = alive;

    // Ambient Synapse Replay: when no live SSE event arrived in the last 3s and toggle is on,
    // gently fire real historical interactions so the cortex breathes with real activity!
    if (this.showLineage && !this.reducedMotion && this.historyEvents.length > 0 && now - this.lastLiveAt > 3000) {
      if (now - this.lastReplayAt > 850) {
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

    // Deep dark neural cortex void background
    const bg = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.48,
      20,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.68,
    );
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(0.55, "#090d18");
    bg.addColorStop(1, "#05070e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // 1. Whisper-faint 3D brain hemisphere contour guides (barely visible, no cube!)
    ctx.lineWidth = 0.85;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.065)";
    for (const ring of this._cortexShell) {
      ctx.beginPath();
      for (let i = 0; i < ring.length; i++) {
        const pt = this._project(ring[i].x, ring[i].y, ring[i].z);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // 2. Project all neurons & sort back-to-front
    const projected = new Map();
    const sorted = [];
    for (const node of this.nodes.values()) {
      const pt = this._project(node.x, node.y, node.z);
      projected.set(node.id, pt);
      sorted.push({ node, pt });
    }
    sorted.sort((a, b) => b.pt.z - a.pt.z);

    // 3. Draw active firing synapses (ONLY when firing — lingers briefly, then fades away!)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const syn of this.synapses) {
      const pFrom = projected.get(syn.fromId);
      const pTo = projected.get(syn.toId);
      if (!pFrom || !pTo) continue;

      const age = now - syn.born;
      const life = Math.max(0, 1 - age / syn.ttl);
      const fade = life * life;
      const travelT = Math.min(1, age / syn.travelMs);

      if (syn.fromId === syn.toId) {
        // Self-firing synaptic ring burst
        const ringR = (6 + (1 - life) * 26) * Math.min(1.6, pFrom.scale * 0.09);
        ctx.strokeStyle = syn.color;
        ctx.globalAlpha = fade * 0.72;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(pFrom.x, pFrom.y, Math.max(2, ringR), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }

      // Curved 3D axon bezier arc bowing slightly outward from brain center
      const mx = (pFrom.x + pTo.x) * 0.5;
      const my = (pFrom.y + pTo.y) * 0.5;
      const cx = mx + (mx - this.width * 0.5) * 0.18;
      const cy = my + (my - this.height * 0.5) * 0.18 - 14;

      // Lingering glowing axon pathway (fades cleanly after spark crosses)
      ctx.strokeStyle = syn.color;
      ctx.lineWidth = 1.1 + fade * 1.4;
      ctx.globalAlpha = fade * 0.58;
      ctx.beginPath();
      ctx.moveTo(pFrom.x, pFrom.y);
      ctx.quadraticCurveTo(cx, cy, pTo.x, pTo.y);
      ctx.stroke();

      // Bright action-potential pulse shooting along the axon!
      if (travelT < 1) {
        const u = 1 - travelT;
        const sx = u * u * pFrom.x + 2 * u * travelT * cx + travelT * travelT * pTo.x;
        const sy = u * u * pFrom.y + 2 * u * travelT * cy + travelT * travelT * pTo.y;

        const grad = ctx.createRadialGradient(sx, sy, 0.5, sx, sy, 12);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.35, syn.color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 4. Draw all neurons (dormant = calm & visible; firing = lit up with bloom!)
    this.hitTargets = [];
    const placedLabels = [];
    for (const { node, pt } of sorted) {
      const isHovered = this.hovered?.id === node.id;
      const act = node.activation;
      const baseR = node.kind === "agent" ? 3.4 : node.kind === "anchor" ? 4.2 : 2.3;
      const r = Math.max(1.8, baseR * Math.min(1.5, Math.max(0.65, pt.scale * 0.085)));

      // Dormant resting soma (always visible, unlit!)
      if (act < 0.03 && !isHovered) {
        ctx.fillStyle =
          node.kind === "agent"
            ? "rgba(148, 163, 184, 0.42)"
            : node.kind === "anchor"
              ? "rgba(148, 163, 184, 0.28)"
              : "rgba(100, 116, 139, 0.26)";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Illuminated neuron bloom!
        const intensity = isHovered ? Math.max(act, 0.75) : act;
        const color = isHovered && act < 0.1 ? "#38bdf8" : node.glowColor;
        const bloomR = r * (3.2 + intensity * 4.5);
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0.5, pt.x, pt.y, bloomR);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.28, color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(1, 0.25 + intensity * 0.85);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, bloomR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.5 + intensity * 0.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r * (1 + intensity * 0.55), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Register click/hover target
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

      // Only show labels for actively lit neurons or hovered neuron (clean, zero clutter!)
      if (this.showLabels && (act > 0.22 || isHovered)) {
        const text = node.label.slice(0, 26);
        const lx = pt.x + r + 7;
        const ly = pt.y + 3;
        const overlaps = placedLabels.some((b) => Math.abs(b.x - lx) < 110 && Math.abs(b.y - ly) < 15);
        if (!overlaps) {
          placedLabels.push({ x: lx, y: ly });
          ctx.font = '500 10.5px "IBM Plex Mono", monospace';
          ctx.fillStyle = isHovered ? "#ffffff" : node.glowColor;
          ctx.globalAlpha = isHovered ? 0.98 : Math.min(0.95, act * 1.15);
          ctx.fillText(text, lx, ly);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 5. Subtle floating caption for the newest firing synapse
    const newest = this.synapses[this.synapses.length - 1];
    if (newest && newest.label) {
      const life = Math.max(0, 1 - (now - newest.born) / newest.ttl);
      if (life > 0.08) {
        ctx.font = '500 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = newest.color;
        ctx.globalAlpha = Math.min(0.92, life * 1.3);
        ctx.fillText(`⚡ ${newest.label}`, 16, this.height - 16);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }
}
