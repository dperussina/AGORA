import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";
import { KNOWN } from "/artifacts.js";

const SIZE = 64;
const HALF = (SIZE - 1) / 2;
const T_AXIS = new THREE.Vector3(0.42, 0.18, -0.31).normalize();
function $(id) {
  return document.getElementById(id);
}

function fnv(text) {
  let hash = 2166136261;
  const source = String(text ?? "");
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(hash, lane) {
  return ((hash >>> (lane * 5)) & 1023) / 1023;
}

function payloadPosition(payload) {
  if (payload === undefined || payload === null || typeof payload !== "object") {
    return null;
  }
  const nested = payload.position;
  const source =
    nested !== undefined && typeof nested === "object" && nested !== null ? nested : payload;
  if (typeof source.x !== "number" || typeof source.y !== "number" || typeof source.z !== "number") {
    return null;
  }
  return { x: source.x, y: source.y, z: source.z };
}

function isPublicField(def) {
  return def !== undefined && def !== null && def.visibility === "public";
}

function publicFieldsOf(typeName, types) {
  const spec = types?.[typeName];
  const fields = spec?.fields && typeof spec.fields === "object" ? spec.fields : {};
  return Object.keys(fields)
    .filter((name) => isPublicField(fields[name]))
    .sort();
}

function sanitize(text) {
  return String(text ?? "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, "")
    .slice(0, 280);
}

function spectrumOf(row, types, standing) {
  const typeKey = `${row.kind}:${row.type ?? row.kind}`;
  const basis = fnv(typeKey);
  const idHash = fnv(row.id);
  const axes = [unit(basis, 0), unit(basis, 1), unit(idHash, 0)];
  for (const name of publicFieldsOf(row.type, types)) {
    const value = row.fields?.[name];
    if (typeof value === "number" && Number.isFinite(value)) {
      axes.push(((Math.abs(Math.trunc(value)) % 1000) + unit(fnv(String(value)), 0)) / 1001);
    } else if (typeof value === "boolean") {
      axes.push(value ? 1 : 0);
    } else if (typeof value === "string") {
      const clean = sanitize(value);
      axes.push(Math.min(1, clean.length / 80), unit(fnv(clean), 1));
    } else {
      axes.push(0);
    }
  }
  if (row.kind === "mark" && typeof row.text === "string") {
    const clean = sanitize(row.text);
    axes.push(Math.min(1, clean.length / 80), unit(fnv(clean), 2));
  }
  const score = standing.get(row.id);
  if (score !== undefined) {
    axes.push(Math.min(1, score.fame / 40), Math.min(1, score.notoriety / 40));
  }
  return { axes, grain: basis, rise: 0.7 + (axes[3] ?? axes[0]) * 1.2 };
}

function cell(pos) {
  return new THREE.Vector3(pos.x - HALF, pos.z - HALF, -(pos.y - HALF));
}

const SATELLITE_RADIUS = 40;
const Y_UP = new THREE.Vector3(0, 1, 0);
const Y_DOWN = new THREE.Vector3(0, -1, 0);

function orbitSeat(pos, now = 0) {
  const at = cell(pos);
  if (at.lengthSq() < 1e-6) {
    at.set(0.15, 1, 0.1);
  }
  at.normalize();
  at.applyAxisAngle(Y_UP, now * 0.000035);
  return at.multiplyScalar(SATELLITE_RADIUS);
}

function faceWorld(node, seat) {
  const inward = seat.clone().negate();
  if (inward.lengthSq() < 1e-6) {
    return;
  }
  node.quaternion.setFromUnitVectors(Y_DOWN, inward.normalize());
}

function latticeOf(point) {
  return {
    x: Math.round(point.x + HALF),
    y: Math.round(-point.z + HALF),
    z: Math.round(point.y + HALF),
  };
}

const canvas = $("spectrum");
const stage = $("spectrum-view");
if (!(canvas instanceof HTMLCanvasElement) || stage === null) {
  throw new Error("spectrum stage missing");
}

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !reduced, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.15));
renderer.setClearColor(0x16101f, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16101f);
scene.fog = new THREE.FogExp2(0x16101f, 0.0022);
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 520);
camera.position.set(48, 36, 54);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = !reduced;
controls.dampingFactor = 0.07;
controls.minDistance = 22;
controls.maxDistance = 130;
controls.target.set(0, 0, 0);

scene.add(new THREE.HemisphereLight(0x8a9aab, 0x1c1612, 0.42));
const key = new THREE.DirectionalLight(0xc4d0da, 0.28);
key.position.set(36, 88, 18);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 8;
key.shadow.camera.far = 220;
key.shadow.camera.left = -48;
key.shadow.camera.right = 48;
key.shadow.camera.top = 48;
key.shadow.camera.bottom = -48;
key.shadow.bias = -0.0002;
scene.add(key);

const FORMS = {
  nexus: KNOWN.nexus(),
  cairn: KNOWN.cairn(),
  vantage: KNOWN.vantage(),
  hollow: KNOWN.hollow(),
  drift: KNOWN.drift(),
  mark: KNOWN.mark(),
  identity: KNOWN.identity(),
  echo: KNOWN.echo(),
  entity: KNOWN.entity(),
};

