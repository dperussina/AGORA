/**
 * Mega-Polished Cozy Isometric Continent Visualizer for Agora (60 FPS, High-DPI 2D Canvas).
 * Chibi Bot-Creatures × Storybook RTS Continent:
 * - Multi-layered 2.5D island terrain with animated ocean surf, cobblestone roads between named hubs,
 *   wind-swaying trees, wildflower clusters, ambient fireflies, and drifting cloud shadows
 * - Hand-crafted isometric buildings: Golden Treasure Chests (with coin badges & star glints),
 *   Crystal Mini-Labs (faceted levitating prisms + spinning script-execution rune circles),
 *   and Cozy Timber Cottages (glowing mullioned windows & chimney smoke puffs)
 * - Glossy 3D-shaded chibi bot-creatures with dual-catchlight blinking eyes, rosy cheeks,
 *   signature faction outfits (flower crowns, brass goggles, wizard hats + floating mini-books,
 *   Grokbot signal antennae, leaf sprouts), sleepy floating "z z" when idle, and happy ^ ^ jumps!
 */

function hash2(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function drawFourPointStar(ctx, x, y, r, color, alpha = 1) {
  const rad = Math.max(0.5, r);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.quadraticCurveTo(x, y, x, y + rad);
  ctx.quadraticCurveTo(x, y, x - rad, y);
  ctx.quadraticCurveTo(x, y, x, y - rad);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function critterStyle(name) {
  const s = String(name || "").toLowerCase();
  if (s.includes("orchid")) {
    return {
      top: "#e9d5ff",
      body: "#c084fc",
      shade: "#9333ea",
      belly: "#faf5ff",
      ink: "#4c1d95",
      accent: "#f472b6",
      hat: "flower",
    };
  }
  if (s.includes("basalt")) {
    return {
      top: "#fed7aa",
      body: "#fb923c",
      shade: "#ea580c",
      belly: "#fff7ed",
      ink: "#7c2d12",
      accent: "#fbbf24",
      hat: "goggles",
    };
  }
  if (s.includes("archivist") || s.includes("chronicler")) {
    return {
      top: "#a7f3d0",
      body: "#34d399",
      shade: "#059669",
      belly: "#ecfdf5",
      ink: "#064e3b",
      accent: "#fde047",
      hat: "wizard",
    };
  }
  if (s.includes("grok")) {
    return {
      top: "#bae6fd",
      body: "#38bdf8",
      shade: "#0284c7",
      belly: "#f0f9ff",
      ink: "#0c4a6e",
      accent: "#22d3ee",
      hat: "antenna",
    };
  }
  if (s.includes("architect") || s.includes("cartographer")) {
    return {
      top: "#fef08a",
      body: "#facc15",
      shade: "#ca8a04",
      belly: "#fefce8",
      ink: "#713f12",
      accent: "#4ade80",
      hat: "sprout",
    };
  }
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const styles = [
    { top: "#fbcfe8", body: "#f472b6", shade: "#db2777", belly: "#fdf2f8", ink: "#831843", accent: "#fde047", hat: "ears" },
    { top: "#bfdbfe", body: "#60a5fa", shade: "#2563eb", belly: "#eff6ff", ink: "#1e3a8a", accent: "#34d399", hat: "antenna" },
    { top: "#bbf7d0", body: "#4ade80", shade: "#16a34a", belly: "#f0fdf4", ink: "#14532d", accent: "#f472b6", hat: "sprout" },
    { top: "#fecaca", body: "#f87171", shade: "#dc2626", belly: "#fef2f2", ink: "#7f1d1d", accent: "#fbbf24", hat: "flower" },
  ];
  return styles[h % styles.length];
}

export class ContinentView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.actorLabel = opts.actorLabel || ((id) => id);
    this.onSelect = opts.onSelect || (() => {});
    this.onHover = opts.onHover || (() => {});

    this.anchors = [];
    this.artifacts = [];
    this.agents = [];
    this.drifts = [];
    this.onlineIds = new Set();

    // Smooth unit positions & animations
    this.unitPos = new Map();
    this.bubbles = new Map();
    this.bolts = [];
    this.runRings = [];
    this.sparkles = [];
    this.floaters = [];
    this.ripples = [];

    // Ambient floating fireflies across the island
    this.fireflies = Array.from({ length: 22 }, (_, i) => ({
      wx: 10 + hash2(i, 7) * 44,
      wy: 10 + hash2(i, 19) * 44,
      phase: hash2(i, 31) * Math.PI * 2,
      speed: 0.4 + hash2(i, 43) * 0.7,
    }));

    this.camX = 0;
    this.camY = 0;
    this.zoom = 1.12;
    this.targetCamX = 0;
    this.targetCamY = 0;
    this.targetZoom = 1.12;
    this.showLabels = true;

    this.dragging = false;
    this.dragMoved = false;
    this.lastX = 0;
    this.lastY = 0;
    this.hitTargets = [];
    this.hovered = null;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 960;
    this.height = 480;
    this.rafId = null;
    this.running = false;
    this.visible = true;
    this.lastFrame = performance.now();

    this.terrain = this._buildTerrain();
    this._bindEvents();
    this._resize();
    this.start();
  }

  _buildTerrain() {
    const N = 32;
    const raw = [];
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        const nx = (gx / (N - 1)) * 2 - 1;
        const ny = (gy / (N - 1)) * 2 - 1;
        const distEdge = Math.hypot(nx * 0.94, ny * 0.94);
        const fbm =
          smoothNoise(gx * 0.14 + 3.1, gy * 0.14 + 1.7) * 0.58 +
          smoothNoise(gx * 0.28 + 11.4, gy * 0.28 + 7.2) * 0.3 +
          smoothNoise(gx * 0.55 + 2.3, gy * 0.55 + 5.9) * 0.12;
        const elev = fbm - distEdge * 0.5 + 0.25;
        raw.push({ gx, gy, wx: gx * 2 + 1, wy: gy * 2 + 1, elev });
      }
    }
    const at = (gx, gy) => (gx < 0 || gy < 0 || gx >= N || gy >= N ? 0 : raw[gy * N + gx].elev);
    return raw.map((c) => {
      const isLand = c.elev > 0.16;
      const isCoast =
        isLand && (at(c.gx - 1, c.gy) <= 0.16 || at(c.gx + 1, c.gy) <= 0.16 || at(c.gx, c.gy - 1) <= 0.16 || at(c.gx, c.gy + 1) <= 0.16);
      const propSeed = hash2(c.gx + 19, c.gy + 47);
      let prop = null;
      if (isLand && !isCoast && c.elev > 0.23 && c.elev < 0.55) {
        if (propSeed > 0.86) prop = propSeed > 0.93 ? "pine" : "oak";
        else if (propSeed > 0.72) prop = "flower";
        else if (propSeed < 0.05) prop = "rock";
      }
      return { ...c, isLand, isCoast, prop, propSeed };
    });
  }

  setWorldData({ anchors, artifacts, agents, drifts, onlineIds }) {
    if (anchors) this.anchors = anchors;
    if (artifacts) this.artifacts = artifacts;
    if (drifts) this.drifts = drifts;
    if (onlineIds) this.onlineIds = new Set(onlineIds);
    if (agents) {
      this.agents = agents;
      for (const a of agents) {
        const tx = Number(a.position?.x ?? 32);
        const ty = Number(a.position?.y ?? 32);
        const cur = this.unitPos.get(a.id);
        if (!cur) {
          this.unitPos.set(a.id, { x: tx, y: ty, tx, ty, moving: false, celebrateUntil: 0, facing: 1 });
        } else {
          if (Math.abs(tx - cur.tx) > 0.1) cur.facing = tx >= cur.tx ? 1 : -1;
          cur.tx = tx;
          cur.ty = ty;
        }
      }
    }
  }

  _spawnSparkles(wx, wy, color, count = 14) {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = 16 + Math.random() * 30;
      this.sparkles.push({
        wx,
        wy,
        dx: 0,
        dy: -10,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd * 0.5 - 24 - Math.random() * 20,
        color,
        size: 1.8 + Math.random() * 2.4,
        born: now,
        life: 900 + Math.random() * 550,
      });
    }
    if (this.sparkles.length > 240) this.sparkles.splice(0, this.sparkles.length - 240);
  }

  triggerEvent(ev) {
    if (!ev || !ev.type) return;
    const now = performance.now();
    const p = ev.payload || {};
    const actorId = String(ev.actor || "").replace(/^identity:/, "");
    const pos = this.unitPos.get(actorId);

    if (ev.type === "speak" && p.text && !p.private && pos) {
      this.bubbles.set(actorId, { text: String(p.text).slice(0, 74), born: now, duration: 7800 });
      this.ripples.push({ x: pos.x, y: pos.y, color: "#ff8ba7", born: now, duration: 1500 });
      pos.celebrateUntil = now + 950;
    } else if (ev.type === "speak" && p.private && pos && Array.isArray(p.hearers) && p.hearers[0]) {
      const targetPos = this.unitPos.get(p.hearers[0]);
      if (targetPos) {
        this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: targetPos.x, toY: targetPos.y, color: "#f472b6", kind: "mail", born: now, duration: 1350 });
      }
    } else if (ev.type === "act.craft" && typeof p.x === "number") {
      this.ripples.push({ x: p.x, y: p.y, color: "#38bdf8", born: now, duration: 1800 });
      this._spawnSparkles(p.x, p.y, "#fde047", 16);
      this.floaters.push({ x: p.x, y: p.y, text: `✦ Built ${String(p.name || p.kind || "item").slice(0, 16)}`, color: "#fde047", born: now, duration: 2900 });
      if (pos) pos.celebrateUntil = now + 1500;
    } else if (ev.type === "act.run") {
      const targetArt = this.artifacts.find((a) => a.id === p.target);
      const isWasm = p.sandbox === "quickjs-wasm" || p.scheduled || p.reactive;
      const fxCol = isWasm ? "#34d399" : "#38bdf8";
      if (targetArt?.position) {
        this.runRings.push({ x: targetArt.position.x, y: targetArt.position.y, color: fxCol, born: now, duration: 2200 });
        this._spawnSparkles(targetArt.position.x, targetArt.position.y, fxCol, 16);
        if (pos) {
          this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: targetArt.position.x, toY: targetArt.position.y, color: fxCol, kind: "script", born: now, duration: 950 });
          pos.celebrateUntil = now + 1300;
        }
      } else if (pos) {
        this.runRings.push({ x: pos.x, y: pos.y, color: fxCol, born: now, duration: 1900 });
        this._spawnSparkles(pos.x, pos.y, fxCol, 12);
        pos.celebrateUntil = now + 1200;
      }
      if (p.payoutReceived > 0 && pos) {
        this._spawnSparkles(pos.x, pos.y, "#fbbf24", 14);
        this.floaters.push({ x: pos.x, y: pos.y, text: `★ +${p.payoutReceived} coin!`, color: "#fde047", born: now, duration: 2900 });
      }
    } else if (ev.type === "act.give" && p.amount > 0 && pos) {
      const targetArt = this.artifacts.find((a) => a.id === p.target);
      const targetUnit = this.unitPos.get(p.target);
      const dest = targetArt?.position || targetUnit;
      if (dest) {
        this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: dest.x, toY: dest.y, color: "#fbbf24", kind: "coin", born: now, duration: 1100 });
        this.floaters.push({ x: dest.x, y: dest.y, text: `+${p.amount}c`, color: "#fde047", born: now, duration: 2500 });
      }
    } else if (ev.type === "amendment.applied") {
      this._spawnSparkles(32, 32, "#fbbf24", 22);
      this.floaters.push({ x: 32, y: 32, text: `★ LAW RATIFIED: Bill #${p.proposalId} ★`, color: "#fde047", born: now, duration: 4000 });
    }
  }

  focusActive() {
    const pts = [];
    for (const a of this.agents) {
      if (this.onlineIds.has(a.id) && a.position) pts.push({ x: a.position.x, y: a.position.y });
    }
    if (pts.length === 0) {
      for (const a of this.anchors) {
        if (a.name && a.centre) pts.push({ x: a.centre.x, y: a.centre.y });
      }
    }
    if (pts.length === 0) {
      this.resetView();
      return;
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const iso = this._worldToIsoRaw(cx, cy);
    this.targetCamX = -iso.x;
    this.targetCamY = -iso.y;
    this.targetZoom = 1.55;
  }

  focusCoord(x, y) {
    const iso = this._worldToIsoRaw(x, y);
    this.targetCamX = -iso.x;
    this.targetCamY = -iso.y;
    this.targetZoom = 1.9;
  }

  resetView() {
    this.targetCamX = 0;
    this.targetCamY = 0;
    this.targetZoom = 1.08;
  }

  zoomBy(factor) {
    this.targetZoom = Math.max(0.65, Math.min(2.8, this.targetZoom * factor));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
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

  _step(now, dt) {
    this.camX += (this.targetCamX - this.camX) * 0.14;
    this.camY += (this.targetCamY - this.camY) * 0.14;
    this.zoom += (this.targetZoom - this.zoom) * 0.14;

    for (const u of this.unitPos.values()) {
      const dx = u.tx - u.x;
      const dy = u.ty - u.y;
      if (Math.hypot(dx, dy) > 0.04) {
        u.x += dx * 0.09;
        u.y += dy * 0.09;
        u.moving = true;
      } else {
        u.x = u.tx;
        u.y = u.ty;
        u.moving = false;
      }
    }

    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const sp = this.sparkles[i];
      if (now - sp.born >= sp.life) {
        this.sparkles.splice(i, 1);
        continue;
      }
      sp.dx += sp.vx * dt;
      sp.dy += sp.vy * dt;
      sp.vy += 18 * dt;
      sp.vx *= Math.pow(0.25, dt);
    }
  }

  _worldToIsoRaw(wx, wy) {
    const dx = wx - 32;
    const dy = wy - 32;
    return {
      x: (dx - dy) * 11.5,
      y: (dx + dy) * 5.8,
    };
  }

  _project(wx, wy, elev = 0) {
    const raw = this._worldToIsoRaw(wx, wy);
    return {
      x: this.width * 0.5 + (raw.x + this.camX) * this.zoom,
      y: this.height * 0.52 + (raw.y + this.camY - elev * 22) * this.zoom,
    };
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
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (this.dragging) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        if (Math.hypot(dx, dy) > 3) this.dragMoved = true;
        this.targetCamX += dx / this.zoom;
        this.targetCamY += dy / this.zoom;
        this.camX = this.targetCamX;
        this.camY = this.targetCamY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
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
        if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
          e.preventDefault();
          this.zoomBy(e.deltaY > 0 ? 0.9 : 1.12);
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

  _findHit(px, py) {
    let best = null;
    let bestD = 22;
    for (let i = this.hitTargets.length - 1; i >= 0; i--) {
      const t = this.hitTargets[i];
      const d = Math.hypot(t.x - px, t.y - py);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  _drawDiamond(ctx, cx, cy, hw, hh, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  _render(now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Rich sunlit cerulean-to-indigo ocean
    const seaGrad = ctx.createRadialGradient(this.width * 0.48, this.height * 0.45, 50, this.width * 0.5, this.height * 0.5, this.width * 0.78);
    seaGrad.addColorStop(0, "#154c70");
    seaGrad.addColorStop(0.55, "#0d314d");
    seaGrad.addColorStop(1, "#071829");
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Animated shimmering ocean ripples
    ctx.strokeStyle = "rgba(186, 230, 253, 0.13)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 22; i++) {
      const wx = ((i * 97 + now * 0.015) % (this.width + 80)) - 40;
      const wy = (i * 49) % this.height;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 12, wy - 2.6, wx + 24, wy);
      ctx.stroke();
    }

    const hw = 23.4 * this.zoom;
    const hh = 11.8 * this.zoom;
    const surfPulse = 0.5 + 0.5 * Math.sin(now * 0.0028);

    // 1. Render 2.5D isometric continent terrain with shoreline foam & layered flora
    for (const cell of this.terrain) {
      const p = this._project(cell.wx, cell.wy, cell.isLand ? Math.max(0, (cell.elev - 0.16) * 0.9) : 0);
      if (p.x < -hw * 2.5 || p.x > this.width + hw * 2.5 || p.y < -hh * 3.5 || p.y > this.height + hh * 3.5) continue;

      if (!cell.isLand) {
        if (cell.elev > 0.06) {
          // Turquoise coastal shoal
          this._drawDiamond(ctx, p.x, p.y, hw * 1.04, hh * 1.04, "rgba(56, 189, 248, 0.22)", null);
        }
        continue;
      }

      // Animated white sea-foam halo under coastal tiles
      if (cell.isCoast) {
        const fScale = 1.07 + surfPulse * 0.05;
        this._drawDiamond(ctx, p.x, p.y + 3 * this.zoom, hw * fScale, hh * fScale, `rgba(224, 242, 254, ${0.18 + surfPulse * 0.14})`, null);
      }

      // Sunlit left cliff face + cool shaded right cliff face
      const cliffH = Math.max(4, (cell.elev - 0.14) * 20) * this.zoom;
      ctx.fillStyle = cell.elev < 0.22 ? "#8c744c" : "#3a564f";
      ctx.beginPath();
      ctx.moveTo(p.x - hw, p.y);
      ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh + cliffH);
      ctx.lineTo(p.x - hw, p.y + cliffH);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cell.elev < 0.22 ? "#635136" : "#223633";
      ctx.beginPath();
      ctx.moveTo(p.x + hw, p.y);
      ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh + cliffH);
      ctx.lineTo(p.x + hw, p.y + cliffH);
      ctx.closePath();
      ctx.fill();

      // Rich biome top colors
      let topColor = "#3f875e"; // sunlit clover meadow
      if (cell.elev < 0.21) topColor = "#d9be82"; // warm sandy beach
      else if (cell.elev > 0.58) topColor = "#8b9aa6"; // snow-dusted mountain peak
      else if (cell.elev > 0.46) topColor = "#326e52"; // highland forest
      else if (cell.propSeed > 0.5) topColor = "#479367"; // subtle grass variety
      this._drawDiamond(ctx, p.x, p.y, hw, hh, topColor, "rgba(255,255,255,0.045)");

      // Snowcap accent on high peaks
      if (cell.elev > 0.6) {
        this._drawDiamond(ctx, p.x, p.y - 0.5 * this.zoom, hw * 0.52, hh * 0.52, "rgba(248, 250, 252, 0.72)", null);
      }

      // Lush animated trees, wildflowers & mossy rocks
      const z = this.zoom;
      if (cell.prop === "oak" || cell.prop === "pine") {
        const sway = Math.sin(now * 0.002 + cell.gx * 0.7) * 1.1 * z;
        // Ground shadow
        ctx.beginPath();
        ctx.ellipse(p.x + 2 * z, p.y + 1 * z, 5 * z, 2.5 * z, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fill();
        // Trunk
        ctx.fillStyle = "#7c4a24";
        ctx.fillRect(p.x - 1.2 * z, p.y - 4 * z, 2.4 * z, 5 * z);
        if (cell.prop === "pine") {
          ctx.fillStyle = "#1b4d38";
          ctx.beginPath();
          ctx.moveTo(p.x + sway, p.y - 14 * z);
          ctx.lineTo(p.x + 5.5 * z, p.y - 4 * z);
          ctx.lineTo(p.x - 5.5 * z, p.y - 4 * z);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#2d7a56";
          ctx.beginPath();
          ctx.moveTo(p.x + sway, p.y - 14 * z);
          ctx.lineTo(p.x + 3.8 * z, p.y - 7.5 * z);
          ctx.lineTo(p.x - 4.2 * z, p.y - 7.5 * z);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = "#215c3e";
          ctx.beginPath();
          ctx.arc(p.x + sway * 0.8, p.y - 7.5 * z, 5 * z, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#41a86d";
          ctx.beginPath();
          ctx.arc(p.x - 1.4 * z + sway, p.y - 9 * z, 3.6 * z, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (cell.prop === "flower") {
        ctx.fillStyle = cell.propSeed > 0.8 ? "#fbcfe8" : "#fef08a";
        ctx.beginPath();
        ctx.arc(p.x + 2.5 * z, p.y - 1 * z, 1.6 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#bae6fd";
        ctx.beginPath();
        ctx.arc(p.x - 3 * z, p.y + 1.2 * z, 1.4 * z, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell.prop === "rock") {
        ctx.fillStyle = "#64748b";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 0.5 * z, 3.6 * z, 2.2 * z, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath();
        ctx.ellipse(p.x - 0.8 * z, p.y - 1.2 * z, 2 * z, 1.1 * z, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Cobblestone trade roads connecting named Nexus hubs!
    const namedNexuses = this.anchors.filter((a) => a.name && a.centre);
    if (namedNexuses.length >= 2) {
      ctx.save();
      ctx.strokeStyle = "rgba(226, 206, 168, 0.35)";
      ctx.lineWidth = Math.max(2, 4.5 * this.zoom);
      ctx.setLineDash([4 * this.zoom, 5 * this.zoom]);
      ctx.lineCap = "round";
      for (let i = 0; i < namedNexuses.length - 1; i++) {
        const a = this._project(namedNexuses[i].centre.x, namedNexuses[i].centre.y, 0.25);
        const b = this._project(namedNexuses[i + 1].centre.x, namedNexuses[i + 1].centre.y, 0.25);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 - 12 * this.zoom, b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Ornate Nexus Plazas with corner braziers & Landmarks
    this.hitTargets = [];
    const breathe = 0.5 + 0.5 * Math.sin(now * 0.004);
    for (const a of this.anchors) {
      if (!a.centre) continue;
      const p = this._project(a.centre.x, a.centre.y, 0.25);
      const isNamed = Boolean(a.name);
      const r = (a.class === "nexus" ? 28 : 16) * this.zoom;

      if (a.class === "nexus") {
        // Outer stone courtyard + inner inlaid compass ring
        this._drawDiamond(ctx, p.x, p.y, r * 1.2, r * 0.6, "rgba(44, 58, 82, 0.92)", isNamed ? "#fde047" : "rgba(186,230,253,0.45)");
        this._drawDiamond(ctx, p.x, p.y, r * 0.85, r * 0.42, "rgba(63, 82, 114, 0.85)", "rgba(255,255,255,0.12)");
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 0.52, r * 0.26, 0, 0, Math.PI * 2);
        ctx.strokeStyle = isNamed ? `rgba(253, 224, 71, ${0.5 + 0.4 * breathe})` : "rgba(125, 211, 252, 0.4)";
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Warm flickering corner braziers on named hubs!
        if (isNamed) {
          const corners = [
            [p.x - r * 0.85, p.y],
            [p.x + r * 0.85, p.y],
          ];
          for (const [bx, by] of corners) {
            ctx.fillStyle = "#334155";
            ctx.fillRect(bx - 2 * this.zoom, by - 4 * this.zoom, 4 * this.zoom, 4 * this.zoom);
            const fl = 2.4 + Math.sin(now * 0.015 + bx) * 0.8;
            ctx.fillStyle = "rgba(251, 146, 60, 0.85)";
            ctx.beginPath();
            ctx.arc(bx, by - 5.5 * this.zoom, Math.max(0.5, fl * this.zoom), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fef08a";
            ctx.beginPath();
            ctx.arc(bx, by - 5.8 * this.zoom, Math.max(0.5, fl * 0.5 * this.zoom), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (a.class === "hollow") {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 0.74, r * 0.37, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
        ctx.fill();
        ctx.strokeStyle = "rgba(167, 139, 250, 0.45)";
        ctx.stroke();
      } else {
        this._drawDiamond(ctx, p.x, p.y, r * 0.68, r * 0.34, "rgba(100, 116, 139, 0.78)", "rgba(241,245,249,0.4)");
      }

      if (isNamed && this.showLabels) {
        ctx.font = `700 ${Math.max(9.5, Math.round(10.5 * this.zoom))}px 'IBM Plex Mono', monospace`;
        const tw = ctx.measureText(a.name).width;
        const bx = p.x - tw * 0.5 - 8;
        const by = p.y + r * 0.58 - 2;
        ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
        ctx.strokeStyle = "rgba(253, 224, 71, 0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + 16, 16, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fef08a";
        ctx.fillText(a.name, bx + 8, by + 11.5);
      }

      this.hitTargets.push({
        kind: "anchor",
        x: p.x,
        y: p.y,
        data: a,
        label: `${a.name || a.designation} (${a.class}) · (${a.centre.x}, ${a.centre.y}, ${a.centre.z})`,
      });
    }

    // 4. Spinning Script-Execution Magic Circles
    for (let i = this.runRings.length - 1; i >= 0; i--) {
      const rr = this.runRings[i];
      const age = (now - rr.born) / rr.duration;
      if (age >= 1) {
        this.runRings.splice(i, 1);
        continue;
      }
      const p = this._project(rr.x, rr.y, 0.25);
      const alpha = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85;
      const radX = Math.max(4, (18 + Math.sin(age * Math.PI) * 9) * this.zoom);
      const radY = radX * 0.5;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = rr.color;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -now * 0.045;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radX, radY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let k = 0; k < 4; k++) {
        const ang = now * 0.0065 + (k * Math.PI) / 2;
        drawFourPointStar(ctx, p.x + Math.cos(ang) * radX, p.y + Math.sin(ang) * radY, 4.2 * this.zoom, "#ffffff", alpha);
      }
      ctx.restore();
    }

    // 5. Depth-sort cozy buildings & glossy chibi bot-creatures
    const drawables = [];
    const coordCounts = new Map();
    for (const art of this.artifacts) {
      if (!art.position) continue;
      const key = `${art.position.x},${art.position.y}`;
      const idx = coordCounts.get(key) || 0;
      coordCounts.set(key, idx + 1);
      const angle = idx * 2.1;
      const rad = idx === 0 ? 0 : Math.min(3.5, 1.3 + Math.floor(idx / 5) * 0.95);
      drawables.push({
        sortKey: art.position.x + art.position.y + idx * 0.01,
        type: "building",
        wx: art.position.x + Math.cos(angle) * rad,
        wy: art.position.y + Math.sin(angle) * rad,
        art,
      });
    }

    const unitCounts = new Map();
    for (const ag of this.agents) {
      const u = this.unitPos.get(ag.id) || { x: ag.position?.x ?? 32, y: ag.position?.y ?? 32, moving: false, celebrateUntil: 0, facing: 1 };
      const key = `${Math.round(u.x)},${Math.round(u.y)}`;
      const idx = unitCounts.get(key) || 0;
      unitCounts.set(key, idx + 1);
      const angle = idx * 1.9 + 0.4;
      const rad = idx === 0 ? 0 : 1.25;
      drawables.push({
        sortKey: u.x + u.y + 0.14,
        type: "unit",
        wx: u.x + Math.cos(angle) * rad,
        wy: u.y + Math.sin(angle) * rad,
        ag,
        moving: u.moving,
        celebrating: now < (u.celebrateUntil || 0),
        facing: u.facing || 1,
      });
    }

    drawables.sort((a, b) => a.sortKey - b.sortKey);

    for (const item of drawables) {
      const p = this._project(item.wx, item.wy, 0.25);
      if (p.x < -80 || p.x > this.width + 80 || p.y < -80 || p.y > this.height + 80) continue;
      if (item.type === "building") this._drawBuilding(ctx, p.x, p.y, item.art, now);
      else this._drawCritter(ctx, p.x, p.y, item.ag, item.moving, item.celebrating, item.facing, now);
    }

    // 6. Cute glowing Cloud-Wisp Drifts + ambient island fireflies
    for (const d of this.drifts) {
      if (!d.position) continue;
      const p = this._project(d.position.x, d.position.y, 0.6 + 0.14 * Math.sin(now * 0.005));
      const z = this.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, 9 * z), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(186, 230, 253, 0.25)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, 4.8 * z), 0, Math.PI * 2);
      ctx.fillStyle = "#f0f9ff";
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(p.x - 2 * z, p.y - 0.8 * z, 1.2 * z, 1.5 * z);
      ctx.fillRect(p.x + 0.9 * z, p.y - 0.8 * z, 1.2 * z, 1.5 * z);
    }

    for (const ff of this.fireflies) {
      const t = now * 0.001 * ff.speed + ff.phase;
      const p = this._project(ff.wx + Math.sin(t) * 1.4, ff.wy + Math.cos(t * 0.8) * 1.4, 0.45 + Math.sin(t * 1.7) * 0.15);
      const glow = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 2.5));
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, 2.2 * this.zoom), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(254, 240, 138, ${glow * 0.65})`;
      ctx.fill();
    }

    // 7. Soft drifting cloud shadows for atmospheric depth
    for (let c = 0; c < 3; c++) {
      const cx = ((now * 0.009 + c * 390) % (this.width + 320)) - 160;
      const cy = this.height * (0.25 + c * 0.24);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 110 * this.zoom, 42 * this.zoom, -0.15, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(7, 18, 34, 0.09)";
      ctx.fill();
    }

    // 8. Ripples, Arcane Bolts / Flying Envelopes, Sparkles, Floaters & Cute Speech Bubbles
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const age = (now - r.born) / r.duration;
      if (age >= 1) {
        this.ripples.splice(i, 1);
        continue;
      }
      const p = this._project(r.x, r.y, 0.25);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.max(1, (8 + age * 40) * this.zoom), Math.max(0.5, (4 + age * 20) * this.zoom), 0, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const t = (now - b.born) / b.duration;
      if (t >= 1) {
        this.bolts.splice(i, 1);
        continue;
      }
      const p1 = this._project(b.fromX, b.fromY, 0.45);
      const p2 = this._project(b.toX, b.toY, 0.45);
      const cx = (p1.x + p2.x) * 0.5;
      const cy = Math.min(p1.y, p2.y) - 42 * this.zoom;
      const inv = 1 - t;
      const bx = inv * inv * p1.x + 2 * inv * t * cx + t * t * p2.x;
      const by = inv * inv * p1.y + 2 * inv * t * cy + t * t * p2.y;

      ctx.strokeStyle = b.color;
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (b.kind === "mail") {
        const z = this.zoom;
        ctx.fillStyle = "#fdf2f8";
        ctx.strokeStyle = "#ec4899";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.roundRect(bx - 5.5 * z, by - 3.8 * z, 11 * z, 7.6 * z, 1.5 * z);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx - 5 * z, by - 3.2 * z);
        ctx.lineTo(bx, by + 0.6 * z);
        ctx.lineTo(bx + 5 * z, by - 3.2 * z);
        ctx.stroke();
      } else {
        drawFourPointStar(ctx, bx, by, 7 * this.zoom, b.color, 0.9);
        drawFourPointStar(ctx, bx, by, 3.5 * this.zoom, "#ffffff", 1);
      }
    }

    for (const sp of this.sparkles) {
      const age = (now - sp.born) / sp.life;
      if (age < 0 || age >= 1) continue;
      const p = this._project(sp.wx, sp.wy, 0.25);
      drawFourPointStar(
        ctx,
        p.x + sp.dx * this.zoom,
        p.y + sp.dy * this.zoom,
        sp.size * 1.4 * this.zoom,
        age < 0.35 ? "#ffffff" : sp.color,
        1 - age,
      );
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      const age = (now - f.born) / f.duration;
      if (age >= 1) {
        this.floaters.splice(i, 1);
        continue;
      }
      const p = this._project(f.x, f.y, 0.65);
      ctx.font = "700 11.5px 'IBM Plex Mono', monospace";
      const tw = ctx.measureText(f.text).width;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.beginPath();
      ctx.roundRect(p.x - tw * 0.5 - 6, p.y - 30 - age * 28, tw + 12, 16, 6);
      ctx.fill();
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x - tw * 0.5, p.y - 18 - age * 28);
      ctx.restore();
    }

    // Cute rounded pastel speech bubbles with pointer tails
    for (const [id, b] of this.bubbles.entries()) {
      const age = (now - b.born) / b.duration;
      if (age >= 1) {
        this.bubbles.delete(id);
        continue;
      }
      const u = this.unitPos.get(id);
      if (!u) continue;
      const p = this._project(u.x, u.y, 0.25);
      const alpha = age > 0.82 ? (1 - age) / 0.18 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "500 10.5px 'Instrument Sans', sans-serif";
      const text = `“${b.text}”`;
      const tw = Math.min(225, ctx.measureText(text).width);
      const bx = p.x - tw * 0.5 - 10;
      const by = p.y - 50 * this.zoom - 22;
      ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
      ctx.strokeStyle = "rgba(244, 114, 182, 0.72)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 20, 23, 11);
      ctx.fill();
      ctx.stroke();
      // Little speech tail
      ctx.beginPath();
      ctx.moveTo(p.x - 4, by + 23);
      ctx.lineTo(p.x, by + 28);
      ctx.lineTo(p.x + 4, by + 23);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fdf2f8";
      ctx.fillText(text, bx + 10, by + 15, 225);
      ctx.restore();
    }

    // Subtle cinematic corner vignette
    const vig = ctx.createRadialGradient(this.width * 0.5, this.height * 0.5, this.width * 0.32, this.width * 0.5, this.height * 0.5, this.width * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(4, 10, 18, 0.42)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.width, this.height);

    // Floating glassmorphic legend pill
    const legend = [
      ["Online Critter", "#34d399"],
      ["WASM Crystal Lab", "#38bdf8"],
      ["Treasure Chest", "#fde047"],
      ["Cozy Cottage", "#f472b6"],
    ];
    ctx.fillStyle = "rgba(10, 18, 30, 0.76)";
    ctx.strokeStyle = "rgba(226, 232, 240, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(10, this.height - 26, 438, 20, 8);
    ctx.fill();
    ctx.stroke();

    let lx = 20;
    ctx.font = "500 9.5px 'IBM Plex Mono', monospace";
    for (const [label, col] of legend) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(lx + 3, this.height - 16, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(241, 245, 249, 0.9)";
      ctx.fillText(label, lx + 11, this.height - 13);
      lx += ctx.measureText(label).width + 24;
    }

    ctx.restore();
  }

  _drawBuilding(ctx, x, y, art, now) {
    const z = this.zoom;
    const kind = String(art.kind || "").toLowerCase();
    const funded = (art.currency ?? 0) > 0;
    const isHovered = this.hovered?.data?.id === art.id;

    // Ground drop shadow
    ctx.beginPath();
    ctx.ellipse(x, y + 2.5 * z, 11 * z, 5.5 * z, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
    ctx.fill();

    if (funded) {
      // Soft golden aura pool under funded treasure chest
      ctx.beginPath();
      ctx.ellipse(x, y + 1 * z, 14 * z, 7 * z, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(251, 191, 36, 0.16)";
      ctx.fill();

      // Burnished wooden chest body
      const woodGrad = ctx.createLinearGradient(x - 8 * z, y - 10 * z, x + 8 * z, y + 2 * z);
      woodGrad.addColorStop(0, "#b45309");
      woodGrad.addColorStop(1, "#78350f");
      ctx.fillStyle = woodGrad;
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - 8 * z, y - 10 * z, 16 * z, 11 * z, 3 * z);
      ctx.fill();
      ctx.stroke();

      // Arched golden lid + specular shine
      const lidGrad = ctx.createLinearGradient(x, y - 14 * z, x, y - 8 * z);
      lidGrad.addColorStop(0, "#fef08a");
      lidGrad.addColorStop(1, "#f59e0b");
      ctx.fillStyle = lidGrad;
      ctx.beginPath();
      ctx.roundRect(x - 8.6 * z, y - 13.5 * z, 17.2 * z, 5.2 * z, 3.5 * z);
      ctx.fill();
      ctx.stroke();

      // Shiny keyhole clasp
      ctx.fillStyle = "#fef9c3";
      ctx.fillRect(x - 1.8 * z, y - 9.2 * z, 3.6 * z, 4.2 * z);
      ctx.fillStyle = "#78350f";
      ctx.fillRect(x - 0.6 * z, y - 7.8 * z, 1.2 * z, 1.8 * z);

      // Twinkling 4-point gold star above chest
      const twk = 0.5 + 0.5 * Math.sin(now * 0.007 + Math.abs(x));
      drawFourPointStar(ctx, x + 7 * z, y - 16 * z - twk * 2 * z, 3.8 * z, "#fef08a", 0.55 + 0.45 * twk);

      // Crisp mini coin badge when zoomed in or hovered
      if (z >= 1.2 || isHovered) {
        const badge = `${art.currency}c`;
        ctx.font = `700 ${Math.max(8, Math.round(8.5 * z))}px 'IBM Plex Mono', monospace`;
        const bw = ctx.measureText(badge).width;
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.beginPath();
        ctx.roundRect(x - bw * 0.5 - 4, y - 25 * z, bw + 8, 12, 4);
        ctx.fill();
        ctx.fillStyle = "#fde047";
        ctx.fillText(badge, x - bw * 0.5, y - 16.5 * z);
      }
    } else if (kind === "script" || kind === "machine") {
      // Cozy Crystal Mini-Lab with shaded stone walls & levitating faceted prism!
      const bob = Math.sin(now * 0.005 + Math.abs(x)) * 2.2 * z;
      const wallGrad = ctx.createLinearGradient(x - 6 * z, y - 11 * z, x + 6 * z, y);
      wallGrad.addColorStop(0, "#475569");
      wallGrad.addColorStop(1, "#1e293b");
      ctx.fillStyle = wallGrad;
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - 6 * z, y - 11 * z, 12 * z, 12 * z, 3.5 * z);
      ctx.fill();
      ctx.stroke();

      // Warm glowing arched porthole window
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(x, y - 4.8 * z, Math.max(0.5, 2.5 * z), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      ctx.beginPath();
      ctx.arc(x - 0.7 * z, y - 5.5 * z, Math.max(0.5, 0.8 * z), 0, Math.PI * 2);
      ctx.fill();

      // Glowing cyan crystal dome roof
      const domeGrad = ctx.createRadialGradient(x - 2 * z, y - 14 * z, 1, x, y - 10 * z, 9 * z);
      domeGrad.addColorStop(0, "#bae6fd");
      domeGrad.addColorStop(0.5, "#0ea5e9");
      domeGrad.addColorStop(1, "#0369a1");
      ctx.fillStyle = domeGrad;
      ctx.beginPath();
      ctx.arc(x, y - 10.5 * z, Math.max(1, 7.6 * z), Math.PI, 0);
      ctx.closePath();
      ctx.fill();

      // Levitating faceted prism crystal + soft glow halo
      ctx.beginPath();
      ctx.arc(x, y - 19 * z + bob, Math.max(1, 6.5 * z), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
      ctx.fill();
      ctx.fillStyle = "#7dd3fc";
      ctx.beginPath();
      ctx.moveTo(x, y - 24 * z + bob);
      ctx.lineTo(x + 3.8 * z, y - 19 * z + bob);
      ctx.lineTo(x, y - 14.5 * z + bob);
      ctx.lineTo(x - 3.8 * z, y - 19 * z + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.moveTo(x, y - 24 * z + bob);
      ctx.lineTo(x, y - 14.5 * z + bob);
      ctx.lineTo(x - 3.8 * z, y - 19 * z + bob);
      ctx.closePath();
      ctx.fill();
    } else {
      // Cozy Storybook Timber Cottage with warm mullioned window & chimney smoke!
      ctx.fillStyle = "#f8fafc";
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - 6.5 * z, y - 9.5 * z, 13 * z, 10.5 * z, 2.2 * z);
      ctx.fill();
      ctx.stroke();

      // Chimney on right side
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(x + 3.2 * z, y - 16 * z, 2.8 * z, 6.5 * z);

      // Pitched berry-pink roof with eaves highlight
      const roofGrad = ctx.createLinearGradient(x, y - 17.5 * z, x, y - 8 * z);
      roofGrad.addColorStop(0, "#f472b6");
      roofGrad.addColorStop(1, "#be185d");
      ctx.fillStyle = roofGrad;
      ctx.beginPath();
      ctx.moveTo(x, y - 17.5 * z);
      ctx.lineTo(x + 8.8 * z, y - 8.8 * z);
      ctx.lineTo(x - 8.8 * z, y - 8.8 * z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cozy warm arched door + tiny lit window
      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.roundRect(x - 4.2 * z, y - 4.8 * z, 3.8 * z, 5.6 * z, 1.5 * z);
      ctx.fill();
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(x + 1.2 * z, y - 5.5 * z, 3.2 * z, 3.2 * z);

      // Soft floating chimney smoke puffs (guaranteed positive radius!)
      const puff = (((now * 0.00055 + Math.abs(x) * 0.1) % 1) + 1) % 1;
      ctx.fillStyle = `rgba(248, 250, 252, ${(1 - puff) * 0.48})`;
      ctx.beginPath();
      ctx.arc(x + 4.6 * z + Math.sin(puff * 4) * 1.5 * z, y - 17 * z - puff * 11 * z, Math.max(0.5, (1.5 + puff * 2.6) * z), 0, Math.PI * 2);
      ctx.fill();
    }

    if (isHovered) {
      ctx.beginPath();
      ctx.ellipse(x, y + 1.5 * z, 14 * z, 7 * z, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    this.hitTargets.push({
      kind: "artifact",
      x,
      y: y - 7 * z,
      data: art,
      label: `${art.name || art.id} (${art.kind}${funded ? ` · ${art.currency}c` : ""}) — Click to open in Reading Room`,
    });
  }

  _drawCritter(ctx, x, y, ag, moving, celebrating, facing, now) {
    const z = this.zoom;
    const name = this.actorLabel(ag.id);
    const st = critterStyle(name);
    const isOnline = this.onlineIds.has(ag.id);
    const isHovered = this.hovered?.data?.id === ag.id;

    // Bouncy squash-and-stretch hop!
    const hopPhase = celebrating ? now * 0.018 : moving ? now * 0.014 : now * 0.0045 + Math.abs(x) * 0.08;
    const hop = celebrating
      ? Math.abs(Math.sin(hopPhase)) * 7.5 * z
      : moving
        ? Math.abs(Math.sin(hopPhase)) * 4.8 * z
        : isOnline
          ? Math.max(0, Math.sin(hopPhase)) * 1.8 * z
          : 0;
    const stretch = celebrating || moving ? 1 + Math.sin(hopPhase * 2) * 0.075 : 1;

    // Warcraft-style glowing selection ring
    if (isOnline || isHovered) {
      ctx.beginPath();
      ctx.ellipse(x, y + 2.2 * z, 11 * z, 5.5 * z, 0, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? "rgba(255,255,255,0.16)" : "rgba(52, 211, 153, 0.16)";
      ctx.fill();
      ctx.strokeStyle = isHovered ? "#ffffff" : "#34d399";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Soft ground shadow shrinking slightly on hop
    ctx.beginPath();
    ctx.ellipse(x, y + 1.8 * z, Math.max(3, (8.2 - hop * 0.25) * z), Math.max(1.5, 3.6 * z), 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    ctx.fill();

    const cy = y - 9 * z - hop;
    const bw = (15 * z) / stretch;
    const bh = 14.2 * z * stretch;

    // Cute alternating pattering feet
    const footSwing = moving ? Math.sin(now * 0.022) * 2.4 * z : 0;
    ctx.fillStyle = st.ink;
    ctx.beginPath();
    ctx.ellipse(x - 3.6 * z, y + 0.4 * z - Math.max(0, footSwing), 2.6 * z, 1.7 * z, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 3.6 * z, y + 0.4 * z - Math.max(0, -footSwing), 2.6 * z, 1.7 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cute waving stubby arms
    const armY = celebrating ? cy - 3.5 * z : cy + 1.2 * z;
    ctx.fillStyle = st.body;
    ctx.strokeStyle = st.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - bw * 0.54, armY, Math.max(1, 2.5 * z), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + bw * 0.54, armY, Math.max(1, 2.5 * z), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glossy 3D-shaded chibi vinyl-toy body!
    const bodyGrad = ctx.createRadialGradient(x - bw * 0.2, cy - bh * 0.3, 1, x, cy, bw * 0.85);
    bodyGrad.addColorStop(0, st.top);
    bodyGrad.addColorStop(0.65, st.body);
    bodyGrad.addColorStop(1, st.shade);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = st.ink;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.roundRect(x - bw * 0.5, cy - bh * 0.55, bw, bh, 7 * z);
    ctx.fill();
    ctx.stroke();

    // Glossy forehead shine pill
    ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
    ctx.beginPath();
    ctx.ellipse(x - bw * 0.16, cy - bh * 0.38, bw * 0.18, bh * 0.08, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Soft pastel face screen / belly
    ctx.fillStyle = st.belly;
    ctx.beginPath();
    ctx.roundRect(x - bw * 0.39, cy - bh * 0.3, bw * 0.78, bh * 0.58, 4.8 * z);
    ctx.fill();

    // Expressive chibi eyes (sleeping - - when offline, happy ^ ^ when celebrating, big dual-catchlight when awake!)
    const lookX = facing * 0.45 * z;
    const blinkCycle = (now * 0.001 + (Math.abs(x) % 7)) % 4.3;
    const isBlinking = blinkCycle > 4.14;
    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#0f172a";
    ctx.lineWidth = 1.4;

    if (celebrating) {
      ctx.beginPath();
      ctx.moveTo(x - 4.4 * z, cy - 0.2 * z);
      ctx.lineTo(x - 2.8 * z, cy - 2.3 * z);
      ctx.lineTo(x - 1.2 * z, cy - 0.2 * z);
      ctx.moveTo(x + 1.2 * z, cy - 0.2 * z);
      ctx.lineTo(x + 2.8 * z, cy - 2.3 * z);
      ctx.lineTo(x + 4.4 * z, cy - 0.2 * z);
      ctx.stroke();
    } else if (!isOnline || isBlinking) {
      ctx.beginPath();
      ctx.moveTo(x - 4.1 * z, cy - 0.8 * z);
      ctx.quadraticCurveTo(x - 2.7 * z, cy - 0.1 * z, x - 1.3 * z, cy - 0.8 * z);
      ctx.moveTo(x + 1.3 * z, cy - 0.8 * z);
      ctx.quadraticCurveTo(x + 2.7 * z, cy - 0.1 * z, x + 4.1 * z, cy - 0.8 * z);
      ctx.stroke();
    } else {
      // Big glossy kawaii eyes with dual specular catchlights!
      for (const ex of [x - 2.8 * z + lookX, x + 2.8 * z + lookX]) {
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(ex, cy - 1.1 * z, Math.max(0.8, 1.85 * z), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ex - 0.55 * z, cy - 1.7 * z, Math.max(0.4, 0.7 * z), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + 0.55 * z, cy - 0.5 * z, Math.max(0.25, 0.35 * z), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Soft rosy pink cheeks
    ctx.fillStyle = "rgba(244, 114, 182, 0.62)";
    ctx.beginPath();
    ctx.ellipse(x - 4.7 * z, cy + 1 * z, 1.65 * z, 1 * z, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4.7 * z, cy + 1 * z, 1.65 * z, 1 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cute mouth (happy open smile when celebrating, tiny curved smile otherwise)
    if (celebrating) {
      ctx.fillStyle = "#f43f5e";
      ctx.beginPath();
      ctx.arc(x, cy + 0.7 * z, Math.max(0.6, 1.7 * z), 0, Math.PI);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(x, cy + 0.5 * z, Math.max(0.5, 1.6 * z), 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    // Signature Faction Hats & Accessories!
    const topY = cy - bh * 0.55;
    if (st.hat === "flower") {
      ctx.fillStyle = "#f472b6";
      for (let k = 0; k < 5; k++) {
        const ang = (k * Math.PI * 2) / 5 + now * 0.0012;
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * 2.8 * z, topY - 2 * z + Math.sin(ang) * 2 * z, Math.max(0.5, 1.9 * z), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(x, topY - 2 * z, Math.max(0.5, 1.5 * z), 0, Math.PI * 2);
      ctx.fill();
    } else if (st.hat === "wizard") {
      // Pointy emerald Archivist wizard hat + gold band + floating mini-book!
      ctx.fillStyle = "#065f46";
      ctx.strokeStyle = "#022c22";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, topY + 0.5 * z, 8.2 * z, 2.4 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 1.5 * z, topY - 10 * z);
      ctx.lineTo(x + 6 * z, topY + 0.5 * z);
      ctx.lineTo(x - 6 * z, topY + 0.5 * z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawFourPointStar(ctx, x + 1.5 * z, topY - 10.5 * z, 3.2 * z, "#fde047", 1);

      // Tiny orbiting Archivist spellbook!
      const bkY = cy - 2 * z + Math.sin(now * 0.006) * 2 * z;
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x + bw * 0.68, bkY - 2.5 * z, 4.2 * z, 5 * z);
      ctx.fillStyle = "#fef9c3";
      ctx.fillRect(x + bw * 0.68 + 0.8 * z, bkY - 1.8 * z, 2.6 * z, 3.6 * z);
    } else if (st.hat === "goggles") {
      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.roundRect(x - 5.8 * z, topY - 2.6 * z, 11.6 * z, 3.8 * z, 1.6 * z);
      ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(x - 2.5 * z, topY - 0.7 * z, Math.max(0.5, 1.7 * z), 0, Math.PI * 2);
      ctx.arc(x + 2.5 * z, topY - 0.7 * z, Math.max(0.5, 1.7 * z), 0, Math.PI * 2);
      ctx.fill();
    } else if (st.hat === "sprout") {
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, topY - 5 * z);
      ctx.stroke();
      ctx.fillStyle = "#4ade80";
      ctx.beginPath();
      ctx.ellipse(x - 2.6 * z, topY - 5.4 * z, 2.7 * z, 1.5 * z, -0.45, 0, Math.PI * 2);
      ctx.ellipse(x + 2.6 * z, topY - 5.4 * z, 2.7 * z, 1.5 * z, 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (st.hat === "ears") {
      ctx.fillStyle = st.body;
      ctx.strokeStyle = st.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x - 4 * z, topY - 2.5 * z, 2 * z, 4.2 * z, -0.25, 0, Math.PI * 2);
      ctx.ellipse(x + 4 * z, topY - 2.5 * z, 2 * z, 4.2 * z, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Classic springy glowing Grokbot antenna!
      const sway = Math.sin(now * 0.008 + Math.abs(x)) * 2 * z;
      ctx.strokeStyle = st.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.quadraticCurveTo(x + sway * 0.5, topY - 3 * z, x + sway, topY - 6.5 * z);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + sway, topY - 7 * z, Math.max(0.8, 3.6 * z), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34, 211, 238, 0.35)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + sway, topY - 7 * z, Math.max(0.5, 2.2 * z), 0, Math.PI * 2);
      ctx.fillStyle = st.accent;
      ctx.fill();
    }

    // Cute floating "z z" when idle/offline!
    if (!isOnline && z >= 0.9) {
      const zp = (((now * 0.0007 + Math.abs(x) * 0.05) % 1) + 1) % 1;
      ctx.save();
      ctx.globalAlpha = (1 - zp) * 0.7;
      ctx.font = `700 ${Math.max(8, Math.round(9 * z))}px 'IBM Plex Mono', monospace`;
      ctx.fillStyle = "#bae6fd";
      ctx.fillText("z", x + 8 * z + zp * 4 * z, topY - 4 * z - zp * 11 * z);
      ctx.restore();
    }

    // Crisp floating nameplate pill
    if ((this.showLabels && isOnline) || isHovered) {
      ctx.font = `600 ${Math.max(8.5, Math.round(9.5 * z))}px 'Instrument Sans', sans-serif`;
      const tw = ctx.measureText(name).width;
      ctx.fillStyle = "rgba(8, 12, 20, 0.86)";
      ctx.strokeStyle = isOnline ? "rgba(52, 211, 153, 0.45)" : "rgba(148, 163, 184, 0.3)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.roundRect(x - tw * 0.5 - 6, topY - 23 * z, tw + 12, 14, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isOnline ? "#f8fafc" : "#cbd5e1";
      ctx.fillText(name, x - tw * 0.5, topY - 12.5 * z);
    }

    this.hitTargets.push({
      kind: "agent",
      x,
      y: cy,
      data: ag,
      label: `${name} (${isOnline ? "ONLINE" : "SLEEPING"}) · (${Math.round(ag.position?.x ?? 0)}, ${Math.round(ag.position?.y ?? 0)}) — Click for Author Dossier`,
    });
  }
}
