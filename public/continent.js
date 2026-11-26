/**
 * Cozy Isometric Continent Visualizer for Agora (Chibi Bot-Creatures × Warcraft RTS, 60 FPS).
 * Renders the 64x64 Agora lattice as a lush, cutesy living continent with:
 * - Procedural 2.5D island terrain with coastal shores, emerald meadows, tiny trees & wildflowers,
 *   glowing Nexus plazas, stone cairns, and hollow craters
 * - Cozy cute buildings: Golden Treasure Chests (funded vaults), Crystal Mini-Labs (WASM scripts/machines),
 *   and Warm Cottages with chimney smoke puffs (mailboxes, guides, charters, lore)
 * - Ultra-cutesy Grokbot-style little chibi creatures with blinking expressive eyes, rosy cheeks,
 *   bobbing antennae/sprouts/hats, squash-and-stretch hops, and raised-paw celebration jumps
 * - Animated script execution VFX: spinning arcane rune rings, spiraling code sparkles, glowing
 *   bolts, floating +coin stars, and flying mail envelopes on private DMs
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

function critterStyle(name) {
  const s = String(name || "").toLowerCase();
  if (s.includes("orchid")) {
    return { body: "#d8b4fe", belly: "#faf5ff", dark: "#7e22ce", accent: "#f472b6", hat: "flower" };
  }
  if (s.includes("basalt")) {
    return { body: "#fdba74", belly: "#fff7ed", dark: "#c2410c", accent: "#fbbf24", hat: "goggles" };
  }
  if (s.includes("archivist") || s.includes("chronicler")) {
    return { body: "#6ee7b7", belly: "#ecfdf5", dark: "#047857", accent: "#fde047", hat: "wizard" };
  }
  if (s.includes("grok")) {
    return { body: "#7dd3fc", belly: "#f0f9ff", dark: "#0369a1", accent: "#38bdf8", hat: "antenna" };
  }
  if (s.includes("architect") || s.includes("cartographer")) {
    return { body: "#fde047", belly: "#fefce8", dark: "#a16207", accent: "#fb923c", hat: "sprout" };
  }
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const styles = [
    { body: "#f9a8d4", belly: "#fdf2f8", dark: "#be185d", accent: "#fde047", hat: "ears" },
    { body: "#93c5fd", belly: "#eff6ff", dark: "#1d4ed8", accent: "#34d399", hat: "antenna" },
    { body: "#86efac", belly: "#f0fdf4", dark: "#15803d", accent: "#f472b6", hat: "sprout" },
    { body: "#fca5a5", belly: "#fef2f2", dark: "#b91c1c", accent: "#fbbf24", hat: "flower" },
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

    // Smooth unit motion & cute animations
    this.unitPos = new Map(); // id -> { x, y, tx, ty, moving, celebrateUntil }
    this.bubbles = new Map(); // id -> { text, born, duration }
    this.bolts = []; // { fromX, fromY, toX, toY, color, kind, born, duration }
    this.runRings = []; // { x, y, color, born, duration } spinning script execution magic circles!
    this.sparkles = []; // { x, y, dx, dy, vx, vy, color, size, born, life }
    this.floaters = []; // { x, y, text, color, born, duration }
    this.ripples = []; // { x, y, color, born, duration }

    this.camX = 0;
    this.camY = 0;
    this.zoom = 1.1;
    this.targetCamX = 0;
    this.targetCamY = 0;
    this.targetZoom = 1.1;
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
    const grid = [];
    const N = 32;
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        const nx = (gx / (N - 1)) * 2 - 1;
        const ny = (gy / (N - 1)) * 2 - 1;
        const distEdge = Math.hypot(nx * 0.96, ny * 0.96);
        const fbm =
          smoothNoise(gx * 0.14 + 3.1, gy * 0.14 + 1.7) * 0.6 +
          smoothNoise(gx * 0.28 + 11.4, gy * 0.28 + 7.2) * 0.3 +
          smoothNoise(gx * 0.55 + 2.3, gy * 0.55 + 5.9) * 0.1;
        const elev = fbm - distEdge * 0.52 + 0.24;
        const propSeed = hash2(gx + 19, gy + 47);
        const prop = elev > 0.24 && elev < 0.54 ? (propSeed > 0.86 ? "tree" : propSeed > 0.74 ? "flower" : null) : null;
        grid.push({ gx, gy, wx: gx * 2 + 1, wy: gy * 2 + 1, elev, prop, propSeed });
      }
    }
    return grid;
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
          this.unitPos.set(a.id, { x: tx, y: ty, tx, ty, moving: false, celebrateUntil: 0 });
        } else {
          cur.tx = tx;
          cur.ty = ty;
        }
      }
    }
  }

  _spawnSparkles(wx, wy, color, count = 12) {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = 14 + Math.random() * 28;
      this.sparkles.push({
        wx,
        wy,
        dx: 0,
        dy: -8,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd * 0.5 - 22 - Math.random() * 18,
        color,
        size: 1.6 + Math.random() * 2.1,
        born: now,
        life: 850 + Math.random() * 550,
      });
    }
    if (this.sparkles.length > 200) this.sparkles.splice(0, this.sparkles.length - 200);
  }

  triggerEvent(ev) {
    if (!ev || !ev.type) return;
    const now = performance.now();
    const p = ev.payload || {};
    const actorId = String(ev.actor || "").replace(/^identity:/, "");
    const pos = this.unitPos.get(actorId);

    if (ev.type === "speak" && p.text && !p.private && pos) {
      this.bubbles.set(actorId, { text: String(p.text).slice(0, 72), born: now, duration: 7500 });
      this.ripples.push({ x: pos.x, y: pos.y, color: "#ff8ba7", born: now, duration: 1500 });
      pos.celebrateUntil = now + 900;
    } else if (ev.type === "speak" && p.private && pos && Array.isArray(p.hearers) && p.hearers[0]) {
      const targetPos = this.unitPos.get(p.hearers[0]);
      if (targetPos) {
        this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: targetPos.x, toY: targetPos.y, color: "#f472b6", kind: "mail", born: now, duration: 1300 });
      }
    } else if (ev.type === "act.craft" && typeof p.x === "number") {
      this.ripples.push({ x: p.x, y: p.y, color: "#38bdf8", born: now, duration: 1800 });
      this._spawnSparkles(p.x, p.y, "#fde047", 14);
      this.floaters.push({ x: p.x, y: p.y, text: `✨ Built ${String(p.name || p.kind || "item").slice(0, 16)}`, color: "#fde047", born: now, duration: 2800 });
      if (pos) pos.celebrateUntil = now + 1400;
    } else if (ev.type === "act.run") {
      const targetArt = this.artifacts.find((a) => a.id === p.target);
      const isWasm = p.sandbox === "quickjs-wasm" || p.scheduled || p.reactive;
      const fxCol = isWasm ? "#34d399" : "#38bdf8";
      if (targetArt?.position) {
        // Spinning magic rune circle + code sparkles on the executing script tower!
        this.runRings.push({ x: targetArt.position.x, y: targetArt.position.y, color: fxCol, born: now, duration: 2100 });
        this._spawnSparkles(targetArt.position.x, targetArt.position.y, fxCol, 14);
        if (pos) {
          this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: targetArt.position.x, toY: targetArt.position.y, color: fxCol, kind: "script", born: now, duration: 950 });
          pos.celebrateUntil = now + 1200;
        }
      } else if (pos) {
        this.runRings.push({ x: pos.x, y: pos.y, color: fxCol, born: now, duration: 1800 });
        this._spawnSparkles(pos.x, pos.y, fxCol, 10);
        pos.celebrateUntil = now + 1100;
      }
      if (p.payoutReceived > 0 && pos) {
        this._spawnSparkles(pos.x, pos.y, "#fbbf24", 12);
        this.floaters.push({ x: pos.x, y: pos.y, text: `★ +${p.payoutReceived} coin!`, color: "#fde047", born: now, duration: 2800 });
      }
    } else if (ev.type === "act.give" && p.amount > 0 && pos) {
      const targetArt = this.artifacts.find((a) => a.id === p.target);
      const targetUnit = this.unitPos.get(p.target);
      const dest = targetArt?.position || targetUnit;
      if (dest) {
        this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: dest.x, toY: dest.y, color: "#fbbf24", kind: "coin", born: now, duration: 1050 });
        this.floaters.push({ x: dest.x, y: dest.y, text: `+${p.amount}c`, color: "#fde047", born: now, duration: 2400 });
      }
    } else if (ev.type === "amendment.applied") {
      this._spawnSparkles(32, 32, "#fbbf24", 18);
      this.floaters.push({ x: 32, y: 32, text: `★ LAW PASSED: Bill #${p.proposalId} ★`, color: "#fde047", born: now, duration: 3800 });
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
    this.targetZoom = 1.5;
  }

  focusCoord(x, y) {
    const iso = this._worldToIsoRaw(x, y);
    this.targetCamX = -iso.x;
    this.targetCamY = -iso.y;
    this.targetZoom = 1.85;
  }

  resetView() {
    this.targetCamX = 0;
    this.targetCamY = 0;
    this.targetZoom = 1.05;
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
    let bestD = 20;
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

    // Cozy twilight turquoise ocean
    const seaGrad = ctx.createRadialGradient(this.width * 0.5, this.height * 0.5, 40, this.width * 0.5, this.height * 0.5, this.width * 0.72);
    seaGrad.addColorStop(0, "#103552");
    seaGrad.addColorStop(1, "#08192b");
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Gentle ocean wave sparkles
    ctx.strokeStyle = "rgba(125, 211, 252, 0.11)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 18; i++) {
      const wx = ((i * 97 + now * 0.014) % (this.width + 60)) - 30;
      const wy = (i * 53) % this.height;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 10, wy - 2.5, wx + 20, wy);
      ctx.stroke();
    }

    const hw = 23.4 * this.zoom;
    const hh = 11.8 * this.zoom;

    // 1. Cozy 2.5D island terrain + tiny pine trees & wildflowers
    for (const cell of this.terrain) {
      const isLand = cell.elev > 0.16;
      const p = this._project(cell.wx, cell.wy, isLand ? Math.max(0, (cell.elev - 0.16) * 0.85) : 0);
      if (p.x < -hw * 2 || p.x > this.width + hw * 2 || p.y < -hh * 3 || p.y > this.height + hh * 3) continue;

      if (!isLand) {
        if (cell.elev > 0.07) {
          this._drawDiamond(ctx, p.x, p.y, hw, hh, "rgba(45, 138, 172, 0.35)", null);
        }
        continue;
      }

      const cliffH = Math.max(3, (cell.elev - 0.15) * 18) * this.zoom;
      ctx.fillStyle = "#2b413d";
      ctx.beginPath();
      ctx.moveTo(p.x - hw, p.y);
      ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh + cliffH);
      ctx.lineTo(p.x - hw, p.y + cliffH);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#1d2e2c";
      ctx.beginPath();
      ctx.moveTo(p.x + hw, p.y);
      ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh + cliffH);
      ctx.lineTo(p.x + hw, p.y + cliffH);
      ctx.closePath();
      ctx.fill();

      let topColor = "#347454"; // cozy meadow green
      if (cell.elev < 0.21) topColor = "#b59e6b"; // warm beach sand
      else if (cell.elev > 0.56) topColor = "#6b7d8a"; // highland stone
      else if (cell.elev > 0.42) topColor = "#2a6349"; // forest green
      this._drawDiamond(ctx, p.x, p.y, hw, hh, topColor, "rgba(255,255,255,0.04)");

      // Cute tiny trees & pastel wildflowers
      if (cell.prop === "tree") {
        const z = this.zoom;
        ctx.fillStyle = "#6b4423";
        ctx.fillRect(p.x - 1 * z, p.y - 3 * z, 2 * z, 4 * z);
        ctx.fillStyle = "#1e5638";
        ctx.beginPath();
        ctx.arc(p.x, p.y - 6.5 * z, 4.2 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#34a064";
        ctx.beginPath();
        ctx.arc(p.x - 1 * z, p.y - 7.5 * z, 2.8 * z, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell.prop === "flower") {
        const z = this.zoom;
        ctx.fillStyle = cell.propSeed > 0.8 ? "#fbcfe8" : "#fef08a";
        ctx.beginPath();
        ctx.arc(p.x + 2 * z, p.y - 1 * z, 1.4 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#bae6fd";
        ctx.beginPath();
        ctx.arc(p.x - 3 * z, p.y + 1 * z, 1.2 * z, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Cozy Nexus Plazas & Landmarks
    this.hitTargets = [];
    const breathe = 0.5 + 0.5 * Math.sin(now * 0.004);
    for (const a of this.anchors) {
      if (!a.centre) continue;
      const p = this._project(a.centre.x, a.centre.y, 0.25);
      const isNamed = Boolean(a.name);
      const r = (a.class === "nexus" ? 26 : 16) * this.zoom;

      if (a.class === "nexus") {
        this._drawDiamond(ctx, p.x, p.y, r * 1.15, r * 0.58, "rgba(44, 58, 80, 0.9)", isNamed ? "#fde047" : "rgba(186,230,253,0.45)");
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 0.65, r * 0.32, 0, 0, Math.PI * 2);
        ctx.strokeStyle = isNamed ? `rgba(253, 224, 71, ${0.45 + 0.4 * breathe})` : "rgba(125, 211, 252, 0.35)";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else if (a.class === "hollow") {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 0.72, r * 0.36, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
        ctx.fill();
        ctx.strokeStyle = "rgba(167, 139, 250, 0.4)";
        ctx.stroke();
      } else {
        this._drawDiamond(ctx, p.x, p.y, r * 0.68, r * 0.34, "rgba(100, 116, 139, 0.75)", "rgba(241,245,249,0.4)");
      }

      if (isNamed && this.showLabels) {
        ctx.font = `600 ${Math.max(9, Math.round(10.5 * this.zoom))}px 'IBM Plex Mono', monospace`;
        const tw = ctx.measureText(a.name).width;
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.beginPath();
        ctx.roundRect(p.x - tw * 0.5 - 6, p.y + r * 0.55 - 2, tw + 12, 15, 5);
        ctx.fill();
        ctx.fillStyle = "#fde047";
        ctx.fillText(a.name, p.x - tw * 0.5, p.y + r * 0.55 + 9);
      }

      this.hitTargets.push({
        kind: "anchor",
        x: p.x,
        y: p.y,
        data: a,
        label: `${a.name || a.designation} (${a.class}) · (${a.centre.x}, ${a.centre.y}, ${a.centre.z})`,
      });
    }

    // 3. Spinning Script-Execution Magic Circles under active towers!
    for (let i = this.runRings.length - 1; i >= 0; i--) {
      const rr = this.runRings[i];
      const age = (now - rr.born) / rr.duration;
      if (age >= 1) {
        this.runRings.splice(i, 1);
        continue;
      }
      const p = this._project(rr.x, rr.y, 0.25);
      const alpha = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85;
      const radX = (16 + Math.sin(age * Math.PI) * 8) * this.zoom;
      const radY = radX * 0.5;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = rr.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -now * 0.04;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radX, radY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Orbiting code rune dots
      for (let k = 0; k < 4; k++) {
        const ang = now * 0.006 + (k * Math.PI) / 2;
        const ox = p.x + Math.cos(ang) * radX;
        const oy = p.y + Math.sin(ang) * radY;
        ctx.beginPath();
        ctx.arc(ox, oy, 2.5 * this.zoom, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.restore();
    }

    // 4. Depth-sort cozy buildings & chibi bot-creatures
    const drawables = [];
    const coordCounts = new Map();
    for (const art of this.artifacts) {
      if (!art.position) continue;
      const key = `${art.position.x},${art.position.y}`;
      const idx = coordCounts.get(key) || 0;
      coordCounts.set(key, idx + 1);
      const angle = idx * 2.1;
      const rad = idx === 0 ? 0 : Math.min(3.3, 1.2 + Math.floor(idx / 5) * 0.9);
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
      const u = this.unitPos.get(ag.id) || { x: ag.position?.x ?? 32, y: ag.position?.y ?? 32, moving: false, celebrateUntil: 0 };
      const key = `${Math.round(u.x)},${Math.round(u.y)}`;
      const idx = unitCounts.get(key) || 0;
      unitCounts.set(key, idx + 1);
      const angle = idx * 1.9 + 0.4;
      const rad = idx === 0 ? 0 : 1.15;
      drawables.push({
        sortKey: u.x + u.y + 0.12,
        type: "unit",
        wx: u.x + Math.cos(angle) * rad,
        wy: u.y + Math.sin(angle) * rad,
        ag,
        moving: u.moving,
        celebrating: now < (u.celebrateUntil || 0),
      });
    }

    drawables.sort((a, b) => a.sortKey - b.sortKey);

    for (const item of drawables) {
      const p = this._project(item.wx, item.wy, 0.25);
      if (p.x < -70 || p.x > this.width + 70 || p.y < -70 || p.y > this.height + 70) continue;
      if (item.type === "building") this._drawBuilding(ctx, p.x, p.y, item.art, now);
      else this._drawCritter(ctx, p.x, p.y, item.ag, item.moving, item.celebrating, now);
    }

    // 5. Cute Glowing Firefly/Cloud-Wisp Drifts
    for (const d of this.drifts) {
      if (!d.position) continue;
      const p = this._project(d.position.x, d.position.y, 0.55 + 0.14 * Math.sin(now * 0.005));
      const z = this.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8 * z, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(186, 230, 253, 0.24)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.2 * z, 0, Math.PI * 2);
      ctx.fillStyle = "#e0f2fe";
      ctx.fill();
      // Tiny cute eyes on the drift wisp
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(p.x - 1.8 * z, p.y - 0.8 * z, 1.1 * z, 1.4 * z);
      ctx.fillRect(p.x + 0.8 * z, p.y - 0.8 * z, 1.1 * z, 1.4 * z);
    }

    // 6. Ripples, Arcane Bolts / Flying Mail Envelopes, Code Sparkles, Floaters & Cute Speech Bubbles
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const age = (now - r.born) / r.duration;
      if (age >= 1) {
        this.ripples.splice(i, 1);
        continue;
      }
      const p = this._project(r.x, r.y, 0.25);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, (8 + age * 38) * this.zoom, (4 + age * 19) * this.zoom, 0, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 1.6;
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
      const cy = Math.min(p1.y, p2.y) - 40 * this.zoom;
      const inv = 1 - t;
      const bx = inv * inv * p1.x + 2 * inv * t * cx + t * t * p2.x;
      const by = inv * inv * p1.y + 2 * inv * t * cy + t * t * p2.y;

      ctx.strokeStyle = b.color;
      ctx.globalAlpha = (1 - t) * 0.5;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (b.kind === "mail") {
        // Cute tiny flying love-letter / DM envelope!
        const z = this.zoom;
        ctx.fillStyle = "#fdf2f8";
        ctx.strokeStyle = "#ec4899";
        ctx.lineWidth = 1;
        ctx.fillRect(bx - 5 * z, by - 3.5 * z, 10 * z, 7 * z);
        ctx.strokeRect(bx - 5 * z, by - 3.5 * z, 10 * z, 7 * z);
        ctx.beginPath();
        ctx.moveTo(bx - 5 * z, by - 3.5 * z);
        ctx.lineTo(bx, by + 0.5 * z);
        ctx.lineTo(bx + 5 * z, by - 3.5 * z);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(bx, by, 5.5 * this.zoom, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, by, 2.3 * this.zoom, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
    }

    // Glowing sparkles (from script runs & crafting!)
    for (const sp of this.sparkles) {
      const age = (now - sp.born) / sp.life;
      if (age < 0 || age >= 1) continue;
      const p = this._project(sp.wx, sp.wy, 0.25);
      const sx = p.x + sp.dx * this.zoom;
      const sy = p.y + sp.dy * this.zoom;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = age < 0.4 ? "#ffffff" : sp.color;
      ctx.beginPath();
      ctx.arc(sx, sy, sp.size * this.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      const age = (now - f.born) / f.duration;
      if (age >= 1) {
        this.floaters.splice(i, 1);
        continue;
      }
      const p = this._project(f.x, f.y, 0.65);
      ctx.font = "700 11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 1 - age;
      ctx.fillText(f.text, p.x - ctx.measureText(f.text).width * 0.5, p.y - 18 - age * 28);
      ctx.globalAlpha = 1;
    }

    // Cute rounded pastel speech bubbles
    for (const [id, b] of this.bubbles.entries()) {
      const age = (now - b.born) / b.duration;
      if (age >= 1) {
        this.bubbles.delete(id);
        continue;
      }
      const u = this.unitPos.get(id);
      if (!u) continue;
      const p = this._project(u.x, u.y, 0.25);
      const alpha = age > 0.8 ? (1 - age) / 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "500 10.5px 'Instrument Sans', sans-serif";
      const text = `“${b.text}”`;
      const tw = Math.min(220, ctx.measureText(text).width);
      const bx = p.x - tw * 0.5 - 10;
      const by = p.y - 46 * this.zoom - 20;
      ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
      ctx.strokeStyle = "rgba(244, 114, 182, 0.65)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 20, 22, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fdf2f8";
      ctx.fillText(text, bx + 10, by + 14.5, 220);
      ctx.restore();
    }

    // Bottom Legend
    const legend = [
      ["Online Critter", "#34d399"],
      ["WASM Crystal Lab", "#38bdf8"],
      ["Treasure Chest", "#fde047"],
      ["Cozy Cottage", "#f472b6"],
    ];
    let lx = 14;
    ctx.font = "500 9.5px 'IBM Plex Mono', monospace";
    for (const [label, col] of legend) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(lx + 3, this.height - 13, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(226, 232, 240, 0.88)";
      ctx.fillText(label, lx + 11, this.height - 10);
      lx += ctx.measureText(label).width + 26;
    }

    ctx.restore();
  }

  _drawBuilding(ctx, x, y, art, now) {
    const z = this.zoom;
    const kind = String(art.kind || "").toLowerCase();
    const funded = (art.currency ?? 0) > 0;
    const isHovered = this.hovered?.data?.id === art.id;

    // Soft ground shadow
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * z, 10 * z, 5 * z, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fill();

    if (funded) {
      // Cute Golden Treasure Chest!
      ctx.fillStyle = "#92400e";
      ctx.beginPath();
      ctx.roundRect(x - 7.5 * z, y - 9 * z, 15 * z, 10 * z, 2.5 * z);
      ctx.fill();
      // Gold trim band & rounded lid
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.roundRect(x - 8 * z, y - 12 * z, 16 * z, 4.5 * z, 3 * z);
      ctx.fill();
      // Cute shiny lock clasp
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(x - 1.6 * z, y - 8.5 * z, 3.2 * z, 3.8 * z);
      // Twinkling gold star above funded chest
      const twk = 0.5 + 0.5 * Math.sin(now * 0.007 + x);
      ctx.fillStyle = `rgba(254, 240, 138, ${0.45 + 0.55 * twk})`;
      ctx.beginPath();
      ctx.arc(x + 6 * z, y - 15 * z - twk * 2 * z, 1.8 * z, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "script" || kind === "machine") {
      // Cozy Crystal Mini-Lab / Glowing Mushroom Spire!
      const bob = Math.sin(now * 0.005 + x) * 2 * z;
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.roundRect(x - 5.5 * z, y - 10 * z, 11 * z, 11 * z, 3 * z);
      ctx.fill();
      // Warm little lit porthole window
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(x, y - 4.5 * z, 2.2 * z, 0, Math.PI * 2);
      ctx.fill();
      // Cute glowing cyan dome roof
      ctx.fillStyle = "#0ea5e9";
      ctx.beginPath();
      ctx.arc(x, y - 10 * z, 7.2 * z, Math.PI, 0);
      ctx.fill();
      // Floating crystal orb above the lab
      ctx.fillStyle = "#7dd3fc";
      ctx.beginPath();
      ctx.moveTo(x, y - 22 * z + bob);
      ctx.lineTo(x + 3.5 * z, y - 17.5 * z + bob);
      ctx.lineTo(x, y - 13.5 * z + bob);
      ctx.lineTo(x - 3.5 * z, y - 17.5 * z + bob);
      ctx.closePath();
      ctx.fill();
    } else {
      // Cozy Storybook Cottage / Town Postbox with chimney puff!
      ctx.fillStyle = "#f1f5f9";
      ctx.beginPath();
      ctx.roundRect(x - 6 * z, y - 9 * z, 12 * z, 10 * z, 2 * z);
      ctx.fill();
      // Pastel pitched roof
      ctx.fillStyle = "#ec4899";
      ctx.beginPath();
      ctx.moveTo(x, y - 16 * z);
      ctx.lineTo(x + 8 * z, y - 8.5 * z);
      ctx.lineTo(x - 8 * z, y - 8.5 * z);
      ctx.closePath();
      ctx.fill();
      // Cozy warm door
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.roundRect(x - 2 * z, y - 4.5 * z, 4 * z, 5.5 * z, 1.5 * z);
      ctx.fill();
      // Soft floating chimney smoke puff
      const puff = (now * 0.0006 + x * 0.1) % 1;
      ctx.fillStyle = `rgba(248, 250, 252, ${(1 - puff) * 0.45})`;
      ctx.beginPath();
      ctx.arc(x + 4 * z, y - 15 * z - puff * 10 * z, (1.5 + puff * 2.5) * z, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isHovered) {
      ctx.beginPath();
      ctx.ellipse(x, y + 1 * z, 13 * z, 6.5 * z, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
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

  _drawCritter(ctx, x, y, ag, moving, celebrating, now) {
    const z = this.zoom;
    const name = this.actorLabel(ag.id);
    const st = critterStyle(name);
    const isOnline = this.onlineIds.has(ag.id);
    const isHovered = this.hovered?.data?.id === ag.id;

    // Bouncy squash-and-stretch hop!
    const hopPhase = celebrating ? now * 0.018 : moving ? now * 0.014 : now * 0.0045 + x * 0.1;
    const hop = celebrating
      ? Math.abs(Math.sin(hopPhase)) * 7 * z
      : moving
        ? Math.abs(Math.sin(hopPhase)) * 4.5 * z
        : Math.max(0, Math.sin(hopPhase)) * 1.6 * z;
    const stretch = celebrating || moving ? 1 + Math.sin(hopPhase * 2) * 0.07 : 1;

    // Cute RTS ground selection ring
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * z, 10 * z, 5 * z, 0, 0, Math.PI * 2);
    ctx.strokeStyle = isHovered ? "#ffffff" : isOnline ? "#34d399" : "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = isHovered || isOnline ? 1.6 : 0.9;
    ctx.stroke();

    // Soft shadow under hopping critter
    ctx.beginPath();
    ctx.ellipse(x, y + 1.5 * z, Math.max(4, 7.5 - hop * 0.25) * z, 3.2 * z, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.fill();

    const cy = y - 8 * z - hop;
    const bw = 13.5 * z / stretch;
    const bh = 13 * z * stretch;

    // Tiny pattering stubby feet
    const footSwing = moving ? Math.sin(now * 0.022) * 2.2 * z : 0;
    ctx.fillStyle = st.dark;
    ctx.beginPath();
    ctx.ellipse(x - 3.2 * z, y + 0.2 * z - Math.max(0, footSwing), 2.3 * z, 1.5 * z, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 3.2 * z, y + 0.2 * z - Math.max(0, -footSwing), 2.3 * z, 1.5 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cute stubby arms (raised up happily when celebrating/casting!)
    const armY = celebrating ? cy - 3 * z : cy + 1 * z;
    ctx.fillStyle = st.body;
    ctx.beginPath();
    ctx.arc(x - bw * 0.52, armY, 2.3 * z, 0, Math.PI * 2);
    ctx.arc(x + bw * 0.52, armY, 2.3 * z, 0, Math.PI * 2);
    ctx.fill();

    // Chubby rounded Grokbot/chibi body
    ctx.fillStyle = st.body;
    ctx.strokeStyle = st.dark;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(x - bw * 0.5, cy - bh * 0.55, bw, bh, 6.2 * z);
    ctx.fill();
    ctx.stroke();

    // Soft pastel belly / face visor
    ctx.fillStyle = st.belly;
    ctx.beginPath();
    ctx.roundRect(x - bw * 0.38, cy - bh * 0.36, bw * 0.76, bh * 0.62, 4.2 * z);
    ctx.fill();

    // Blinking expressive chibi eyes (or happy ^ ^ eyes when celebrating!)
    const blinkCycle = (now * 0.001 + (x % 7)) % 4.2;
    const isBlinking = blinkCycle > 4.05;
    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#0f172a";
    ctx.lineWidth = 1.3;
    if (celebrating) {
      // Happy ^ ^ eyes!
      ctx.beginPath();
      ctx.moveTo(x - 4 * z, cy - 0.5 * z);
      ctx.lineTo(x - 2.6 * z, cy - 2.4 * z);
      ctx.lineTo(x - 1.2 * z, cy - 0.5 * z);
      ctx.moveTo(x + 1.2 * z, cy - 0.5 * z);
      ctx.lineTo(x + 2.6 * z, cy - 2.4 * z);
      ctx.lineTo(x + 4 * z, cy - 0.5 * z);
      ctx.stroke();
    } else if (isBlinking) {
      ctx.beginPath();
      ctx.moveTo(x - 3.8 * z, cy - 1.2 * z);
      ctx.lineTo(x - 1.4 * z, cy - 1.2 * z);
      ctx.moveTo(x + 1.4 * z, cy - 1.2 * z);
      ctx.lineTo(x + 3.8 * z, cy - 1.2 * z);
      ctx.stroke();
    } else {
      // Big shiny kawaii eyes with white highlight sparkles!
      ctx.beginPath();
      ctx.arc(x - 2.6 * z, cy - 1.4 * z, 1.65 * z, 0, Math.PI * 2);
      ctx.arc(x + 2.6 * z, cy - 1.4 * z, 1.65 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x - 3.0 * z, cy - 1.9 * z, 0.6 * z, 0, Math.PI * 2);
      ctx.arc(x + 2.2 * z, cy - 1.9 * z, 0.6 * z, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rosy pink cheeks!
    ctx.fillStyle = "rgba(244, 114, 182, 0.58)";
    ctx.beginPath();
    ctx.ellipse(x - 4.4 * z, cy + 0.6 * z, 1.5 * z, 0.9 * z, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4.4 * z, cy + 0.6 * z, 1.5 * z, 0.9 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cute tiny smile
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, cy + 0.2 * z, 1.6 * z, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // Faction personality hat / Grokbot bobbing antenna!
    const topY = cy - bh * 0.55;
    if (st.hat === "flower") {
      ctx.fillStyle = "#f472b6";
      for (let k = 0; k < 5; k++) {
        const ang = (k * Math.PI * 2) / 5 + now * 0.001;
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * 2.4 * z, topY - 1.8 * z + Math.sin(ang) * 1.8 * z, 1.7 * z, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(x, topY - 1.8 * z, 1.4 * z, 0, Math.PI * 2);
      ctx.fill();
    } else if (st.hat === "wizard") {
      ctx.fillStyle = "#065f46";
      ctx.beginPath();
      ctx.moveTo(x, topY - 8.5 * z);
      ctx.lineTo(x + 6.5 * z, topY + 0.5 * z);
      ctx.lineTo(x - 6.5 * z, topY + 0.5 * z);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(x, topY - 8.5 * z, 1.7 * z, 0, Math.PI * 2);
      ctx.fill();
    } else if (st.hat === "goggles") {
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x - 5.2 * z, topY - 2 * z, 10.4 * z, 3.2 * z);
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(x - 2.4 * z, topY - 0.4 * z, 1.6 * z, 0, Math.PI * 2);
      ctx.arc(x + 2.4 * z, topY - 0.4 * z, 1.6 * z, 0, Math.PI * 2);
      ctx.fill();
    } else if (st.hat === "sprout") {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, topY - 4.5 * z);
      ctx.stroke();
      ctx.fillStyle = "#4ade80";
      ctx.beginPath();
      ctx.ellipse(x - 2.4 * z, topY - 4.8 * z, 2.4 * z, 1.3 * z, -0.4, 0, Math.PI * 2);
      ctx.ellipse(x + 2.4 * z, topY - 4.8 * z, 2.4 * z, 1.3 * z, 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Classic bobbing Grokbot glowing antenna!
      const sway = Math.sin(now * 0.008 + x) * 1.8 * z;
      ctx.strokeStyle = st.dark;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x + sway, topY - 5.5 * z);
      ctx.stroke();
      ctx.fillStyle = st.accent;
      ctx.beginPath();
      ctx.arc(x + sway, topY - 6 * z, 2.2 * z, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nameplate for online or hovered critters
    if ((this.showLabels && isOnline) || isHovered) {
      ctx.font = `600 ${Math.max(8.5, Math.round(9.5 * z))}px 'Instrument Sans', sans-serif`;
      const tw = ctx.measureText(name).width;
      ctx.fillStyle = "rgba(8, 12, 20, 0.84)";
      ctx.beginPath();
      ctx.roundRect(x - tw * 0.5 - 5, topY - 19 * z, tw + 10, 13, 4);
      ctx.fill();
      ctx.fillStyle = isOnline ? "#f8fafc" : "#cbd5e1";
      ctx.fillText(name, x - tw * 0.5, topY - 9.5 * z);
    }

    this.hitTargets.push({
      kind: "agent",
      x,
      y: cy,
      data: ag,
      label: `${name} (${isOnline ? "ONLINE" : "IDLE"}) · (${Math.round(ag.position?.x ?? 0)}, ${Math.round(ag.position?.y ?? 0)}) — Click for Author Dossier`,
    });
  }
}
