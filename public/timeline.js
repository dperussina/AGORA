/**
 * Lean Experiment Timeline Visualizer for Agora (High-DPI 2D Canvas, 60 FPS).
 * Plots multi-agent activity across horizontal swimlanes (one per citizen + ARBITER)
 * over tick time, with cross-lane causality/interaction arcs, hover inspection,
 * click-to-open Reading Room, drag-to-scrub, zoom, and live-edge auto-follow.
 */

const LANE_LEFT = 152;
const TOP_PAD = 34;
const BOT_PAD = 26;

const CAT_COLORS = {
  script: "#34d399",
  artifact: "#38bdf8",
  speech: "#ff6b4a",
  governance: "#fbbf24",
  spatial: "#94a3b8",
  other: "#cbd5e1",
};

export class ExperimentTimeline {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.actorLabel = opts.actorLabel || ((id) => id);
    this.onSelectEvent = opts.onSelectEvent || (() => {});
    this.onSelectActor = opts.onSelectActor || (() => {});
    this.onHover = opts.onHover || (() => {});

    this.events = []; // oldest -> newest
    this.artifactsById = new Map();
    this.hitTargets = [];
    this.laneHits = [];
    this.hovered = null;

    // Viewport state in event-index / tick space
    this.pxPerEvent = 24;
    this.scrollOffset = 0; // 0 = pinned to live right edge
    this.followLive = true;

    this.dragging = false;
    this.dragMoved = false;
    this.lastX = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 960;
    this.height = 460;
    this.dirty = true;
    this.rafId = null;
    this.running = false;
    this.visible = true;