const MAT = {
  wake: new THREE.LineBasicMaterial({ color: 0xc4a574, transparent: true, opacity: 0.35 }),
  cage: new THREE.LineBasicMaterial({ color: 0x3a454c, transparent: true, opacity: 0.28 }),
  entity: new THREE.MeshStandardMaterial({ color: 0x8a5a40, roughness: 0.45, metalness: 0.2 }),
  residue: new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.4, metalness: 0.15 }),
  plane: new THREE.MeshPhysicalMaterial({
    color: 0x6a7a88,
    roughness: 0.18,
    metalness: 0.35,
    transparent: true,
    opacity: 0.22,
    transmission: 0.35,
    thickness: 0.4,
    side: THREE.DoubleSide,
  }),
  floor: new THREE.MeshPhysicalMaterial({
    color: 0x1a2028,
    roughness: 0.12,
    metalness: 0.45,
    transparent: true,
    opacity: 0.55,
    envMapIntensity: 1.4,
  }),
  fieldNexus: new THREE.MeshBasicMaterial({
    color: 0xffb45a,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  fieldCairn: new THREE.MeshBasicMaterial({
    color: 0xd8e4ee,
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  fieldVantage: new THREE.MeshBasicMaterial({
    color: 0x7af0ff,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  fieldHollow: new THREE.MeshBasicMaterial({
    color: 0x2a0406,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  }),
};

const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE, SIZE, SIZE)), MAT.cage);
scene.add(cage);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE + 12, SIZE + 12), MAT.floor);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -HALF;
floor.receiveShadow = true;
scene.add(floor);

const plane = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), MAT.plane);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);
const ghost = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), MAT.plane.clone());
ghost.material.opacity = 0.1;
ghost.rotation.x = -Math.PI / 2;
scene.add(ghost);

const wakes = new THREE.LineSegments(new THREE.BufferGeometry(), MAT.wake);
scene.add(wakes);

const volumes = new THREE.Group();
const relics = new THREE.Group();
const gods = new THREE.Group();
const wardens = new THREE.Group();
const fields = new THREE.Group();
scene.add(volumes, relics, gods, wardens, fields);
const FIELD_BALL = new THREE.SphereGeometry(2.6, 22, 16);
const FIELD_MAT = {
  nexus: MAT.fieldNexus,
  cairn: MAT.fieldCairn,
  vantage: MAT.fieldVantage,
  hollow: MAT.fieldHollow,
};

function radialMap(stops) {
  const paper = document.createElement("canvas");
  paper.width = 64;
  paper.height = 64;
  const ctx = paper.getContext("2d");
  const wash = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, color] of stops) {
    wash.addColorStop(at, color);
  }
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(paper);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function spriteMat(map, color, opacity = 1) {
  return new THREE.SpriteMaterial({
    map,
    color,
    opacity,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
}

const LIGHT_MAP = radialMap([
  [0, "rgba(255,255,255,1)"],
  [0.12, "rgba(255,244,210,0.95)"],
  [0.38, "rgba(255,190,90,0.45)"],
  [0.7, "rgba(255,120,40,0.12)"],
  [1, "rgba(0,0,0,0)"],
]);
const GLOW_DOT = spriteMat(LIGHT_MAP, 0xe8d2a4, 0.55);

const LIT_KINDS = ["identity", "echo", "entity", "mark", "anchor", "drift"];
const LAMP_TINT = {
  identity: 0x00ffd4,
  echo: 0x6ec8e8,
  entity: 0xffc44d,
  mark: 0xff6a28,
  drift: 0x3ef0d4,
  nexus: 0xffb45a,
  cairn: 0xf0e6d0,
  vantage: 0x7af0ff,
  hollow: 0xff1a14,
  anchor: 0xffd4a0,
};
const LAMP_COUNT = 10;
const lamps = Array.from({ length: LAMP_COUNT }, () => {
  const lamp = new THREE.PointLight(0xffd4a0, 0, 16, 2);
  lamp.castShadow = false;
  scene.add(lamp);
  return lamp;
});

function nightEnvironment() {
  const booth = new THREE.Scene();
  booth.add(new THREE.HemisphereLight(0xd0c4e8, 0x1a1020, 1.3));
  booth.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(10, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x1a1428, side: THREE.BackSide }),
    ),
  );
  const rose = new THREE.PointLight(0xff6aa8, 60, 24, 2);
  rose.position.set(5, 2, -4);
  const aqua = new THREE.PointLight(0x5ad4ff, 52, 24, 2);
  aqua.position.set(-6, 3, 5);
  const gold = new THREE.PointLight(0xffc878, 44, 24, 2);
  gold.position.set(0, 6, 2);
  booth.add(rose, aqua, gold);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const map = pmrem.fromScene(booth, 0.08).texture;
  pmrem.dispose();
  return map;
}

scene.environment = nightEnvironment();
scene.environmentIntensity = 0.95;

function hashUnit(seed, lane) {
  return unit(fnv(seed), lane);
}

