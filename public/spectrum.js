import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";
import { KNOWN, blockArtifact, blockForm, wakeArtifact, wakeHasLoot } from "/artifacts.js";

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

function parseCellText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const parts = value.split(",");
  if (parts.length !== 3) {
    return null;
  }
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  if (![x, y, z].every((n) => Number.isInteger(n))) {
    return null;
  }
  return { x, y, z };
}

function payloadPosition(payload) {
  if (payload === undefined || payload === null || typeof payload !== "object") {
    return null;
  }
  const nested = payload.position;
  if (typeof nested === "string") {
    const fromText = parseCellText(nested);
    if (fromText !== null) {
      return fromText;
    }
  }
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
const HOME = {
  pos: new THREE.Vector3(48, 36, 54),
  target: new THREE.Vector3(0, 0, 0),
};
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = !reduced;
controls.dampingFactor = 0.07;
controls.enableZoom = false;
controls.minDistance = 8;
controls.maxDistance = 180;
controls.target.copy(HOME.target);

let fly = null;

function worldOf(row) {
  if (row.type === "vantage") {
    return orbitSeat(row.position);
  }
  const at = row.kind === "identity" ? livingWorld(row) : cell(row.position);
  if (row.kind === "echo") {
    at.addScaledVector(T_AXIS, 5.2);
  }
  return at;
}

function lookDistance(row) {
  if (row.type === "nexus") {
    return 28;
  }
  if (row.type === "hollow") {
    return 20;
  }
  if (row.type === "cairn") {
    return 16;
  }
  if (row.type === "vantage") {
    return 11;
  }
  return 14;
}

function flyTo(toPos, toTarget, duration = 900) {
  fly = {
    fromPos: camera.position.clone(),
    toPos,
    fromTarget: controls.target.clone(),
    toTarget,
    born: performance.now(),
    duration,
  };
}

function flyHome() {
  flyTo(HOME.pos.clone(), HOME.target.clone());
}

function flyToRow(row, distance = lookDistance(row)) {
  if (row?.position === undefined) {
    return;
  }
  const target = worldOf(row);
  const away = camera.position.clone().sub(controls.target);
  if (away.lengthSq() < 0.01) {
    away.set(18, 12, 18);
  }
  away.setLength(distance);
  flyTo(target.clone().add(away), target);
}

function lookingAt(row) {
  if (state.look === null || row === null) {
    return false;
  }
  if (row.kind === "anchor") {
    return state.look.kind === "anchor" && state.look.id === row.id;
  }
  return (row.kind === "identity" || row.kind === "echo") && state.look.id === row.id;
}

function toggleLook(row) {
  if (row?.position === undefined) {
    return;
  }
  const again = lookingAt(row);
  state.selected = row;
  if (again) {
    state.look = null;
    writeSelected(row);
    flyHome();
    return;
  }
  state.look = { kind: row.kind, id: row.id };
  writeSelected(row);
  flyToRow(row);
}

function tickFly(now) {
  if (fly === null) {
    return;
  }
  const t = Math.min(1, (now - fly.born) / fly.duration);
  const ease = 1 - (1 - t) * (1 - t);
  camera.position.lerpVectors(fly.fromPos, fly.toPos, ease);
  controls.target.lerpVectors(fly.fromTarget, fly.toTarget, ease);
  if (t >= 1) {
    fly = null;
  }
}

function dolly(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const next = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * factor));
  offset.setLength(next);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

scene.add(new THREE.HemisphereLight(0x8a9aab, 0x1c1612, 0.42));
const key = new THREE.DirectionalLight(0xc4d0da, 0.28);
key.position.set(36, 88, 18);
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
  beast: KNOWN.beast(),
  wake: KNOWN.wake(),
  crate: KNOWN.crate(),
  slab: KNOWN.slab(),
  post: KNOWN.post(),
  stall: KNOWN.stall(),
};

const PAPER_TYPES = new Set([
  "war",
  "wound",
  "fallen",
  "gold",
  "resource",
  "listing",
  "offer",
  "message",
  "channel",
  "skill",
  "home",
  "invite",
  "membership",
  "guild",
]);

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
const SPARK_MAP = LIGHT_MAP;
const sparks = [];

function sequence(index, factor, offset = 0) {
  return (index * factor + offset) % 1;
}

function visualTone(type) {
  if (type.startsWith("amendment.")) {
    return { color: 0xc4a574, count: 22, duration: 1800, spread: 7 };
  }
  if (type === "speak" || type === "speak.warden" || type === "act.speak") {
    return { color: 0x00ffd4, count: 18, duration: 1600, spread: 4 };
  }
  if (type === "act.mark") {
    return { color: 0xff6a28, count: 22, duration: 1700, spread: 5 };
  }
  if (type === "effect.create") {
    return { color: 0xffc44d, count: 20, duration: 1500, spread: 5 };
  }
  if (type === "effect.destroy" || type.endsWith("_failed") || type === "body.fell" || type === "body.died") {
    return { color: 0xff1a14, count: 28, duration: 1400, spread: 6 };
  }
  if (type === "war.struck" || type === "act.strike") {
    return { color: 0xc4e8ff, count: 20, duration: 900, spread: 4 };
  }
  if (type === "beast.bit") {
    return { color: 0xff3a6a, count: 20, duration: 980, spread: 4 };
  }
  if (type === "effect.move" || type === "act.move") {
    return { color: 0x7af0ff, count: 14, duration: 1100, spread: 3 };
  }
  return { color: 0x9ec4d4, count: 12, duration: 1100, spread: 3 };
}

function visualEvent(type, payload) {
  if (type === "act.fall" || type === "act.wait" || type === "wake.rolled") {
    return false;
  }
  if (type === "effect.create" && payload && PAPER_TYPES.has(payload.type)) {
    return false;
  }
  return (
    type === "speak" ||
    type === "speak.warden" ||
    (type.startsWith("act.") && type !== "act.wait") ||
    type.startsWith("effect.") ||
    type.startsWith("amendment.") ||
    type.startsWith("war.") ||
    type === "beast.bit" ||
    type === "body.fell" ||
    type === "body.died" ||
    type.endsWith("_failed")
  );
}

function eventSeed(item) {
  const type = typeof item.type === "string" ? item.type : "event";
  let seed = (Number(item.seq) || Number(item.tick) * 31 || 1) + type.length * 17;
  for (let i = 0; i < type.length; i += 1) {
    seed = Math.imul(seed ^ type.charCodeAt(i), 16777619);
  }
  return seed >>> 0;
}

function eventArc(from, to, color) {
  const distance = from.distanceTo(to);
  const middle = from.clone().lerp(to, 0.5);
  middle.y += Math.max(1.5, distance * 0.16);
  const curve = new THREE.QuadraticBezierCurve3(from, middle, to);
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(20)),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function disposeSpark(spark) {
  scene.remove(spark.group);
  spark.group.traverse((node) => {
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material && material.map !== SPARK_MAP) {
        material.dispose();
      }
    }
  });
}

