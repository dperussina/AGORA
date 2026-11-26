/**
 * Warcraft II-Inspired Top-Down 3/4 Continent Map for Agora (High-DPI 2D Canvas, 60 FPS).
 * Classic Tides of Darkness medieval fantasy aesthetic × cute chibi units:
 * - Painted 3/4 top-down terrain: royal-blue animated ocean, golden sandy shores with surf foam,
 *   lush summer grass, dirt/cobblestone roads linking named Keeps, rocky cliffs, and dense Warcraft II forests
 * - Iconic Warcraft II buildings: Timber-and-stone Keeps (Nexuses), Glowing Gold Mines (funded vaults),
 *   Stone Mage Towers (WASM scripts/machines with spinning spell circles on run), and Medieval Cottages
 * - Cute chibi Warcraft II units (Footmen, Mages, Archmages, Dwarven Explorers, Bot-Knights) with
 *   faction-colored armor/cloaks, bright green WC2 selection rings + mana bars, walking bob,
 *   blinking kawaii eyes, and speech bubbles
 * - Built-in live clickable WC2 Tactical Minimap + top medieval resource bar
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

function unitClassOf(name) {
  const s = String(name || "").toLowerCase();
  if (s.includes("orchid")) {
    return { team: "#a855f7", light: "#e9d5ff", dark: "#581c87", skin: "#fde8d7", accent: "#f472b6", role: "mage" };
  }
  if (s.includes("basalt")) {
    return { team: "#ea580c", light: "#fed7aa", dark: "#7c2d12", skin: "#fde8d7", accent: "#fbbf24", role: "footman" };
  }
  if (s.includes("archivist") || s.includes("chronicler")) {
    return { team: "#10b981", light: "#a7f3d0", dark: "#064e3b", skin: "#fde8d7", accent: "#fde047", role: "archmage" };
  }
  if (s.includes("grok")) {
    return { team: "#0284c7", light: "#bae6fd", dark: "#0c4a6e", skin: "#e0f2fe", accent: "#22d3ee", role: "golem" };
  }
  if (s.includes("architect") || s.includes("cartographer")) {
    return { team: "#eab308", light: "#fef08a", dark: "#713f12", skin: "#fde8d7", accent: "#4ade80", role: "scout" };
  }
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const presets = [
    { team: "#e11d48", light: "#fecdd3", dark: "#881337", skin: "#fde8d7", accent: "#fde047", role: "footman" },
    { team: "#2563eb", light: "#bfdbfe", dark: "#1e3a8a", skin: "#fde8d7", accent: "#38bdf8", role: "mage" },
    { team: "#16a34a", light: "#bbf7d0", dark: "#14532d", skin: "#fde8d7", accent: "#f472b6", role: "scout" },
  ];
  return presets[h % presets.length];
}

const TILE_PX = 22; // 64 * 22 = 1408px wide Warcraft II continent!

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

    this.unitPos = new Map();
    this.bubbles = new Map();
    this.bolts = [];
    this.runRings = [];
    this.sparkles = [];
    this.floaters = [];
    this.ripples = [];

    // Camera centered on (32, 32)
    this.camX = 32 * TILE_PX;
    this.camY = 32 * TILE_PX;
    this.zoom = 0.85;
    this.targetCamX = this.camX;
    this.targetCamY = this.camY;
    this.targetZoom = 0.85;
    this.showLabels = true;

    this.dragging = false;
    this.dragMoved = false;
    this.lastX = 0;
    this.lastY = 0;
    this.hitTargets = [];
    this.hovered = null;
    this.minimapRect = { x: 14, y: 0, w: 118, h: 118 };

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 960;
    this.height = 480;
    this.rafId = null;
    this.running = false;
    this.visible = true;
    this.lastFrame = performance.now();

    // Pre-bake painted Warcraft II 3/4 continent terrain onto an offscreen canvas for blazing 60 FPS!
    this.terrainGrid = this._buildTerrainGrid();
    this.terrainCanvas = this._bakeTerrainCanvas();

    this._bindEvents();
    this._resize();
    this.start();
  }

  _buildTerrainGrid() {
    const N = 64;
    const grid = new Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const nx = (x / (N - 1)) * 2 - 1;
        const ny = (y / (N - 1)) * 2 - 1;
        const distEdge = Math.hypot(nx * 0.92, ny * 0.92);
        const fbm =
          smoothNoise(x * 0.08 + 2.4, y * 0.08 + 1.3) * 0.56 +
          smoothNoise(x * 0.17 + 9.2, y * 0.17 + 6.1) * 0.3 +
          smoothNoise(x * 0.35 + 4.1, y * 0.35 + 8.7) * 0.14;
        const elev = fbm - distEdge * 0.44 + 0.27;
        const treeNoise = smoothNoise(x * 0.22 + 31.5, y * 0.22 + 17.2);
        const seed = hash2(x + 11, y + 29);
        const isLand = elev > 0.16;
        const isForest = isLand && elev > 0.26 && elev < 0.56 && treeNoise > 0.62 && seed > 0.28;
        const isRock = isLand && elev >= 0.56;
        grid[y * N + x] = { x, y, elev, isLand, isForest, isRock, seed };
      }
    }
    return grid;
  }

  _bakeTerrainCanvas() {
    const N = 64;
    const size = N * TILE_PX;
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const ctx = off.getContext("2d");

    // Deep WC2 royal ocean
    ctx.fillStyle = "#16406b";
    ctx.fillRect(0, 0, size, size);

    const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? null : this.terrainGrid[y * N + x]);

    // 1. Base terrain tiles (water shoals, warm sand, WC2 summer grass, dirt, stone ridges)
    for (const c of this.terrainGrid) {
      const px = c.x * TILE_PX;
      const py = c.y * TILE_PX;
      if (!c.isLand) {
        if (c.elev > 0.07) {
          ctx.fillStyle = "#1e5c8c"; // coastal shallows
          ctx.fillRect(px, py, TILE_PX, TILE_PX);
        } else if (c.seed > 0.85) {
          ctx.fillStyle = "#1b4b7a";
          ctx.fillRect(px + 4, py + 10, 10, 2);
        }
        continue;
      }

      const southWater = !at(c.x, c.y + 1)?.isLand;
      const coast =
        !at(c.x - 1, c.y)?.isLand || !at(c.x + 1, c.y)?.isLand || !at(c.x, c.y - 1)?.isLand || southWater;

      if (coast || c.elev < 0.21) {
        // Warm Warcraft II shoreline sand + foam edge
        ctx.fillStyle = c.seed > 0.5 ? "#c8a96e" : "#bfa065";
        ctx.fillRect(px, py, TILE_PX, TILE_PX);
        if (southWater) {
          ctx.fillStyle = "#7a5e34";
          ctx.fillRect(px, py + TILE_PX - 4, TILE_PX, 4);
          ctx.fillStyle = "rgba(224, 242, 254, 0.45)";
          ctx.fillRect(px, py + TILE_PX - 1, TILE_PX, 2);
        }
      } else if (c.isRock) {
        // Warcraft II craggy highland rock
        ctx.fillStyle = c.seed > 0.5 ? "#697178" : "#5a6269";
        ctx.fillRect(px, py, TILE_PX, TILE_PX);
        ctx.fillStyle = "#8a9299";
        ctx.fillRect(px + 2, py + 2, TILE_PX - 6, 4);
        ctx.fillStyle = "#3f464d";
        ctx.fillRect(px + 3, py + TILE_PX - 4, TILE_PX - 4, 3);
      } else {
        // Classic Warcraft II summer grass with subtle painted turf texture
        ctx.fillStyle = c.elev > 0.42 ? "#356e3a" : c.seed > 0.5 ? "#438242" : "#3d7a3d";
        ctx.fillRect(px, py, TILE_PX, TILE_PX);
        if (c.seed > 0.72) {
          ctx.fillStyle = "#52944c";
          ctx.fillRect(px + 4, py + 6, 3, 2);
          ctx.fillRect(px + 13, py + 14, 3, 2);
        } else if (c.seed < 0.14) {
          // Cute tiny wildflower specks
          ctx.fillStyle = c.seed < 0.07 ? "#fef08a" : "#fbcfe8";
          ctx.fillRect(px + 8, py + 9, 2, 2);
        }
      }
    }

    // 2. Classic Warcraft II dense evergreen forest clusters!
    for (const c of this.terrainGrid) {
      if (!c.isForest) continue;
      const cx = c.x * TILE_PX + TILE_PX * 0.5;
      const cy = c.y * TILE_PX + TILE_PX * 0.5;
      // Ground shadow
      ctx.fillStyle = "rgba(10, 28, 16, 0.42)";
      ctx.beginPath();
      ctx.ellipse(cx + 2, cy + 5, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Trunk
      ctx.fillStyle = "#59371c";
      ctx.fillRect(cx - 2, cy, 4, 6);
      // Layered pine boughs (Warcraft II dark-to-bright green canopy)
      ctx.fillStyle = "#174223";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx + 10, cy + 3);
      ctx.lineTo(cx - 10, cy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#246132";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 14);
      ctx.lineTo(cx + 8, cy - 2);
      ctx.lineTo(cx - 8, cy - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#368242";
      ctx.beginPath();
      ctx.moveTo(cx - 1, cy - 14);
      ctx.lineTo(cx + 4, cy - 6);
      ctx.lineTo(cx - 5, cy - 6);
      ctx.closePath();
      ctx.fill();
    }

    return off;
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
      const spd = 18 + Math.random() * 32;
      this.sparkles.push({
        wx,
        wy,
        dx: 0,
        dy: -10,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd * 0.6 - 24 - Math.random() * 18,
        color,
        size: 2 + Math.random() * 2.2,
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
      this.ripples.push({ x: pos.x, y: pos.y, color: "#fde047", born: now, duration: 1500 });
      pos.celebrateUntil = now + 950;
    } else if (ev.type === "speak" && p.private && pos && Array.isArray(p.hearers) && p.hearers[0]) {
      const targetPos = this.unitPos.get(p.hearers[0]);
      if (targetPos) {
        this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: targetPos.x, toY: targetPos.y, color: "#f472b6", kind: "mail", born: now, duration: 1350 });
      }
    } else if (ev.type === "act.craft" && typeof p.x === "number") {
      this.ripples.push({ x: p.x, y: p.y, color: "#38bdf8", born: now, duration: 1800 });
      this._spawnSparkles(p.x, p.y, "#fde047", 16);
      this.floaters.push({ x: p.x, y: p.y, text: `⚒ Built ${String(p.name || p.kind || "structure").slice(0, 16)}`, color: "#fde047", born: now, duration: 2900 });
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
        this.floaters.push({ x: pos.x, y: pos.y, text: `+${p.payoutReceived} Gold!`, color: "#fde047", born: now, duration: 2900 });
      }
    } else if (ev.type === "act.give" && p.amount > 0 && pos) {
      const targetArt = this.artifacts.find((a) => a.id === p.target);
      const targetUnit = this.unitPos.get(p.target);
      const dest = targetArt?.position || targetUnit;
      if (dest) {
        this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: dest.x, toY: dest.y, color: "#fbbf24", kind: "coin", born: now, duration: 1100 });
        this.floaters.push({ x: dest.x, y: dest.y, text: `+${p.amount}g`, color: "#fde047", born: now, duration: 2500 });
      }
    } else if (ev.type === "amendment.applied") {
      this._spawnSparkles(32, 32, "#fbbf24", 22);
      this.floaters.push({ x: 32, y: 32, text: `★ DECREE RATIFIED: Bill #${p.proposalId} ★`, color: "#fde047", born: now, duration: 4000 });
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
    this.targetCamX = cx * TILE_PX;
    this.targetCamY = cy * TILE_PX;
    this.targetZoom = 1.25;
  }

  focusCoord(x, y) {
    this.targetCamX = x * TILE_PX;
    this.targetCamY = y * TILE_PX;
    this.targetZoom = 1.65;
  }

  resetView() {
    this.targetCamX = 32 * TILE_PX;
    this.targetCamY = 32 * TILE_PX;
    this.targetZoom = 0.72;
  }

  zoomBy(factor) {
    this.targetZoom = Math.max(0.45, Math.min(2.4, this.targetZoom * factor));
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

  _project(wx, wy) {
    return {
      x: this.width * 0.5 + (wx * TILE_PX - this.camX) * this.zoom,
      y: this.height * 0.5 + (wy * TILE_PX - this.camY) * this.zoom,
    };
  }

  _inMinimap(px, py) {
    const m = this.minimapRect;
    return px >= m.x && px <= m.x + m.w && py >= m.y && py <= m.y + m.h;
  }

  _jumpToMinimap(px, py) {
    const m = this.minimapRect;
    const fx = Math.max(0, Math.min(1, (px - m.x) / m.w));
    const fy = Math.max(0, Math.min(1, (py - m.y) / m.h));
    this.targetCamX = fx * 64 * TILE_PX;
    this.targetCamY = fy * 64 * TILE_PX;
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
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (this._inMinimap(px, py)) {
        this._jumpToMinimap(px, py);
        return;
      }
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
        this.targetCamX -= dx / this.zoom;
        this.targetCamY -= dy / this.zoom;
        this.camX = this.targetCamX;
        this.camY = this.targetCamY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        return;
      }
      if (this._inMinimap(px, py)) {
        this.canvas.style.cursor = "crosshair";
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
    this.minimapRect = { x: 14, y: this.height - 126, w: 112, h: 112 };
  }

  _findHit(px, py) {
    let best = null;
    let bestD = 24;
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

  _render(now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Deep WC2 ocean outside continent bounds
    ctx.fillStyle = "#123458";
    ctx.fillRect(0, 0, this.width, this.height);

    // 1. Blit pre-baked painted Warcraft II terrain continent
    const origin = this._project(0, 0);
    const mapSize = 64 * TILE_PX * this.zoom;
    ctx.drawImage(this.terrainCanvas, origin.x, origin.y, mapSize, mapSize);

    // 2. Dirt & Cobblestone Trade Roads connecting named Warcraft II Keeps!
    const namedHubs = this.anchors.filter((a) => a.name && a.centre);
    if (namedHubs.length >= 2) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(114, 83, 46, 0.72)";
      ctx.lineWidth = Math.max(4, 12 * this.zoom);
      for (let i = 0; i < namedHubs.length - 1; i++) {
        const a = this._project(namedHubs[i].centre.x, namedHubs[i].centre.y);
        const b = this._project(namedHubs[i + 1].centre.x, namedHubs[i + 1].centre.y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 - 18 * this.zoom, b.x, b.y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(182, 149, 98, 0.78)";
      ctx.lineWidth = Math.max(2, 7 * this.zoom);
      ctx.setLineDash([6 * this.zoom, 5 * this.zoom]);
      for (let i = 0; i < namedHubs.length - 1; i++) {
        const a = this._project(namedHubs[i].centre.x, namedHubs[i].centre.y);
        const b = this._project(namedHubs[i + 1].centre.x, namedHubs[i + 1].centre.y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 - 18 * this.zoom, b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Warcraft II Town Halls / Keeps (Nexuses), Runestones (Cairns/Vantages), & Dark Portals (Hollows)
    this.hitTargets = [];
    for (const a of this.anchors) {
      if (!a.centre) continue;
      const p = this._project(a.centre.x, a.centre.y);
      if (p.x < -80 || p.x > this.width + 80 || p.y < -80 || p.y > this.height + 80) continue;
      this._drawAnchor(ctx, p.x, p.y, a, now);
    }

    // 4. Spinning WC2 Spell Circles under executing Mage Towers!
    for (let i = this.runRings.length - 1; i >= 0; i--) {
      const rr = this.runRings[i];
      const age = (now - rr.born) / rr.duration;
      if (age >= 1) {
        this.runRings.splice(i, 1);
        continue;
      }
      const p = this._project(rr.x, rr.y);
      const alpha = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85;
      const rad = Math.max(6, (22 + Math.sin(age * Math.PI) * 10) * this.zoom);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = rr.color;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -now * 0.05;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 4 * this.zoom, rad, rad * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let k = 0; k < 4; k++) {
        const ang = now * 0.0065 + (k * Math.PI) / 2;
        drawFourPointStar(ctx, p.x + Math.cos(ang) * rad, p.y + 4 * this.zoom + Math.sin(ang) * rad * 0.6, 4.5 * this.zoom, "#ffffff", alpha);
      }
      ctx.restore();
    }

    // 5. Depth-sort buildings (artifacts) + chibi Warcraft II units by Y coordinate
    const drawables = [];
    const coordCounts = new Map();
    for (const art of this.artifacts) {
      if (!art.position) continue;
      const key = `${art.position.x},${art.position.y}`;
      const idx = coordCounts.get(key) || 0;
      coordCounts.set(key, idx + 1);
      const angle = idx * 2.1;
      const rad = idx === 0 ? 0 : Math.min(3.6, 1.45 + Math.floor(idx / 5) * 1.05);
      const wx = art.position.x + Math.cos(angle) * rad;
      const wy = art.position.y + Math.sin(angle) * rad;
      drawables.push({ sortY: wy, type: "building", wx, wy, art });
    }

    const unitCounts = new Map();
    for (const ag of this.agents) {
      const u = this.unitPos.get(ag.id) || { x: ag.position?.x ?? 32, y: ag.position?.y ?? 32, moving: false, celebrateUntil: 0, facing: 1 };
      const key = `${Math.round(u.x)},${Math.round(u.y)}`;
      const idx = unitCounts.get(key) || 0;
      unitCounts.set(key, idx + 1);
      const angle = idx * 1.9 + 0.5;
      const rad = idx === 0 ? 0 : 1.3;
      const wx = u.x + Math.cos(angle) * rad;
      const wy = u.y + Math.sin(angle) * rad;
      drawables.push({
        sortY: wy + 0.2,
        type: "unit",
        wx,
        wy,
        ag,
        moving: u.moving,
        celebrating: now < (u.celebrateUntil || 0),
        facing: u.facing || 1,
      });
    }

    drawables.sort((a, b) => a.sortY - b.sortY);

    for (const item of drawables) {
      const p = this._project(item.wx, item.wy);
      if (p.x < -90 || p.x > this.width + 90 || p.y < -90 || p.y > this.height + 90) continue;
      if (item.type === "building") this._drawBuilding(ctx, p.x, p.y, item.art, now);
      else this._drawUnit(ctx, p.x, p.y, item.ag, item.moving, item.celebrating, item.facing, now);
    }

    // 6. Floating Arcane Drifts (cute WC2 wisps)
    for (const d of this.drifts) {
      if (!d.position) continue;
      const p = this._project(d.position.x, d.position.y);
      const z = this.zoom;
      const bob = Math.sin(now * 0.005) * 4 * z;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 10 * z + bob, Math.max(1, 10 * z), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(125, 211, 252, 0.28)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y - 10 * z + bob, Math.max(1, 5 * z), 0, Math.PI * 2);
      ctx.fillStyle = "#e0f2fe";
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(p.x - 2 * z, p.y - 11 * z + bob, 1.3 * z, 1.6 * z);
      ctx.fillRect(p.x + 1 * z, p.y - 11 * z + bob, 1.3 * z, 1.6 * z);
    }

    // 7. Ripples, Spell Bolts / Flying Envelopes, Sparkles, Floaters & Speech Bubbles
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const age = (now - r.born) / r.duration;
      if (age >= 1) {
        this.ripples.splice(i, 1);
        continue;
      }
      const p = this._project(r.x, r.y);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 4 * this.zoom, Math.max(1, (10 + age * 42) * this.zoom), Math.max(0.5, (6 + age * 26) * this.zoom), 0, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 2;
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
      const p1 = this._project(b.fromX, b.fromY);
      const p2 = this._project(b.toX, b.toY);
      const cx = (p1.x + p2.x) * 0.5;
      const cy = Math.min(p1.y, p2.y) - 44 * this.zoom;
      const inv = 1 - t;
      const bx = inv * inv * p1.x + 2 * inv * t * cx + t * t * p2.x;
      const by = inv * inv * p1.y + 2 * inv * t * cy + t * t * p2.y;

      ctx.strokeStyle = b.color;
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (b.kind === "mail") {
        const z = this.zoom;
        ctx.fillStyle = "#fdf2f8";
        ctx.strokeStyle = "#db2777";
        ctx.lineWidth = 1.1;
        ctx.fillRect(bx - 6 * z, by - 4 * z, 12 * z, 8 * z);
        ctx.strokeRect(bx - 6 * z, by - 4 * z, 12 * z, 8 * z);
        ctx.beginPath();
        ctx.moveTo(bx - 6 * z, by - 4 * z);
        ctx.lineTo(bx, by + 1 * z);
        ctx.lineTo(bx + 6 * z, by - 4 * z);
        ctx.stroke();
      } else {
        drawFourPointStar(ctx, bx, by, 7.5 * this.zoom, b.color, 0.95);
        drawFourPointStar(ctx, bx, by, 3.6 * this.zoom, "#ffffff", 1);
      }
    }

    for (const sp of this.sparkles) {
      const age = (now - sp.born) / sp.life;
      if (age < 0 || age >= 1) continue;
      const p = this._project(sp.wx, sp.wy);
      drawFourPointStar(ctx, p.x + sp.dx * this.zoom, p.y + sp.dy * this.zoom, sp.size * 1.4 * this.zoom, age < 0.35 ? "#ffffff" : sp.color, 1 - age);
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      const age = (now - f.born) / f.duration;
      if (age >= 1) {
        this.floaters.splice(i, 1);
        continue;
      }
      const p = this._project(f.x, f.y);
      ctx.font = "700 12px 'IBM Plex Mono', monospace";
      const tw = ctx.measureText(f.text).width;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = "rgba(15, 20, 28, 0.82)";
      ctx.beginPath();
      ctx.roundRect(p.x - tw * 0.5 - 6, p.y - 34 - age * 28, tw + 12, 17, 4);
      ctx.fill();
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x - tw * 0.5, p.y - 22 - age * 28);
      ctx.restore();
    }

    // Speech Bubbles
    for (const [id, b] of this.bubbles.entries()) {
      const age = (now - b.born) / b.duration;
      if (age >= 1) {
        this.bubbles.delete(id);
        continue;
      }
      const u = this.unitPos.get(id);
      if (!u) continue;
      const p = this._project(u.x, u.y);
      const alpha = age > 0.82 ? (1 - age) / 0.18 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "500 10.5px 'Instrument Sans', sans-serif";
      const text = `“${b.text}”`;
      const tw = Math.min(230, ctx.measureText(text).width);
      const bx = p.x - tw * 0.5 - 10;
      const by = p.y - 46 * this.zoom - 22;
      ctx.fillStyle = "rgba(18, 22, 30, 0.94)";
      ctx.strokeStyle = "#d4a64a";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 20, 23, 6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 4, by + 23);
      ctx.lineTo(p.x, by + 28);
      ctx.lineTo(p.x + 4, by + 23);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fef9c3";
      ctx.fillText(text, bx + 10, by + 15, 230);
      ctx.restore();
    }

    // 8. Warcraft II Carved Stone & Gold Top Resource Bar + Clickable Tactical Minimap!
    this._drawWarcraftHud(ctx);

    ctx.restore();
  }

  _drawAnchor(ctx, x, y, a, now) {
    const z = this.zoom;
    const isNamed = Boolean(a.name);

    if (a.class === "nexus") {
      // Classic Warcraft II Town Hall / Stone Courtyard Keep!
      const w = 44 * z;
      const h = 32 * z;
      // Stone plaza paving
      ctx.fillStyle = "#57534e";
      ctx.strokeStyle = "#292524";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(x - w * 0.65, y - h * 0.55, w * 1.3, h * 1.15, 4 * z);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#78716c";
      ctx.fillRect(x - w * 0.55, y - h * 0.45, w * 1.1, h * 0.95);

      // Keep main hall walls
      ctx.fillStyle = "#a8a29e";
      ctx.strokeStyle = "#1c1917";
      ctx.fillRect(x - 16 * z, y - 14 * z, 32 * z, 20 * z);
      ctx.strokeRect(x - 16 * z, y - 14 * z, 32 * z, 20 * z);

      // Steep royal-blue / gold-trimmed WC2 shingled roof
      ctx.fillStyle = isNamed ? "#1d4ed8" : "#475569";
      ctx.beginPath();
      ctx.moveTo(x, y - 28 * z);
      ctx.lineTo(x + 21 * z, y - 12 * z);
      ctx.lineTo(x - 21 * z, y - 12 * z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Archway gate + fluttering pennant flag!
      ctx.fillStyle = "#451a03";
      ctx.beginPath();
      ctx.roundRect(x - 5 * z, y - 3 * z, 10 * z, 9 * z, [4 * z, 4 * z, 0, 0]);
      ctx.fill();

      const wave = Math.sin(now * 0.008 + Math.abs(x)) * 2.2 * z;
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y - 28 * z);
      ctx.lineTo(x, y - 38 * z);
      ctx.stroke();
      ctx.fillStyle = isNamed ? "#fbbf24" : "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(x, y - 38 * z);
      ctx.lineTo(x + 9 * z, y - 35 * z + wave);
      ctx.lineTo(x, y - 32 * z);
      ctx.closePath();
      ctx.fill();
    } else if (a.class === "hollow") {
      // Dark Warcraft II stone rune crater
      ctx.fillStyle = "#1e1b2e";
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(x, y, 16 * z, 11 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Standing Runestone / Cairn
      ctx.fillStyle = "#64748b";
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y - 14 * z);
      ctx.lineTo(x + 7 * z, y + 4 * z);
      ctx.lineTo(x - 7 * z, y + 4 * z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (isNamed && this.showLabels) {
      ctx.font = `700 ${Math.max(9.5, Math.round(10.5 * z))}px 'IBM Plex Mono', monospace`;
      const tw = ctx.measureText(a.name).width;
      const bx = x - tw * 0.5 - 8;
      const by = y + 20 * z;
      ctx.fillStyle = "rgba(24, 18, 12, 0.9)";
      ctx.strokeStyle = "#d4a64a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 16, 16, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fef08a";
      ctx.fillText(a.name, bx + 8, by + 11.5);
    }

    this.hitTargets.push({
      kind: "anchor",
      x,
      y,
      data: a,
      label: `${a.name || a.designation} (${a.class}) · (${a.centre.x}, ${a.centre.y}, ${a.centre.z})`,
    });
  }

  _drawBuilding(ctx, x, y, art, now) {
    const z = this.zoom;
    const kind = String(art.kind || "").toLowerCase();
    const funded = (art.currency ?? 0) > 0;
    const isHovered = this.hovered?.data?.id === art.id;

    // Ground shadow
    ctx.beginPath();
    ctx.ellipse(x + 2 * z, y + 4 * z, 14 * z, 7.5 * z, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
    ctx.fill();

    if (funded) {
      // Iconic Warcraft II GOLD MINE!
      // Rocky golden-streaked mound
      ctx.fillStyle = "#78716c";
      ctx.strokeStyle = "#1c1917";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - 16 * z, y + 6 * z);
      ctx.lineTo(x - 10 * z, y - 10 * z);
      ctx.lineTo(x + 2 * z, y - 14 * z);
      ctx.lineTo(x + 14 * z, y - 7 * z);
      ctx.lineTo(x + 17 * z, y + 6 * z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Timber-framed dark mine tunnel entrance
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x - 6 * z, y - 4 * z, 12 * z, 10 * z);
      ctx.strokeStyle = "#92400e";
      ctx.lineWidth = 2.4 * z;
      ctx.strokeRect(x - 6 * z, y - 4 * z, 12 * z, 10 * z);

      // Glowing gold ore piles spilling out of the mine!
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(x - 9 * z, y + 5 * z, Math.max(1, 3.8 * z), 0, Math.PI * 2);
      ctx.arc(x + 8 * z, y + 5 * z, Math.max(1, 4.2 * z), 0, Math.PI * 2);
      ctx.arc(x + 3 * z, y + 6 * z, Math.max(1, 3 * z), 0, Math.PI * 2);
      ctx.fill();

      const twk = 0.5 + 0.5 * Math.sin(now * 0.008 + Math.abs(x));
      drawFourPointStar(ctx, x + 9 * z, y - 12 * z, 4.2 * z, "#fef08a", 0.5 + 0.5 * twk);

      // Gold badge
      if (z >= 0.8 || isHovered) {
        const badge = `${art.currency}g`;
        ctx.font = `700 ${Math.max(8, Math.round(9 * z))}px 'IBM Plex Mono', monospace`;
        const bw = ctx.measureText(badge).width;
        ctx.fillStyle = "rgba(24, 18, 12, 0.88)";
        ctx.strokeStyle = "#d4a64a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x - bw * 0.5 - 4, y - 26 * z, bw + 8, 13, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fde047";
        ctx.fillText(badge, x - bw * 0.5, y - 16.5 * z);
      }
    } else if (kind === "script" || kind === "machine") {
      // Classic Warcraft II STONE MAGE TOWER!
      const bob = Math.sin(now * 0.005 + Math.abs(x)) * 2 * z;
      // Stone turret cylinder
      ctx.fillStyle = "#94a3b8";
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1.2;
      ctx.fillRect(x - 7.5 * z, y - 16 * z, 15 * z, 21 * z);
      ctx.strokeRect(x - 7.5 * z, y - 16 * z, 15 * z, 21 * z);
      // Battlement parapet
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(x - 9 * z, y - 19 * z, 18 * z, 4 * z);
      ctx.strokeRect(x - 9 * z, y - 19 * z, 18 * z, 4 * z);
      // Tall pointed blue wizard spire roof
      ctx.fillStyle = "#1d4ed8";
      ctx.beginPath();
      ctx.moveTo(x, y - 31 * z);
      ctx.lineTo(x + 9.5 * z, y - 19 * z);
      ctx.lineTo(x - 9.5 * z, y - 19 * z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Glowing cyan lancet window + floating arcane orb
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(x - 2 * z, y - 11 * z, 4 * z, 7 * z);
      drawFourPointStar(ctx, x, y - 34 * z + bob, 4.5 * z, "#7dd3fc", 0.95);
    } else {
      // Classic Warcraft II Medieval Cottage / Farmstead!
      ctx.fillStyle = "#e7dcc8";
      ctx.strokeStyle = "#292524";
      ctx.lineWidth = 1.2;
      ctx.fillRect(x - 9 * z, y - 7 * z, 18 * z, 12 * z);
      ctx.strokeRect(x - 9 * z, y - 7 * z, 18 * z, 12 * z);
      // Timber cross-beams
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 1.4 * z;
      ctx.beginPath();
      ctx.moveTo(x - 9 * z, y - 1 * z);
      ctx.lineTo(x + 9 * z, y - 1 * z);
      ctx.stroke();
      // Warm thatched / terracotta roof
      ctx.fillStyle = "#b45309";
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y - 17 * z);
      ctx.lineTo(x + 11.5 * z, y - 6 * z);
      ctx.lineTo(x - 11.5 * z, y - 6 * z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Lit golden window & wooden door
      ctx.fillStyle = "#78350f";
      ctx.fillRect(x - 5.5 * z, y - 1 * z, 4.5 * z, 6 * z);
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(x + 2 * z, y - 4.5 * z, 4 * z, 4 * z);
      // Safe positive-radius chimney smoke puff
      const puff = (((now * 0.00055 + Math.abs(x) * 0.1) % 1) + 1) % 1;
      ctx.fillStyle = `rgba(248, 250, 252, ${(1 - puff) * 0.45})`;
      ctx.beginPath();
      ctx.arc(x + 5 * z, y - 15 * z - puff * 10 * z, Math.max(0.5, (1.5 + puff * 2.5) * z), 0, Math.PI * 2);
      ctx.fill();
    }

    if (isHovered) {
      // Classic Warcraft II bright green building selection box!
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 1.8;
      ctx.strokeRect(x - 18 * z, y - 22 * z, 36 * z, 30 * z);
    }

    this.hitTargets.push({
      kind: "artifact",
      x,
      y: y - 6 * z,
      data: art,
      label: `${art.name || art.id} (${art.kind}${funded ? ` · ${art.currency}g` : ""}) — Click to inspect`,
    });
  }

  _drawUnit(ctx, x, y, ag, moving, celebrating, facing, now) {
    const z = this.zoom;
    const name = this.actorLabel(ag.id);
    const u = unitClassOf(name);
    const isOnline = this.onlineIds.has(ag.id);
    const isHovered = this.hovered?.data?.id === ag.id;

    const hopPhase = celebrating ? now * 0.018 : moving ? now * 0.015 : now * 0.0045 + Math.abs(x) * 0.08;
    const hop = celebrating
      ? Math.abs(Math.sin(hopPhase)) * 7 * z
      : moving
        ? Math.abs(Math.sin(hopPhase)) * 4.5 * z
        : isOnline
          ? Math.max(0, Math.sin(hopPhase)) * 1.6 * z
          : 0;

    // Iconic Warcraft II bright green unit selection box/ring!
    if (isOnline || isHovered) {
      ctx.strokeStyle = isHovered ? "#ffffff" : "#22c55e";
      ctx.lineWidth = isHovered ? 2 : 1.6;
      ctx.beginPath();
      ctx.ellipse(x, y + 3 * z, 11.5 * z, 6.2 * z, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ground shadow
    ctx.beginPath();
    ctx.ellipse(x, y + 2.5 * z, Math.max(3, (8.5 - hop * 0.25) * z), Math.max(1.5, 4 * z), 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
    ctx.fill();

    const cy = y - 9 * z - hop;
    const bw = 15.5 * z;
    const bh = 14.5 * z;

    // Stubby boots
    const footSwing = moving ? Math.sin(now * 0.022) * 2.5 * z : 0;
    ctx.fillStyle = "#292524";
    ctx.beginPath();
    ctx.ellipse(x - 3.6 * z, y + 1 * z - Math.max(0, footSwing), 2.7 * z, 1.8 * z, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 3.6 * z, y + 1 * z - Math.max(0, -footSwing), 2.7 * z, 1.8 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cute Warcraft II faction armor / robe body
    const bodyGrad = ctx.createRadialGradient(x - 3 * z, cy - 4 * z, 1, x, cy, 12 * z);
    bodyGrad.addColorStop(0, u.light);
    bodyGrad.addColorStop(0.6, u.team);
    bodyGrad.addColorStop(1, u.dark);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(x - bw * 0.5, cy - bh * 0.55, bw, bh, 6.5 * z);
    ctx.fill();
    ctx.stroke();

    // Cute chibi face window
    ctx.fillStyle = u.skin;
    ctx.beginPath();
    ctx.roundRect(x - bw * 0.38, cy - bh * 0.32, bw * 0.76, bh * 0.54, 4.5 * z);
    ctx.fill();

    // Expressive chibi eyes (sleeping when offline, ^ ^ when celebrating, shiny kawaii eyes when awake!)
    const lookX = facing * 0.45 * z;
    const blink = (now * 0.001 + (Math.abs(x) % 7)) % 4.3 > 4.14;
    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#0f172a";
    ctx.lineWidth = 1.4;
    if (celebrating) {
      ctx.beginPath();
      ctx.moveTo(x - 4.2 * z, cy - 0.3 * z);
      ctx.lineTo(x - 2.7 * z, cy - 2.2 * z);
      ctx.lineTo(x - 1.2 * z, cy - 0.3 * z);
      ctx.moveTo(x + 1.2 * z, cy - 0.3 * z);
      ctx.lineTo(x + 2.7 * z, cy - 2.2 * z);
      ctx.lineTo(x + 4.2 * z, cy - 0.3 * z);
      ctx.stroke();
    } else if (!isOnline || blink) {
      ctx.beginPath();
      ctx.moveTo(x - 4 * z, cy - 0.8 * z);
      ctx.lineTo(x - 1.4 * z, cy - 0.8 * z);
      ctx.moveTo(x + 1.4 * z, cy - 0.8 * z);
      ctx.lineTo(x + 4 * z, cy - 0.8 * z);
      ctx.stroke();
    } else {
      for (const ex of [x - 2.8 * z + lookX, x + 2.8 * z + lookX]) {
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(ex, cy - 1.1 * z, Math.max(0.8, 1.8 * z), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ex - 0.55 * z, cy - 1.7 * z, Math.max(0.4, 0.7 * z), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Rosy cheeks + smile
    ctx.fillStyle = "rgba(244, 114, 182, 0.58)";
    ctx.beginPath();
    ctx.ellipse(x - 4.7 * z, cy + 0.9 * z, 1.6 * z, 0.95 * z, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4.7 * z, cy + 0.9 * z, 1.6 * z, 0.95 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    // Warcraft II Role Gear (Footman Shield+Helm, Archmage Hat+Staff, Mage Hood, Grokbot Antenna!)
    const topY = cy - bh * 0.55;
    if (u.role === "footman") {
      // Cute knight helm + round wooden/brass shield!
      ctx.fillStyle = "#94a3b8";
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(x, topY + 1.5 * z, Math.max(1, 7.6 * z), Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      // Tiny plumed crest
      ctx.fillStyle = u.accent;
      ctx.fillRect(x - 1.4 * z, topY - 8.5 * z, 2.8 * z, 4.5 * z);
      // Round shield on side
      ctx.fillStyle = u.team;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x + 8.5 * z, cy + 1.5 * z, Math.max(1, 4.2 * z), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (u.role === "archmage") {
      // Classic Warcraft II Archmage wizard hat + glowing staff!
      ctx.fillStyle = "#065f46";
      ctx.strokeStyle = "#022c22";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(x, topY + 0.8 * z, 8.8 * z, 2.5 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 1.5 * z, topY - 10.5 * z);
      ctx.lineTo(x + 6.5 * z, topY + 0.8 * z);
      ctx.lineTo(x - 6.5 * z, topY + 0.8 * z);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Glowing Archmage staff
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 1.8 * z;
      ctx.beginPath();
      ctx.moveTo(x + 9.2 * z, y + 1 * z);
      ctx.lineTo(x + 9.2 * z, topY - 4 * z);
      ctx.stroke();
      drawFourPointStar(ctx, x + 9.2 * z, topY - 5 * z, 4 * z, "#fde047", 1);
    } else if (u.role === "mage") {
      // Elven violet mage flower crown + glowing staff
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
    } else if (u.role === "golem") {
      // Grokbot glowing antenna
      const sway = Math.sin(now * 0.008 + Math.abs(x)) * 2 * z;
      ctx.strokeStyle = u.dark;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x + sway, topY - 6.5 * z);
      ctx.stroke();
      ctx.fillStyle = u.accent;
      ctx.beginPath();
      ctx.arc(x + sway, topY - 7 * z, Math.max(0.5, 2.5 * z), 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Scout leaf crest
      ctx.fillStyle = "#4ade80";
      ctx.beginPath();
      ctx.ellipse(x - 2.5 * z, topY - 3.5 * z, 2.8 * z, 1.5 * z, -0.45, 0, Math.PI * 2);
      ctx.ellipse(x + 2.5 * z, topY - 3.5 * z, 2.8 * z, 1.5 * z, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // Classic Warcraft II mini green HP bar + nameplate for online/hovered units!
    if ((this.showLabels && isOnline) || isHovered) {
      const barW = 24 * z;
      ctx.fillStyle = "#090d12";
      ctx.fillRect(x - barW * 0.5, topY - 13 * z, barW, 3.2 * z);
      ctx.fillStyle = isOnline ? "#22c55e" : "#94a3b8";
      ctx.fillRect(x - barW * 0.5 + 0.6, topY - 12.5 * z, barW - 1.2, 2.2 * z);

      ctx.font = `600 ${Math.max(8.5, Math.round(9.5 * z))}px 'Instrument Sans', sans-serif`;
      const tw = ctx.measureText(name).width;
      ctx.fillStyle = "rgba(18, 14, 10, 0.86)";
      ctx.strokeStyle = isOnline ? "#d4a64a" : "rgba(148,163,184,0.35)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.roundRect(x - tw * 0.5 - 5, topY - 27 * z, tw + 10, 13, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fef9c3";
      ctx.fillText(name, x - tw * 0.5, topY - 17 * z);
    }

    // Sleeping "z" when offline
    if (!isOnline && z >= 0.75) {
      const zp = (((now * 0.0007 + Math.abs(x) * 0.05) % 1) + 1) % 1;
      ctx.save();
      ctx.globalAlpha = (1 - zp) * 0.72;
      ctx.font = `700 ${Math.max(8, Math.round(9 * z))}px 'IBM Plex Mono', monospace`;
      ctx.fillStyle = "#bae6fd";
      ctx.fillText("z", x + 9 * z + zp * 4 * z, topY - 4 * z - zp * 11 * z);
      ctx.restore();
    }

    this.hitTargets.push({
      kind: "agent",
      x,
      y: cy,
      data: ag,
      label: `${name} (${isOnline ? "ONLINE" : "SLEEPING"}) · (${Math.round(ag.position?.x ?? 0)}, ${Math.round(ag.position?.y ?? 0)}) — Click for Author Dossier`,
    });
  }

  _drawWarcraftHud(ctx) {
    // 1. Carved Medieval Stone & Gold Top Resource Bar
    const totalGold = this.artifacts.reduce((s, a) => s + (a.currency ?? 0), 0);
    const namedCount = this.anchors.filter((a) => a.name).length;
    const onlineCount = this.agents.filter((a) => this.onlineIds.has(a.id)).length;
    const scriptCount = this.artifacts.filter((a) => a.kind === "script" || a.kind === "machine").length;

    const barW = Math.min(this.width - 24, 460);
    const bx = (this.width - barW) * 0.5;
    ctx.fillStyle = "rgba(26, 20, 14, 0.88)";
    ctx.strokeStyle = "#c89b3c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, 10, barW, 24, 4);
    ctx.fill();
    ctx.stroke();

    ctx.font = "700 10.5px 'IBM Plex Mono', monospace";
    const stats = [
      [`GOLD MINES: ${totalGold}g`, "#fde047"],
      [`KEEPS: ${namedCount}`, "#93c5fd"],
      [`UNITS: ${onlineCount}/${this.agents.length}`, "#4ade80"],
      [`TOWERS: ${scriptCount}`, "#c084fc"],
    ];
    let sx = bx + 16;
    for (const [txt, col] of stats) {
      ctx.fillStyle = col;
      ctx.fillText(txt, sx, 26);
      sx += ctx.measureText(txt).width + 20;
    }

    // 2. Classic Clickable Warcraft II Tactical Minimap (bottom-left)
    const m = this.minimapRect;
    ctx.fillStyle = "#1c150e";
    ctx.strokeStyle = "#c89b3c";
    ctx.lineWidth = 2;
    ctx.fillRect(m.x - 3, m.y - 3, m.w + 6, m.h + 6);
    ctx.strokeRect(m.x - 3, m.y - 3, m.w + 6, m.h + 6);

    ctx.drawImage(this.terrainCanvas, m.x, m.y, m.w, m.h);

    // Minimap gold mines & towers
    for (const art of this.artifacts) {
      if (!art.position) continue;
      const mx = m.x + (art.position.x / 64) * m.w;
      const my = m.y + (art.position.y / 64) * m.h;
      ctx.fillStyle = (art.currency ?? 0) > 0 ? "#fde047" : "#38bdf8";
      ctx.fillRect(mx - 1.2, my - 1.2, 2.5, 2.5);
    }

    // Minimap live units
    for (const ag of this.agents) {
      const u = this.unitPos.get(ag.id);
      if (!u) continue;
      const mx = m.x + (u.x / 64) * m.w;
      const my = m.y + (u.y / 64) * m.h;
      ctx.fillStyle = this.onlineIds.has(ag.id) ? "#22c55e" : "#cbd5e1";
      ctx.fillRect(mx - 1.8, my - 1.8, 3.6, 3.6);
    }

    // Minimap white camera viewport rectangle
    const viewW = (this.width / this.zoom / (64 * TILE_PX)) * m.w;
    const viewH = (this.height / this.zoom / (64 * TILE_PX)) * m.h;
    const viewX = m.x + (this.camX / (64 * TILE_PX)) * m.w - viewW * 0.5;
    const viewY = m.y + (this.camY / (64 * TILE_PX)) * m.h - viewH * 0.5;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.max(m.x, viewX),
      Math.max(m.y, viewY),
      Math.min(m.w, viewW),
      Math.min(m.h, viewH),
    );
  }
}