function nebulaMap(seed, rgb) {
  const size = 512;
  const paper = document.createElement("canvas");
  paper.width = size;
  paper.height = size;
  const ctx = paper.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 18; i += 1) {
    const x = size * (0.28 + hashUnit(`${seed}:x:${i}`, 0) * 0.44);
    const y = size * (0.28 + hashUnit(`${seed}:y:${i}`, 1) * 0.44);
    const r = size * (0.08 + hashUnit(`${seed}:r:${i}`, 2) * 0.16);
    const a = 0.12 + hashUnit(`${seed}:a:${i}`, 0) * 0.2;
    const wash = ctx.createRadialGradient(x, y, 0, x, y, r);
    wash.addColorStop(0, `rgba(${rgb},${a})`);
    wash.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "destination-in";
  const falloff = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.46);
  falloff.addColorStop(0, "rgba(255,255,255,1)");
  falloff.addColorStop(0.55, "rgba(255,255,255,0.45)");
  falloff.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(paper);
  map.colorSpace = THREE.SRGBColorSpace;
  map.premultiplyAlpha = true;
  return map;
}

function pushStar(positions, colors, x, y, z, tint, gain) {
  positions.push(x, y, z);
  colors.push(tint.r * gain, tint.g * gain, tint.b * gain);
}

function buildStars() {
  const positions = [];
  const colors = [];
  const rose = new THREE.Color(0xff8ec8);
  const aqua = new THREE.Color(0x7ad8ff);
  const gold = new THREE.Color(0xffd078);
  const ice = new THREE.Color(0xf2f6ff);
  const violet = new THREE.Color(0xc89cff);
  const stars = reduced ? 2800 : 9000;
  for (let i = 0; i < stars; i += 1) {
    const kind = hashUnit(`sky:${i}`, 0);
    if (kind < 0.58) {
      const r = 55 + hashUnit(`sky:${i}:r`, 1) * 210;
      const theta = hashUnit(`sky:${i}:t`, 2) * Math.PI * 2;
      const arm = Math.floor(hashUnit(`sky:${i}:a`, 0) * 3);
      const twist = theta + r * 0.03 + arm * ((Math.PI * 2) / 3);
      const lift = (hashUnit(`sky:${i}:y`, 1) - 0.5) * 28 * Math.exp(-r / 80);
      const tint = r < 40 ? gold : kind < 0.2 ? rose : kind < 0.38 ? aqua : ice;
      pushStar(positions, colors, Math.cos(twist) * r, lift + 6, Math.sin(twist) * r, tint, 0.85 + (1 - r / 270) * 0.9);
    } else if (kind < 0.86) {
      const u = hashUnit(`halo:${i}`, 1);
      const v = hashUnit(`halo:${i}`, 2);
      const radius = 140 + u * 110;
      const phi = Math.acos(2 * v - 1);
      const theta = hashUnit(`halo:${i}:t`, 0) * Math.PI * 2;
      pushStar(
        positions,
        colors,
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius * 0.7,
        Math.sin(phi) * Math.sin(theta) * radius,
        kind < 0.72 ? violet : aqua,
        0.55 + u * 0.55,
      );
    } else {
      const host = kind < 0.93 ? [130, 42, -110] : [-118, -34, 136];
      const s = 18 + hashUnit(`dwarf:${i}`, 1) * 26;
      pushStar(
        positions,
        colors,
        host[0] + (hashUnit(`dwarf:${i}:x`, 0) - 0.5) * s,
        host[1] + (hashUnit(`dwarf:${i}:y`, 1) - 0.5) * s * 0.5,
        host[2] + (hashUnit(`dwarf:${i}:z`, 2) - 0.5) * s,
        kind < 0.93 ? gold : rose,
        1.1,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: reduced ? 1.4 : 1.85,
      map: radialMap([
        [0, "rgba(255,255,255,1)"],
        [0.2, "rgba(255,255,255,0.85)"],
        [0.55, "rgba(200,220,255,0.25)"],
        [1, "rgba(0,0,0,0)"],
      ]),
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    }),
  );
}

function buildNebulae() {
  const group = new THREE.Group();
  const clouds = [
    { rgb: "255,90,160", color: 0xff5aa0, pos: [160, 28, -40], scale: 150 },
    { rgb: "90,180,255", color: 0x5ab4ff, pos: [-70, 50, 170], scale: 170 },
    { rgb: "200,120,255", color: 0xc878ff, pos: [40, -60, -180], scale: 160 },
    { rgb: "255,170,70", color: 0xffaa46, pos: [-160, 20, -90], scale: 140 },
    { rgb: "70,255,210", color: 0x46ffd2, pos: [120, -30, 140], scale: 130 },
    { rgb: "255,80,120", color: 0xff5078, pos: [-40, 80, -150], scale: 120 },
    { rgb: "120,90,255", color: 0x785aff, pos: [90, 70, 90], scale: 145 },
    { rgb: "255,210,120", color: 0xffd278, pos: [-130, -50, 60], scale: 125 },
  ];
  for (const [index, cloud] of clouds.entries()) {
    const sprite = new THREE.Sprite(spriteMat(nebulaMap(`neb:${index}`, cloud.rgb), 0xffffff, 0.7));
    sprite.position.set(cloud.pos[0], cloud.pos[1], cloud.pos[2]);
    sprite.scale.setScalar(cloud.scale);
    group.add(sprite);
  }
  return group;
}

function buildCosmos() {
  const root = new THREE.Group();
  root.add(buildStars(), buildNebulae());
  root.rotation.x = 0.4;
  root.rotation.z = -0.16;
  return root;
}

const cosmos = buildCosmos();
scene.add(cosmos);

