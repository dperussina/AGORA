/**
 * Lean Animated Experiment Timeline Visualizer for Agora (High-DPI 2D Canvas, 60 FPS).
 * Plots multi-agent activity across horizontal swimlanes (one per citizen + ARBITER)
 * over tick time, with:
 * - Real-time SSE live edge with glowing pulsing playhead & smooth conveyor slide-in
 * - Glowing particle bursts & double sonar shockwaves on live/replayed events
 * - Luminous traveling signal packets along cross-lane interaction arcs
 * - Breathing online presence indicators & active-lane highlight flashes
 * - Built-in chronological Replay mode (Play / Pause / 1x / 2x / 4x)
 * - Hover inspection, click-to-open Reading Room, drag-to-scrub, and zoom
 */

const LANE_LEFT = 160;
const TOP_PAD = 36;
const BOT_PAD = 28;

const CAT_COLORS = {
  script: "#34d399",
  artifact: "#38bdf8",
  speech: "#ff6b4a",
  governance: "#fbbf24",
  spatial: "#94a3b8",
  other: "#cbd5e1",
};

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class ExperimentTimeline {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.actorLabel = opts.actorLabel || ((id) => id);
    this.onSelectEvent = opts.onSelectEvent || (() => {});
    this.onSelectActor = opts.onSelectActor || (() => {});
    this.onHover = opts.onHover || (() => {});
    this.onStateChange = opts.onStateChange || (() => {});

    this.events = []; // oldest -> newest
    this.pinnedLanes = []; // stable lane order so agents never jump rows when replying
    this.artifactsById = new Map();
    this.onlineIds = new Set();
    this.hitTargets = [];
    this.laneHits = [];
    this.hovered = null;

    // Animation state
    this.particles = [];
    this.arcBursts = [];
    this.laneFlashes = new Map(); // actorId -> { born, color }
    this.slideOffset = 0; // smooth conveyor glide when a new event enters

    // Replay state
    this.replaying = false;
    this.replayCount = 0; // how many events are revealed during replay
    this.replaySpeed = 1; // 1, 2, 4
    this.replayAccum = 0;
    this.lastFrameTime = performance.now();

    // Viewport state in event-index space
    this.pxPerEvent = 24;
    this.scrollOffset = 0; // 0 = pinned to live/replay right edge
    this.followLive = true;

    this.dragging = false;
    this.dragMoved = false;
    this.lastX = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 960;
    this.height = 460;
    this.rafId = null;
    this.running = false;
    this.visible = true;

    this._bindEvents();
    this._resize();
    this.start();
  }

  setOnlineIds(ids = []) {
    this.onlineIds = new Set(ids);
  }

  setData(events, artifacts = []) {
    this.events = [...events]
      .filter((e) => e && e.type && !e.type.startsWith("effect.") && !e.type.startsWith("credential.") && e.type !== "tick.boundary")
      .reverse();
    this.artifactsById = new Map(artifacts.map((a) => [a.id, a]));
    // Lock initial swimlanes in stable order (ARBITER first, then alphabetical by label) so agents never jump rows
    const seen = new Set(this.pinnedLanes);
    const newlyFound = [];
    for (const ev of this.events) {
      const id = this._actorIdOf(ev.actor);
      if (!seen.has(id)) {
        seen.add(id);
        newlyFound.push(id);
      }
    }
    newlyFound.sort((a, b) => {
      if (a === "ARBITER") return -1;
      if (b === "ARBITER") return 1;
      return String(this.actorLabel(a)).localeCompare(String(this.actorLabel(b)));
    });
    for (const id of newlyFound) {
      if (id === "ARBITER") this.pinnedLanes.unshift(id);
      else this.pinnedLanes.push(id);
    }
    if (!this.replaying && this.followLive) this.scrollOffset = 0;
    if (this.replaying && this.replayCount > this.events.length) {
      this.replayCount = this.events.length;
    }
  }

  pushLiveEvent(ev) {
    if (!ev || !ev.type || ev.type.startsWith("effect.") || ev.type.startsWith("credential.") || ev.type === "tick.boundary") {
      return;
    }
    const actorId = this._actorIdOf(ev.actor);
    if (!this.pinnedLanes.includes(actorId)) {
      if (actorId === "ARBITER") this.pinnedLanes.unshift(actorId);
      else this.pinnedLanes.push(actorId);
    }
    const now = performance.now();
    const stamped = { ...ev, _born: now };
    this.events.push(stamped);
    if (this.events.length > 260) {
      this.events.shift();
      if (this.replaying && this.replayCount > 1) this.replayCount -= 1;
    }
    if (!this.replaying) {
      if (this.followLive) {
        this.scrollOffset = 0;
        this.slideOffset = Math.min(this.pxPerEvent * 2.5, this.slideOffset + this.pxPerEvent);
      }
      this._triggerEventFx(stamped, now);
    }
  }

  toggleReplay() {
    if (this.replaying) {
      this.stopReplay();
    } else {
      this.startReplay();
    }
  }

  startReplay() {
    if (this.events.length === 0) return;
    this.replaying = true;
    this.replayCount = 1;
    this.replayAccum = 0;
    this.followLive = true;
    this.scrollOffset = 0;
    this.slideOffset = this.pxPerEvent;
    this.particles = [];
    this.arcBursts = [];
    const now = performance.now();
    const first = this.events[0];
    if (first) {
      first._born = now;
      this._triggerEventFx(first, now);
    }
    this._emitState();
  }

  stopReplay() {
    if (!this.replaying) return;
    this.replaying = false;
    this.followLive = true;
    this.scrollOffset = 0;
    this._emitState();
  }

  cycleSpeed() {
    this.replaySpeed = this.replaySpeed === 1 ? 2 : this.replaySpeed === 2 ? 4 : 1;
    this._emitState();
  }

  snapLive() {
    this.replaying = false;
    this.followLive = true;
    this.scrollOffset = 0;
    this._emitState();
  }

  zoomBy(factor) {
    this.pxPerEvent = Math.max(10, Math.min(64, this.pxPerEvent * factor));
  }

  _emitState() {
    const active = this.replaying ? this.events[Math.max(0, this.replayCount - 1)] : this.events[this.events.length - 1];
    this.onStateChange({
      replaying: this.replaying,
      speed: this.replaySpeed,
      followLive: this.followLive,
      replayCount: this.replayCount,
      total: this.events.length,
      currentEvent: active || null,
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;
      this._step(now, dt);
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

  _triggerEventFx(ev, now) {
    const actorId = this._actorIdOf(ev.actor);
    const cat = this._categoryOf(ev);
    const color = CAT_COLORS[cat] || "#cbd5e1";

    this.laneFlashes.set(actorId, { born: now, color });

    // Queue burst to be anchored at the live/replay right edge in the next layout pass
    const count = cat === "governance" || cat === "script" ? 16 : 11;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const speed = 26 + Math.random() * 68;
      this.particles.push({
        actorId,
        dx: 0,
        dy: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.4 + Math.random() * 2.2,
        color,
        born: now,
        life: 620 + Math.random() * 480,
      });
    }
    if (this.particles.length > 240) {
      this.particles.splice(0, this.particles.length - 240);
    }

    // If cross-lane interaction, launch a high-energy arc burst packet
    const p = ev.payload || {};
    const targetArt = this.artifactsById.get(p.target) || this.artifactsById.get(p.parent);
    const targetOwner = targetArt?.owner;
    if (targetOwner && targetOwner !== actorId) {
      this.arcBursts.push({
        fromActor: actorId,
        toActor: targetOwner,
        color,
        born: now,
        duration: 780,
      });
      this.laneFlashes.set(targetOwner, { born: now + 260, color });
    }
  }

  _step(now, dt) {
    // Smooth conveyor glide easing
    if (Math.abs(this.slideOffset) > 0.15) {
      this.slideOffset *= Math.pow(0.06, dt);
    } else {
      this.slideOffset = 0;
    }

    // Advance replay playback
    if (this.replaying && this.events.length > 0) {
      const eventsPerSec = 3.2 * this.replaySpeed;
      this.replayAccum += dt * eventsPerSec;
      while (this.replayAccum >= 1 && this.replaying) {
        this.replayAccum -= 1;
        if (this.replayCount < this.events.length) {
          const ev = this.events[this.replayCount];
          this.replayCount += 1;
          if (ev) {
            ev._born = now;
            this.slideOffset = Math.min(this.pxPerEvent * 2, this.slideOffset + this.pxPerEvent);
            this._triggerEventFx(ev, now);
          }
          this._emitState();
        } else {
          // Reached live tip -> seamlessly return to live mode
          this.replaying = false;
          this.followLive = true;
          this.scrollOffset = 0;
          this._emitState();
          break;
        }
      }
    }

    // Step particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      if (now - pt.born >= pt.life) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.dx += pt.vx * dt;
      pt.dy += pt.vy * dt;
      const drag = Math.pow(0.14, dt);
      pt.vx *= drag;
      pt.vy *= drag;
    }

    // Prune completed arc bursts
    for (let i = this.arcBursts.length - 1; i >= 0; i--) {
      if (now - this.arcBursts[i].born > this.arcBursts[i].duration) {
        this.arcBursts.splice(i, 1);
      }
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
        this.followLive = !this.replaying && this.scrollOffset < 8;
        this.lastX = e.clientX;
        return;
      }
      const hit = this._findHit(px, py);
      if (hit !== this.hovered) {
        this.hovered = hit;
        this.canvas.style.cursor = hit ? "pointer" : "grab";
        this.onHover(hit);
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
    });

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          e.preventDefault();
          this.scrollOffset = Math.max(0, this.scrollOffset - e.deltaX);
          this.followLive = !this.replaying && this.scrollOffset < 8;
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

    // Deep obsidian telemetry backdrop
    ctx.fillStyle = "#080b10";
    ctx.fillRect(0, 0, this.width, this.height);

    const visibleEvents = this.replaying ? this.events.slice(0, this.replayCount) : this.events;

    // Use locked swimlane order so agents stay anchored in their row as they act & reply
    const activeSet = new Set(this.events.map((e) => this._actorIdOf(e.actor)));
    const laneOrder = this.pinnedLanes.filter((id) => activeSet.has(id));
    if (laneOrder.length === 0) {
      ctx.font = "500 12px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "rgba(148, 163, 184, 0.72)";
      ctx.fillText("Waiting for live agent events on /listen…", 28, this.height * 0.5);
      ctx.restore();
      return;
    }
    const lanes = laneOrder.slice(0, 14);
    const plotW = Math.max(120, this.width - LANE_LEFT - 32);
    const plotH = Math.max(80, this.height - TOP_PAD - BOT_PAD);
    const laneH = plotH / lanes.length;
    const laneY = new Map(lanes.map((id, idx) => [id, TOP_PAD + laneH * (idx + 0.5)]));
    const rightEdge = this.width - 34;

    // Draw horizontal swimlane tracks + lane flash glows + presence dots
    this.laneHits = [];
    const breathe = 0.55 + 0.45 * Math.sin(now * 0.004);
    for (let i = 0; i < lanes.length; i++) {
      const id = lanes[i];
      const y = laneY.get(id);
      const name = id === "ARBITER" ? "ARBITER / SENATE" : this.actorLabel(id);
      const laneTop = TOP_PAD + i * laneH;

      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.018)";
        ctx.fillRect(0, laneTop, this.width, laneH);
      }

      // Active-lane glow flash when this actor just fired an event
      const flash = this.laneFlashes.get(id);
      if (flash && now >= flash.born) {
        const age = (now - flash.born) / 900;
        if (age < 1) {
          const alpha = (1 - age) * 0.14;
          const grad = ctx.createLinearGradient(LANE_LEFT, 0, this.width, 0);
          grad.addColorStop(0, hexToRgba(flash.color, alpha * 0.35));
          grad.addColorStop(0.8, hexToRgba(flash.color, alpha));
          grad.addColorStop(1, hexToRgba(flash.color, alpha * 1.4));
          ctx.fillStyle = grad;
          ctx.fillRect(LANE_LEFT, laneTop, this.width - LANE_LEFT, laneH);
        }
      }

      // Swimlane center rail
      ctx.strokeStyle = "rgba(226, 232, 240, 0.075)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(LANE_LEFT, y);
      ctx.lineTo(rightEdge, y);
      ctx.stroke();

      // Subtle ambient telemetry pulse gliding along active online lanes
      const isOnline = id !== "ARBITER" && this.onlineIds.has(id);
      if (isOnline) {
        const pulseX = LANE_LEFT + (((now * 0.055 + i * 97) % plotW));
        const g = ctx.createLinearGradient(pulseX - 28, y, pulseX + 4, y);
        g.addColorStop(0, "rgba(52, 211, 153, 0)");
        g.addColorStop(1, "rgba(52, 211, 153, 0.32)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(Math.max(LANE_LEFT, pulseX - 28), y);
        ctx.lineTo(Math.min(rightEdge, pulseX + 4), y);
        ctx.stroke();
      }

      // Online breathing dot in left gutter
      if (id === "ARBITER") {
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(10, y - 2.5, 5, 5);
      } else if (isOnline) {
        ctx.beginPath();
        ctx.arc(12.5, y, 2.8 + breathe * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52, 211, 153, ${0.18 * breathe})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(12.5, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#34d399";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(12.5, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(148, 163, 184, 0.32)";
        ctx.fill();
      }

      ctx.font = id === "ARBITER" ? "600 9.5px 'IBM Plex Mono', monospace" : "500 10.5px 'Instrument Sans', sans-serif";
      ctx.fillStyle = id === "ARBITER" ? "#fbbf24" : isOnline ? "#f8fafc" : "#94a3b8";
      ctx.fillText(name.slice(0, 17), 22, y + 3.5);
      this.laneHits.push({ id, name, y, h: laneH });
    }

    // Left gutter divider
    ctx.strokeStyle = "rgba(226, 232, 240, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LANE_LEFT, 0);
    ctx.lineTo(LANE_LEFT, this.height);
    ctx.stroke();

    // Clipped plot region
    ctx.save();
    ctx.beginPath();
    ctx.rect(LANE_LEFT + 1, 0, this.width - LANE_LEFT, this.height);
    ctx.clip();

    // Glowing vertical LIVE / REPLAY playhead beam on the right edge
    const beamColor = this.replaying ? "#38bdf8" : "#34d399";
    const beamGrad = ctx.createLinearGradient(rightEdge - 22, 0, rightEdge + 12, 0);
    beamGrad.addColorStop(0, "rgba(0,0,0,0)");
    beamGrad.addColorStop(0.65, hexToRgba(beamColor, 0.12 + 0.08 * breathe));
    beamGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = beamGrad;
    ctx.fillRect(rightEdge - 22, TOP_PAD - 6, 34, plotH + 10);

    ctx.strokeStyle = hexToRgba(beamColor, 0.55 + 0.35 * breathe);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rightEdge, TOP_PAD - 6);
    ctx.lineTo(rightEdge, this.height - BOT_PAD + 4);
    ctx.stroke();

    // Top-right playhead badge
    ctx.font = "600 9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = beamColor;
    const badgeText = this.replaying
      ? `REPLAY ${this.replaySpeed}× · ${this.replayCount}/${this.events.length}`
      : this.followLive
        ? "● LIVE"
        : "SCRUBBING";
    const bw = ctx.measureText(badgeText).width;
    ctx.fillText(badgeText, this.width - bw - 14, 18);

    // Compute visible event positions (with smooth conveyor slideOffset)
    const n = visibleEvents.length;
    const positions = [];
    let lastTickDrawn = -1;

    for (let i = 0; i < n; i++) {
      const ev = visibleEvents[i];
      const x = rightEdge - (n - 1 - i) * this.pxPerEvent + this.scrollOffset + this.slideOffset;
      if (x < LANE_LEFT - 40 || x > this.width + 40) continue;

      if (ev.tick !== lastTickDrawn) {
        lastTickDrawn = ev.tick;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.11)";
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(x, TOP_PAD - 8);
        ctx.lineTo(x, this.height - BOT_PAD + 4);
        ctx.stroke();

        ctx.font = "500 9px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "rgba(148, 163, 184, 0.62)";
        ctx.fillText(`t${String(ev.tick ?? 0).padStart(3, "0")}`, x - 10, TOP_PAD - 13);
      }

      const actorId = this._actorIdOf(ev.actor);
      const y = laneY.get(actorId);
      if (y !== undefined) {
        positions.push({ ev, x, y, actorId });
      }
    }

    // Draw ONLY real directed A -> B interaction arcs (DMs, coin gifts, running/forking/noting another agent's work)
    // with explicit arrowheads and receiver rings on B's lane so lines NEVER point to nowhere!
    for (let idx = 0; idx < positions.length; idx++) {
      const pt = positions[idx];
      const p = pt.ev.payload || {};
      let targetActor = null;
      let edgeTag = "";

      if (pt.ev.type === "speak" && p.private === true && Array.isArray(p.hearers) && p.hearers.length === 1) {
        targetActor = this._actorIdOf(p.hearers[0]);
        edgeTag = "DM";
      } else if (pt.ev.type === "act.give" && typeof p.target === "string") {
        const art = this.artifactsById.get(p.target);
        targetActor = art?.owner ? this._actorIdOf(art.owner) : this._actorIdOf(p.target);
        edgeTag = p.amount ? `+${p.amount}c` : "GIVE";
      } else if (pt.ev.type === "act.run" || pt.ev.type === "act.craft" || pt.ev.type === "speak.artifact") {
        const targetArt = this.artifactsById.get(p.target) || this.artifactsById.get(p.parent);
        if (targetArt?.owner) {
          targetActor = this._actorIdOf(targetArt.owner);
          edgeTag = pt.ev.type === "act.craft" ? "FORK" : pt.ev.type === "speak.artifact" ? "NOTE" : "RUN";
        }
      }

      if (targetActor && targetActor !== pt.actorId && laneY.has(targetActor)) {
        const ty = laneY.get(targetActor);
        const cat = this._categoryOf(pt.ev);
        const color = CAT_COLORS[cat] || "#38bdf8";
        const dir = ty > pt.y ? 1 : -1;
        const cpx = pt.x - Math.min(30, Math.max(14, Math.abs(ty - pt.y) * 0.18));
        const cpy = (pt.y + ty) * 0.5;

        // Directed curve from actor A to receiver B
        ctx.strokeStyle = hexToRgba(color, 0.48);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.quadraticCurveTo(cpx, cpy, pt.x, ty - dir * 5.5);
        ctx.stroke();

        // Crisp receiver ring + arrowhead on B's lane
        ctx.beginPath();
        ctx.arc(pt.x, ty, 3.6, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(color, 0.85);
        ctx.lineWidth = 1.1;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(pt.x, ty - dir * 4);
        ctx.lineTo(pt.x - 3.2, ty - dir * 9.5);
        ctx.lineTo(pt.x + 3.2, ty - dir * 9.5);
        ctx.closePath();
        ctx.fill();

        // Traveling signal packet along A -> B
        const t = ((now * 0.0006 + idx * 0.23) % 1);
        const inv = 1 - t;
        const bx = inv * inv * pt.x + 2 * inv * t * cpx + t * t * pt.x;
        const by = inv * inv * pt.y + 2 * inv * t * cpy + t * t * ty;

        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.3);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        // Tiny action tag when zoomed in enough
        if (edgeTag && this.pxPerEvent >= 22) {
          ctx.font = "600 8px 'IBM Plex Mono', monospace";
          ctx.fillStyle = hexToRgba(color, 0.9);
          ctx.fillText(edgeTag, cpx - 6, cpy + 3);
        }
      }
    }

    // High-energy live/replay arc burst packets
    for (const burst of this.arcBursts) {
      const fy = laneY.get(burst.fromActor);
      const ty = laneY.get(burst.toActor);
      if (fy === undefined || ty === undefined) continue;
      const t = Math.min(1, (now - burst.born) / burst.duration);
      const cpx = rightEdge - 36;
      const cpy = (fy + ty) * 0.5;
      const inv = 1 - t;
      const bx = inv * inv * rightEdge + 2 * inv * t * cpx + t * t * rightEdge;
      const by = inv * inv * fy + 2 * inv * t * cpy + t * t * ty;

      ctx.beginPath();
      ctx.arc(bx, by, 9 * (1 - t * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(burst.color, 0.45 * (1 - t));
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    // Draw glowing event glyphs + double sonar shockwaves
    this.hitTargets = [];
    for (const pt of positions) {
      const cat = this._categoryOf(pt.ev);
      const color = CAT_COLORS[cat] || "#cbd5e1";
      const isHovered = this.hovered?.data === pt.ev;

      // Ambient radial glow behind each node
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isHovered ? 11 : 7.5, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(color, isHovered ? 0.32 : 0.14);
      ctx.fill();

      // Fresh arrival double sonar shockwave
      if (pt.ev._born) {
        const age = (now - pt.ev._born) / 1600;
        if (age >= 0 && age < 1) {
          const ease = 1 - Math.pow(1 - age, 3);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4 + ease * 24, 0, Math.PI * 2);
          ctx.strokeStyle = hexToRgba(color, (1 - age) * 0.85);
          ctx.lineWidth = 1.4;
          ctx.stroke();

          if (age > 0.15) {
            const age2 = (age - 0.15) / 0.85;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3 + age2 * 14, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba("#ffffff", (1 - age2) * 0.45);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = isHovered ? 1.9 : 1.25;

      if (cat === "script") {
        ctx.fillRect(pt.x - 3.6, pt.y - 3.6, 7.2, 7.2);
      } else if (cat === "governance") {
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - 5.2);
        ctx.lineTo(pt.x + 5, pt.y + 4.2);
        ctx.lineTo(pt.x - 5, pt.y + 4.2);
        ctx.closePath();
        ctx.fill();
      } else if (cat === "speech") {
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - 5);
        ctx.lineTo(pt.x + 5, pt.y);
        ctx.lineTo(pt.x, pt.y + 5);
        ctx.lineTo(pt.x - 5, pt.y);
        ctx.closePath();
        ctx.fill();
      } else if (cat === "artifact") {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.7, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isHovered) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8.5, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.1;
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

    // Draw glowing particle bursts
    for (const pt of this.particles) {
      const originY = laneY.get(pt.actorId);
      if (originY === undefined) continue;
      const age = (now - pt.born) / pt.life;
      if (age < 0 || age >= 1) continue;
      const alpha = 1 - age;
      const px = rightEdge + this.slideOffset + pt.dx;
      const py = originY + pt.dy;

      // Soft outer glow
      ctx.beginPath();
      ctx.arc(px, py, pt.size * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(pt.color, alpha * 0.28);
      ctx.fill();

      // Hot core spark
      ctx.beginPath();
      ctx.arc(px, py, pt.size * (0.6 + 0.4 * alpha), 0, Math.PI * 2);
      ctx.fillStyle = alpha > 0.55 ? "#ffffff" : hexToRgba(pt.color, alpha);
      ctx.fill();
    }

    ctx.restore();

    // Replay progress bar along the bottom track
    if (this.replaying && this.events.length > 0) {
      const pct = this.replayCount / this.events.length;
      ctx.fillStyle = "rgba(56, 189, 248, 0.16)";
      ctx.fillRect(LANE_LEFT, this.height - 3, this.width - LANE_LEFT, 3);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(LANE_LEFT, this.height - 3, (this.width - LANE_LEFT) * pct, 3);
    }

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
      ctx.fillRect(lx, this.height - 16, 6, 6);
      ctx.fillStyle = "rgba(148, 163, 184, 0.82)";
      ctx.fillText(text, lx + 10, this.height - 10);
      lx += ctx.measureText(text).width + 26;
    }

    ctx.restore();
  }
}