function sparkAt(item, context = {}) {
  const type = typeof item.type === "string" ? item.type : "event";
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  if (!visualEvent(type, payload)) {
    return;
  }
  const tone = visualTone(type);
  const eventAt = context.at ?? payloadPosition(item.payload);
  const origin = eventAt === null ? new THREE.Vector3(0, 0, 0) : cell(eventAt);
  const group = new THREE.Group();
  group.position.copy(origin);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(type.startsWith("amendment.") ? 2.2 : 0.7, 0.03, 5, 32),
    new THREE.MeshBasicMaterial({
      color: tone.color,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  ring.quaternion.copy(camera.quaternion);
  group.add(ring);
  const positions = new Float32Array(tone.count * 3);
  const velocities = new Float32Array(tone.count * 3);
  const seed = eventSeed(item);
  for (let i = 0; i < tone.count; i += 1) {
    const theta = sequence(i + seed, 0.61803398875) * Math.PI * 2;
    const y = sequence(i + seed, 0.75487766625, 0.17) * 2 - 1;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const speed = 0.55 + sequence(i + seed, 0.56984029099, 0.41) * tone.spread;
    const offset = i * 3;
    velocities[offset] = Math.cos(theta) * radial * speed;
    velocities[offset + 1] = y * speed + (type === "act.mark" ? 1.4 : 0);
    velocities[offset + 2] = Math.sin(theta) * radial * speed;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: tone.color,
      size: type.startsWith("amendment.") ? 1.15 : 0.8,
      map: SPARK_MAP,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  group.add(particles);
  const paths = [];
  const localOrigin = new THREE.Vector3();
  const from = context.from === null || context.from === undefined ? null : cell(context.from).sub(origin);
  if (
    (type === "act.move" ||
      type === "effect.move" ||
      type === "war.struck" ||
      type === "act.strike" ||
      type === "beast.bit") &&
    from !== null
  ) {
    const path = eventArc(from, localOrigin, tone.color);
    group.add(path);
    paths.push(path);
  }
  scene.add(group);
  sparks.push({
    group,
    particles,
    positions,
    velocities,
    ring,
    paths,
    born: performance.now(),
    duration: tone.duration,
    type,
  });
  while (sparks.length > 24) {
    const oldest = sparks.shift();
    if (oldest !== undefined) {
      disposeSpark(oldest);
    }
  }
}

function tickSparks(now) {
  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const spark = sparks[i];
    const age = (now - spark.born) / spark.duration;
    if (age >= 1) {
      disposeSpark(spark);
      sparks.splice(i, 1);
      continue;
    }
    const travel = Math.sin(Math.min(1, age) * Math.PI * 0.5);
    for (let n = 0; n < spark.positions.length; n += 3) {
      spark.positions[n] = spark.velocities[n] * travel;
      spark.positions[n + 1] = spark.velocities[n + 1] * travel - age * age * 0.8;
      spark.positions[n + 2] = spark.velocities[n + 2] * travel;
    }
    spark.particles.geometry.attributes.position.needsUpdate = true;
    spark.particles.material.opacity = Math.max(0, 1 - age);
    spark.ring.scale.setScalar(1 + age * (spark.type.startsWith("amendment.") ? 12 : 5));
    spark.ring.material.opacity = Math.max(0, (1 - age) * 0.7);
    spark.ring.quaternion.copy(camera.quaternion);
    for (const path of spark.paths) {
      path.material.opacity = Math.max(0, (1 - age) * 0.55);
    }
  }
}

const JET_CAP = 220;
const JET_LIFE = 480;
const jetPos = new Float32Array(JET_CAP * 3);
const jetVel = new Float32Array(JET_CAP * 3);
const jetBorn = new Float32Array(JET_CAP);
const jetAt = new THREE.Vector3();
const jetDir = new THREE.Vector3();
const jetBack = new THREE.Vector3();
const jetExhaust = new THREE.Vector3();
const jetGeo = new THREE.BufferGeometry();
jetGeo.setAttribute("position", new THREE.BufferAttribute(jetPos, 3));
const jetPoints = new THREE.Points(
  jetGeo,
  new THREE.PointsMaterial({
    color: 0x00ffd4,
    size: 0.5,
    map: SPARK_MAP,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  }),
);
jetPoints.frustumCulled = false;
scene.add(jetPoints);
let jetWrite = 0;

function hideJet(slot) {
  const j = slot * 3;
  jetPos[j] = 0;
  jetPos[j + 1] = -9999;
  jetPos[j + 2] = 0;
  jetBorn[slot] = 0;
}

for (let i = 0; i < JET_CAP; i += 1) {
  hideJet(i);
}

function puffJet(at, back, now, count = 4) {
  for (let i = 0; i < count; i += 1) {
    const slot = jetWrite % JET_CAP;
    jetWrite += 1;
    const j = slot * 3;
    jetPos[j] = at.x + (Math.random() - 0.5) * 0.16;
    jetPos[j + 1] = at.y + (Math.random() - 0.5) * 0.16;
    jetPos[j + 2] = at.z + (Math.random() - 0.5) * 0.16;
    const speed = 2.2 + Math.random() * 3.1;
    jetVel[j] = back.x * speed + (Math.random() - 0.5) * 0.75;
    jetVel[j + 1] = back.y * speed + (Math.random() - 0.5) * 0.75;
    jetVel[j + 2] = back.z * speed + (Math.random() - 0.5) * 0.75;
    jetBorn[slot] = now;
  }
}

function tickJet(now) {
  const dt = 0.016;
  let alive = 0;
  for (let i = 0; i < JET_CAP; i += 1) {
    if (jetBorn[i] === 0 || now - jetBorn[i] > JET_LIFE) {
      if (jetBorn[i] !== 0) {
        hideJet(i);
      }
      continue;
    }
    const j = i * 3;
    jetPos[j] += jetVel[j] * dt;
    jetPos[j + 1] += jetVel[j + 1] * dt;
    jetPos[j + 2] += jetVel[j + 2] * dt;
    alive += 1;
  }
  jetGeo.attributes.position.needsUpdate = true;
  jetPoints.material.opacity = alive > 0 ? 0.9 : 0;
}

function godNode(id) {
  for (const child of gods.children) {
    if (child.userData.row?.kind === "identity" && child.userData.row.id === id) {
      return child;
    }
  }
  return null;
}

function tickFlights(now) {
  let landed = false;
  for (const [id, flight] of state.flights) {
    if (foldCombatBusy(id, now)) {
      continue;
    }
    const t = Math.min(1, (now - flight.born) / flight.duration);
    const ease = t * t * (3 - 2 * t);
    jetAt.copy(flight.from).lerp(flight.to, ease);
    jetDir.copy(flight.to).sub(flight.from);
    const node = godNode(id);
    if (jetDir.lengthSq() > 1e-6) {
      jetDir.normalize();
      jetBack.copy(jetDir).negate();
      if (node) {
        node.position.copy(jetAt);
        node.quaternion.setFromUnitVectors(Y_UP, jetDir);
        hideIdleRig(node.userData.idleRig);
      }
      if (!reduced) {
        puffJet(jetExhaust.copy(jetAt).addScaledVector(jetBack, 0.22), jetBack, now);
      }
    } else if (node) {
      node.position.copy(jetAt);
    }
    if (t >= 1) {
      if (node) {
        node.quaternion.identity();
        node.position.copy(flight.to);
      }
      const idle = idles.get(id);
      if (idle !== undefined) {
        holdIdle(idle, now, 700);
      }
      state.flights.delete(id);
      landed = true;
    }
  }
  if (landed || state.flights.size > 0) {
    buildWakes(godCenters());
  }
}

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
  const map = pmrem.fromScene(booth, 0).texture;
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
  text: {},
  names: new Map(),
  profiles: new Map(),
  standing: new Map(),
  ledgers: new Map(),
  founders: new Set(),
  occupants: new Map(),
  residue: [],
  selected: null,
  look: null,
  onScreen: true,
  streamLive: false,
  dirty: true,
  picks: [],
  movers: [],
  prints: { volumes: "", relics: "", gods: "", wardens: "" },
  flights: new Map(),
};

const idles = new Map();
const idleScratch = new THREE.Vector3();
const idleBack = new THREE.Vector3();

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

function sameCell(a, b) {
  return a !== null && b !== null && a.x === b.x && a.y === b.y && a.z === b.z;
}

function cellReach(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

function hollowReach(pos, reach) {
  return listOf("anchor").some((row) => row.type === "hollow" && cellReach(row.position, pos) <= reach);
}

function beginFlight(id, fromLattice, toLattice) {
  if (sameCell(fromLattice, toLattice)) {
    return;
  }
  const to = cell(toLattice);
  const prior = state.flights.get(id);
  const from = prior
    ? prior.from.clone().lerp(prior.to, Math.min(1, (performance.now() - prior.born) / prior.duration))
    : cell(fromLattice);
  const dist = from.distanceTo(to);
  if (dist < 0.05) {
    return;
  }
  const born = performance.now();
  state.flights.set(id, {
    from,
    to,
    born,
    duration: Math.min(2400, 420 + dist * 260),
  });
  if (!reduced) {
    jetDir.copy(to).sub(from);
    if (jetDir.lengthSq() > 1e-6) {
      jetDir.normalize();
      puffJet(from, jetBack.copy(jetDir).negate(), born, 10);
    }
  }
}

function livingWorld(row, now = performance.now()) {
  const flight = state.flights.get(row.id);
  if (flight !== undefined) {
    const t = Math.min(1, (now - flight.born) / flight.duration);
    const ease = t * t * (3 - 2 * t);
    return flight.from.clone().lerp(flight.to, ease);
  }
  const home = cell(row.position);
  const idle = idles.get(row.id);
  if (idle !== undefined) {
    const pose = idlePose(idle, now);
    home.x += pose.x;
    home.y += pose.y;
    home.z += pose.z;
  }
  return home;
}

function easeInOut(t) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - (2 - 2 * clamped) ** 2 / 2;
}

function pickIdleAct(seed, now) {
  const pick = (seed + Math.floor(now * 0.013)) % 100;
  if (pick < 34) {
    return "circle";
  }
  if (pick < 58) {
    return "gather";
  }
  if (pick < 82) {
    return "release";
  }
  return "drift";
}

function idleBusy(item, now) {
  return item.act !== "hold" && now < item.next;
}

function someoneElseBusy(selfId, now) {
  for (const [id, item] of idles) {
    if (id !== selfId && idleBusy(item, now)) {
      return true;
    }
  }
  return false;
}

function holdIdle(idle, now, wait) {
  idle.act = "hold";
  idle.born = now;
  idle.duration = wait;
  idle.next = now + wait;
}

function startIdleAct(idle, now) {
  idle.act = pickIdleAct(idle.seed, now);
  idle.born = now;
  idle.duration = idle.act === "release" ? 4200 : idle.act === "circle" ? 5000 : idle.act === "drift" ? 3600 : 3200;
  idle.next = now + idle.duration;
  idle.heading = ((idle.seed + Math.floor(now)) % 360) * (Math.PI / 180);
}

const foldShots = [];
const recentFoldShots = [];
const dogfights = new Map();
const booms = [];

const foldCombat = {
  poses: new Map(),
  homes: new Map(),
  wounds: new Map(),
};

function occupantCell(id) {
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }
  for (const row of state.occupants.values()) {
    if (row.id === id && row.position) {
      return row.position;
    }
  }
  return foldCombat.homes.get(id) ?? null;
}

function rememberCombatCell(id, at) {
  if (typeof id !== "string" || id.length === 0 || at === null || at === undefined) {
    return;
  }
  foldCombat.homes.set(id, at);
}

function namedBody(name) {
  if (typeof name !== "string" || name.length === 0) {
    return "";
  }
  const folded = name.toLowerCase();
  for (const [id, label] of state.names) {
    if (typeof label === "string" && label.toLowerCase() === folded) {
      return id;
    }
  }
  for (const row of state.occupants.values()) {
    const named = typeof row.name === "string" ? row.name : "";
    const kindName = typeof row.kindName === "string" ? row.kindName : "";
    const type = typeof row.type === "string" ? row.type : "";
    if (named.toLowerCase() === folded || kindName.toLowerCase() === folded || type.toLowerCase() === folded) {
      return row.id;
    }
  }
  return "";
}