const state = {
  z: 32,
  tick: 0,
  types: {},
  names: new Map(),
  standing: new Map(),
  founders: new Set(),
  occupants: new Map(),
  residue: [],
  selected: null,
  onScreen: true,
  streamLive: false,
  dirty: true,
  picks: [],
  movers: [],
  prints: { volumes: "", relics: "", gods: "", wardens: "" },
};

function occupantKey(kind, id, extra = "") {
  return `${kind}:${id}:${extra}`;
}

function put(row) {
  if (row.position === undefined || row.position === null) {
    return;
  }
  const extra = row.kind === "mark" ? `${row.position.x},${row.position.y},${row.position.z}` : "";
  state.occupants.set(occupantKey(row.kind, row.id, extra), row);
  state.dirty = true;
}

function dropKind(kind) {
  for (const [key, row] of state.occupants) {
    if (row.kind === kind) {
      state.occupants.delete(key);
    }
  }
  state.dirty = true;
}

function rememberBody(id, position, kind) {
  if (position === null) {
    return;
  }
  const prior = [...state.occupants.values()].find((row) => row.kind === kind && row.id === id);
  state.occupants.set(occupantKey(kind, id), {
    kind,
    id,
    type: prior?.type ?? (kind === "identity" ? "identity" : kind),
    position,
    fields: prior?.fields,
    text: prior?.text,
  });
  state.dirty = true;
}

function foldEntity(item) {
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const id = typeof payload.id === "string" ? payload.id : "";
  const at = payloadPosition(payload);
  if (item.type === "effect.create" && id.length > 0) {
    put({
      kind: "entity",
      id,
      type: typeof payload.type === "string" ? payload.type : "entity",
      position: at,
    });
    return at;
  }
  if (item.type === "effect.move" && id.length > 0 && at !== null) {
    const prior = [...state.occupants.values()].find((row) => row.kind === "entity" && row.id === id);
    put({
      kind: "entity",
      id,
      type: prior?.type ?? "entity",
      position: at,
      fields: prior?.fields,
    });
    return at;
  }
  if (item.type === "effect.destroy" && id.length > 0) {
    state.occupants.delete(occupantKey("entity", id));
    state.dirty = true;
  }
  return at;
}

function ripple(_position, _type) {}

function listOf(kind) {
  return [...state.occupants.values()].filter((row) => row.kind === kind && row.position);
}

function godCenters() {
  return listOf("identity").map((row) => ({
    id: row.id,
    world: cell(row.position),
    fame: state.standing.get(row.id)?.fame ?? 0,
  }));
}

function writeLines(object, points) {
  const data = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i += 1) {
    data[i * 3] = points[i].x;
    data[i * 3 + 1] = points[i].y;
    data[i * 3 + 2] = points[i].z;
  }
  object.geometry.dispose();
  object.geometry = new THREE.BufferGeometry();
  object.geometry.setAttribute("position", new THREE.BufferAttribute(data, 3));
}

function buildWakes(godsAt) {
  const points = [];
  for (const echo of listOf("echo")) {
    const live = listOf("identity").find((row) => row.id === echo.id);
    const from = cell(echo.position).addScaledVector(T_AXIS, 5.2);
    const to = live ? cell(live.position) : from.clone();
    points.push(from, to);
  }
  for (const god of godsAt) {
    points.push(god.world.clone(), god.world.clone().addScaledVector(T_AXIS, -1.6));
  }
  writeLines(wakes, points);
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    child.traverse((node) => {
      if (node.userData.label && node.material) {
        node.material.map?.dispose();
        node.material.dispose();
      }
    });
    group.remove(child);
  }
}

function placeForm(kind, row, place) {
  const proto = FORMS[kind] ?? FORMS[row.type];
  if (proto === undefined) {
    return null;
  }
  const node = proto.clone();
  if (row.type === "vantage") {
    const seat = orbitSeat(row.position);
    node.position.copy(seat);
    faceWorld(node, seat);
    node.userData.worldOrbit = true;
  } else {
    node.position.copy(cell(row.position));
  }
  if (place !== undefined) {
    place(node);
  }
  adornGlow(node, row);
  labelForm(node, row);
  tag(node, row);
  return node;
}

