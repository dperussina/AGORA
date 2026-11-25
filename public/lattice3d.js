/**
 * Bespoke Zero-WebGL 3D Architectural Lattice Renderer for Agora.
 * Pure High-DPI 2D Canvas with 3D perspective projection, painter's depth sort,
 * spring-damped orbit/zoom, live SSE activity pulses, 3D lineage arcs,
 * pointer hit-testing, and automatic off-screen pausing.
 */

const GRID = 63;
const HALF = GRID / 2;

export class Lattice3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onSelect = opts.onSelect || (() => {});
    this.onHover = opts.onHover || (() => {});
    this.actorLabel = opts.actorLabel || ((id) => id);

    // Camera state (target vs damped current for silky inertia)
    this.yaw = -0.68;
    this.pitch = 0.46;
    this.zoom = 1.05;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.targetZoom = this.zoom;
    this.autoOrbit = true;
    this.showLineage = true;
    this.showLabels = true;

    // World data
    this.anchors = [];
    this.artifacts = [];
    this.agents = new Map(); // id -> { id, x, y, z, tx, ty, tz, trail: [] }
    this.drifts = [];
    this.pulses = []; // { x, y, z, color, label, born, ttl, to?: {x,y,z} }
    this.hitTargets = []; // populated each frame for click/hover
    this.hovered = null;

    // Lifecycle & visibility
    this.rafId = null;
    this.running = false;
    this.visible = true;
    this.dragging = false;
    this.dragMoved = false;
    this.lastPtr = { x: 0, y: 0 };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 960;
    this.height = 500;
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    this._bindEvents();
    this._resize();
    this.start();
  }

  setWorldData({ anchors = [], bodies = [], artifacts = [], drifts = [] }) {
    this.anchors = anchors;
    this.artifacts = artifacts;
    this.drifts = drifts;

    const seen = new Set();
    for (const b of bodies) {
      if (!b.position) continue;
      seen.add(b.id);
      const existing = this.agents.get(b.id);
      if (existing) {
        if (existing.tx !== b.position.x || existing.ty !== b.position.y || existing.tz !== b.position.z) {
          existing.trail.push({ x: existing.tx, y: existing.ty, z: existing.tz, born: performance.now() });
          if (existing.trail.length > 10) existing.trail.shift();
          existing.tx = b.position.x;
          existing.ty = b.position.y;
          existing.tz = b.position.z;
        }
      } else {
        this.agents.set(b.id, {
          id: b.id,
          x: b.position.x,
          y: b.position.y,
          z: b.position.z,
          tx: b.position.x,
          ty: b.position.y,
          tz: b.position.z,
          trail: [],
        });
      }
    }
    for (const id of [...this.agents.keys()]) {
      if (!seen.has(id)) this.agents.delete(id);
    }
  }

  triggerEvent(ev) {
    if (!ev || !ev.type) return;
    const now = performance.now();
    const p = ev.payload || {};
    const actorId = String(ev.actor || "").startsWith("identity:")
      ? String(ev.actor).slice("identity:".length)
      : ev.actor;

    if ((ev.type === "act.move" || ev.type === "identity.spawn") && actorId && typeof p.x === "number") {
      const existing = this.agents.get(actorId);
      if (existing) {
        existing.trail.push({ x: existing.tx, y: existing.ty, z: existing.tz, born: now });
        if (existing.trail.length > 12) existing.trail.shift();
        existing.tx = p.x;
        existing.ty = p.y;
        existing.tz = p.z;
      } else {
        this.agents.set(actorId, {
          id: actorId,
          x: p.x,
          y: p.y,
          z: p.z,
          tx: p.x,
          ty: p.y,
          tz: p.z,
          trail: [],
        });
      }
      this.pulses.push({ x: p.x, y: p.y, z: p.z, color: "#d9381e", label: "", born: now, ttl: 1800 });
      return;
    }

    if (ev.type === "act.craft" && typeof p.x === "number") {
      this.pulses.push({
        x: p.x,
        y: p.y,
        z: p.z,
        color: "#1d4ed8",
        label: `+ ${p.name || p.kind || "artifact"}`,
        born: now,
        ttl: 5200,
      });
      return;
    }

    if (ev.type === "act.run") {
      const art = this.artifacts.find((a) => a.id === p.target);
      if (art?.position) {
        this.pulses.push({
          x: art.position.x,
          y: art.position.y,
          z: art.position.z,
          color: "#1d4ed8",
          label: `run[${p.input}] → ${String(p.reply || "ok").slice(0, 34)}`,
          born: now,
          ttl: 5500,
        });
      }
      return;
    }

    if (ev.type === "speak" || ev.type === "speak.artifact" || ev.type === "act.mark") {
      const agent = this.agents.get(actorId);
      const origin =
        typeof p.x === "number"
          ? { x: p.x, y: p.y, z: p.z }
          : agent
            ? { x: agent.x, y: agent.y, z: agent.z }
            : null;
      const targetArt = ev.type === "speak.artifact" ? this.artifacts.find((a) => a.id === p.target) : null;
      if (origin) {
        this.pulses.push({
          x: origin.x,
          y: origin.y,
          z: origin.z,
          to: targetArt?.position || null,
          color: "#d9381e",
          label: `“${String(p.text || "").slice(0, 42)}”`,
          born: now,
          ttl: 6000,
        });
      }
    }
  }

  setPreset(name) {
    this.autoOrbit = false;
    if (name === "iso") {
      this.targetYaw = -0.68;
      this.targetPitch = 0.46;
      this.targetZoom = 1.05;
    } else if (name === "top") {
      this.targetYaw = 0;
      this.targetPitch = 1.48;
      this.targetZoom = 1.15;
    } else if (name === "front") {
      this.targetYaw = 0;
      this.targetPitch = 0.08;
      this.targetZoom = 1.12;
    } else if (name === "orbit") {
      this.autoOrbit = true;
    }
  }

  zoomBy(factor) {
    this.targetZoom = Math.max(0.55, Math.min(2.4, this.targetZoom * factor));
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

    // Pause when off-screen (contentvisibilityautostatechange + IntersectionObserver fallback)
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
        this.targetYaw += dx * 0.0065;
        this.targetPitch = Math.max(-1.35, Math.min(1.5, this.targetPitch + dy * 0.0065));
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
        if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 4) return;
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.92 : 1.09;
        this.zoomBy(factor);
      },
      { passive: false },
    );
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  _findHit(px, py) {
    let best = null;
    let bestDist = 18;
    for (let i = this.hitTargets.length - 1; i >= 0; i--) {
      const t = this.hitTargets[i];
      const d = Math.hypot(t.sx - px, t.sy - py);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  _updateHover(px, py) {
    const hit = this._findHit(px, py);
    this.hovered = hit;
    this.canvas.style.cursor = hit ? "pointer" : this.dragging ? "grabbing" : "grab";
    this.onHover(hit);
  }

  _project(x, y, z) {
    // Center around (0, 0, 0), swap Y/Z so Z is vertical elevation in architectural view
    const nx = x - HALF;
    const ny = z - HALF;
    const nz = y - HALF;

    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const rx = nx * cy - nz * sy;
    const rz1 = nx * sy + nz * cy;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const ry = ny * cp - rz1 * sp;
    const rz = ny * sp + rz1 * cp;

    const camDist = 135;
    const scale = (Math.min(this.width, this.height) * 0.86 * this.zoom) / (camDist + rz);
    return {
      sx: this.width * 0.5 + rx * scale,
      sy: this.height * 0.52 - ry * scale,
      depth: rz,
      scale,
    };
  }

  _step(now) {
    if (this.autoOrbit && !this.dragging && !this.reducedMotion) {
      this.targetYaw += 0.0018;
    }
    // Spring damping
    const k = this.reducedMotion ? 1 : 0.11;
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;

    for (const a of this.agents.values()) {
      a.x += (a.tx - a.x) * 0.12;
      a.y += (a.ty - a.y) * 0.12;
      a.z += (a.tz - a.z) * 0.12;
      a.trail = a.trail.filter((pt) => now - pt.born < 9000);
    }
    this.pulses = this.pulses.filter((p) => now - p.born < p.ttl);
  }

  _render(now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Warm archival drafting surface
    ctx.fillStyle = "#faf8f3";
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle radial vignette
    const grad = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.5,
      40,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.65,
    );
    grad.addColorStop(0, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(230,224,212,0.45)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    this._drawLatticeCube(ctx);
    if (this.showLineage) this._drawLineageArcs(ctx);

    // Collect depth-sorted drawables
    const drawables = [];
    this.hitTargets = [];

    for (const a of this.anchors) {
      if (!a.centre) continue;
      const p = this._project(a.centre.x, a.centre.y, a.centre.z);
      drawables.push({ kind: "anchor", depth: p.depth, p, data: a });
    }
    for (const d of this.drifts) {
      if (!d.position) continue;
      const p = this._project(d.position.x, d.position.y, d.position.z);
      drawables.push({ kind: "drift", depth: p.depth, p, data: d });
    }
    for (const art of this.artifacts) {
      if (!art.position) continue;
      const p = this._project(art.position.x, art.position.y, art.position.z);
      drawables.push({ kind: "artifact", depth: p.depth, p, data: art });
    }
    for (const ag of this.agents.values()) {
      const p = this._project(ag.x, ag.y, ag.z);
      drawables.push({ kind: "agent", depth: p.depth, p, data: ag });
    }

    // Painter's sort: farthest first
    drawables.sort((a, b) => b.depth - a.depth);

    for (const item of drawables) {
      if (item.kind === "anchor") this._drawAnchor(ctx, item.p, item.data);
      else if (item.kind === "drift") this._drawDrift(ctx, item.p);
      else if (item.kind === "artifact") this._drawArtifact(ctx, item.p, item.data, now);
      else if (item.kind === "agent") this._drawAgent(ctx, item.p, item.data, now);
    }

    this._drawPulses(ctx, now);
    ctx.restore();
  }

  _drawLatticeCube(ctx) {
    // Floor grid (z = 0)
    ctx.lineWidth = 0.75;
    for (let i = 0; i <= 4; i++) {
      const v = (i / 4) * GRID;
      ctx.strokeStyle = i === 0 || i === 4 ? "rgba(17,18,20,0.22)" : "rgba(17,18,20,0.08)";
      this._line3d(ctx, v, 0, 0, v, GRID, 0);
      this._line3d(ctx, 0, v, 0, GRID, v, 0);
    }

    // Outer 64³ cube edges
    const corners = [
      [0, 0, 0], [GRID, 0, 0], [GRID, GRID, 0], [0, GRID, 0],
      [0, 0, GRID], [GRID, 0, GRID], [GRID, GRID, GRID], [0, GRID, GRID],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    ctx.strokeStyle = "rgba(17,18,20,0.22)";
    ctx.lineWidth = 1;
    for (const [a, b] of edges) {
      const ca = corners[a];
      const cb = corners[b];
      this._line3d(ctx, ca[0], ca[1], ca[2], cb[0], cb[1], cb[2]);
    }

    // Axis labels
    ctx.font = "500 10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(17,18,20,0.45)";
    const px = this._project(GRID + 3, 0, 0);
    const py = this._project(0, GRID + 3, 0);
    const pz = this._project(0, 0, GRID + 3);
    ctx.fillText("X 63", px.sx, px.sy);
    ctx.fillText("Y 63", py.sx, py.sy);
    ctx.fillText("Z 63", pz.sx, pz.sy);
  }

  _drawLineageArcs(ctx) {
    const byId = new Map(this.artifacts.map((a) => [a.id, a]));
    for (const art of this.artifacts) {
      if (!art.position) continue;
      const refs = new Set();
      if (art.parent) refs.add(art.parent);
      if (typeof art.cites === "string") {
        for (const r of art.cites.split(/[\s,]+/)) if (r) refs.add(r);
      }
      for (const ref of refs) {
        const target = byId.get(ref);
        if (!target?.position) continue;
        const a = this._project(art.position.x, art.position.y, art.position.z);
        const b = this._project(target.position.x, target.position.y, target.position.z);
        const mx = (a.sx + b.sx) / 2;
        const my = (a.sy + b.sy) / 2 - 28;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.quadraticCurveTo(mx, my, b.sx, b.sy);
        ctx.strokeStyle = "rgba(29, 78, 216, 0.35)";
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawAnchor(ctx, p, a) {
    const isNamed = Boolean(a.name);
    const floor = this._project(a.centre.x, a.centre.y, 0);
    if (isNamed) {
      ctx.strokeStyle = "rgba(17,18,20,0.16)";
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(floor.sx, floor.sy);
      ctx.lineTo(p.sx, p.sy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const r = isNamed ? Math.max(6, 2.2 * p.scale) : Math.max(2.5, 0.9 * p.scale);
    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy - r);
    ctx.lineTo(p.sx + r, p.sy);
    ctx.lineTo(p.sx, p.sy + r);
    ctx.lineTo(p.sx - r, p.sy);
    ctx.closePath();
    ctx.strokeStyle = isNamed ? "#111214" : "rgba(17,18,20,0.28)";
    ctx.lineWidth = isNamed ? 1.5 : 1;
    ctx.stroke();
    if (isNamed) {
      ctx.fillStyle = "rgba(17,18,20,0.06)";
      ctx.fill();
      if (this.showLabels) {
        ctx.font = "600 11px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "#111214";
        ctx.fillText(a.name, p.sx + r + 5, p.sy + 4);
      }
      this.hitTargets.push({ kind: "anchor", sx: p.sx, sy: p.sy, label: `${a.name} (${a.class})`, data: a });
    }
  }

  _drawDrift(ctx, p) {
    ctx.fillStyle = "rgba(17,18,20,0.22)";
    ctx.fillRect(p.sx - 1.5, p.sy - 1.5, 3, 3);
  }

  _drawArtifact(ctx, p, art, now) {
    const floor = this._project(art.position.x, art.position.y, 0);
    const kind = String(art.kind || "artifact").toLowerCase();
    const color = kind === "machine" ? "#1d4ed8" : kind === "mailbox" ? "#d9381e" : "#9a6700";

    // Elevation stem
    ctx.strokeStyle = "rgba(17,18,20,0.14)";
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(floor.sx, floor.sy);
    ctx.lineTo(p.sx, p.sy);
    ctx.stroke();

    // Floor shadow dot
    ctx.fillStyle = "rgba(17,18,20,0.14)";
    ctx.beginPath();
    ctx.arc(floor.sx, floor.sy, 2, 0, Math.PI * 2);
    ctx.fill();

    // Isometric architectural marker
    const s = Math.max(4.5, 1.8 * p.scale);
    ctx.fillStyle = color;
    ctx.fillRect(p.sx - s, p.sy - s, s * 2, s * 2);
    ctx.strokeStyle = "#faf8f3";
    ctx.lineWidth = 1.25;
    ctx.strokeRect(p.sx - s, p.sy - s, s * 2, s * 2);

    // Subtle orbiting ring for runnable machines
    if (kind === "machine") {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, s + 3 + pulse * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(29, 78, 216, ${(0.32 + pulse * 0.25).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (this.showLabels) {
      ctx.font = "500 10px 'IBM Plex Mono', monospace";
      ctx.fillStyle = color;
      ctx.fillText(art.name || art.id, p.sx + s + 5, p.sy + 3);
    }

    this.hitTargets.push({
      kind: "artifact",
      sx: p.sx,
      sy: p.sy,
      label: `${art.name || art.id} [${kind}] · (${art.position.x}, ${art.position.y}, ${art.position.z})`,
      data: art,
    });
  }

  _drawAgent(ctx, p, ag, now) {
    // Movement trail
    if (ag.trail.length > 0) {
      ctx.beginPath();
      const first = this._project(ag.trail[0].x, ag.trail[0].y, ag.trail[0].z);
      ctx.moveTo(first.sx, first.sy);
      for (let i = 1; i < ag.trail.length; i++) {
        const pt = this._project(ag.trail[i].x, ag.trail[i].y, ag.trail[i].z);
        ctx.lineTo(pt.sx, pt.sy);
      }
      ctx.lineTo(p.sx, p.sy);
      ctx.strokeStyle = "rgba(217, 56, 30, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const floor = this._project(ag.x, ag.y, 0);
    ctx.strokeStyle = "rgba(217, 56, 30, 0.25)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(floor.sx, floor.sy);
    ctx.lineTo(p.sx, p.sy);
    ctx.stroke();

    const r = Math.max(4.5, 1.8 * p.scale);
    const halo = r + 3.5 + Math.sin(now * 0.004) * 1.8;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, halo, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(217, 56, 30, 0.14)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#d9381e";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    const name = this.actorLabel(ag.id);
    if (this.showLabels) {
      ctx.font = "600 10.5px 'Instrument Sans', sans-serif";
      ctx.fillStyle = "#111214";
      ctx.fillText(name, p.sx + r + 6, p.sy - 4);
    }

    this.hitTargets.push({
      kind: "agent",
      sx: p.sx,
      sy: p.sy,
      label: `${name} · (${Math.round(ag.x)}, ${Math.round(ag.y)}, ${Math.round(ag.z)})`,
      data: { id: ag.id, name, position: { x: Math.round(ag.x), y: Math.round(ag.y), z: Math.round(ag.z) } },
    });
  }

  _drawPulses(ctx, now) {
    for (const pulse of this.pulses) {
      const t = Math.min(1, (now - pulse.born) / pulse.ttl);
      const alpha = Math.max(0, 1 - t);
      const p = this._project(pulse.x, pulse.y, pulse.z);

      // Expanding acoustic / signal ring
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 6 + t * 38, 0, Math.PI * 2);
      ctx.strokeStyle = pulse.color;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Optional arc to mailbox / target artifact
      if (pulse.to) {
        const dest = this._project(pulse.to.x, pulse.to.y, pulse.to.z);
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy);
        ctx.quadraticCurveTo((p.sx + dest.sx) / 2, (p.sy + dest.sy) / 2 - 36, dest.sx, dest.sy);
        ctx.strokeStyle = pulse.color;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      // Floating editorial callout badge
      if (pulse.label) {
        ctx.font = "500 10.5px 'IBM Plex Mono', monospace";
        const w = ctx.measureText(pulse.label).width + 12;
        const bx = p.sx - w / 2;
        const by = p.sy - 26 - t * 14;
        ctx.fillStyle = "#111214";
        ctx.fillRect(bx, by - 11, w, 18);
        ctx.fillStyle = "#faf8f3";
        ctx.fillText(pulse.label, bx + 6, by + 1);
      }
      ctx.restore();
    }
  }

  _line3d(ctx, x1, y1, z1, x2, y2, z2) {
    const a = this._project(x1, y1, z1);
    const b = this._project(x2, y2, z2);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
}