function occupantAt(at) {
  if (at === null) {
    return "";
  }
  for (const row of state.occupants.values()) {
    if (row.position && sameCell(row.position, at) && row.kind !== "mark" && row.kind !== "echo") {
      return row.id;
    }
  }
  return "";
}

function resolveCombatId(id, payload) {
  if (typeof id === "string" && id.length > 0 && occupantCell(id) !== null) {
    return id;
  }
  const named = namedBody(typeof payload?.name === "string" ? payload.name : typeof id === "string" ? id : "");
  if (named.length > 0) {
    return named;
  }
  const occupant = occupantAt(payloadPosition(payload ?? {}));
  if (occupant.length > 0) {
    return occupant;
  }
  return typeof id === "string" ? id : "";
}

function setFoldPose(id, mode, now, extra = {}) {
  if (typeof id !== "string" || id.length === 0) {
    return;
  }
  const duration =
    extra.duration ??
    (mode === "hurt" ? 3800 : mode === "rise" ? 2200 : mode === "dead" ? 2400 : mode === "fallen" ? 1e9 : 900);
  foldCombat.poses.set(id, { mode, born: now, duration, ...extra });
}

function lookYaw(from, to) {
  const delta = to.clone().sub(from);
  return Math.atan2(delta.x, delta.z);
}

function foldPoseFor(id, now) {
  const pose = foldCombat.poses.get(id);
  if (pose === undefined) {
    return null;
  }
  const u = Math.min(1, Math.max(0, (now - pose.born) / Math.max(1, pose.duration)));
  if (now - pose.born > pose.duration && pose.mode !== "fallen" && pose.mode !== "dead") {
    if (pose.mode === "hit") {
      setFoldPose(id, "hurt", now, { wounds: pose.wounds, duration: 3600 });
      return foldPoseFor(id, now);
    }
    foldCombat.poses.delete(id);
    return null;
  }
  const base = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  const toward = typeof pose.toward === "string" ? occupantCell(pose.toward) : null;
  const here = occupantCell(id);
  if (toward !== null && here !== null) {
    base.yaw = lookYaw(cell(here), cell(toward));
  }
  if (pose.mode === "lock") {
    base.y = 0.08;
    return base;
  }
  if (pose.mode === "fire") {
    const kick = gate(u, 0.12, 0.7);
    base.z -= kick * 0.16;
    base.pitch = -kick * 0.35;
    return base;
  }
  if (pose.mode === "hit") {
    const rock = gate(u, 0.08, 0.55);
    const wounds = pose.wounds ?? 1;
    base.z += rock * (0.16 + wounds * 0.08);
    base.pitch = rock * 0.55;
    base.roll = Math.sin(u * 22) * rock * 0.4;
    return base;
  }
  if (pose.mode === "hurt") {
    const wounds = pose.wounds ?? 1;
    const linger = 1 - u;
    base.pitch = linger * (0.12 + wounds * 0.08);
    base.roll = Math.sin(now * 0.012) * linger * 0.1;
    return base;
  }
  if (pose.mode === "rise") {
    const lift = u * u * (3 - 2 * u);
    base.pitch = (1 - lift) * (Math.PI / 2);
    base.y = 0.08 + lift * 0.12;
    return base;
  }
  if (pose.mode === "fallen") {
    base.pitch = Math.PI / 2;
    base.y = 0.08;
    base.roll = 0.08;
    return base;
  }
  if (pose.mode === "dead") {
    base.pitch = Math.PI / 2 + u * 1.2;
    base.y = 0.2 + u * 0.4;
    base.roll = u * 2.2;
    return base;
  }
  return base;
}

function combatNode(id) {
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }
  const god = godNode(id);
  if (god) {
    return god;
  }
  for (const root of [relics, volumes]) {
    for (const child of root.children) {
      if (child.userData.row?.id === id) {
        return child;
      }
    }
  }
  const at = occupantCell(id);
  if (at === null) {
    return null;
  }
  for (const child of volumes.children) {
    const row = child.userData.row;
    if (row?.type !== "hollow" || !row.position) {
      continue;
    }
    const reach = Math.max(
      Math.abs(row.position.x - at.x),
      Math.abs(row.position.y - at.y),
      Math.abs(row.position.z - at.z),
    );
    if (reach <= 2) {
      return child;
    }
  }
  return null;
}

function plantedCombat(node) {
  const row = node?.userData?.row;
  return row?.kind === "anchor" || row?.type === "hollow";
}

function fightKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function foldCombatBusy(id, now) {
  if (foldPoseFor(id, now) !== null) {
    return true;
  }
  for (const fight of dogfights.values()) {
    if ((fight.a === id || fight.b === id) && now < fight.until) {
      return true;
    }
  }
  return foldShots.some((shot) => (shot.fromId === id || shot.toId === id) && now - shot.born < shot.duration);
}

function combatWorld(id) {
  const node = combatNode(id);
  if (node) {
    return node.position.clone();
  }
  const at = occupantCell(id);
  return at === null ? null : cell(at);
}

function beginDogfight(fromId, toId, item, now) {
  if (typeof fromId !== "string" || fromId.length === 0 || typeof toId !== "string" || toId.length === 0) {
    return null;
  }
  const fromAt = occupantCell(fromId);
  const toAt = occupantCell(toId) ?? payloadPosition(item.payload);
  if (fromAt === null || toAt === null) {
    return null;
  }
  const from = cell(fromAt);
  const to = cell(toAt);
  const key = fightKey(fromId, toId);
  let fight = dogfights.get(key);
  const nodeA = combatNode(fromId);
  const nodeB = combatNode(toId);
  if (fight === undefined) {
    const mid = from.clone().lerp(to, 0.5);
    const span = Math.max(1.2, from.distanceTo(to));
    const hollow = plantedCombat(nodeA) || plantedCombat(nodeB);
    fight = {
      a: fromId,
      b: toId,
      mid,
      radius: hollow ? Math.min(5.4, Math.max(2.8, span * 0.42)) : Math.min(3.8, Math.max(1.8, span * 0.38)),
      born: now,
      until: now + 6400,
      seed: (fnv(key) % 628) / 100,
      hitA: 0,
      hitB: 0,
      lastVolley: now,
      volley: 0,
      dead: null,
      deadAt: 0,
      framed: false,
      homeA: from.clone(),
      homeB: to.clone(),
      beast: item.type === "beast.bit" || fromId.startsWith("ent:") || toId.startsWith("ent:"),
    };
    dogfights.set(key, fight);
    state.flights.delete(fromId);
    state.flights.delete(toId);
  } else {
    fight.until = Math.max(fight.until, now + 6400);
    if (nodeA) {
      fight.homeA.copy(nodeA.userData.combatHome ?? fight.homeA);
    }
    if (nodeB) {
      fight.homeB.copy(nodeB.userData.combatHome ?? fight.homeB);
    }
  }
  if (!fight.framed && !reduced) {
    fight.framed = true;
    const look = fight.mid.clone();
    if (controls.target.distanceTo(look) > 8) {
      const away = camera.position.clone().sub(controls.target);
      if (away.lengthSq() < 0.01) {
        away.set(18, 12, 18);
      }
      away.setLength(hollowLook(fight));
      flyTo(look.clone().add(away), look, 1100);
    }
  }
  return fight;
}

function hollowLook(fight) {
  return plantedCombat(combatNode(fight.a)) || plantedCombat(combatNode(fight.b)) ? 16 : 12;
}

function markFightHit(fight, toId, now) {
  if (toId === fight.a) {
    fight.hitA = now;
  }
  if (toId === fight.b) {
    fight.hitB = now;
  }
  fight.until = Math.max(fight.until, now + 5600);
}

function spawnFoldShot(from, to, fromId, toId, kind, now) {
  const bite = kind === "bite";
  const rocket = kind === "rocket";
  const blast = kind === "blast";
  const color = new THREE.Color(bite ? 0xff3a6a : rocket ? 0xff7a28 : blast ? 0x7af0ff : 0xc4e8ff);
  const hot = new THREE.Color(bite ? 0xffc078 : rocket ? 0xffe08a : 0xf4fff8);
  const length = Math.max(0.35, from.distanceTo(to));
  const mid = from.clone().lerp(to, 0.5);
  const group = new THREE.Group();
  group.position.copy(mid);
  group.lookAt(to);
  const fat = bite ? 0.28 : blast ? 0.2 : rocket ? 0.1 : 0.11;
  const bloom = new THREE.Mesh(
    new THREE.CylinderGeometry(fat * 2.4, fat * 1.6, rocket ? Math.min(1.1, length * 0.22) : length, 12, 1, true),
    glowIdle(color, rocket ? 0.4 : 0.28),
  );
  bloom.rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(fat * 0.35, fat * 0.22, rocket ? Math.min(0.7, length * 0.16) : length, 8, 1, true),
    glowIdle(hot, 0.95),
  );
  core.rotation.x = Math.PI / 2;
  group.add(bloom, core);
  const bolt = new THREE.Mesh(
    rocket
      ? new THREE.ConeGeometry(0.16, 0.42, 8)
      : new THREE.SphereGeometry(bite ? 0.22 : blast ? 0.2 : 0.13, 12, 10),
    glowIdle(hot, 0.95),
  );
  if (rocket) {
    bolt.quaternion.setFromUnitVectors(Y_UP, to.clone().sub(from).normalize());
  }
  scene.add(group, bolt);
  foldShots.push({
    group,
    bolt,
    bloom,
    core,
    from: from.clone(),
    to: to.clone(),
    fromId,
    toId,
    kind,
    born: now,
    duration: rocket ? 820 : bite ? 980 : blast ? 640 : 720,
    boom: rocket || blast,
    track: !rocket,
    length,
  });
  puffJet(from, to.clone().sub(from).normalize(), now, 5);
  while (foldShots.length > 16) {
    const oldest = foldShots.shift();
    if (oldest !== undefined) {
      scene.remove(oldest.group, oldest.bolt);
    }
  }
}