function nameSprite(text, color, max = 18) {
  const board = document.createElement("canvas");
  board.width = 320;
  board.height = 72;
  const ctx = board.getContext("2d");
  if (ctx === null) {
    return new THREE.Sprite();
  }
  ctx.clearRect(0, 0, board.width, board.height);
  const wash = ctx.createLinearGradient(20, 0, 300, 0);
  wash.addColorStop(0, "rgba(8, 12, 18, 0.88)");
  wash.addColorStop(1, "rgba(18, 28, 36, 0.7)");
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.moveTo(30, 10);
  ctx.lineTo(292, 10);
  ctx.lineTo(306, 24);
  ctx.lineTo(306, 52);
  ctx.lineTo(292, 66);
  ctx.lineTo(30, 66);
  ctx.lineTo(16, 52);
  ctx.lineTo(16, 24);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.62;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(38, 38, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.font = "500 24px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text.slice(0, max), 172, 38);
  const texture = new THREE.CanvasTexture(board);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(4.45, 1, 1);
  sprite.userData.label = true;
  return sprite;
}

function placeTitle(row) {
  if (row.kind === "anchor") {
    const voted = typeof row.name === "string" ? row.name.trim() : "";
    return voted.length > 0 ? voted : `ANCHOR:${row.id}`;
  }
  if (row.kind === "identity") {
    const named = state.names.get(row.id);
    return typeof named === "string" && named.length > 0 ? named : "agent";
  }
  return "";
}

function labelForm(node, row) {
  const title = placeTitle(row);
  if (title.length === 0) {
    return;
  }
  const lift = {
    nexus: 3.9,
    cairn: 2.7,
    vantage: 0.72,
    hollow: 2.35,
    identity: 1.2,
  };
  const color = row.kind === "identity" ? "#00ffd4" : "#e8d2a4";
  const sprite = nameSprite(title, color, row.kind === "anchor" ? 22 : 18);
  sprite.position.y = lift[row.type] ?? lift[row.kind] ?? 1.4;
  node.add(sprite);
}

function adornGlow(node, row) {
  const tint = LAMP_TINT[row.type] ?? LAMP_TINT[row.kind] ?? 0xffd4a0;
  const halo = new THREE.Sprite(spriteMat(LIGHT_MAP, tint, 0.62));
  const glowY = {
    vantage: 0.12,
    identity: 0.4,
    echo: 0.35,
    hollow: 0.42,
    cairn: 1.15,
    nexus: 0.55,
    mark: 1.35,
    drift: 0.08,
    entity: 0.38,
  };
  const glowS = {
    vantage: 1.85,
    nexus: 6.4,
    cairn: 4.6,
    hollow: 3.4,
    mark: 2.2,
    drift: 1.8,
    entity: 2.0,
    identity: 4.8,
    echo: 2.1,
  };
  halo.position.y = glowY[row.type] ?? glowY[row.kind] ?? 0.55;
  halo.scale.setScalar(glowS[row.type] ?? glowS[row.kind] ?? (row.kind === "anchor" ? 4.2 : 2.4));
  halo.userData = { motion: "glow", phase: fnv(row.id), rest: halo.scale.clone() };
  node.add(halo);
  const underY = {
    nexus: -0.34,
    cairn: -0.22,
    vantage: -0.58,
    hollow: -0.24,
    mark: -0.1,
    entity: -0.36,
    identity: -0.14,
    echo: -0.12,
    drift: -0.14,
  };
  const belly = underY[row.type] ?? underY[row.kind];
  if (belly !== undefined) {
    const under = new THREE.Sprite(spriteMat(LIGHT_MAP, tint, 0.48));
    under.position.y = belly;
    under.scale.setScalar((glowS[row.type] ?? glowS[row.kind] ?? 2.4) * 0.55);
    under.userData = { motion: "glow", phase: fnv(`${row.id}:under`), rest: under.scale.clone() };
    node.add(under);
  }
}

function wardenAxis(row) {
  if (row.axis === "x" || row.axis === "y" || row.axis === "z") {
    return row.axis;
  }
  const at = row.position;
  if (at.x === 0 || at.x === SIZE - 1) {
    return "x";
  }
  if (at.y === 0 || at.y === SIZE - 1) {
    return "y";
  }
  return "z";
}

function wardenFace(row, axis) {
  if (typeof row.face === "number") {
    return row.face;
  }
  return row.position[axis] === 0 ? 0 : SIZE - 1;
}

function placeWarden(row) {
  const axis = wardenAxis(row);
  const face = wardenFace(row, axis);
  const node = new THREE.Group();
  node.position.copy(cell(row.position));
  if (axis === "x") {
    node.position.x += face === 0 ? 0.2 : -0.2;
  } else if (axis === "y") {
    node.position.z += face === 0 ? -0.2 : 0.2;
  } else {
    node.position.y += face === 0 ? 0.2 : -0.2;
  }
  const dot = new THREE.Sprite(GLOW_DOT);
  dot.scale.setScalar(0.7);
  node.add(dot);
  tag(node, row);
  return node;
}

function buildWardens() {
  clearGroup(wardens);
  for (const row of listOf("warden")) {
    wardens.add(placeWarden(row));
  }
}

function tag(node, row) {
  node.userData.row = row;
  node.traverse((child) => {
    child.userData.row = row;
  });
}

function buildVolumes() {
  clearGroup(volumes);
  clearGroup(fields);
  for (const row of listOf("anchor")) {
    const node = placeForm(row.type, row);
    if (node !== null) {
      volumes.add(node);
    }
    const aura = new THREE.Mesh(FIELD_BALL, FIELD_MAT[row.type] ?? MAT.fieldCairn);
    if (row.type === "vantage") {
      const seat = orbitSeat(row.position);
      aura.position.copy(seat);
      aura.scale.setScalar(0.62);
      aura.userData.worldOrbit = true;
      aura.userData.row = row;
    } else {
      aura.position.copy(cell(row.position));
    }
    if (row.type === "hollow") {
      aura.scale.setScalar(1.45);
    }
    if (row.type === "nexus") {
      aura.scale.setScalar(2.35);
    }
    if (row.type === "cairn") {
      aura.scale.setScalar(1.55);
    }
    fields.add(aura);
  }
}

function buildRelics() {
  clearGroup(relics);
  for (const row of listOf("mark")) {
    const node = placeForm("mark", row);
    if (node !== null) {
      relics.add(node);
    }
  }
  for (const row of listOf("drift")) {
    const node = placeForm("drift", row);
    if (node !== null) {
      relics.add(node);
    }
  }
  for (const row of listOf("entity")) {
    const spec = spectrumOf(row, state.types, state.standing);
    const node = placeForm("entity", row, (clone) => {
      clone.rotation.y = spec.grain % 8;
      clone.scale.setScalar(0.85 + spec.rise * 0.15);
    });
    if (node !== null) {
      relics.add(node);
    }
  }
}

function buildGods() {
  clearGroup(gods);
  for (const row of listOf("identity")) {
    const fame = state.standing.get(row.id)?.fame ?? 0;
    const node = placeForm("identity", row, (clone) => {
      clone.scale.setScalar(1 + Math.min(0.45, fame / 20) + (state.founders.has(row.id) ? 0.12 : 0));
    });
    if (node !== null) {
      gods.add(node);
    }
  }
  for (const row of listOf("echo")) {
    const node = placeForm("echo", row, (clone) => {
      clone.position.addScaledVector(T_AXIS, 5.2);
      clone.scale.setScalar(0.86);
    });
    if (node !== null) {
      gods.add(node);
    }
  }
}

function collectPicks() {
  state.picks = [];
  for (const root of [volumes, relics, gods, wardens]) {
    for (const child of root.children) {
      state.picks.push(child);
    }
  }
}

function collectMovers() {
  state.movers = [];
  for (const root of [volumes, relics, gods, wardens, fields]) {
    root.traverse((node) => {
      if (node.userData.motion || node.userData.worldOrbit) {
        state.movers.push(node);
      }
    });
  }
}

function syncLiving() {
  const at = new Map();
  for (const child of gods.children) {
    const row = child.userData.row;
    if (row) {
      at.set(`${row.kind}:${row.id}`, child);
    }
  }
  for (const row of listOf("identity")) {
    const node = at.get(`identity:${row.id}`);
    if (node) {
      node.position.copy(cell(row.position));
      node.userData.row = row;
    }
  }
}

function paint() {
  const volumesPrint = listOf("anchor")
    .map((row) => `${row.id}:${row.type}:${row.name ?? ""}`)
    .sort()
    .join("|");
  const wardensPrint = listOf("warden")
    .map((row) => row.id)
    .sort()
    .join("|");
  const relicsPrint = [...listOf("mark"), ...listOf("drift"), ...listOf("entity")]
    .map((row) => `${row.kind}:${row.id}:${row.position.x},${row.position.y},${row.position.z}`)
    .sort()
    .join("|");
  const godsPrint = [...listOf("identity"), ...listOf("echo")]
    .map((row) => `${row.kind}:${row.id}:${state.names.get(row.id) ?? ""}`)
    .sort()
    .join("|");
  let rebuilt = false;
  if (volumesPrint !== state.prints.volumes) {
    buildVolumes();
    state.prints.volumes = volumesPrint;
    rebuilt = true;
  }
  if (wardensPrint !== state.prints.wardens) {
    buildWardens();
    state.prints.wardens = wardensPrint;
    rebuilt = true;
  }
  if (relicsPrint !== state.prints.relics) {
    buildRelics();
    state.prints.relics = relicsPrint;
    rebuilt = true;
  }
  if (godsPrint !== state.prints.gods) {
    buildGods();
    buildWakes(godCenters());
    state.prints.gods = godsPrint;
    rebuilt = true;
  } else {
    syncLiving();
  }
  if (rebuilt) {
    collectMovers();
  }
  collectPicks();
  const census = { identity: 0, echo: 0, mark: 0, anchor: 0, warden: 0, drift: 0, entity: 0 };
  for (const row of state.occupants.values()) {
    census[row.kind] = (census[row.kind] ?? 0) + 1;
  }
  writeCensus(census);
  state.dirty = false;
}

function applyMap(map) {
  dropKind("echo");
  dropKind("anchor");
  dropKind("warden");
  dropKind("drift");
  if (!state.streamLive) {
    dropKind("identity");
    dropKind("entity");
    dropKind("mark");
  }
  for (const row of map.bodies ?? []) {
    if (typeof row.id === "string") {
      put({ kind: "echo", id: row.id, type: "identity", position: row.position });
    }
  }
  for (const row of map.anchors ?? []) {
    put({
      kind: "anchor",
      id: String(row.designation ?? "anchor"),
      type: String(row.class ?? "anchor"),
      position: row.centre,
      name: typeof row.name === "string" ? row.name : "",
    });
  }
  for (const row of map.wardens ?? []) {
    put({
      kind: "warden",
      id: String(row.id ?? "warden"),
      type: "warden",
      position: row.position,
      axis: row.axis,
      face: row.face,
    });
  }
  for (const row of map.drifts ?? []) {
    put({ kind: "drift", id: String(row.id ?? "drift"), type: "drift", position: row.position });
  }
  if (!state.streamLive) {
    for (const row of map.entities ?? []) {
      put({
        kind: "entity",
        id: String(row.id ?? ""),
        type: typeof row.type === "string" ? row.type : "entity",
        position: row.position,
      });
    }
    for (const row of map.marks ?? []) {
      put({
        kind: "mark",
        id: String(row.authorId ?? "mark"),
        type: "mark",
        position: row.position,
        text: typeof row.text === "string" ? row.text : "",
      });
    }
  }
}

function writeCensus(census) {
  const root = $("spectrum-census");
  if (root === null) {
    return;
  }
  root.replaceChildren();
  const labels = {
    identity: "inhabitants",
    echo: "echoes",
    entity: "things",
    mark: "marks",
    anchor: "places",
    warden: "wardens",
    drift: "drift",
  };
  for (const kind of ["identity", "echo", "entity", "mark", "anchor", "warden", "drift"]) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = labels[kind];
    dd.textContent = String(census[kind] ?? 0);
    row.append(dt, dd);
    root.append(row);
  }
}

