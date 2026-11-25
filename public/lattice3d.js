/**
 * Lean Precision 3D Spatial Telemetry Renderer for Agora (Zero WebGL, 60 FPS).
 * Inspired by scientific star-charts and lean data visualization:
 * - Ultra-fine micro-reticle glyphs (never chunky overlapping boxes/spheres)
 * - Automatic screen-space anti-collision micro-fanning with exact-origin tethers
 * - Greedy 2D label collision avoidance (zero overlapping text)
 * - Smooth "Focus Active" camera targeting + spring-damped orbit/zoom
 * - Automatic off-screen & background tab pausing
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

    // Camera & focus target (in world coordinates 0..63)
    this.yaw = -0.68;
    this.pitch = 0.44;
    this.zoom = 1.05;
    this.focus = { x: HALF, y: HALF, z: HALF };
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.targetZoom = this.zoom;
    this.targetFocus = { x: HALF, y: HALF, z: HALF };
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
      this.pulses.push({ x: p.x, y: p.y, z: p.z, color: "#ff6b4a", label: "", born: now, ttl: 2200 });
      return;
    }

    if (ev.type === "act.craft" && typeof p.x === "number") {
      this.pulses.push({
        x: p.x,
        y: p.y,
        z: p.z,
        color: p.kind === "script" ? "#34d399" : "#38bdf8",
        label: `+ ${p.name || p.kind || "artifact"}`,
        born: now,
        ttl: 5200,
      });
      return;
    }

    if (ev.type === "act.run") {
      const art = this.artifacts.find((a) => a.id === p.target);
      const agent = this.agents.get(actorId);
      const origin = art?.position || (agent ? { x: agent.x, y: agent.y, z: agent.z } : null);
      if (origin) {
        this.pulses.push({
          x: origin.x,
          y: origin.y,
          z: origin.z,
          color: p.sandbox === "quickjs-wasm" ? "#34d399" : "#38bdf8",
          label: `${p.sandbox === "quickjs-wasm" ? "wasm" : "run"}[${p.input}] → ${String(p.reply || "ok").slice(0, 32)}`,
          born: now,
          ttl: 5800,
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
          label: `${this.actorLabel(actorId)}: “${String(p.text || "").slice(0, 38)}”`,
          born: now,
          ttl: 6000,
        });
      }
    }
  }

  setPreset(name) {
    this.autoOrbit = false;
    if (name === "iso") {
      this.targetFocus = { x: HALF, y: HALF, z: HALF };
      this.targetYaw = -0.68;
      this.targetPitch = 0.44;
      this.targetZoom = 1.05;
    } else if (name === "top") {
      this.targetFocus = { x: HALF, y: HALF, z: HALF };
      this.targetYaw = 0;
      this.targetPitch = 1.5;
      this.targetZoom = 1.15;
    } else if (name === "front") {
      this.targetFocus = { x: HALF, y: HALF, z: HALF };
      this.targetYaw = 0;
      this.targetPitch = 0.06;
      this.targetZoom = 1.12;
    } else if (name === "focus") {
      const pts = [
        ...[...this.agents.values()].map((a) => ({ x: a.tx, y: a.ty, z: a.tz })),
        ...this.artifacts.filter((a) => a.position).map((a) => a.position),
      ];
      if (pts.length > 0) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        this.targetFocus = { x: cx, y: cy, z: cz };
        this.targetZoom = 2.05;
      }
    } else if (name === "orbit") {
      this.targetFocus = { x: HALF, y: HALF, z: HALF };
      this.targetZoom = 1.05;
      this.autoOrbit = true;
    }
  }

  zoomBy(factor) {
    this.targetZoom = Math.max(0.55, Math.min(3.8, this.targetZoom * factor));
  }

  focusPoint(x, y, z) {
    this.autoOrbit = false;
    this.targetFocus = { x: Number(x) || HALF, y: Number(y) || HALF, z: Number(z) || HALF };
    this.targetZoom = 2.45;
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
        this.targetPitch = Math.max(-1.4, Math.min(1.52, this.targetPitch + dy * 0.006));
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
    let bestDist = 16;
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
    const nx = x - this.focus.x;
    const ny = z - this.focus.z;
    const nz = y - this.focus.y;

    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const rx = nx * cy - nz * sy;
    const rz1 = nx * sy + nz * cy;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const ry = ny * cp - rz1 * sp;
    const rz = ny * sp + rz1 * cp;

    const camDist = 138;
    const scale = (Math.min(this.width, this.height) * 0.88 * this.zoom) / (camDist + rz);
    return {
      sx: this.width * 0.5 + rx * scale,
      sy: this.height * 0.52 - ry * scale,
      depth: rz,
      scale,
    };
  }

  _step(now) {
    if (this.autoOrbit && !this.dragging && !this.reducedMotion) {
      this.targetYaw += 0.0014;
    }
    const k = this.reducedMotion ? 1 : 0.11;
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;
    this.focus.x += (this.targetFocus.x - this.focus.x) * k;
    this.focus.y += (this.targetFocus.y - this.focus.y) * k;
    this.focus.z += (this.targetFocus.z - this.focus.z) * k;

    for (const a of this.agents.values()) {
      a.x += (a.tx - a.x) * 0.14;
      a.y += (a.ty - a.y) * 0.14;
      a.z += (a.tz - a.z) * 0.14;
      a.trail = a.trail.filter((pt) => now - pt.born < 12_000);
    }
    this.pulses = this.pulses.filter((p) => now - p.born < p.ttl);
  }

  _render(now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Clean, ultra-lean obsidian telemetry ground
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, this.width, this.height);

    this._drawLatticeFrame(ctx);
    if (this.showLineage) this._drawLineageSplines(ctx, now);

    // Project all interactive nodes and resolve screen-space micro-collisions
    const nodes = [];
    for (const a of this.anchors) {
      if (!a.centre) continue;
      const p = this._project(a.centre.x, a.centre.y, a.centre.z);
      if (a.name) {
        nodes.push({ kind: "anchor", depth: p.depth, ox: p.sx, oy: p.sy, sx: p.sx, sy: p.sy, data: a });
      } else {
        this._drawSilentAnchor(ctx, p);
      }
    }
    for (const d of this.drifts) {
      if (!d.position) continue;
      const p = this._project(d.position.x, d.position.y, d.position.z);
      ctx.fillStyle = "rgba(148, 163, 184, 0.25)";
      ctx.fillRect(p.sx - 0.75, p.sy - 0.75, 1.5, 1.5);
    }
    for (const art of this.artifacts) {
      if (!art.position) continue;
      const p = this._project(art.position.x, art.position.y, art.position.z);
      nodes.push({ kind: "artifact", depth: p.depth, ox: p.sx, oy: p.sy, sx: p.sx, sy: p.sy, data: art });
    }
    for (const ag of this.agents.values()) {
      const p = this._project(ag.x, ag.y, ag.z);
      nodes.push({ kind: "agent", depth: p.depth, ox: p.sx, oy: p.sy, sx: p.sx, sy: p.sy, data: ag });
    }

    // Screen-space anti-collision relaxation (keeps adjacent XYZ nodes cleanly separated!)
    const interactive = nodes.filter((n) => n.kind !== "anchor");
    const minSep = 16;
    for (let iter = 0; iter < 5; iter++) {
      for (let i = 0; i < interactive.length; i++) {
        for (let j = i + 1; j < interactive.length; j++) {
          const a = interactive[i];
          const b = interactive[j];
          let dx = b.sx - a.sx;
          let dy = b.sy - a.sy;
          let dist = Math.hypot(dx, dy);
          if (dist < minSep) {
            if (dist < 0.01) {
              const ang = (i * 2.39996 + j * 1.1) % (Math.PI * 2);
              dx = Math.cos(ang);
              dy = Math.sin(ang);
              dist = 1;
            }
            const push = (minSep - dist) * 0.52;
            const ux = dx / dist;
            const uy = dy / dist;
            a.sx -= ux * push;
            a.sy -= uy * push;
            b.sx += ux * push;
            b.sy += uy * push;
          }
        }
      }
    }

    nodes.sort((a, b) => b.depth - a.depth);
    this.hitTargets = [];
    const placedLabels = [];

    for (const n of nodes) {
      if (n.kind === "anchor") {
        this._drawNamedAnchor(ctx, n, placedLabels);
      } else if (n.kind === "artifact") {
        this._drawArtifactGlyph(ctx, n, now, placedLabels);
      } else if (n.kind === "agent") {
        this._drawAgentGlyph(ctx, n, now, placedLabels);
      }
    }

    this._drawPulses(ctx, now);
    ctx.restore();
  }

  _drawLatticeFrame(ctx) {
    // Whisper-quiet 4×4 floor grid
    ctx.lineWidth = 0.6;
    for (let i = 0; i <= 4; i++) {
      const v = (i / 4) * GRID;
      ctx.strokeStyle = i === 0 || i === 4 ? "rgba(226, 232, 240, 0.14)" : "rgba(226, 232, 240, 0.045)";
      this._line3d(ctx, v, 0, 0, v, GRID, 0);
      this._line3d(ctx, 0, v, 0, GRID, v, 0);
    }

    // Minimalist hairline bounding edges
    const corners = [
      [0, 0, 0], [GRID, 0, 0], [GRID, GRID, 0], [0, GRID, 0],
      [0, 0, GRID], [GRID, 0, GRID], [GRID, GRID, GRID], [0, GRID, GRID],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    ctx.lineWidth = 0.75;
    for (const [a, b] of edges) {
      const pa = this._project(corners[a][0], corners[a][1], corners[a][2]);
      const pb = this._project(corners[b][0], corners[b][1], corners[b][2]);
      const alpha = Math.max(0.05, Math.min(0.18, 0.13 - (pa.depth + pb.depth) * 0.0008));
      ctx.strokeStyle = `rgba(226, 232, 240, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }

    ctx.font = "400 9.5px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(148, 163, 184, 0.45)";
    const px = this._project(GRID + 2.5, 0, 0);
    const py = this._project(0, GRID + 2.5, 0);
    const pz = this._project(0, 0, GRID + 2.5);
    ctx.fillText("X", px.sx, px.sy);
    ctx.fillText("Y", py.sx, py.sy);
    ctx.fillText("Z", pz.sx, pz.sy);
  }

  _drawLineageSplines(ctx, now) {
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
        const my = (a.sy + b.sy) * 0.5 - 26;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.quadraticCurveTo(mx, my, b.sx, b.sy);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (!this.reducedMotion) {
          const t = (now * 0.0004) % 1;
          const u = 1 - t;
          const dx = u * u * b.sx + 2 * u * t * mx + t * t * a.sx;
          const dy = u * u * b.sy + 2 * u * t * my + t * t * a.sy;
          ctx.fillStyle = "#7dd3fc";
          ctx.beginPath();
          ctx.arc(dx, dy, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  _drawSilentAnchor(ctx, p) {
    ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(p.sx - 2, p.sy);
    ctx.lineTo(p.sx + 2, p.sy);
    ctx.moveTo(p.sx, p.sy - 2);
    ctx.lineTo(p.sx, p.sy + 2);
    ctx.stroke();
  }

  _drawNamedAnchor(ctx, n, placedLabels) {
    const a = n.data;
    const floor = this._project(a.centre.x, a.centre.y, 0);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.14)";
    ctx.lineWidth = 0.75;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(floor.sx, floor.sy);
    ctx.lineTo(n.sx, n.sy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Precision architectural corner-brackets around the landmark
    const s = 9;
    const c = 3.5;
    ctx.strokeStyle = "rgba(251, 191, 36, 0.65)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(n.sx - s, n.sy - s + c); ctx.lineTo(n.sx - s, n.sy - s); ctx.lineTo(n.sx - s + c, n.sy - s);
    ctx.moveTo(n.sx + s - c, n.sy - s); ctx.lineTo(n.sx + s, n.sy - s); ctx.lineTo(n.sx + s, n.sy - s + c);
    ctx.moveTo(n.sx - s, n.sy + s - c); ctx.lineTo(n.sx - s, n.sy + s); ctx.lineTo(n.sx - s + c, n.sy + s);
    ctx.moveTo(n.sx + s - c, n.sy + s); ctx.lineTo(n.sx + s, n.sy + s); ctx.lineTo(n.sx + s, n.sy + s - c);
    ctx.stroke();

    if (this.showLabels) {
      this._drawLeanLabel(ctx, n.sx, n.sy - 14, a.name.toUpperCase(), "#fbbf24", placedLabels, true);
    }
    this.hitTargets.push({ kind: "anchor", sx: n.sx, sy: n.sy, label: `${a.name} (${a.class}) · (${a.centre.x}, ${a.centre.y}, ${a.centre.z})`, data: a });
  }

  _drawTether(ctx, n, color) {
    if (Math.hypot(n.sx - n.ox, n.sy - n.oy) > 2) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(n.ox, n.oy);
      ctx.lineTo(n.sx, n.sy);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  _drawArtifactGlyph(ctx, n, now, placedLabels) {
    const art = n.data;
    const kind = String(art.kind || "artifact").toLowerCase();
    const isHovered = this.hovered?.data?.id === art.id;
    const colors = {
      script: "#34d399",
      machine: "#38bdf8",
      mailbox: "#fb7185",
      protocol: "#fbbf24",
      language: "#c084fc",
    };
    const color = colors[kind] || "#94a3b8";

    // Whisper-fine elevation drop to floor
    const floor = this._project(art.position.x, art.position.y, 0);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(floor.sx, floor.sy);
    ctx.lineTo(n.ox, n.oy);
    ctx.stroke();

    this._drawTether(ctx, n, color);

    // Lean precision micro-glyphs (distinct per kind, never chunky blocks!)
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = isHovered ? 1.6 : 1.15;

    if (kind === "script") {
      // [·] code bracket glyph
      ctx.beginPath();
      ctx.moveTo(n.sx - 2, n.sy - 4.5); ctx.lineTo(n.sx - 4.5, n.sy - 4.5); ctx.lineTo(n.sx - 4.5, n.sy + 4.5); ctx.lineTo(n.sx - 2, n.sy + 4.5);
      ctx.moveTo(n.sx + 2, n.sy - 4.5); ctx.lineTo(n.sx + 4.5, n.sy - 4.5); ctx.lineTo(n.sx + 4.5, n.sy + 4.5); ctx.lineTo(n.sx + 2, n.sy + 4.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "machine") {
      // ◎ precision concentric ring + micro-tick
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, 4.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, 1.8, 0, Math.PI * 2);
      ctx.fill();
      if (!this.reducedMotion) {
        const a = now * 0.0025;
        ctx.beginPath();
        ctx.arc(n.sx + Math.cos(a) * 4.8, n.sy + Math.sin(a) * 4.8, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = "#e0f2fe";
        ctx.fill();
      }
    } else if (kind === "mailbox") {
      // ◇ crisp hollow diamond
      ctx.beginPath();
      ctx.moveTo(n.sx, n.sy - 4.8);
      ctx.lineTo(n.sx + 4.8, n.sy);
      ctx.lineTo(n.sx, n.sy + 4.8);
      ctx.lineTo(n.sx - 4.8, n.sy);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // △ crisp micro-triangle
      ctx.beginPath();
      ctx.moveTo(n.sx, n.sy - 4.5);
      ctx.lineTo(n.sx + 4.2, n.sy + 3.5);
      ctx.lineTo(n.sx - 4.2, n.sy + 3.5);
      ctx.closePath();
      ctx.stroke();
    }

    if (this.showLabels || isHovered) {
      this._drawLeanLabel(ctx, n.sx + 8, n.sy + 3, art.name || art.id, color, placedLabels, isHovered);
    }

    this.hitTargets.push({
      kind: "artifact",
      sx: n.sx,
      sy: n.sy,
      label: `${art.name || art.id} [${kind}] · (${art.position.x}, ${art.position.y}, ${art.position.z})`,
      data: art,
    });
  }

  _drawAgentGlyph(ctx, n, now, placedLabels) {
    const ag = n.data;
    const isHovered = this.hovered?.data?.id === ag.id;

    // Fine movement trajectory spline
    if (ag.trail.length > 0) {
      ctx.beginPath();
      const first = this._project(ag.trail[0].x, ag.trail[0].y, ag.trail[0].z);
      ctx.moveTo(first.sx, first.sy);
      for (let i = 1; i < ag.trail.length; i++) {
        const pt = this._project(ag.trail[i].x, ag.trail[i].y, ag.trail[i].z);
        ctx.lineTo(pt.sx, pt.sy);
      }
      ctx.lineTo(n.ox, n.oy);
      ctx.strokeStyle = "rgba(255, 107, 74, 0.48)";
      ctx.lineWidth = 1.15;
      ctx.stroke();
    }

    this._drawTether(ctx, n, "#ff6b4a");

    // Precision crosshair reticle + 2.8px coral core
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.0035);
    ctx.strokeStyle = `rgba(255, 107, 74, ${(isHovered ? 0.95 : 0.45 + pulse * 0.25).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(n.sx - 6, n.sy); ctx.lineTo(n.sx - 3, n.sy);
    ctx.moveTo(n.sx + 3, n.sy); ctx.lineTo(n.sx + 6, n.sy);
    ctx.moveTo(n.sx, n.sy - 6); ctx.lineTo(n.sx, n.sy - 3);
    ctx.moveTo(n.sx, n.sy + 3); ctx.lineTo(n.sx, n.sy + 6);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(n.sx, n.sy, isHovered ? 3.4 : 2.6, 0, Math.PI * 2);
    ctx.fillStyle = "#ff6b4a";
    ctx.fill();

    const name = this.actorLabel(ag.id);
    if (this.showLabels || isHovered) {
      this._drawLeanLabel(ctx, n.sx + 8, n.sy - 4, name, "#f1f5f9", placedLabels, isHovered);
    }

    this.hitTargets.push({
      kind: "agent",
      sx: n.sx,
      sy: n.sy,
      label: `${name} · (${Math.round(ag.x)}, ${Math.round(ag.y)}, ${Math.round(ag.z)})`,
      data: { id: ag.id, name, position: { x: Math.round(ag.x), y: Math.round(ag.y), z: Math.round(ag.z) } },
    });
  }

  _drawLeanLabel(ctx, x, y, text, color, placed, force = false) {
    ctx.font = "500 9.5px 'IBM Plex Mono', monospace";
    const w = ctx.measureText(text).width + 6;
    const h = 13;
    const box = { x1: x - 2, y1: y - 9, x2: x + w, y2: y - 9 + h };
    if (!force) {
      for (const b of placed) {
        if (!(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)) {
          return; // Skip colliding label cleanly — zero spaghetti overlap!
        }
      }
    }
    placed.push(box);
    ctx.fillStyle = "rgba(11, 14, 20, 0.72)";
    ctx.fillRect(box.x1, box.y1, w + 2, h);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 1, y);
  }

  _drawPulses(ctx, now) {
    for (const pulse of this.pulses) {
      const t = Math.min(1, (now - pulse.born) / pulse.ttl);
      const alpha = Math.max(0, 1 - t);
      const p = this._project(pulse.x, pulse.y, pulse.z);

      ctx.save();
      ctx.globalAlpha = alpha;

      // Hairline expanding sonar ring
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 5 + t * 28, 0, Math.PI * 2);
      ctx.strokeStyle = pulse.color;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (pulse.to) {
        const dest = this._project(pulse.to.x, pulse.to.y, pulse.to.z);
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy);
        ctx.quadraticCurveTo((p.sx + dest.sx) * 0.5, (p.sy + dest.sy) * 0.5 - 28, dest.sx, dest.sy);
        ctx.strokeStyle = pulse.color;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      if (pulse.label) {
        ctx.font = "500 9.5px 'IBM Plex Mono', monospace";
        const w = ctx.measureText(pulse.label).width + 10;
        const bx = p.sx - w / 2;
        const by = p.sy - 18 - t * 14;
        ctx.fillStyle = "rgba(11, 14, 20, 0.9)";
        ctx.fillRect(bx, by - 9, w, 14);
        ctx.strokeStyle = pulse.color;
        ctx.lineWidth = 0.75;
        ctx.strokeRect(bx, by - 9, w, 14);
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(pulse.label, bx + 5, by + 1);
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