function shotMuzzle(id, fallback) {
  const node = combatNode(id);
  if (node) {
    const tip = node.position.clone();
    tip.y += plantedCombat(node) ? 1.4 : 0.55;
    return tip;
  }
  return fallback.clone();
}

function fireFoldShot(fromId, toId, item, now) {
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const striker = resolveCombatId(fromId, payload);
  const target = resolveCombatId(toId, payload);
  const hinted = payloadPosition(payload);
  if (hinted !== null) {
    if (occupantCell(target) === null) {
      rememberCombatCell(target, hinted);
    }
    if (occupantCell(striker) === null) {
      rememberCombatCell(striker, hinted);
    }
  }
  const actor = actorId(item);
  if (occupantCell(striker) === null && actor.length > 0) {
    rememberCombatCell(striker, occupantCell(actor));
  }
  let fromAt = occupantCell(striker);
  let toAt = occupantCell(target) ?? hinted;
  if (fromAt === null && hinted !== null && toAt !== null && !sameCell(hinted, toAt)) {
    fromAt = hinted;
    rememberCombatCell(striker, hinted);
  }
  if (fromAt === null && hinted !== null) {
    fromAt = hinted;
    rememberCombatCell(striker, hinted);
  }
  if (toAt === null && hinted !== null) {
    toAt = hinted;
    rememberCombatCell(target, hinted);
  }
  if (fromAt === null || toAt === null) {
    return;
  }
  if (recentFoldShots.some((row) => row.fromId === striker && row.toId === target && now - row.born < 280)) {
    const existing = beginDogfight(striker, target, item, now);
    if (existing) {
      markFightHit(existing, target, now);
    }
    return;
  }
  recentFoldShots.push({ fromId: striker, toId: target, born: now });
  while (recentFoldShots.length > 24) {
    recentFoldShots.shift();
  }
  const fight = beginDogfight(striker, target, item, now);
  const from = shotMuzzle(striker, cell(fromAt));
  const to = shotMuzzle(target, cell(toAt));
  const bite = item.type === "beast.bit" || striker.startsWith("ent:");
  spawnFoldShot(from, to, striker, target, bite ? "bite" : "blast", now);
  const wounds = Math.min(3, (foldCombat.wounds.get(target) ?? 0) + 1);
  foldCombat.wounds.set(target, wounds);
  setFoldPose(striker, "fire", now, { toward: target, duration: 820 });
  setFoldPose(target, "hit", now, { from: striker, wounds, duration: 620 });
  if (fight) {
    markFightHit(fight, target, now);
  }
}

function boomAt(world, now, scale = 1) {
  const group = new THREE.Group();
  group.position.copy(world);
  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.55 * scale, 12, 10), glowIdle(0xff6a20, 0.95));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 10, 8), glowIdle(0xffe8a0, 1));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42 * scale, 0.07, 6, 22), glowIdle(0xff3a18, 0.85));
  ring.rotation.x = Math.PI / 2;
  group.add(fire, core, ring);
  scene.add(group);
  booms.push({ group, fire, core, ring, born: now, duration: 920 });
  puffJet(world, Y_UP, now, Math.round(16 * scale));
  puffJet(world, new THREE.Vector3(0.4, 0.7, -0.2), now, 8);
}

function tickBooms(now) {
  for (let i = booms.length - 1; i >= 0; i -= 1) {
    const boom = booms[i];
    const u = (now - boom.born) / boom.duration;
    if (u >= 1) {
      scene.remove(boom.group);
      boom.group.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      booms.splice(i, 1);
      continue;
    }
    const grow = 0.45 + u * 3.4;
    boom.fire.scale.setScalar(grow);
    boom.core.scale.setScalar(0.7 + u * 1.6);
    boom.ring.scale.setScalar(1 + u * 4.2);
    boom.fire.material.opacity = 0.92 * (1 - u);
    boom.core.material.opacity = 1 - u;
    boom.ring.material.opacity = 0.8 * (1 - u);
    boom.ring.rotation.z += 0.08;
  }
}

function dogfightPose(fight, side, now) {
  const node = combatNode(side === 0 ? fight.a : fight.b);
  const home = side === 0 ? fight.homeA : fight.homeB;
  const t = (now - fight.born) * 0.001;
  const phase = side === 0 ? 0 : Math.PI;
  if (plantedCombat(node)) {
    const other = combatWorld(side === 0 ? fight.b : fight.a) ?? fight.mid;
    const toward = other.clone().sub(home);
    if (toward.lengthSq() > 1e-6) {
      toward.normalize();
    }
    const lunge = 0.22 + Math.sin(t * 1.7 + phase) * 0.28;
    return {
      x: home.x + toward.x * lunge,
      y: home.y + Math.sin(t * 1.1) * 0.12,
      z: home.z + toward.z * lunge,
      yaw: Math.atan2(toward.x, toward.z),
      roll: Math.sin(t * 2.2 + phase) * 0.12,
      pitch: Math.cos(t * 1.6) * 0.08,
    };
  }
  const ang = t * 1.72 + phase + fight.seed;
  const weave = Math.sin(t * 2.85 + phase) * 0.88;
  const climb = Math.sin(t * 1.95 + phase * 0.7) * 1.05;
  const jink = Math.sin(t * 5.15 + fight.seed + phase) * 0.52;
  const radius = fight.radius + weave;
  return {
    x: fight.mid.x + Math.cos(ang) * radius + Math.cos(ang + 1.2) * jink,
    y: fight.mid.y + 1.05 + climb,
    z: fight.mid.z + Math.sin(ang) * radius + Math.sin(ang + 1.2) * jink,
    yaw: ang + Math.PI / 2,
    roll: Math.sin(t * 3.15 + phase) * 0.52,
    pitch: Math.cos(t * 2.05 + phase) * 0.24,
  };
}

function poseCombatant(fight, side, now) {
  const id = side === 0 ? fight.a : fight.b;
  const node = combatNode(id);
  if (node === null) {
    return;
  }
  if (node.userData.combatHome === undefined) {
    node.userData.combatHome = node.position.clone();
  }
  hideIdleRig(node.userData.idleRig);
  const pose = dogfightPose(fight, side, now);
  const hitAt = side === 0 ? fight.hitA : fight.hitB;
  const wobble = hitAt > 0 && now - hitAt < 520 ? 1 - (now - hitAt) / 520 : 0;
  const extra = foldPoseFor(id, now);
  node.position.set(
    pose.x + Math.sin(now * 0.046) * wobble * 0.22 + (extra?.x ?? 0),
    pose.y + Math.cos(now * 0.051) * wobble * 0.16 + (extra?.y ?? 0),
    pose.z + Math.sin(now * 0.039) * wobble * 0.2 + (extra?.z ?? 0),
  );
  node.rotation.order = "YXZ";
  node.rotation.set(
    pose.pitch + Math.cos(now * 0.058) * wobble * 0.55 + (extra?.pitch ?? 0),
    pose.yaw,
    pose.roll + Math.sin(now * 0.064) * wobble * 0.85 + (extra?.roll ?? 0),
  );
  if (!reduced && !plantedCombat(node) && now - (node.userData.combatJet ?? 0) > 55) {
    node.userData.combatJet = now;
    puffJet(node.position, new THREE.Vector3(Math.sin(pose.yaw), 0.15, Math.cos(pose.yaw)), now, 2);
  }
  if (fight.dead === id && fight.deadAt > 0) {
    const u = Math.min(1, (now - fight.deadAt) / 1100);
    if (u < 0.18) {
      node.scale.setScalar(1 + u * 2.4);
    } else {
      node.scale.setScalar(Math.max(0.01, 1.4 - (u - 0.18) * 2.2));
    }
    node.rotation.x += u * 1.8;
    node.rotation.z += u * 2.4;
  }
}

function restoreCombatant(id, home) {
  const node = combatNode(id);
  if (node === null) {
    return;
  }
  node.position.copy(node.userData.combatHome ?? home);
  node.rotation.set(0, 0, 0);
  node.scale.set(1, 1, 1);
  delete node.userData.combatHome;
}

function applyFoldCombat(now) {
  const busy = new Set();
  for (const fight of dogfights.values()) {
    if (now < fight.until) {
      busy.add(fight.a);
      busy.add(fight.b);
    }
  }
  for (const id of [...foldCombat.poses.keys()]) {
    if (busy.has(id)) {
      continue;
    }
    const node = combatNode(id);
    if (node === null) {
      continue;
    }
    const pose = foldPoseFor(id, now);
    if (pose === null) {
      if (node.userData.combatHome !== undefined) {
        node.position.copy(node.userData.combatHome);
        node.rotation.set(0, 0, 0);
        delete node.userData.combatHome;
      }
      continue;
    }
    hideIdleRig(node.userData.idleRig);
    const at = occupantCell(id);
    if (node.userData.combatHome === undefined) {
      node.userData.combatHome = at !== null ? cell(at) : node.position.clone();
    }
    const home = node.userData.combatHome;
    node.position.set(home.x + pose.x, home.y + pose.y, home.z + pose.z);
    node.rotation.order = "YXZ";
    node.rotation.set(pose.pitch, pose.yaw, pose.roll);
  }
}