function writeSelected(hit) {
  const box = $("spectrum-selected");
  const axes = $("spectrum-axes");
  const caption = $("spectrum-caption");
  if (box === null || axes === null) {
    return;
  }
  if (hit === null) {
    box.replaceChildren();
    box.textContent = "Click the lattice.";
    axes.replaceChildren();
    axes.dataset.empty = "true";
    if (caption) {
      caption.textContent =
        "The fold is not the world. It is what the log looks like when you stand outside time.";
    }
    return;
  }
  const spec = spectrumOf(hit, state.types, state.standing);
  const title = document.createElement("strong");
  title.textContent = placeTitle(hit) || hit.type || hit.kind;
  const meta = document.createElement("small");
  const at = hit.position ? `${hit.position.x}, ${hit.position.y}, ${hit.position.z}` : "";
  meta.textContent = hit.kind === "anchor" ? `${hit.type} · ${at}` : at;
  box.replaceChildren(title, meta);
  axes.replaceChildren();
  axes.dataset.empty = spec.axes.length === 0 ? "true" : "false";
  for (const value of spec.axes.slice(0, 12)) {
    const bar = document.createElement("i");
    bar.style.height = `${Math.max(8, Math.round(value * 100))}%`;
    axes.append(bar);
  }
  if (caption) {
    caption.textContent = placeTitle(hit) || hit.type || "A place in the fold.";
  }
}

function pickFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  const y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x, y }, camera);
  const hits = ray.intersectObjects(state.picks, true);
  if (hits[0]?.object.userData.row) {
    return hits[0].object.userData.row;
  }
  if (hits[0] === undefined) {
    const planeHit = ray.intersectObject(plane, false)[0];
    return planeHit === undefined ? null : nearest(latticeOf(planeHit.point));
  }
  return null;
}

function nearest(lattice) {
  let best = null;
  let bestD = 3;
  for (const row of state.occupants.values()) {
    const at = row.position;
    if (at === undefined || at === null) {
      continue;
    }
    const d = Math.max(Math.abs(at.x - lattice.x), Math.abs(at.y - lattice.y), Math.abs(at.z - lattice.z));
    if (d < bestD) {
      bestD = d;
      best = row;
    }
  }
  return best;
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function setPlane(z) {
  state.z = z;
  plane.position.y = z - HALF;
  ghost.position.copy(plane.position).addScaledVector(T_AXIS, 6);
  state.dirty = true;
}

async function readJson(path) {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("json")) {
    throw new Error(path);
  }
  return res.json();
}

async function refresh() {
  const status = $("spectrum-status");
  try {
    const [metrics, map, rules, identities, standing] = await Promise.all([
      readJson("/pulse"),
      readJson("/map"),
      readJson("/rules"),
      readJson("/identities"),
      readJson("/standing?sort=fame"),
    ]);
    state.tick = Number(metrics.tick) || 0;
    state.types = rules?.registry?.types ?? {};
    state.names = new Map((identities.identities ?? []).map((row) => [row.id, row.name]));
    state.founders = new Set((identities.identities ?? []).filter((row) => row.founder).map((row) => row.id));
    state.standing = new Map(
      (standing.standing ?? []).map((row) => [row.id, { fame: Number(row.fame) || 0, notoriety: Number(row.notoriety) || 0 }]),
    );
    applyMap(map);
    state.dirty = true;
    if (status) {
      status.textContent = metrics.halted ? "The world is still." : `Tick ${state.tick}`;
      status.dataset.state = metrics.halted ? "down" : "up";
    }
    if (state.selected) {
      writeSelected(
        [...state.occupants.values()].find((row) => row.kind === state.selected.kind && row.id === state.selected.id) ??
          null,
      );
    }
  } catch {
    if (status) {
      status.textContent = "The fold is out of reach.";
      status.dataset.state = "down";
    }
  }
}

function appendRecord(item) {
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const at = payloadPosition(payload);
  const actor = typeof item.actor === "string" && item.actor.startsWith("identity:") ? item.actor.slice(10) : "";
  if (item.type === "act.move" && actor.length > 0 && at !== null) {
    rememberBody(actor, at, "identity");
    ripple(at, item.type);
  }
  if (item.type === "act.mark" && at !== null) {
    put({
      kind: "mark",
      id: actor || "mark",
      type: "mark",
      position: at,
      text: typeof payload.text === "string" ? payload.text : "",
    });
    ripple(at, item.type);
  }
  if (item.type === "act.speak" && actor.length > 0) {
    const body = listOf("identity").find((row) => row.id === actor);
    ripple(body?.position ?? at, item.type);
  }
  const created = foldEntity(item);
  if (item.type === "effect.create" || item.type === "effect.destroy") {
    ripple(created, item.type);
  }
}

