/**
 * High-DPI 3D Architectural Vitrine Renderer for Agora (Zero WebGL, 60 FPS).
 * Features true 3D lit multi-face polyhedra (prisms, octahedra, pavilions, spheres),
 * depth-fogged 64³ lattice, cast floor shadows, animated 3D lineage streams,
 * live SSE speech/machine/movement FX, spring-damped orbit/zoom, and auto-pause.
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

    this.yaw = -0.72;
    this.pitch = 0.48;
    this.zoom = 1.08;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.targetZoom = this.zoom;
    this.autoOrbit = true;
    this.showLineage = true;
    this.showLabels = true;

    this.anchors = [];
    this.artifacts = [];
    this.agents = new Map();
    this.drifts = [];
    this.pulses = [];
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

    this._bindEvents();
    this._resize();
    this.start();
  }

  setWorldData({ anchors, bodies, artifacts, drifts }) {
    if (anchors !== undefined) this.anchors = anchors;
    if (artifacts !== undefined) this.artifacts = artifacts;
    if (drifts !== undefined) this.drifts = drifts;

    if (bodies !== undefined) {
      const now = performance.now();
      const seen = new Set();
      for (const b of bodies) {
        if (!b.position) continue;
        seen.add(b.id);
        const existing = this.agents.get(b.id);
        if (existing) {
          if (existing.tx !== b.position.x || existing.ty !== b.position.y || existing.tz !== b.position.z) {
            existing.trail.push({ x: existing.tx, y: existing.ty, z: existing.tz, born: now });
            if (existing.trail.length > 14) existing.trail.shift();
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
        if (existing.trail.length > 16) existing.trail.shift();
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
      this.pulses.push({ x: p.x, y: p.y, z: p.z, color: "#ff5c40", label: "", born: now, ttl: 2400 });
      return;
    }

    if (ev.type === "act.craft" && typeof p.x === "number") {
      this.pulses.push({
        x: p.x,
        y: p.y,
        z: p.z,
        color: "#60a5fa",
        beam: true,
        label: `+ ${p.name || p.kind || "artifact"}`,
        born: now,
        ttl: 5600,
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
          color: "#38bdf8",
          beam: true,
          label: `run[${p.input}] → ${String(p.reply || "ok").slice(0, 36)}`,
          born: now,
          ttl: 6000,
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
          color: "#ff6b4a",
          label: `${this.actorLabel(actorId)}: “${String(p.text || "").slice(0, 40)}”`,
          born: now,
          ttl: 6500,
        });
      }
    }
  }

  setPreset(name) {
    this.autoOrbit = false;
    if (name === "iso") {
      this.targetYaw = -0.72;
      this.targetPitch = 0.48;
      this.targetZoom = 1.08;
    } else if (name === "top") {
      this.targetYaw = 0;
      this.targetPitch = 1.48;
      this.targetZoom = 1.18;
    } else if (name === "front") {
      this.targetYaw = 0;
      this.targetPitch = 0.08;
      this.targetZoom = 1.14;
    } else if (name === "orbit") {
      this.autoOrbit = true;
    }
  }

  zoomBy(factor) {
    this.targetZoom = Math.max(0.55, Math.min(2.6, this.targetZoom * factor));
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
        this.zoomBy(e.deltaY > 0 ? 0.92 : 1.09);
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
    let bestDist = 20;
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

    const camDist = 132;
    const scale = (Math.min(this.width, this.height) * 0.9 * this.zoom) / (camDist + rz);
    return {
      sx: this.width * 0.5 + rx * scale,
      sy: this.height * 0.52 - ry * scale,
      depth: rz,
      scale,
    };
  }

  _step(now) {
    if (this.autoOrbit && !this.dragging && !this.reducedMotion) {
      this.targetYaw += 0.002;
    }
    const k = this.reducedMotion ? 1 : 0.11;
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;

    for (const a of this.agents.values()) {
      a.x += (a.tx - a.x) * 0.12;
      a.y += (a.ty - a.y) * 0.12;
      a.z += (a.tz - a.z) * 0.12;
      a.trail = a.trail.filter((pt) => now - pt.born < 12_000);
    }
    this.pulses = this.pulses.filter((p) => now - p.born < p.ttl);
  }

  _render(now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Backlit architectural vitrine background
    const bg = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.45,
      30,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.72,
    );
    bg.addColorStop(0, "#171d2b");
    bg.addColorStop(0.55, "#0f131d");
    bg.addColorStop(1, "#090b11");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    this._drawLatticeCube(ctx);
    if (this.showLineage) this._drawLineageArcs(ctx, now);

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

    drawables.sort((a, b) => b.depth - a.depth);

    for (const item of drawables) {
      if (item.kind === "anchor") this._drawAnchor(ctx, item.p, item.data, now);
      else if (item.kind === "drift") this._drawDrift(ctx, item.p);
      else if (item.kind === "artifact") this._drawArtifact(ctx, item.p, item.data, now);
      else if (item.kind === "agent") this._drawAgent(ctx, item.p, item.data, now);
    }

    this._drawPulses(ctx, now);
    ctx.restore();
  }

  _drawLatticeCube(ctx) {
    // Translucent recessed floor plate (z = 0)
    const f0 = this._project(0, 0, 0);
    const f1 = this._project(GRID, 0, 0);
    const f2 = this._project(GRID, GRID, 0);
    const f3 = this._project(0, GRID, 0);
    ctx.beginPath();
    ctx.moveTo(f0.sx, f0.sy);
    ctx.lineTo(f1.sx, f1.sy);
    ctx.lineTo(f2.sx, f2.sy);
    ctx.lineTo(f3.sx, f3.sy);
    ctx.closePath();
    ctx.fillStyle = "rgba(56, 189, 248, 0.035)";
    ctx.fill();

    // 8×8 floor grid
    ctx.lineWidth = 0.75;
    for (let i = 0; i <= 8; i++) {
      const v = (i / 8) * GRID;
      ctx.strokeStyle = i === 0 || i === 8 ? "rgba(148, 163, 184, 0.3)" : "rgba(148, 163, 184, 0.09)";
      this._line3d(ctx, v, 0, 0, v, GRID, 0);
      this._line3d(ctx, 0, v, 0, GRID, v, 0);
    }

    // Cube bounding volume
    const corners = [
      [0, 0, 0], [GRID, 0, 0], [GRID, GRID, 0], [0, GRID, 0],
      [0, 0, GRID], [GRID, 0, GRID], [GRID, GRID, GRID], [0, GRID, GRID],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    ctx.lineWidth = 1;
    for (const [a, b] of edges) {
      const ca = corners[a];
      const cb = corners[b];
      const pa = this._project(ca[0], ca[1], ca[2]);
      const pb = this._project(cb[0], cb[1], cb[2]);
      const avgDepth = (pa.depth + pb.depth) * 0.5;
      const alpha = Math.max(0.09, Math.min(0.32, 0.22 - avgDepth * 0.002));
      ctx.strokeStyle = `rgba(226, 232, 240, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }

    // Subtle glowing axis ticks
    ctx.font = "500 10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(148, 163, 184, 0.58)";
    const px = this._project(GRID + 3, 0, 0);
    const py = this._project(0, GRID + 3, 0);
    const pz = this._project(0, 0, GRID + 3);
    ctx.fillText("X 63", px.sx, px.sy);
    ctx.fillText("Y 63", py.sx, py.sy);
    ctx.fillText("Z 63", pz.sx, pz.sy);
  }

  _drawLineageArcs(ctx, now) {
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
        const mx = (a.sx + b.sx) * 0.5;
        const my = (a.sy + b.sy) * 0.5 - 38;

        ctx.save();
        const grad = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
        grad.addColorStop(0, "rgba(56, 189, 248, 0.85)");
        grad.addColorStop(1, "rgba(245, 158, 11, 0.85)");
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.quadraticCurveTo(mx, my, b.sx, b.sy);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Animated glowing data packet traveling along the lineage arc
        if (!this.reducedMotion) {
          const t = (now * 0.00045) % 1;
          const u = 1 - t;
          const dx = u * u * b.sx + 2 * u * t * mx + t * t * a.sx;
          const dy = u * u * b.sy + 2 * u * t * my + t * t * a.sy;
          ctx.beginPath();
          ctx.arc(dx, dy, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = "#e0f2fe";
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  _drawSolidBox(ctx, cx, cy, cz, rx, ry, rz, colors) {
    const verts = [
      this._project(cx - rx, cy - ry, cz - rz),
      this._project(cx + rx, cy - ry, cz - rz),
      this._project(cx + rx, cy + ry, cz - rz),
      this._project(cx - rx, cy + ry, cz - rz),
      this._project(cx - rx, cy - ry, cz + rz),
      this._project(cx + rx, cy - ry, cz + rz),
      this._project(cx + rx, cy + ry, cz + rz),
      this._project(cx - rx, cy + ry, cz + rz),
    ];
    const faces = [
      { idx: [4, 5, 6, 7], color: colors.top },
      { idx: [0, 1, 5, 4], color: colors.left },
      { idx: [1, 2, 6, 5], color: colors.right },
      { idx: [2, 3, 7, 6], color: colors.left },
      { idx: [3, 0, 4, 7], color: colors.right },
    ];
    faces.sort((a, b) => {
      const da = a.idx.reduce((s, i) => s + verts[i].depth, 0) / 4;
      const db = b.idx.reduce((s, i) => s + verts[i].depth, 0) / 4;
      return db - da;
    });
    for (const f of faces) {
      ctx.beginPath();
      ctx.moveTo(verts[f.idx[0]].sx, verts[f.idx[0]].sy);
      for (let i = 1; i < f.idx.length; i++) ctx.lineTo(verts[f.idx[i]].sx, verts[f.idx[i]].sy);
      ctx.closePath();
      ctx.fillStyle = f.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }

  _drawAnchor(ctx, p, a, now) {
    const isNamed = Boolean(a.name);
    const floor = this._project(a.centre.x, a.centre.y, 0);

    if (!isNamed) {
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(148, 163, 184, 0.25)";
      ctx.fill();
      return;
    }

    // Vertical drop stem + glowing floor ring
    ctx.strokeStyle = "rgba(245, 158, 11, 0.25)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(floor.sx, floor.sy);
    ctx.lineTo(p.sx, p.sy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.ellipse(floor.sx, floor.sy, 14, 7, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3D wireframe architectural pavilion
    this._drawSolidBox(ctx, a.centre.x, a.centre.y, a.centre.z, 2.2, 2.2, 2.2, {
      top: "rgba(245, 158, 11, 0.24)",
      left: "rgba(245, 158, 11, 0.14)",
      right: "rgba(245, 158, 11, 0.08)",
    });

    const pulse = 0.5 + 0.5 * Math.sin(now * 0.002);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 10 + pulse * 3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(251, 191, 36, ${(0.25 + pulse * 0.2).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (this.showLabels) {
      this._drawLabelPill(ctx, p.sx, p.sy - 18, a.name.toUpperCase(), "#fbbf24", "rgba(15, 19, 29, 0.85)");
    }
    this.hitTargets.push({ kind: "anchor", sx: p.sx, sy: p.sy, label: `${a.name} (${a.class})`, data: a });
  }

  _drawDrift(ctx, p) {
    ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawArtifact(ctx, p, art, now) {
    const floor = this._project(art.position.x, art.position.y, 0);
    const kind = String(art.kind || "artifact").toLowerCase();

    const palettes = {
      machine: { top: "#60a5fa", left: "#2563eb", right: "#1e3a8a", glow: "rgba(56, 189, 248, 0.45)", text: "#93c5fd", h: 2.8 },
      mailbox: { top: "#fb7185", left: "#e11d48", right: "#881337", glow: "rgba(251, 113, 133, 0.45)", text: "#fda4af", h: 2.3 },
      protocol: { top: "#fcd34d", left: "#d97706", right: "#78350f", glow: "rgba(251, 191, 36, 0.4)", text: "#fde68a", h: 2.0 },
      language: { top: "#c084fc", left: "#7c3aed", right: "#4c1d95", glow: "rgba(192, 132, 252, 0.4)", text: "#e9d5ff", h: 2.0 },
    };
    const pal = palettes[kind] || palettes.protocol;

    // Elevation stem + floor shadow
    ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(floor.sx, floor.sy);
    ctx.lineTo(p.sx, p.sy);
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.ellipse(floor.sx, floor.sy, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft bloom
    const bloom = ctx.createRadialGradient(p.sx, p.sy, 1, p.sx, p.sy, 18);
    bloom.addColorStop(0, pal.glow);
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 18, 0, Math.PI * 2);
    ctx.fill();

    // True 3D lit prism
    this._drawSolidBox(ctx, art.position.x, art.position.y, art.position.z, 1.4, 1.4, pal.h, pal);

    // Orbiting gyro-ring for runnable machines
    if (kind === "machine") {
      const a = now * 0.0022;
      ctx.save();
      ctx.translate(p.sx, p.sy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 5.5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }

    if (this.showLabels) {
      ctx.font = "500 10px 'IBM Plex Mono', monospace";
      ctx.fillStyle = pal.text;
      ctx.fillText(art.name || art.id, p.sx + 11, p.sy + 3);
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
    // Glowing tapered movement ribbon
    if (ag.trail.length > 0) {
      ctx.beginPath();
      const first = this._project(ag.trail[0].x, ag.trail[0].y, ag.trail[0].z);
      ctx.moveTo(first.sx, first.sy);
      for (let i = 1; i < ag.trail.length; i++) {
        const pt = this._project(ag.trail[i].x, ag.trail[i].y, ag.trail[i].z);
        ctx.lineTo(pt.sx, pt.sy);
      }
      ctx.lineTo(p.sx, p.sy);
      ctx.strokeStyle = "rgba(255, 107, 74, 0.65)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const floor = this._project(ag.x, ag.y, 0);
    const stemGrad = ctx.createLinearGradient(p.sx, p.sy, floor.sx, floor.sy);
    stemGrad.addColorStop(0, "rgba(255, 107, 74, 0.55)");
    stemGrad.addColorStop(1, "rgba(255, 107, 74, 0.05)");
    ctx.strokeStyle = stemGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy);
    ctx.lineTo(floor.sx, floor.sy);
    ctx.stroke();

    // Luminous radial bloom
    const r = Math.max(5, 2.0 * p.scale);
    const halo = r * 2.8 + Math.sin(now * 0.004) * 2.5;
    const bloom = ctx.createRadialGradient(p.sx, p.sy, 1, p.sx, p.sy, halo);
    bloom.addColorStop(0, "rgba(255, 107, 74, 0.55)");
    bloom.addColorStop(1, "rgba(255, 107, 74, 0)");
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, halo, 0, Math.PI * 2);
    ctx.fill();

    // Lit 3D sphere with specular highlight
    const sph = ctx.createRadialGradient(p.sx - r * 0.32, p.sy - r * 0.32, r * 0.12, p.sx, p.sy, r);
    sph.addColorStop(0, "#ffe4de");
    sph.addColorStop(0.38, "#ff6b4a");
    sph.addColorStop(1, "#991b1b");
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fillStyle = sph;
    ctx.fill();

    const name = this.actorLabel(ag.id);
    if (this.showLabels) {
      this._drawLabelPill(ctx, p.sx, p.sy - r - 11, name, "#f8fafc", "rgba(15, 19, 29, 0.78)");
    }

    this.hitTargets.push({
      kind: "agent",
      sx: p.sx,
      sy: p.sy,
      label: `${name} · (${Math.round(ag.x)}, ${Math.round(ag.y)}, ${Math.round(ag.z)})`,
      data: { id: ag.id, name, position: { x: Math.round(ag.x), y: Math.round(ag.y), z: Math.round(ag.z) } },
    });
  }

  _drawLabelPill(ctx, cx, cy, text, fg, bg) {
    ctx.font = "600 10px 'IBM Plex Mono', monospace";
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg;
    ctx.fillRect(cx - w / 2, cy - 8, w, 15);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 0.75;
    ctx.strokeRect(cx - w / 2, cy - 8, w, 15);
    ctx.fillStyle = fg;
    ctx.fillText(text, cx - w / 2 + 5, cy + 3);
  }

  _drawPulses(ctx, now) {
    for (const pulse of this.pulses) {
      const t = Math.min(1, (now - pulse.born) / pulse.ttl);
      const alpha = Math.max(0, 1 - t);
      const p = this._project(pulse.x, pulse.y, pulse.z);

      ctx.save();
      ctx.globalAlpha = alpha;

      // Dual expanding shockwave rings
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, 8 + t * 44, 4 + t * 22, 0, 0, Math.PI * 2);
      ctx.strokeStyle = pulse.color;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      if (pulse.beam) {
        const floor = this._project(pulse.x, pulse.y, 0);
        ctx.strokeStyle = pulse.color;
        ctx.lineWidth = 2.5 * alpha;
        ctx.beginPath();
        ctx.moveTo(floor.sx, floor.sy);
        ctx.lineTo(p.sx, p.sy - 30);
        ctx.stroke();
      }

      if (pulse.to) {
        const dest = this._project(pulse.to.x, pulse.to.y, pulse.to.z);
        const mx = (p.sx + dest.sx) * 0.5;
        const my = (p.sy + dest.sy) * 0.5 - 42;
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy);
        ctx.quadraticCurveTo(mx, my, dest.sx, dest.sy);
        ctx.strokeStyle = pulse.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (pulse.label) {
        this._drawLabelPill(ctx, p.sx, p.sy - 26 - t * 18, pulse.label, "#ffffff", "rgba(17, 24, 39, 0.92)");
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