    this._bindEvents();
    this._resize();
    this.start();
  }

  setData(events, artifacts = []) {
    // Store oldest -> newest, skipping noisy internal events
    this.events = [...events]
      .filter((e) => e && e.type && !e.type.startsWith("effect.") && !e.type.startsWith("credential.") && e.type !== "tick.boundary")
      .reverse();
    this.artifactsById = new Map(artifacts.map((a) => [a.id, a]));
    if (this.followLive) this.scrollOffset = 0;
    this.dirty = true;
  }

  pushLiveEvent(ev) {
    if (!ev || !ev.type || ev.type.startsWith("effect.") || ev.type.startsWith("credential.") || ev.type === "tick.boundary") {
      return;
    }
    this.events.push({ ...ev, _born: performance.now() });
    if (this.events.length > 260) this.events.shift();
    if (this.followLive) this.scrollOffset = 0;
    this.dirty = true;
  }

  snapLive() {
    this.followLive = true;
    this.scrollOffset = 0;
    this.dirty = true;
  }

  zoomBy(factor) {
    this.pxPerEvent = Math.max(10, Math.min(64, this.pxPerEvent * factor));
    this.dirty = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (now) => {
      if (!this.running) return;
      const hasFresh = this.events.some((e) => e._born && now - e._born < 1800);
      if (this.dirty || hasFresh) {
        this._render(now);
        this.dirty = false;
      }
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
    const ro = new ResizeObserver(() => {
      this._resize();
      this.dirty = true;
    });
    ro.observe(this.canvas);

    const stage = this.canvas.closest(".lattice-stage") || this.canvas;
    if ("contentVisibility" in document.documentElement.style) {
      stage.addEventListener("contentvisibilityautostatechange", (e) => {
        this.visible = !e.skipped;
        if (this.visible && !document.hidden) this.start();
        else this.stop();
      });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
      else if (this.visible) this.start();
    });

    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.dragMoved = false;
      this.lastX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (this.dragging) {
        const dx = e.clientX - this.lastX;
        if (Math.abs(dx) > 3) this.dragMoved = true;
        this.scrollOffset = Math.max(0, this.scrollOffset + dx);
        this.followLive = this.scrollOffset < 8;
        this.lastX = e.clientX;
        this.dirty = true;
        return;
      }
      const hit = this._findHit(px, py);
      if (hit !== this.hovered) {
        this.hovered = hit;
        this.canvas.style.cursor = hit ? "pointer" : "grab";
        this.onHover(hit);
        this.dirty = true;
      }
    });

    this.canvas.addEventListener("pointerup", (e) => {
      if (this.dragging && !this.dragMoved) {
        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const hit = this._findHit(px, py);
        if (hit) {
          if (hit.kind === "event") this.onSelectEvent(hit.data);
          else if (hit.kind === "lane" && hit.actorId !== "ARBITER") this.onSelectActor(hit.actorId);
        }
      }
      this.dragging = false;
    });

    this.canvas.addEventListener("pointerleave", () => {
      this.dragging = false;
      this.hovered = null;
      this.onHover(null);
      this.dirty = true;
    });

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          e.preventDefault();
          this.scrollOffset = Math.max(0, this.scrollOffset - e.deltaX);
          this.followLive = this.scrollOffset < 8;
          this.dirty = true;
        } else if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.zoomBy(e.deltaY > 0 ? 0.88 : 1.14);
        }
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

  _actorIdOf(raw) {
    if (!raw || raw === "ARBITER" || raw === "STEWARD") return "ARBITER";
    return String(raw).startsWith("identity:") ? String(raw).slice(9) : String(raw);
  }

  _categoryOf(ev) {
    const t = ev.type || "";
    if (t === "act.run" && (ev.payload?.sandbox === "quickjs-wasm" || ev.payload?.scheduled || ev.payload?.reactive)) {
      return "script";
    }
    if (t.startsWith("speak") || t === "act.mark") return "speech";
    if (t.startsWith("amendment.") || t.startsWith("steward.") || t === "coherence.revert") return "governance";
    if (t === "act.craft" || t === "act.edit" || t === "act.run" || t === "act.give" || t === "act.dismantle") {
      return "artifact";
    }
    return "spatial";
  }

  _findHit(px, py) {
    for (const lane of this.laneHits) {
      if (px <= LANE_LEFT && Math.abs(py - lane.y) <= lane.h * 0.5) {
        return { kind: "lane", actorId: lane.id, label: `Open Author Dossier: ${lane.name}` };
      }
    }
    let best = null;
    let bestDist = 14;
    for (let i = this.hitTargets.length - 1; i >= 0; i--) {
      const t = this.hitTargets[i];
      const d = Math.hypot(t.x - px, t.y - py);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  _render(now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, this.width, this.height);

    // Build ordered swimlanes: ARBITER first (if present), then actors by most recent activity
    const laneOrder = [];
    const seen = new Set();
    for (let i = this.events.length - 1; i >= 0; i--) {
      const id = this._actorIdOf(this.events[i].actor);
      if (!seen.has(id)) {
        seen.add(id);
        laneOrder.push(id);
      }
    }
    if (laneOrder.length === 0) {
      ctx.font = "500 12px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
      ctx.fillText("Waiting for live agent events on /listen…", 28, this.height * 0.5);
      ctx.restore();
      return;
    }

    // Put ARBITER at the top if present, keep max 12 visible lanes
    const arbiterIdx = laneOrder.indexOf("ARBITER");
    if (arbiterIdx > 0) {
      laneOrder.splice(arbiterIdx, 1);
      laneOrder.unshift("ARBITER");
    }
    const lanes = laneOrder.slice(0, 12);
    const plotW = Math.max(120, this.width - LANE_LEFT - 24);
    const plotH = Math.max(80, this.height - TOP_PAD - BOT_PAD);
    const laneH = plotH / lanes.length;
    const laneY = new Map(lanes.map((id, idx) => [id, TOP_PAD + laneH * (idx + 0.5)]));

    // Draw horizontal swimlane tracks
    this.laneHits = [];
    for (let i = 0; i < lanes.length; i++) {
      const id = lanes[i];
      const y = laneY.get(id);
      const name = id === "ARBITER" ? "ARBITER / SENATE" : this.actorLabel(id);

      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.018)";
        ctx.fillRect(0, TOP_PAD + i * laneH, this.width, laneH);
      }
      ctx.strokeStyle = "rgba(226, 232, 240, 0.07)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(LANE_LEFT, y);
      ctx.lineTo(this.width - 12, y);
      ctx.stroke();

      ctx.font = id === "ARBITER" ? "600 9.5px 'IBM Plex Mono', monospace" : "500 10.5px 'Instrument Sans', sans-serif";
      ctx.fillStyle = id === "ARBITER" ? "#fbbf24" : "#e2e8f0";
      ctx.fillText(name.slice(0, 18), 14, y + 3.5);
      this.laneHits.push({ id, name, y, h: laneH });
    }

    // Left gutter divider
    ctx.strokeStyle = "rgba(226, 232, 240, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LANE_LEFT, 0);
    ctx.lineTo(LANE_LEFT, this.height);
    ctx.stroke();

    // Compute X positions from right edge (live tip) leftward
    const rightEdge = this.width - 28;
    const n = this.events.length;
    const positions = [];
    let lastTickDrawn = -1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(LANE_LEFT + 1, 0, plotW + 24, this.height);
    ctx.clip();

    for (let i = 0; i < n; i++) {
      const ev = this.events[i];
      const x = rightEdge - (n - 1 - i) * this.pxPerEvent + this.scrollOffset;
      if (x < LANE_LEFT - 40 || x > this.width + 40) continue;

      // Vertical tick boundary line whenever tick changes
      if (ev.tick !== lastTickDrawn) {
        lastTickDrawn = ev.tick;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(x, TOP_PAD - 8);
        ctx.lineTo(x, this.height - BOT_PAD + 4);
        ctx.stroke();

        ctx.font = "500 9px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
        ctx.fillText(`t${String(ev.tick ?? 0).padStart(3, "0")}`, x - 10, TOP_PAD - 13);
      }

      const actorId = this._actorIdOf(ev.actor);
      const y = laneY.get(actorId);
      if (y !== undefined) {
        positions.push({ ev, x, y, actorId });
      }
    }

    // Draw cross-lane interaction arcs (running another agent's artifact, forking, mailbox note)
    for (const pt of positions) {
      const p = pt.ev.payload || {};
      const targetArt = this.artifactsById.get(p.target) || this.artifactsById.get(p.parent);
      const targetOwner = targetArt?.owner;
      if (targetOwner && targetOwner !== pt.actorId && laneY.has(targetOwner)) {
        const ty = laneY.get(targetOwner);
        const cat = this._categoryOf(pt.ev);
        const color = CAT_COLORS[cat] || "#38bdf8";
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.quadraticCurveTo(pt.x - 18, (pt.y + ty) * 0.5, pt.x, ty);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Draw crisp event glyphs
    this.hitTargets = [];
    for (const pt of positions) {
      const cat = this._categoryOf(pt.ev);
      const color = CAT_COLORS[cat] || "#cbd5e1";
      const isHovered = this.hovered?.data === pt.ev;

      // Fresh arrival sonar ring
      if (pt.ev._born) {
        const age = (now - pt.ev._born) / 1800;
        if (age < 1) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4 + age * 18, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 1 - age;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = isHovered ? 1.8 : 1.2;

      if (cat === "script") {
        ctx.fillRect(pt.x - 3.5, pt.y - 3.5, 7, 7);
      } else if (cat === "governance") {
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - 5);
        ctx.lineTo(pt.x + 4.8, pt.y + 4);
        ctx.lineTo(pt.x - 4.8, pt.y + 4);
        ctx.closePath();
        ctx.fill();
      } else if (cat === "speech") {
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - 4.8);
        ctx.lineTo(pt.x + 4.8, pt.y);
        ctx.lineTo(pt.x, pt.y + 4.8);
        ctx.lineTo(pt.x - 4.8, pt.y);
        ctx.closePath();
        ctx.fill();
      } else if (cat === "artifact") {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isHovered) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      this.hitTargets.push({
        kind: "event",
        x: pt.x,
        y: pt.y,
        data: pt.ev,
        label: `t${String(pt.ev.tick ?? 0).padStart(4, "0")} · ${this.actorLabel(pt.ev.actor)} · ${pt.ev.type}`,
      });
    }

    ctx.restore();

    // Bottom legend
    const legend = [
      ["WASM / Trigger", CAT_COLORS.script],
      ["Artifact", CAT_COLORS.artifact],
      ["Speech / Mail", CAT_COLORS.speech],
      ["Governance", CAT_COLORS.governance],
      ["Spatial", CAT_COLORS.spatial],
    ];
    let lx = LANE_LEFT + 12;
    ctx.font = "500 9.5px 'IBM Plex Mono', monospace";
    for (const [text, col] of legend) {
      ctx.fillStyle = col;
      ctx.fillRect(lx, this.height - 15, 6, 6);
      ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
      ctx.fillText(text, lx + 10, this.height - 9);
      lx += ctx.measureText(text).width + 26;
    }

    ctx.restore();
  }
}