function noteFoldCombat(item, now) {
  const type = typeof item.type === "string" ? item.type : "";
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  if (type === "war.declared") {
    const attacker = resolveCombatId(typeof payload.attacker === "string" ? payload.attacker : actorId(item), payload);
    const defender = resolveCombatId(
      typeof payload.defender === "string" ? payload.defender : typeof payload.target === "string" ? payload.target : "",
      payload,
    );
    setFoldPose(attacker, "lock", now, { toward: defender, duration: 1600 });
    setFoldPose(defender, "lock", now, { toward: attacker, duration: 1600 });
    beginDogfight(attacker, defender, item, now);
    return;
  }
  if (type === "war.struck" || type === "act.strike") {
    const striker = resolveCombatId(typeof payload.striker === "string" ? payload.striker : actorId(item), payload);
    const target = resolveCombatId(typeof payload.target === "string" ? payload.target : "", payload);
    if (type === "war.struck" && target.length === 0 && payloadPosition(payload) === null) {
      return;
    }
    fireFoldShot(striker, target, item, now);
    return;
  }
  if (type === "beast.bit") {
    const beast = resolveCombatId(typeof payload.striker === "string" ? payload.striker : "", payload);
    const victim = resolveCombatId(
      typeof payload.target === "string"
        ? payload.target
        : typeof payload.identityId === "string"
          ? payload.identityId
          : actorId(item),
      payload,
    );
    fireFoldShot(beast, victim, item, now);
    return;
  }
  if (type === "body.fell") {
    const holder = resolveCombatId(typeof payload.holder === "string" ? payload.holder : actorId(item), payload);
    foldCombat.wounds.set(holder, 3);
    setFoldPose(holder, "fallen", now, { duration: 1e9 });
    noteDeath(holder, now);
    return;
  }
  if (type === "body.rose") {
    const holder = resolveCombatId(typeof payload.holder === "string" ? payload.holder : actorId(item), payload);
    foldCombat.wounds.set(holder, 0);
    setFoldPose(holder, "rise", now, { duration: 2200 });
    return;
  }
  if (type === "body.died") {
    const holder = resolveCombatId(typeof payload.holder === "string" ? payload.holder : actorId(item), payload);
    setFoldPose(holder, "dead", now, { duration: 2400 });
    noteDeath(holder, now);
  }
}

function noteDeath(id, now) {
  if (typeof id !== "string" || id.length === 0) {
    return;
  }
  for (const fight of dogfights.values()) {
    if (fight.dead === id && now - fight.deadAt < 1800) {
      return;
    }
  }
  let found = false;
  for (const fight of dogfights.values()) {
    if (fight.a === id || fight.b === id) {
      fight.dead = id;
      fight.deadAt = now;
      fight.until = now + 1600;
      found = true;
    }
  }
  const world = combatWorld(id);
  if (world) {
    const node = combatNode(id);
    boomAt(world, now, plantedCombat(node) ? 3.1 : 1.25);
  }
  if (!found && world) {
    const node = combatNode(id);
    if (node) {
      node.userData.combatHome = node.position.clone();
      dogfights.set(`dead|${id}`, {
        a: id,
        b: id,
        mid: world.clone(),
        radius: 1,
        born: now,
        until: now + 1400,
        seed: 0,
        hitA: now,
        hitB: 0,
        lastVolley: now,
        volley: 0,
        dead: id,
        deadAt: now,
        framed: true,
        homeA: world.clone(),
        homeB: world.clone(),
        beast: id.startsWith("ent:"),
      });
    }
  }
}

function tickDogfights(now) {
  for (const [key, fight] of dogfights) {
    if (now >= fight.until) {
      restoreCombatant(fight.a, fight.homeA);
      if (fight.b !== fight.a) {
        restoreCombatant(fight.b, fight.homeB);
      }
      dogfights.delete(key);
      continue;
    }
    poseCombatant(fight, 0, now);
    if (fight.b !== fight.a) {
      poseCombatant(fight, 1, now);
    }
    if (fight.dead !== null || reduced) {
      continue;
    }
    if (now - fight.lastVolley < 170) {
      continue;
    }
    fight.lastVolley = now;
    fight.volley += 1;
    const fromA = fight.volley % 2 === 1;
    const fromId = fromA ? fight.a : fight.b;
    const toId = fromA ? fight.b : fight.a;
    const from = shotMuzzle(fromId, fromA ? fight.homeA : fight.homeB);
    const to = shotMuzzle(toId, fromA ? fight.homeB : fight.homeA);
    const bite = fight.beast && (fromId.startsWith("ent:") || plantedCombat(combatNode(fromId)));
    const kind = fight.volley % 5 === 0 ? "rocket" : bite ? "bite" : fight.volley % 3 === 0 ? "blast" : "laser";
    spawnFoldShot(from, to, fromId, toId, kind, now);
    if (kind === "rocket" || kind === "blast") {
      markFightHit(fight, toId, now);
    }
  }
}

function tickShots(now) {
  for (let i = foldShots.length - 1; i >= 0; i -= 1) {
    const shot = foldShots[i];
    const u = (now - shot.born) / shot.duration;
    if (u >= 1) {
      if (shot.boom) {
        boomAt(shot.to, now, shot.kind === "rocket" ? 0.85 : 0.55);
      } else {
        puffJet(shot.to, Y_UP, now, 6);
      }
      scene.remove(shot.group, shot.bolt);
      foldShots.splice(i, 1);
      continue;
    }
    if (shot.track) {
      const liveFrom = shotMuzzle(shot.fromId, shot.from);
      const liveTo = shotMuzzle(shot.toId, shot.to);
      shot.from.copy(liveFrom);
      shot.to.copy(liveTo);
      const len = Math.max(0.35, liveFrom.distanceTo(liveTo));
      shot.group.position.copy(liveFrom.clone().lerp(liveTo, 0.5));
      shot.group.lookAt(liveTo);
      const stretch = len / Math.max(0.35, shot.length);
      shot.bloom.scale.y = stretch;
      shot.core.scale.y = stretch;
    }
    const travel = shot.kind === "rocket" ? u * u * (3 - 2 * u) : 1 - (1 - u) * (1 - u);
    const at = shot.from.clone().lerp(shot.to, Math.min(1, travel));
    shot.bolt.position.copy(at);
    if (shot.kind === "rocket") {
      shot.group.position.copy(at);
      shot.group.lookAt(shot.to);
      shot.bolt.quaternion.setFromUnitVectors(Y_UP, shot.to.clone().sub(shot.from).normalize());
      if (!reduced && u * 10 - Math.floor(u * 10) < 0.35) {
        puffJet(at, shot.from.clone().sub(shot.to).normalize(), now, 2);
      }
    }
    const fade = Math.max(0, 1 - u * 0.55);
    shot.core.material.opacity = fade * 0.95;
    shot.bloom.material.opacity = fade * (shot.kind === "rocket" ? 0.4 : 0.28);
  }
}

function ensureIdle(id, now) {
  let idle = idles.get(id);
  if (idle === undefined) {
    idle = {
      act: "hold",
      born: now,
      duration: 400 + (fnv(id) % 900),
      next: now + 400 + (fnv(id) % 900),
      seed: fnv(id),
      heading: (fnv(id) % 360) * (Math.PI / 180),
    };
    idles.set(id, idle);
  }
  if (foldCombatBusy(id, now)) {
    holdIdle(idle, now, 400);
    return idle;
  }
  if (now < idle.next) {
    return idle;
  }
  if (idle.act !== "hold") {
    holdIdle(idle, now, 600);
    return idle;
  }
  if (someoneElseBusy(id, now)) {
    holdIdle(idle, now, 450);
    return idle;
  }
  startIdleAct(idle, now);
  return idle;
}

function gate(u, inEnd, outStart) {
  if (u <= 0 || u >= 1) {
    return 0;
  }
  if (u < inEnd) {
    return easeInOut(u / inEnd);
  }
  if (u > outStart) {
    return 1 - easeInOut((u - outStart) / (1 - outStart));
  }
  return 1;
}

function idlePose(idle, now) {
  const u = Math.min(1, Math.max(0, (now - idle.born) / Math.max(1, idle.duration)));
  const pose = {
    x: 0,
    y: 0.16,
    z: 0,
    yaw: idle.heading,
    beam: 0,
    ring: 0,
    release: 0,
  };
  if (idle.act === "circle") {
    const reach = gate(u, 0.2, 0.8);
    const ang = idle.heading + (u < 0.2 ? 0 : u > 0.8 ? Math.PI * 2 : ((u - 0.2) / 0.6) * Math.PI * 2);
    pose.x = Math.cos(ang) * 1.2 * reach;
    pose.z = Math.sin(ang) * 1.2 * reach;
    const tangent = -ang + Math.PI / 2;
    pose.yaw = idle.heading + (tangent - idle.heading) * reach;
    pose.ring = reach;
  } else if (idle.act === "gather") {
    const deploy = gate(u, 0.16, 0.84);
    pose.y = 0.16 - deploy * 0.06;
    pose.beam = deploy;
  } else if (idle.act === "release") {
    pose.release = u;
  } else if (idle.act === "drift") {
    const travel = gate(u, 0.28, 0.72);
    pose.x = Math.cos(idle.heading) * 1.15 * travel;
    pose.z = Math.sin(idle.heading) * 1.15 * travel;
    pose.y = 0.16 + travel * 0.12;
    pose.yaw = idle.heading;
  }
  return pose;
}

