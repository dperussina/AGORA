/**
 * Isometric RTS Continent Visualizer for Agora (Warcraft / StarCraft-inspired, High-DPI 2D Canvas, 60 FPS).
 * Renders the 64x64 Agora lattice as a living isometric continent with:
 * - Deterministic terrain (ocean, shores, plains, highlands, Nexus plazas, Cairns, Vantages, Hollows)
 * - RTS-style buildings for player-crafted artifacts (Forages/Obelisks, Vaults, Libraries, Town Posts)
 * - Animated faction-colored units with RTS selection rings, smooth gliding movement, nameplates & speech bubbles
 * - Live VFX: construction beams, arcane bolts when running scripts, floating +coin payouts, drifting wisps
 * - Full RTS camera: drag to pan, wheel/buttons to zoom, Focus Active, hover HUD, click unit/building/hub to inspect
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

function factionColor(name) {
  const s = String(name || "").toLowerCase();
  if (s.includes("orchid")) return { primary: "#c084fc", trim: "#f5d0fe", cloak: "#7e22ce" };
  if (s.includes("basalt")) return { primary: "#fb923c", trim: "#fed7aa", cloak: "#9a3412" };
  if (s.includes("archivist") || s.includes("chronicler")) return { primary: "#34d399", trim: "#a7f3d0", cloak: "#065f46" };
  if (s.includes("grok")) return { primary: "#38bdf8", trim: "#bae6fd", cloak: "#0369a1" };
  if (s.includes("architect") || s.includes("cartographer")) return { primary: "#fbbf24", trim: "#fef08a", cloak: "#92400e" };
  // Deterministic fallback palette
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const palettes = [
    { primary: "#f472b6", trim: "#fbcfe8", cloak: "#9d174d" },
    { primary: "#60a5fa", trim: "#bfdbfe", cloak: "#1e40af" },
    { primary: "#4ade80", trim: "#bbf7d0", cloak: "#166534" },
    { primary: "#facc15", trim: "#fef08a", cloak: "#854d0e" },
  ];
  return palettes[h % palettes.length];
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

    // Smooth interpolated unit positions & live bubbles/effects
    this.unitPos = new Map(); // id -> { x, y, tx, ty, moving }
    this.bubbles = new Map(); // id -> { text, born, duration }
    this.bolts = []; // { fromX, fromY, toX, toY, color, born, duration }
    this.floaters = []; // { x, y, text, color, born, duration }
    this.ripples = []; // { x, y, color, born, duration }

    // Camera in isometric screen space (centered on 32,32)
    this.camX = 0;
    this.camY = 0;
    this.zoom = 1.05;
    this.targetCamX = 0;
    this.targetCamY = 0;
    this.targetZoom = 1.05;
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

    // Precompute deterministic 32x32 continent terrain cells (each covers 2x2 lattice units)
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
        grid.push({ gx, gy, wx: gx * 2 + 1, wy: gy * 2 + 1, elev });
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
          this.unitPos.set(a.id, { x: tx, y: ty, tx, ty });
        } else {
          cur.tx = tx;
          cur.ty = ty;
        }
      }
    }
  }

  triggerEvent(ev) {
    if (!ev || !ev.type) return;
    const now = performance.now();
    const p = ev.payload || {};
    const actorId = String(ev.actor || "").replace(/^identity:/, "");
    const pos = this.unitPos.get(actorId);

    if (ev.type === "speak" && p.text && !p.private && pos) {
      this.bubbles.set(actorId, { text: String(p.text).slice(0, 72), born: now, duration: 7500 });
      this.ripples.push({ x: pos.x, y: pos.y, color: "#ff6b4a", born: now, duration: 1500 });
    } else if (ev.type === "speak" && p.private && pos && Array.isArray(p.hearers) && p.hearers[0]) {
      const targetPos = this.unitPos.get(p.hearers[0]);
      if (targetPos) {
        this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: targetPos.x, toY: targetPos.y, color: "#c084fc", born: now, duration: 1100 });
      }
    } else if (ev.type === "act.craft" && typeof p.x === "number") {
      this.ripples.push({ x: p.x, y: p.y, color: "#38bdf8", born: now, duration: 1800 });
      this.floaters.push({ x: p.x, y: p.y, text: `Built ${String(p.name || p.kind || "structure").slice(0, 18)}`, color: "#38bdf8", born: now, duration: 2800 });
    } else if (ev.type === "act.run") {
      const targetArt = this.artifacts.find((a) => a.id === p.target);
      if (pos && targetArt?.position) {
        this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: targetArt.position.x, toY: targetArt.position.y, color: "#34d399", born: now, duration: 950 });
      }
      if (p.payoutReceived > 0 && pos) {
        this.floaters.push({ x: pos.x, y: pos.y, text: `+${p.payoutReceived} coin`, color: "#fbbf24", born: now, duration: 2600 });
      }
    } else if (ev.type === "act.give" && p.amount > 0 && pos) {
      const targetArt = this.artifacts.find((a) => a.id === p.target);
      const targetUnit = this.unitPos.get(p.target);
      const dest = targetArt?.position || targetUnit;
      if (dest) {
        this.bolts.push({ fromX: pos.x, fromY: pos.y, toX: dest.x, toY: dest.y, color: "#fbbf24", born: now, duration: 1000 });
        this.floaters.push({ x: dest.x, y: dest.y, text: `+${p.amount}c`, color: "#fbbf24", born: now, duration: 2400 });
      }
    } else if (ev.type === "amendment.applied") {
      this.floaters.push({ x: 32, y: 32, text: `LAW PASSED: Bill #${p.proposalId}`, color: "#fbbf24", born: now, duration: 3600 });
    }
  }

  focusActive() {
    // Center on the most populated named hub or cluster of online units
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
    this.targetZoom = 1.45;
  }

  focusCoord(x, y) {
    const iso = this._worldToIsoRaw(x, y);
    this.targetCamX = -iso.x;
    this.targetCamY = -iso.y;
    this.targetZoom = 1.8;
  }

  resetView() {
    this.targetCamX = 0;
    this.targetCamY = 0;
    this.targetZoom = 1.0;
  }

  zoomBy(factor) {
    this.targetZoom = Math.max(0.65, Math.min(2.8, this.targetZoom * factor));
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (now) => {
      if (!this.running) return;
      this._step();
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

  _step() {
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
  }

  _worldToIsoRaw(wx, wy) {
    const dx = wx - 32;
    const dy = wy - 32;
    const tileW = 11.5;
    const tileH = 5.8;
    return {
      x: (dx - dy) * tileW,
      y: (dx + dy) * tileH,
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
    let bestD = 18;
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

    // Deep maritime Warcraft/StarCraft ocean backdrop
    const seaGrad = ctx.createRadialGradient(this.width * 0.5, this.height * 0.5, 40, this.width * 0.5, this.height * 0.5, this.width * 0.7);
    seaGrad.addColorStop(0, "#0c2238");
    seaGrad.addColorStop(1, "#06111e");
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle animated ocean wave glints
    ctx.strokeStyle = "rgba(56, 189, 248, 0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const wx = ((i * 97 + now * 0.012) % (this.width + 60)) - 30;
      const wy = (i * 53) % this.height;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + 24, wy);
      ctx.stroke();
    }

    const hw = 23.4 * this.zoom;
    const hh = 11.8 * this.zoom;

    // 1. Render isometric continent terrain tiles (back-to-front)
    for (const cell of this.terrain) {
      const isLand = cell.elev > 0.16;
      const p = this._project(cell.wx, cell.wy, isLand ? Math.max(0, (cell.elev - 0.16) * 0.85) : 0);
      if (p.x < -hw * 2 || p.x > this.width + hw * 2 || p.y < -hh * 3 || p.y > this.height + hh * 3) continue;

      if (!isLand) {
        if (cell.elev > 0.07) {
          this._drawDiamond(ctx, p.x, p.y, hw, hh, "rgba(20, 78, 118, 0.45)", null);
        }
        continue;
      }

      // Draw earthy cliff side under land tiles for 2.5D tabletop depth
      const cliffH = Math.max(3, (cell.elev - 0.15) * 18) * this.zoom;
      ctx.fillStyle = "#1c2826";
      ctx.beginPath();
      ctx.moveTo(p.x - hw, p.y);
      ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh + cliffH);
      ctx.lineTo(p.x - hw, p.y + cliffH);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#131c1b";
      ctx.beginPath();
      ctx.moveTo(p.x + hw, p.y);
      ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh + cliffH);
      ctx.lineTo(p.x + hw, p.y + cliffH);
      ctx.closePath();
      ctx.fill();

      // Biome color by elevation
      let topColor = "#244c3c"; // lush emerald plains
      if (cell.elev < 0.21) topColor = "#7a6f4e"; // coastal sand
      else if (cell.elev > 0.56) topColor = "#4e5d67"; // highland stone
      else if (cell.elev > 0.42) topColor = "#2f5d44"; // forested ridge
      this._drawDiamond(ctx, p.x, p.y, hw, hh, topColor, "rgba(255,255,255,0.035)");
    }

    // 2. Render Nexus Plazas, Cairns, Vantages & Hollows (Landmarks)
    this.hitTargets = [];
    const breathe = 0.5 + 0.5 * Math.sin(now * 0.004);
    for (const a of this.anchors) {
      if (!a.centre) continue;
      const p = this._project(a.centre.x, a.centre.y, 0.25);
      const isNamed = Boolean(a.name);
      const r = (a.class === "nexus" ? 26 : 16) * this.zoom;

      if (a.class === "nexus") {
        // Arcane stone plaza with glowing runic ring
        this._drawDiamond(ctx, p.x, p.y, r * 1.15, r * 0.58, "rgba(30, 41, 59, 0.9)", isNamed ? "#fbbf24" : "rgba(148,163,184,0.45)");
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 0.65, r * 0.32, 0, 0, Math.PI * 2);
        ctx.strokeStyle = isNamed ? `rgba(251, 191, 36, ${0.45 + 0.35 * breathe})` : "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else if (a.class === "hollow") {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 0.7, r * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.fill();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
        ctx.stroke();
      } else {
        this._drawDiamond(ctx, p.x, p.y, r * 0.7, r * 0.35, "rgba(71, 85, 105, 0.7)", "rgba(226,232,240,0.35)");
      }

      if (isNamed && this.showLabels) {
        ctx.font = `600 ${Math.max(9, Math.round(10.5 * this.zoom))}px 'IBM Plex Mono', monospace`;
        const tw = ctx.measureText(a.name).width;
        ctx.fillStyle = "rgba(9, 13, 20, 0.82)";
        ctx.fillRect(p.x - tw * 0.5 - 5, p.y + r * 0.55 - 2, tw + 10, 14);
        ctx.fillStyle = "#fbbf24";
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

    // 3. Collect all drawable buildings (artifacts) + units (agents) and depth-sort by (x + y)
    const drawables = [];

    // Fan overlapping artifacts slightly so buildings at the same hub form a readable RTS village!
    const coordCounts = new Map();
    for (const art of this.artifacts) {
      if (!art.position) continue;
      const key = `${art.position.x},${art.position.y}`;
      const idx = coordCounts.get(key) || 0;
      coordCounts.set(key, idx + 1);
      const angle = idx * 2.1;
      const rad = idx === 0 ? 0 : Math.min(3.2, 1.1 + Math.floor(idx / 5) * 0.9);
      const wx = art.position.x + Math.cos(angle) * rad;
      const wy = art.position.y + Math.sin(angle) * rad;
      drawables.push({ sortKey: wx + wy, type: "building", wx, wy, art });
    }

    const unitCounts = new Map();
    for (const ag of this.agents) {
      const u = this.unitPos.get(ag.id) || { x: ag.position?.x ?? 32, y: ag.position?.y ?? 32, moving: false };
      const key = `${Math.round(u.x)},${Math.round(u.y)}`;
      const idx = unitCounts.get(key) || 0;
      unitCounts.set(key, idx + 1);
      const angle = idx * 1.9 + 0.4;
      const rad = idx === 0 ? 0 : 1.1;
      const wx = u.x + Math.cos(angle) * rad;
      const wy = u.y + Math.sin(angle) * rad;
      drawables.push({ sortKey: wx + wy + 0.1, type: "unit", wx, wy, ag, moving: u.moving });
    }

    drawables.sort((a, b) => a.sortKey - b.sortKey);

    // 4. Render depth-sorted RTS Buildings & Units
    for (const item of drawables) {
      const p = this._project(item.wx, item.wy, 0.25);
      if (p.x < -60 || p.x > this.width + 60 || p.y < -60 || p.y > this.height + 60) continue;

      if (item.type === "building") {
        this._drawBuilding(ctx, p.x, p.y, item.art, now);
      } else {
        this._drawUnit(ctx, p.x, p.y, item.ag, item.moving, now);
      }
    }

    // 5. Render Drifts (floating arcane wisps)
    for (const d of this.drifts) {
      if (!d.position) continue;
      const p = this._project(d.position.x, d.position.y, 0.6 + 0.15 * Math.sin(now * 0.005));
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * this.zoom, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5 * this.zoom, 0, Math.PI * 2);
      ctx.fillStyle = "#e0f2fe";
      ctx.fill();
    }

    // 6. Render live ripples, arcane bolts, speech bubbles, and floating +coin text
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
      const cy = Math.min(p1.y, p2.y) - 36 * this.zoom;
      const inv = 1 - t;
      const bx = inv * inv * p1.x + 2 * inv * t * cx + t * t * p2.x;
      const by = inv * inv * p1.y + 2 * inv * t * cy + t * t * p2.y;

      ctx.strokeStyle = b.color;
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(bx, by, 5 * this.zoom, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, 2.2 * this.zoom, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    // Floating +coin / Built! callouts
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      const age = (now - f.born) / f.duration;
      if (age >= 1) {
        this.floaters.splice(i, 1);
        continue;
      }
      const p = this._project(f.x, f.y, 0.6);
      ctx.font = "700 11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 1 - age;
      ctx.fillText(f.text, p.x - ctx.measureText(f.text).width * 0.5, p.y - 16 - age * 28);
      ctx.globalAlpha = 1;
    }

    // Live RTS Speech Bubbles above speaking units
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
      const bx = p.x - tw * 0.5 - 8;
      const by = p.y - 44 * this.zoom - 18;
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = "rgba(248, 250, 252, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 16, 20, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(text, bx + 8, by + 13.5, 220);
      ctx.restore();
    }

    // Bottom RTS Legend
    const legend = [
      ["Online Unit", "#34d399"],
      ["WASM Tower", "#38bdf8"],
      ["Funded Vault", "#fbbf24"],
      ["Town Post / Lore", "#c084fc"],
    ];
    let lx = 14;
    ctx.font = "500 9.5px 'IBM Plex Mono', monospace";
    for (const [label, col] of legend) {
      ctx.fillStyle = col;
      ctx.fillRect(lx, this.height - 16, 6, 6);
      ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
      ctx.fillText(label, lx + 10, this.height - 10);
      lx += ctx.measureText(label).width + 24;
    }

    ctx.restore();
  }

  _drawBuilding(ctx, x, y, art, now) {
    const z = this.zoom;
    const kind = String(art.kind || "").toLowerCase();
    const funded = (art.currency ?? 0) > 0;
    const isHovered = this.hovered?.data?.id === art.id;

    // Ground shadow
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * z, 9 * z, 4.5 * z, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    ctx.fill();

    if (funded) {
      // Golden Treasury Vault / Funded Bounty Spire
      ctx.fillStyle = "#78350f";
      ctx.fillRect(x - 6 * z, y - 10 * z, 12 * z, 10 * z);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(x, y - 18 * z);
      ctx.lineTo(x + 7 * z, y - 10 * z);
      ctx.lineTo(x - 7 * z, y - 10 * z);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "script" || kind === "machine") {
      // Arcane Crystal Obelisk / Forge Tower
      const bob = Math.sin(now * 0.005 + x) * 1.8 * z;
      ctx.fillStyle = "#1e3a5f";
      ctx.fillRect(x - 4.5 * z, y - 11 * z, 9 * z, 11 * z);
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(x, y - 19 * z + bob);
      ctx.lineTo(x + 4 * z, y - 13 * z + bob);
      ctx.lineTo(x, y - 9 * z + bob);
      ctx.lineTo(x - 4 * z, y - 13 * z + bob);
      ctx.closePath();
      ctx.fill();
    } else {
      // Town Notice Post / Library Pillar
      ctx.fillStyle = "#3b2f4a";
      ctx.fillRect(x - 5 * z, y - 9 * z, 10 * z, 9 * z);
      ctx.fillStyle = "#c084fc";
      ctx.fillRect(x - 6 * z, y - 11 * z, 12 * z, 3 * z);
    }

    if (isHovered) {
      ctx.beginPath();
      ctx.ellipse(x, y + 1 * z, 12 * z, 6 * z, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    this.hitTargets.push({
      kind: "artifact",
      x,
      y: y - 6 * z,
      data: art,
      label: `${art.name || art.id} (${art.kind}${funded ? ` · ${art.currency}c` : ""}) — Click to open in Reading Room`,
    });
  }

  _drawUnit(ctx, x, y, ag, moving, now) {
    const z = this.zoom;
    const name = this.actorLabel(ag.id);
    const col = factionColor(name);
    const isOnline = this.onlineIds.has(ag.id);
    const isHovered = this.hovered?.data?.id === ag.id;
    const bob = moving ? Math.abs(Math.sin(now * 0.014)) * 3.5 * z : Math.sin(now * 0.0035 + x) * 0.8 * z;

    // Warcraft/StarCraft ground selection ring!
    ctx.beginPath();
    ctx.ellipse(x, y + 1.5 * z, 9.5 * z, 4.8 * z, 0, 0, Math.PI * 2);
    ctx.strokeStyle = isHovered ? "#ffffff" : isOnline ? "#34d399" : "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = isHovered || isOnline ? 1.5 : 0.9;
    ctx.stroke();

    // Unit cloak/body (isometric hero silhouette)
    ctx.fillStyle = col.cloak;
    ctx.beginPath();
    ctx.moveTo(x, y - 13 * z - bob);
    ctx.lineTo(x + 5.5 * z, y - 1 * z - bob * 0.5);
    ctx.lineTo(x - 5.5 * z, y - 1 * z - bob * 0.5);
    ctx.closePath();
    ctx.fill();

    // Pauldrons / tunic highlight
    ctx.fillStyle = col.primary;
    ctx.beginPath();
    ctx.arc(x, y - 10 * z - bob, 4 * z, 0, Math.PI * 2);
    ctx.fill();

    // Head / helm glow
    ctx.fillStyle = col.trim;
    ctx.beginPath();
    ctx.arc(x, y - 15.5 * z - bob, 2.7 * z, 0, Math.PI * 2);
    ctx.fill();

    // Nameplate for online or hovered units
    if ((this.showLabels && isOnline) || isHovered) {
      ctx.font = `600 ${Math.max(8.5, Math.round(9.5 * z))}px 'Instrument Sans', sans-serif`;
      const tw = ctx.measureText(name).width;
      ctx.fillStyle = "rgba(8, 12, 20, 0.82)";
      ctx.fillRect(x - tw * 0.5 - 4, y - 28 * z - bob - 9, tw + 8, 12);
      ctx.fillStyle = isOnline ? "#f8fafc" : "#cbd5e1";
      ctx.fillText(name, x - tw * 0.5, y - 28 * z - bob);
    }

    this.hitTargets.push({
      kind: "agent",
      x,
      y: y - 8 * z,
      data: ag,
      label: `${name} (${isOnline ? "ONLINE" : "IDLE"}) · (${Math.round(ag.position?.x ?? 0)}, ${Math.round(ag.position?.y ?? 0)}) — Click for Author Dossier`,
    });
  }
}