function listen() {
  const source = new EventSource("/listen");
  source.addEventListener("error", () => {
    state.streamLive = false;
  });
  source.addEventListener("presence", (event) => {
    try {
      const data = JSON.parse(event.data);
      dropKind("identity");
      for (const row of Array.isArray(data.bodies) ? data.bodies : []) {
        if (typeof row.id === "string") {
          rememberBody(row.id, payloadPosition(row.position ?? row), "identity");
        }
      }
      state.streamLive = true;
      state.dirty = true;
    } catch {
      /* ignore malformed frames */
    }
  });
  source.addEventListener("record", (event) => {
    try {
      appendRecord(JSON.parse(event.data));
    } catch {
      /* ignore malformed frames */
    }
  });
}

function flicker(now, phase) {
  const t = now * 0.011 + phase * 0.001;
  return 0.62 + Math.sin(t) * 0.18 + Math.sin(t * 2.63) * 0.12 + Math.sin(t * 5.17) * 0.07;
}

function aimLamps() {
  const ranked = LIT_KINDS.flatMap((kind) => listOf(kind))
    .map((row) => {
      const world = row.type === "vantage" ? orbitSeat(row.position, performance.now()) : cell(row.position);
      if (row.kind === "echo") {
        world.addScaledVector(T_AXIS, 5.2);
      }
      if (row.type === "vantage" && world.lengthSq() > 1e-6) {
        world.addScaledVector(world.clone().normalize(), 0.35);
      }
      return { row, world, d: camera.position.distanceToSquared(world) };
    })
    .sort((a, b) => {
      const rank = (row) => (row.kind === "identity" ? 0 : 1);
      const order = rank(a.row) - rank(b.row);
      return order !== 0 ? order : a.d - b.d;
    });
  for (let i = 0; i < LAMP_COUNT; i += 1) {
    const lamp = lamps[i];
    const hit = ranked[i];
    if (hit === undefined) {
      lamp.intensity = 0;
      continue;
    }
    lamp.position.copy(hit.world);
    const lift = {
      vantage: 0,
      hollow: 0.42,
      nexus: 0.55,
      cairn: 1.15,
      identity: 0.4,
      echo: 0.35,
      entity: 0.38,
      mark: 1.35,
      drift: 0.08,
    };
    lamp.position.y += lift[hit.row.type] ?? lift[hit.row.kind] ?? 1.1;
    lamp.color.setHex(LAMP_TINT[hit.row.type] ?? LAMP_TINT[hit.row.kind] ?? 0xffd4a0);
    lamp.intensity = hit.row.kind === "identity" ? 320 : hit.row.kind === "anchor" ? 140 : 90;
  }
}

function tick() {
  requestAnimationFrame(tick);
  if (!state.onScreen) {
    return;
  }
  if (state.dirty) {
    paint();
  }
  if (!reduced) {
    controls.update();
    const now = performance.now();
    cosmos.rotation.y += 0.00018;
    aimLamps();
    for (const node of state.movers) {
        if (node.userData.worldOrbit && node.userData.row) {
          const seat = orbitSeat(node.userData.row.position, now);
          node.position.copy(seat);
          if (!node.isMesh) {
            faceWorld(node, seat);
          }
        }
        if (node.userData.motion === "orbit") {
          node.rotation.z += 0.004;
        } else if (node.userData.motion === "writhe") {
          const p = node.userData.phase ?? 0;
          node.rotation.x = Math.sin(now * 0.0014 + p) * 0.14;
          node.rotation.z = Math.cos(now * 0.0011 + p * 1.3) * 0.12;
        } else if (node.userData.motion === "gimbal") {
          node.rotation.y += 0.006;
          node.rotation.z += 0.002;
        } else if (node.userData.motion === "pulse") {
          node.scale.setScalar(1 + Math.sin(now * 0.0025) * 0.12);
        } else if (node.userData.motion === "flicker" || node.userData.motion === "glow") {
          const n = flicker(now, node.userData.phase ?? 0);
          const rest = node.userData.rest;
          if (node.userData.motion === "flicker") {
            node.scale.set(0.86 + n * 0.22, 0.7 + n * 0.55, 0.86 + n * 0.22);
          } else if (rest) {
            node.scale.copy(rest).multiplyScalar(0.88 + n * 0.18);
          }
        }
    }
  } else {
    aimLamps();
  }
  renderer.render(scene, camera);
}

function bind() {
  const slider = $("spectrum-z");
  const label = $("spectrum-z-val");
  if (slider instanceof HTMLInputElement) {
    const sync = () => {
      const z = Number(slider.value);
      if (label) {
        label.textContent = String(z);
      }
      setPlane(z);
    };
    slider.addEventListener("input", sync);
    sync();
  }
  canvas.addEventListener("click", (event) => {
    const hit = pickFromEvent(event);
    state.selected = hit;
    writeSelected(hit);
  });
}

window.addEventListener("resize", resize);
new IntersectionObserver(
  (entries) => {
    state.onScreen = entries.some((entry) => entry.isIntersecting);
    if (typeof window.agoraPauseWorld === "function") {
      window.agoraPauseWorld(state.onScreen);
    }
  },
  { threshold: 0.08 },
).observe(stage);

resize();
writeSelected(null);
bind();
refresh();
window.setInterval(refresh, 30_000);
listen();
requestAnimationFrame(tick);