function glowIdle(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function hideIdleRig(rig) {
  if (rig === undefined) {
    return;
  }
  rig.beam.visible = false;
  rig.core.visible = false;
  rig.ring.visible = false;
  for (const minion of rig.minions) {
    minion.mesh.visible = false;
  }
}

function ensureIdleRig(node) {
  if (node.userData.idleRig?.minions !== undefined) {
    return node.userData.idleRig;
  }
  if (node.userData.idleRig !== undefined) {
    const stale = node.userData.idleRig;
    for (const part of [stale.beam, stale.arm, stale.scoop, stale.ring]) {
      if (part !== undefined) {
        node.remove(part);
      }
    }
  }
  const glow = glowIdle(0x00ffd4, 0.7);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.38, 1, 14, 1, true), glow);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.06, 1, 8, 1, true), glowIdle(0xe8fff8, 0.85));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.035, 6, 48), glowIdle(0x00ffd4, 0.5));
  ring.rotation.x = Math.PI / 2;
  const minions = [];
  const swarm = new THREE.Group();
  for (let i = 0; i < 7; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), glowIdle(0x00ffd4, 0.95));
    mesh.visible = false;
    swarm.add(mesh);
    const phi = Math.acos(1 - (2 * (i + 0.5)) / 7);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    minions.push({
      mesh,
      dest: new THREE.Vector3(Math.sin(phi) * Math.cos(theta) * 1.45, 0.15 + Math.cos(phi) * 0.7, Math.sin(phi) * Math.sin(theta) * 1.45),
    });
  }
  node.add(beam, core, ring, swarm);
  node.userData.idleRig = { beam, core, ring, minions, last: 0 };
  return node.userData.idleRig;
}

function poseMinions(rig, release) {
  const count = rig.minions.length;
  const last = (count - 1) * 0.05;
  for (let i = 0; i < count; i += 1) {
    const local = Math.min(1, Math.max(0, (release - i * 0.05) / (1 - last)));
    const reach = gate(local, 0.22, 0.62);
    const { mesh, dest } = rig.minions[i];
    mesh.visible = reach > 0.03;
    mesh.position.copy(dest).multiplyScalar(reach);
    mesh.scale.setScalar(0.35 + reach * 0.75);
  }
}

function poseIdleRig(rig, pose) {
  const on = pose.beam > 0.04;
  rig.beam.visible = on;
  rig.core.visible = on;
  const length = 0.35 + pose.beam * 2.8;
  rig.beam.scale.set(1, length, 1);
  rig.core.scale.set(1, length, 1);
  rig.beam.position.y = 0.12 - length * 0.5;
  rig.core.position.y = rig.beam.position.y;
  rig.beam.material.opacity = 0.22 + pose.beam * 0.5;
  rig.core.material.opacity = 0.4 + pose.beam * 0.5;
  rig.ring.visible = pose.ring > 0.04;
  rig.ring.scale.setScalar(0.86);
  rig.ring.material.opacity = 0.28 + pose.ring * 0.22;
  poseMinions(rig, pose.release);
}

function tickIdles(now) {
  const live = new Set();
  for (const row of listOf("identity")) {
    live.add(row.id);
    if (state.flights.has(row.id) || foldCombatBusy(row.id, now)) {
      continue;
    }
    const node = godNode(row.id);
    if (node === null) {
      continue;
    }
    const idle = ensureIdle(row.id, now);
    const pose = idlePose(idle, now);
    const home = cell(row.position);
    node.position.set(home.x + pose.x, home.y + pose.y, home.z + pose.z);
    node.rotation.order = "YXZ";
    node.rotation.set(0, pose.yaw, 0);
    const rig = ensureIdleRig(node);
    poseIdleRig(rig, pose);
    if (reduced || now - rig.last <= 70) {
      continue;
    }
    rig.last = now;
    idleScratch.set(node.position.x, node.position.y, node.position.z);
    if (idle.act === "circle" && pose.ring > 0.45) {
      idleBack.set(-pose.x, 0.12, -pose.z);
      if (idleBack.lengthSq() > 1e-6) {
        idleBack.normalize();
        puffJet(idleScratch, idleBack, now, 1);
      }
    } else if (idle.act === "gather" && pose.beam > 0.35) {
      puffJet(idleScratch.setY(idleScratch.y - 0.55), idleBack.set((Math.random() - 0.5) * 0.18, 1.4, (Math.random() - 0.5) * 0.18), now, 3);
    }
  }
  for (const id of [...idles.keys()]) {
    if (!live.has(id)) {
      idles.delete(id);
    }
  }
}

function rememberBody(id, position, kind) {
  if (position === null) {
    return;
  }
  rememberCombatCell(id, position);
  const prior = state.occupants.get(occupantKey(kind, id));
  if (prior?.position && sameCell(prior.position, position)) {
    return;
  }
  if (kind === "identity" && prior?.position && !foldCombatBusy(id, performance.now())) {
    beginFlight(id, prior.position, position);
  }
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
  if ((item.type === "effect.create" || item.type === "wake.left" || item.type === "act.depict") && id.length > 0) {
    const prior = state.occupants.get(occupantKey("entity", id));
    const fromString = typeof payload.position === "string" ? payload.position.split(",") : [];
    const parsed =
      at ??
      (fromString.length === 3
        ? { x: Number(fromString[0]), y: Number(fromString[1]), z: Number(fromString[2]) }
        : null);
    const fields = payload.fields !== null && typeof payload.fields === "object" ? payload.fields : {};
    const createdType =
      typeof payload.type === "string"
        ? payload.type
        : typeof payload.kind === "string"
          ? payload.kind
          : prior?.type ?? "entity";
    if (PAPER_TYPES.has(createdType)) {
      return parsed;
    }
    put({
      kind: "entity",
      id,
      type: createdType,
      position: parsed,
      kindName:
        typeof fields.kind === "string"
          ? fields.kind
          : typeof payload.kind === "string" && payload.type === "block"
            ? payload.kind
            : prior?.kindName,
      name:
        typeof payload.name === "string"
          ? payload.name
          : typeof fields.name === "string"
            ? fields.name
            : prior?.name,
      caption: typeof payload.caption === "string" ? payload.caption : prior?.caption,
      mime: typeof payload.mime === "string" ? payload.mime : prior?.mime,
      hash: typeof payload.hash === "string" ? payload.hash : prior?.hash,
    });
    return parsed;
  }
  if (item.type === "effect.move" && id.length > 0 && at !== null) {
    const prior = state.occupants.get(occupantKey("entity", id));
    put({
      kind: "entity",
      id,
      type: prior?.type ?? "entity",
      position: at,
      fields: prior?.fields,
      kindName: prior?.kindName,
      name: prior?.name,
    });
    return at;
  }
  if ((item.type === "effect.destroy" || item.type === "wake.heeded" || item.type === "wake.followed") && id.length > 0) {
    state.occupants.delete(occupantKey("entity", id));
    state.dirty = true;
  }
  return at;
}

function actorId(item) {
  const actor = typeof item.actor === "string" ? item.actor : "";
  return actor.startsWith("identity:") ? actor.slice(10) : actor;
}

function listOf(kind) {
  return [...state.occupants.values()].filter((row) => row.kind === kind && row.position);
}

function godCenters() {
  return listOf("identity").map((row) => ({
    id: row.id,
    world: livingWorld(row),
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
    const to = live ? livingWorld(live) : from.clone();
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
  if (row.kind === "identity" || row.kind === "echo") {
    const named = state.names.get(row.id);
    return typeof named === "string" && named.length > 0 ? named : "agent";
  }
  if (row.type === "block" || row.type === "wake") {
    return "";
  }
  if (typeof row.name === "string" && row.name.trim().length > 0) {
    return row.name.trim();
  }
  if (row.type === "beast") {
    return "beast";
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
    beast: 1.35,
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
    hollow: 1.85,
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
  node.add(KNOWN.warden());
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

const blockProtos = new Map();
const BLOCK_LIGHT_CAP = 4;
const lightWorld = new THREE.Vector3();

function cachedBlock(kind) {
  const form = blockForm(kind);
  let proto = blockProtos.get(form);
  if (proto === undefined) {
    proto = blockArtifact(kind);
    blockProtos.set(form, proto);
  }
  return proto.clone();
}

function muteBlockLights() {
  const lights = [];
  relics.updateMatrixWorld(true);
  relics.traverse((node) => {
    if (node.isPointLight) {
      lights.push(node);
    }
  });
  if (lights.length <= BLOCK_LIGHT_CAP) {
    return;
  }
  const ranked = lights
    .map((light) => {
      light.getWorldPosition(lightWorld);
      return { light, d: lightWorld.distanceToSquared(camera.position) };
    })
    .sort((a, b) => a.d - b.d);
  ranked.forEach((row, i) => {
    row.light.visible = i < BLOCK_LIGHT_CAP;
  });
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
    if (PAPER_TYPES.has(row.type)) {
      continue;
    }
    if (row.type === "wake") {
      if (!wakeHasLoot(row.kindName) || hollowReach(row.position, 2)) {
        continue;
      }
      const node = wakeArtifact();
      node.position.copy(cell(row.position));
      tag(node, row);
      relics.add(node);
      continue;
    }
    if (row.type === "block") {
      const node = cachedBlock(row.kindName);
      node.position.copy(cell(row.position));
      tag(node, row);
      relics.add(node);
      continue;
    }
    if (row.type === "beast" && hollowReach(row.position, 0)) {
      continue;
    }
    const spec = spectrumOf(row, state.types, state.standing);
    const form = row.type === "beast" ? "beast" : "entity";
    const node = placeForm(form, row, (clone) => {
      clone.rotation.y = spec.grain % 8;
      clone.scale.setScalar(row.type === "beast" ? 1.05 : 0.85 + spec.rise * 0.15);
    });
    if (node !== null) {
      relics.add(node);
    }
  }
  muteBlockLights();
}

function buildGods() {
  clearGroup(gods);
  for (const row of listOf("identity")) {
    const fame = state.standing.get(row.id)?.fame ?? 0;
    const node = placeForm("identity", row, (clone) => {
      clone.position.copy(livingWorld(row));
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
    .filter((row) => !PAPER_TYPES.has(row.type))
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
    collectPicks();
  } else if (state.picks.length === 0) {
    collectPicks();
  }
  const census = { identity: 0, echo: 0, mark: 0, anchor: 0, warden: 0, drift: 0, entity: 0 };
  for (const row of state.occupants.values()) {
    census[row.kind] = (census[row.kind] ?? 0) + 1;
  }
  writeCensus(census);
  writeHere();
  state.dirty = false;
}

function writeHere() {
  const root = $("spectrum-here");
  if (root === null) {
    return;
  }
  const people = listOf("identity");
  root.replaceChildren();
  if (people.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No one is here.";
    root.append(empty);
    return;
  }
  for (const row of people) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = row.id;
    const named = state.names.get(row.id);
    button.textContent = typeof named === "string" && named.length > 0 ? named : "agent";
    if (state.selected?.kind === "identity" && state.selected.id === row.id) {
      button.setAttribute("aria-current", "true");
    }
    item.append(button);
    root.append(item);
  }
}

function applyMap(map) {
  dropKind("echo");
  dropKind("anchor");
  dropKind("warden");
  dropKind("drift");
  if (!state.streamLive) {
    dropKind("identity");
  }
  dropKind("entity");
  dropKind("mark");
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
  for (const row of map.entities ?? []) {
    put({
      kind: "entity",
      id: String(row.id ?? ""),
      type: typeof row.type === "string" ? row.type : "entity",
      position: row.position,
      kindName: typeof row.kind === "string" ? row.kind : undefined,
      name: typeof row.name === "string" ? row.name : undefined,
      caption: typeof row.caption === "string" ? row.caption : undefined,
      mime: typeof row.mime === "string" ? row.mime : undefined,
      hash: typeof row.hash === "string" ? row.hash : undefined,
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

function inhabitantName(id) {
  const named = state.names.get(id);
  return typeof named === "string" && named.length > 0 ? named : "agent";
}

function epithetOf(id) {
  const raw = state.text[`epithets.${id}`];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
}

function loadLedger(id) {
  if (state.ledgers.has(id)) {
    return;
  }
  state.ledgers.set(id, []);
  readJson(`/identities/${encodeURIComponent(id)}`)
    .then((data) => {
      state.ledgers.set(id, Array.isArray(data.ledger) ? data.ledger : []);
      if (state.selected && (state.selected.kind === "identity" || state.selected.kind === "echo") && state.selected.id === id) {
        writeSelected(state.selected);
      }
    })
    .catch(() => {
      state.ledgers.delete(id);
    });
}

function statRow(name, value) {
  const row = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = name;
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function writeInhabitant(hit) {
  const box = $("spectrum-selected");
  const axes = $("spectrum-axes");
  const caption = $("spectrum-caption");
  const profile = state.profiles.get(hit.id);
  const score = state.standing.get(hit.id) ?? { fame: 0, notoriety: 0 };
  const named = inhabitantName(hit.id);
  const title = document.createElement("strong");
  title.textContent = hit.kind === "echo" ? `echo of ${named}` : named;
  const at = hit.position ? `${hit.position.x}, ${hit.position.y}, ${hit.position.z}` : "";
  const meta = document.createElement("small");
  const bits = [hit.kind === "echo" ? "echo" : "inhabitant"];
  if (profile?.founder || state.founders.has(hit.id)) {
    bits.push("founder");
  }
  if (profile?.online === true) {
    bits.push("here");
  }
  if (typeof profile?.sessions === "number" && profile.sessions > 0) {
    bits.push(profile.sessions === 1 ? "1 session" : `${profile.sessions} sessions`);
  }
  if (at.length > 0) {
    bits.push(at);
  }
  meta.textContent = bits.join(" · ");
  const kids = [title, meta];
  const epithet = epithetOf(hit.id);
  if (epithet.length > 0) {
    const lore = document.createElement("p");
    lore.className = "spectrum-epithet";
    lore.textContent = epithet;
    kids.push(lore);
  }
  const stats = document.createElement("dl");
  stats.className = "spectrum-stats";
  stats.append(statRow("fame", String(score.fame)), statRow("notoriety", String(score.notoriety)));
  const meters = document.createElement("div");
  meters.className = "spectrum-standing";
  for (const [kind, value] of [
    ["fame", score.fame],
    ["notoriety", score.notoriety],
  ]) {
    const row = document.createElement("div");
    row.dataset.kind = kind;
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(4, Math.min(100, Math.round(Number(value) * 4)))}%`;
    row.append(fill);
    meters.append(row);
  }
  kids.push(stats, meters);
  if (axes) {
    axes.replaceChildren();
    axes.dataset.empty = "true";
  }
  const cited = state.ledgers.get(hit.id);
  if (cited === undefined) {
    loadLedger(hit.id);
  } else if (cited.length > 0) {
    const kicker = document.createElement("p");
    kicker.className = "spectrum-kicker";
    kicker.textContent = "Cited";
    const list = document.createElement("ul");
    list.className = "spectrum-ledger";
    for (const row of cited.slice(-6).reverse()) {
      const item = document.createElement("li");
      const kind = row.kind === "notoriety" ? "notoriety" : "fame";
      const amount = Number(row.amount) || 0;
      item.textContent = `t${Number(row.tick) || 0} · ${kind} +${amount}`;
      list.append(item);
    }
    kids.push(kicker, list);
  }
  box.replaceChildren(...kids);
  if (caption) {
    caption.textContent = epithet.length > 0 ? epithet : "Fame and notoriety are the public standing.";
  }
  appendLikeness(box, hit);
}

function writeSelected(hit) {
  const box = $("spectrum-selected");
  const axes = $("spectrum-axes");
  const caption = $("spectrum-caption");
  if (box === null || axes === null) {
    return;
  }
  axes.classList.remove("spectrum-standing");
  if (hit === null) {
    box.replaceChildren();
    box.textContent = "Click the lattice.";
    axes.replaceChildren();
    axes.dataset.empty = "true";
    if (caption) {
      caption.textContent =
        "The fold is not the world. It is what the log looks like when you stand outside time.";
    }
    writeHere();
    return;
  }
  if (hit.kind === "identity" || hit.kind === "echo") {
    writeInhabitant(hit);
    writeHere();
    return;
  }
  const spec = spectrumOf(hit, state.types, state.standing);
  const title = document.createElement("strong");
  title.textContent = placeTitle(hit) || hit.kindName || hit.type || hit.kind;
  const meta = document.createElement("small");
  const at = hit.position ? `${hit.position.x}, ${hit.position.y}, ${hit.position.z}` : "";
  if (hit.kind === "anchor") {
    meta.textContent = `${hit.type} · ${at}`;
  } else if (hit.type === "beast") {
    meta.textContent = `beast · ${at}`;
  } else {
    meta.textContent = at;
  }
  box.replaceChildren(title, meta);
  axes.replaceChildren();
  axes.dataset.empty = spec.axes.length === 0 ? "true" : "false";
  for (const value of spec.axes.slice(0, 12)) {
    const bar = document.createElement("i");
    bar.style.height = `${Math.max(8, Math.round(value * 100))}%`;
    axes.append(bar);
  }
  if (caption) {
    caption.textContent = placeTitle(hit) || hit.kindName || hit.type || "A place in the fold.";
  }
  appendLikeness(box, hit);
  writeHere();
}

function likenessOf(hit) {
  if (typeof hit?.hash === "string" && /^[0-9a-f]{64}$/.test(hit.hash)) {
    return hit;
  }
  const at = hit?.position;
  if (at === undefined || at === null) {
    return null;
  }
  for (const row of state.occupants.values()) {
    if (
      row.kind === "entity" &&
      typeof row.hash === "string" &&
      /^[0-9a-f]{64}$/.test(row.hash) &&
      row.position &&
      row.position.x === at.x &&
      row.position.y === at.y &&
      row.position.z === at.z
    ) {
      return row;
    }
  }
  return null;
}

function appendLikeness(box, hit) {
  const pic = likenessOf(hit);
  if (pic === null) {
    return;
  }
  const img = document.createElement("img");
  img.src = `/blob/${pic.hash}`;
  img.alt = typeof pic.caption === "string" && pic.caption.length > 0 ? pic.caption : "A likeness hangs here.";
  img.className = "spectrum-likeness";
  box.append(img);
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
    const tickLabel = $("spectrum-tick");
    if (tickLabel) {
      tickLabel.textContent = String(state.tick);
    }
    state.types = rules?.registry?.types ?? {};
    state.text = rules?.registry?.text && typeof rules.registry.text === "object" ? rules.registry.text : {};
    const identityRows = Array.isArray(identities.identities) ? identities.identities : [];
    state.names = new Map(identityRows.map((row) => [row.id, row.name]));
    state.profiles = new Map(identityRows.map((row) => [row.id, row]));
    state.founders = new Set(identityRows.filter((row) => row.founder).map((row) => row.id));
    state.standing = new Map(
      (standing.standing ?? []).map((row) => [row.id, { fame: Number(row.fame) || 0, notoriety: Number(row.notoriety) || 0 }]),
    );
    state.ledgers.clear();
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

function displayName(item) {
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const id =
    typeof payload.identityId === "string" && payload.identityId.length > 0 ? payload.identityId : actorId(item);
  const named = state.names.get(id);
  if (typeof named === "string" && named.length > 0) {
    return named;
  }
  if (typeof payload.name === "string" && payload.name.length > 0) {
    return payload.name;
  }
  return id.length > 10 ? `${id.slice(0, 10)}…` : id || "someone";
}

function clipLine(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function tickerNoise(type) {
  return type === "tick.boundary" || type === "world.dormancy_gap" || type === "act.wait" || type === "wake.rolled";
}

function tickerLine(item) {
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const type = typeof item.type === "string" ? item.type : "event";
  const who = displayName(item);
  const tick = `t${item.tick}`;
  const at = payloadPosition(payload);
  const cell = at ? `${at.x},${at.y},${at.z}` : "";
  if (type === "speak" || type === "speak.warden") {
    return `${tick}  ${who}: ${clipLine(String(payload.text ?? ""), 56)}`;
  }
  if (type === "act.move") {
    return `${tick}  ${who} walked to ${payload.x},${payload.y},${payload.z}`;
  }
  if (type === "act.mark") {
    return `${tick}  ${who} marked “${clipLine(String(payload.text ?? ""), 36)}”`;
  }
  if (type === "identity.spawn") {
    return `${tick}  ${who} arrived ${payload.x},${payload.y},${payload.z}`;
  }
  if (type === "identity.name") {
    return `${tick}  ${payload.name ?? who} took a name`;
  }
  if (type === "effect.create") {
    return `${tick}  ${payload.type ?? "form"} stood${cell ? ` at ${cell}` : ""}`;
  }
  if (type === "effect.move") {
    return `${tick}  ${payload.id ?? "a form"} moved${cell ? ` to ${cell}` : ""}`;
  }
  if (type === "effect.destroy") {
    return `${tick}  ${payload.id ?? "a form"} left`;
  }
  if (type === "war.struck" || type === "act.strike") {
    return `${tick}  ${who} struck ${clipLine(String(payload.target ?? ""), 20)}`;
  }
  if (type === "beast.bit") {
    return `${tick}  ${payload.beast ?? "a beast"} bit ${clipLine(String(payload.target ?? who), 20)}`;
  }
  if (type === "body.fell") {
    return `${tick}  ${clipLine(String(payload.holder ?? who), 20)} fell`;
  }
  if (type === "body.rose") {
    return `${tick}  ${clipLine(String(payload.holder ?? who), 20)} rose`;
  }
  if (type === "body.died") {
    return `${tick}  ${clipLine(String(payload.holder ?? who), 20)} died`;
  }
  if (type === "war.declared") {
    return `${tick}  ${who} declared on ${clipLine(String(payload.defender ?? ""), 20)}`;
  }
  if (type === "amendment.propose") {
    return `${tick}  ${who} proposed #${payload.proposalId}`;
  }
  if (type === "amendment.vote") {
    return `${tick}  ${who} voted ${payload.position} on #${payload.proposalId}`;
  }
  if (type === "amendment.applied") {
    return `${tick}  #${payload.proposalId} passed`;
  }
  if (type === "amendment.failed") {
    return `${tick}  #${payload.proposalId} failed`;
  }
  return `${tick}  ${type}`;
}

const tickerTape = [];

function paintTicker() {
  const track = $("spectrum-ticker-track");
  if (track === null) {
    return;
  }
  track.replaceChildren();
  const lines = tickerTape.length > 0 ? tickerTape : ["The lattice is quiet."];
  for (const copy of [0, 1]) {
    for (const line of lines) {
      const span = document.createElement("span");
      span.textContent = line;
      span.dataset.copy = String(copy);
      track.append(span);
    }
  }
}

function pushTicker(item) {
  const type = typeof item.type === "string" ? item.type : "";
  if (tickerNoise(type)) {
    return;
  }
  tickerTape.push(tickerLine(item));
  while (tickerTape.length > 36) {
    tickerTape.shift();
  }
  paintTicker();
}

function pushChat(item) {
  const type = typeof item.type === "string" ? item.type : "";
  if (type !== "speak" && type !== "speak.warden" && type !== "act.speak") {
    return;
  }
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const text = String(payload.text ?? "").trim();
  if (text.length === 0) {
    return;
  }
  const root = $("spectrum-chat-log");
  if (root === null) {
    return;
  }
  root.querySelector(".empty")?.remove();
  const stick = root.scrollHeight - root.scrollTop - root.clientHeight < 56;
  const li = document.createElement("li");
  li.className = type === "speak.warden" ? "warden" : "speak";
  const who = document.createElement("span");
  who.className = "who";
  const target = typeof payload.target === "string" && payload.target.length > 0 ? ` → ${payload.target}` : "";
  who.textContent = `${displayName(item)}${target}`;
  const body = document.createElement("span");
  body.textContent = text;
  li.append(who, body);
  root.append(li);
  while (root.children.length > 120) {
    root.firstElementChild?.remove();
  }
  if (stick) {
    root.scrollTop = root.scrollHeight;
  }
}

function appendRecord(item) {
  pushTicker(item);
  pushChat(item);
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const at = payloadPosition(payload);
  const actor = actorId(item);
  const previousBody = listOf("identity").find((row) => row.id === actor)?.position ?? null;
  const previousEntity =
    typeof payload.id === "string"
      ? listOf("entity").find((row) => row.id === payload.id)?.position ?? null
      : null;
  if (item.type === "act.move" && actor.length > 0 && at !== null) {
    rememberBody(actor, at, "identity");
  }
  if (item.type === "wake.followed" && actor.length > 0) {
    const to = payloadPosition(payload.to ?? payload);
    if (to !== null) {
      rememberBody(actor, to, "identity");
    }
  }
  if (item.type === "act.mark" && at !== null) {
    put({
      kind: "mark",
      id: actor || "mark",
      type: "mark",
      position: at,
      text: typeof payload.text === "string" ? payload.text : "",
    });
  }
  const created = foldEntity(item);
  const combat =
    item.type === "war.struck" ||
    item.type === "act.strike" ||
    item.type === "beast.bit" ||
    item.type === "war.declared";
  const fromId =
    typeof payload.striker === "string"
      ? payload.striker
      : typeof payload.attacker === "string"
        ? payload.attacker
        : actor;
  const toId =
    typeof payload.target === "string"
      ? payload.target
      : typeof payload.defender === "string"
        ? payload.defender
        : "";
  const fromCell = combat
    ? occupantCell(fromId) ?? previousBody
    : item.type === "act.move"
      ? previousBody
      : item.type === "effect.move"
        ? previousEntity
        : null;
  const sparkAtCell =
    (combat ? occupantCell(toId) ?? at : null) ??
    at ??
    created ??
    (item.type === "effect.destroy" ? previousEntity : null) ??
    previousBody;
  sparkAt(item, {
    from: fromCell,
    at: sparkAtCell,
  });
  if (
    combat ||
    item.type === "body.fell" ||
    item.type === "body.rose" ||
    item.type === "body.died"
  ) {
    noteFoldCombat(item, performance.now());
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
      const seen = new Set();
      let moved = false;
      for (const row of Array.isArray(data.bodies) ? data.bodies : []) {
        if (typeof row.id === "string") {
          seen.add(row.id);
          const at = payloadPosition(row.position ?? row);
          const prior = state.occupants.get(occupantKey("identity", row.id));
          rememberBody(row.id, at, "identity");
          if (!prior || !at || !sameCell(prior.position, at)) {
            moved = true;
          }
        }
      }
      for (const row of listOf("identity")) {
        if (!seen.has(row.id)) {
          state.occupants.delete(occupantKey("identity", row.id));
          state.flights.delete(row.id);
          moved = true;
        }
      }
      state.streamLive = true;
      if (moved) {
        state.dirty = true;
      }
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
      const world =
        row.kind === "identity"
          ? livingWorld(row)
          : row.type === "vantage"
            ? orbitSeat(row.position, performance.now())
            : cell(row.position);
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
    if (hit.row.type === "hollow") {
      lamp.intensity = 22;
    } else if (hit.row.kind === "identity") {
      lamp.intensity = 320;
    } else if (hit.row.kind === "anchor") {
      lamp.intensity = 140;
    } else {
      lamp.intensity = 90;
    }
  }
}

function tick() {
  requestAnimationFrame(tick);
  if (!state.onScreen || document.hidden) {
    return;
  }
  if (state.dirty) {
    paint();
  }
  if (!reduced) {
    const now = performance.now();
    tickFly(now);
    tickFlights(now);
    tickIdles(now);
    tickDogfights(now);
    applyFoldCombat(now);
    tickJet(now);
    tickSparks(now);
    tickShots(now);
    tickBooms(now);
    controls.update();
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
        } else if (node.userData.motion === "lamp") {
          const rest = typeof node.userData.rest === "number" ? node.userData.rest : 0.85;
          node.intensity = rest * (0.82 + Math.sin(now * 0.003 + (node.userData.phase ?? 0)) * 0.18);
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
    const now = performance.now();
    tickFlights(now);
    tickSparks(now);
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
    if (hit && (hit.kind === "identity" || hit.kind === "echo" || hit.kind === "anchor")) {
      toggleLook(hit);
      return;
    }
    state.look = null;
    state.selected = hit;
    writeSelected(hit);
  });
  $("spectrum-zoom-in")?.addEventListener("click", () => dolly(0.78));
  $("spectrum-zoom-out")?.addEventListener("click", () => dolly(1.28));
  $("spectrum-here")?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button === null || typeof button.dataset.id !== "string") {
      return;
    }
    const row = listOf("identity").find((item) => item.id === button.dataset.id);
    if (row === undefined) {
      return;
    }
    toggleLook(row);
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
paintTicker();
const chat = $("spectrum-chat-log");
if (chat && chat.children.length === 0) {
  const empty = document.createElement("li");
  empty.className = "empty";
  empty.textContent = "The lattice is quiet.";
  chat.append(empty);
}
refresh();
window.setInterval(refresh, 30_000);
listen();
requestAnimationFrame(tick);
