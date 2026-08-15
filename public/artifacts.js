import * as THREE from "three";

function physical(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.55,
    metalness: 0.12,
    envMapIntensity: 1.15,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
    ...extra,
  });
}

export const MAT = {
  stone: physical(0x8a7358, { roughness: 0.78, metalness: 0.04, clearcoat: 0.08, flatShading: false }),
  stoneDark: physical(0x3f3a34, { roughness: 0.86, metalness: 0.06, clearcoat: 0.04 }),
  brass: physical(0xc4a05a, { roughness: 0.22, metalness: 0.88, clearcoat: 0.55, clearcoatRoughness: 0.18, emissive: 0x2a1c08, emissiveIntensity: 0.12 }),
  iron: physical(0x2c3838, { roughness: 0.34, metalness: 0.72, clearcoat: 0.2 }),
  rock: physical(0xc5cdd4, { roughness: 0.9, metalness: 0.02, clearcoat: 0 }),
  slate: physical(0x1c262e, { roughness: 0.42, metalness: 0.35 }),
  deck: physical(0x3d6a62, { roughness: 0.28, metalness: 0.42, emissive: 0x10241f, emissiveIntensity: 0.2 }),
  rim: physical(0xb8c4cc, { roughness: 0.22, metalness: 0.58, clearcoat: 0.4 }),
  voidWall: physical(0x0c1218, {
    roughness: 0.08,
    metalness: 0.15,
    transmission: 0.72,
    thickness: 1.4,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    ior: 1.4,
  }),
  drift: physical(0x6ec8c0, {
    roughness: 0.08,
    metalness: 0.35,
    transmission: 0.35,
    thickness: 0.8,
    iridescence: 0.85,
    iridescenceIOR: 1.4,
    emissive: 0x163832,
    emissiveIntensity: 0.45,
  }),
  entity: physical(0xc4923a, { roughness: 0.18, metalness: 0.7, clearcoat: 0.5, emissive: 0x3a2408, emissiveIntensity: 0.22 }),
  agent: physical(0x243230, { roughness: 0.38, metalness: 0.42, sheen: 0.55, sheenColor: 0x6a8a82, sheenRoughness: 0.4, emissive: 0x0c1816, emissiveIntensity: 0.22 }),
  agentTrim: physical(0xd8c49a, { roughness: 0.2, metalness: 0.82, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
  lamp: physical(0xfff0c8, { roughness: 0.12, metalness: 0.02, emissive: 0xffd089, emissiveIntensity: 2.4, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
  energy: new THREE.MeshBasicMaterial({
    color: 0xf0d089,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  echo: new THREE.MeshPhysicalMaterial({
    color: 0x8aa0aa,
    emissive: 0x243840,
    emissiveIntensity: 0.55,
    roughness: 0.28,
    metalness: 0.08,
    transmission: 0.45,
    thickness: 0.6,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  }),
  markFlag: physical(0xd4b06a, { roughness: 0.32, metalness: 0.55, emissive: 0x3a270c, emissiveIntensity: 0.18, clearcoat: 0.35 }),
  forum: physical(0xc46a3a, { roughness: 0.62, metalness: 0.06, emissive: 0x3a1808, emissiveIntensity: 0.35 }),
  forumWarm: new THREE.MeshBasicMaterial({ color: 0xff8a3a }),
  archive: physical(0xe8dcc4, { roughness: 0.92, metalness: 0, flatShading: true }),
  archiveDark: physical(0x8a7a62, { roughness: 0.88, metalness: 0, flatShading: true }),
  watch: physical(0x1a2420, { roughness: 0.28, metalness: 0.55 }),
  watchEye: new THREE.MeshBasicMaterial({ color: 0x4dff9a }),
  secret: physical(0x1a0a0c, { roughness: 0.22, metalness: 0.12, emissive: 0x2a0406, emissiveIntensity: 0.55 }),
  secretGlow: new THREE.MeshBasicMaterial({ color: 0xff1a14, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false }),
  ember: new THREE.MeshBasicMaterial({ color: 0xff2a18 }),
  timber: physical(0x9a6234, { roughness: 0.78, metalness: 0.04, clearcoat: 0.08 }),
  timberDark: physical(0x3f2414, { roughness: 0.88, metalness: 0.03 }),
  coal: physical(0x1a1412, { roughness: 0.7, metalness: 0.08, emissive: 0x2a0c06, emissiveIntensity: 0.35 }),
  water: physical(0x1a3848, {
    roughness: 0.06,
    metalness: 0.18,
    transmission: 0.35,
    thickness: 0.28,
    transparent: true,
    opacity: 0.82,
    emissive: 0x0a2434,
    emissiveIntensity: 0.35,
  }),
  fire: new THREE.MeshBasicMaterial({
    color: 0xff7a28,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  linen: physical(0xc4a888, { roughness: 0.92, metalness: 0, sheen: 0.4, sheenColor: 0xe8d2b4 }),
  hide: physical(0x16080c, {
    roughness: 0.32,
    metalness: 0.06,
    sheen: 0.85,
    sheenColor: 0x8a1020,
    sheenRoughness: 0.38,
    emissive: 0x220306,
    emissiveIntensity: 0.4,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
  }),
  robe: physical(0x5a2040, { roughness: 0.55, metalness: 0.08, sheen: 0.7, sheenColor: 0xc45a7a, sheenRoughness: 0.35, emissive: 0x1a0810, emissiveIntensity: 0.25 }),
  ink: physical(0x1c1410, { roughness: 0.45, metalness: 0.2 }),
  cloth: physical(0xe85a28, { roughness: 0.7, metalness: 0, emissive: 0x4a1808, emissiveIntensity: 0.45 }),
  ion: new THREE.MeshBasicMaterial({ color: 0x3ef0d4 }),
  watchBeam: new THREE.MeshBasicMaterial({
    color: 0x7af0ff,
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  godFlame: new THREE.MeshBasicMaterial({
    color: 0xffc878,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  hull: physical(0x2a3238, { roughness: 0.22, metalness: 0.82, clearcoat: 0.45, clearcoatRoughness: 0.12 }),
  pad: physical(0xc8d2da, { roughness: 0.28, metalness: 0.55, emissive: 0x1a2430, emissiveIntensity: 0.2 }),
  nav: new THREE.MeshBasicMaterial({ color: 0x7af0ff }),
  navWarm: new THREE.MeshBasicMaterial({ color: 0xffb45a }),
  glass: physical(0x8ec8e0, {
    roughness: 0.06,
    metalness: 0.15,
    transmission: 0.55,
    thickness: 0.35,
    transparent: true,
    opacity: 0.72,
    emissive: 0x3a88aa,
    emissiveIntensity: 0.55,
  }),
  canopy: physical(0xffe2a8, {
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.35,
    thickness: 0.25,
    transparent: true,
    opacity: 0.85,
    emissive: 0xffc878,
    emissiveIntensity: 1.4,
  }),
  aquaCanopy: physical(0xa8fff4, {
    roughness: 0.06,
    metalness: 0.04,
    transmission: 0.4,
    thickness: 0.25,
    transparent: true,
    opacity: 0.88,
    emissive: 0x00ffd4,
    emissiveIntensity: 1.8,
  }),
  aquaFlame: new THREE.MeshBasicMaterial({
    color: 0x00ffd4,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  aqua: new THREE.MeshBasicMaterial({ color: 0x00ffd4 }),
  vault: physical(0xd4dce2, { roughness: 0.28, metalness: 0.62, clearcoat: 0.35, emissive: 0x14181c, emissiveIntensity: 0.18 }),
  holo: new THREE.MeshBasicMaterial({
    color: 0xff6a28,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
};

export function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  item.castShadow = false;
  item.receiveShadow = false;
  return item;
}

export function carryLight(group, color = 0xffc878, intensity = 0.85, distance = 2.8, y = 0.42) {
  const light = new THREE.PointLight(color, intensity, distance, 1.8);
  light.position.set(0, y, 0);
  light.castShadow = false;
  light.userData.motion = "lamp";
  light.userData.rest = intensity;
  group.add(light);
  return light;
}

function lathe(xy, segments = 28) {
  return new THREE.LatheGeometry(
    xy.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
}

function bellyLight(group, material, y, size = 0.14) {
  const core = mesh(new THREE.SphereGeometry(size, 10, 8), material, 0, y, 0);
  core.userData.motion = "pulse";
  group.add(core);
  group.add(mesh(new THREE.CylinderGeometry(size * 2.4, size * 0.35, size * 3.6, 12, 1, true), material, 0, y - size * 1.5, 0));
}

function landingPad(group, x, z, radius = 0.95) {
  group.add(mesh(new THREE.CylinderGeometry(radius, radius + 0.08, 0.1, 24), MAT.pad, x, 0.12, z));
  const ring = mesh(new THREE.RingGeometry(radius * 0.38, radius * 0.52, 24), MAT.nav, x, 0.18, z);
  ring.rotation.x = -Math.PI / 2;
  ring.userData.motion = "pulse";
  group.add(ring);
  const core = mesh(new THREE.CircleGeometry(radius * 0.28, 20), MAT.navWarm, x, 0.17, z);
  core.rotation.x = -Math.PI / 2;
  group.add(core);
  const wash = mesh(new THREE.CylinderGeometry(radius * 0.55, 0.12, 0.7, 14, 1, true), MAT.godFlame, x, 0.48, z);
  group.add(wash);
}

export function cityArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(3.85, 4.05, 0.28, 40), MAT.hull, 0, -0.12, 0));
  g.add(mesh(new THREE.CylinderGeometry(3.45, 3.5, 0.08, 40), MAT.slate, 0, 0.04, 0));
  landingPad(g, 0, 0.15, 1.05);
  landingPad(g, -1.85, -1.35, 0.82);
  landingPad(g, 1.85, -1.35, 0.82);
  g.add(mesh(new THREE.BoxGeometry(4.4, 0.06, 0.55), MAT.hull, 0, 0.08, 1.55));
  g.add(mesh(new THREE.BoxGeometry(3.6, 0.85, 1.15), MAT.hull, 0, 0.52, 2.35));
  g.add(mesh(new THREE.BoxGeometry(3.2, 0.22, 0.18), MAT.glass, 0, 0.72, 2.78));
  g.add(mesh(new THREE.BoxGeometry(2.4, 0.16, 0.16), MAT.navWarm, 0, 0.58, 2.78));
  g.add(mesh(new THREE.BoxGeometry(0.42, 2.85, 0.42), MAT.hull, 1.55, 1.55, 2.45));
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.38, 0.38, 8), MAT.glass, 1.55, 3.12, 2.45));
  g.add(mesh(new THREE.BoxGeometry(0.95, 0.12, 0.7), MAT.pad, 1.55, 3.38, 2.45));
  const beacon = mesh(new THREE.SphereGeometry(0.12, 10, 8), MAT.nav, 1.55, 3.55, 2.45);
  beacon.userData.motion = "pulse";
  g.add(beacon);
  g.add(mesh(new THREE.BoxGeometry(1.7, 1.35, 1.4), MAT.hull, -2.55, 0.75, 0.1));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.55, 0.08), MAT.glass, -2.55, 0.85, 0.82));
  g.add(mesh(new THREE.BoxGeometry(1.55, 0.12, 1.25), MAT.slate, -2.55, 1.46, 0.1));
  g.add(mesh(new THREE.BoxGeometry(1.7, 1.15, 1.4), MAT.hull, 2.55, 0.65, 0.1));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.42, 0.08), MAT.slate, 2.55, 0.7, 0.82));
  g.add(mesh(new THREE.BoxGeometry(0.55, 1.85, 0.55), MAT.hull, 2.15, 1.55, 0.35));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), MAT.navWarm, 2.15, 2.52, 0.35));
  for (const side of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(1.35, 0.08, 0.08), MAT.rim, side * 1.15, 0.85, -1.35);
    g.add(arm);
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), MAT.hull, side * 1.85, 0.55, -1.35));
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18), MAT.nav, side * 0.55, 0.85, -1.35));
  }
  for (let i = 0; i < 6; i += 1) {
    const z = -2.15 - i * 0.32;
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), i % 2 === 0 ? MAT.nav : MAT.navWarm, -0.55, 0.2, z));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), i % 2 === 0 ? MAT.navWarm : MAT.nav, 0.55, 0.2, z));
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const pole = mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), MAT.hull);
    pole.position.set(Math.cos(a) * 3.35, 0.48, Math.sin(a) * 3.35);
    g.add(pole);
    const lamp = mesh(new THREE.SphereGeometry(0.08, 8, 6), i % 2 === 0 ? MAT.navWarm : MAT.nav);
    lamp.position.set(Math.cos(a) * 3.35, 0.95, Math.sin(a) * 3.35);
    g.add(lamp);
  }
  bellyLight(g, MAT.navWarm, -0.32, 0.22);
  return g;
}

export function cairnArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.95, 2.15, 0.22, 8), MAT.hull, 0, 0.02, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.65, 1.7, 0.08, 8), MAT.vault, 0, 0.14, 0));
  g.add(mesh(new THREE.BoxGeometry(1.35, 0.22, 0.55), MAT.hull, 0, 0.28, 1.15));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.55, 0.08), MAT.slate, 0, 0.55, 1.38));
  const racks = [
    [0.48, 2.05, 0.62, -0.62, 1.18, 0.08],
    [0.42, 1.65, 0.52, 0.42, 0.98, -0.28],
    [0.36, 1.28, 0.44, 0.78, 0.8, 0.48],
    [0.32, 0.95, 0.4, -0.12, 0.62, 0.78],
    [0.28, 0.72, 0.34, -0.85, 0.5, 0.55],
  ];
  for (const [w, h, d, x, y, z] of racks) {
    g.add(mesh(new THREE.BoxGeometry(w, h, d), MAT.vault, x, y, z));
    g.add(mesh(new THREE.BoxGeometry(w * 0.78, 0.035, 0.035), MAT.nav, x, y + h * 0.32, z + d * 0.42));
    g.add(mesh(new THREE.BoxGeometry(w * 0.6, 0.025, 0.025), MAT.navWarm, x, y - h * 0.08, z + d * 0.42));
    g.add(mesh(new THREE.BoxGeometry(w * 0.5, 0.02, 0.02), MAT.archive, x, y + h * 0.08, z + d * 0.42));
  }
  const board = mesh(new THREE.BoxGeometry(1.2, 0.78, 0.05), MAT.glass, 0.08, 1.12, 1.12);
  g.add(board);
  for (let i = 0; i < 5; i += 1) {
    g.add(mesh(new THREE.BoxGeometry(0.92, 0.035, 0.02), MAT.nav, 0.08, 1.38 - i * 0.11, 1.15));
  }
  g.add(mesh(new THREE.BoxGeometry(0.18, 2.15, 0.18), MAT.iron, -0.55, 1.2, 0.15));
  const dish = mesh(new THREE.CylinderGeometry(0.48, 0.14, 0.2, 16, 1, true), MAT.rim, -0.55, 2.28, 0.15);
  g.add(dish);
  const pulse = mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.navWarm, -0.55, 2.4, 0.15);
  pulse.userData.motion = "pulse";
  g.add(pulse);
  return g;
}

export function vantageArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.12, 1.22, 0.28, 24), MAT.hull, 0, 0, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.08, 24), MAT.pad, 0, 0.16, 0));
  const bay = mesh(new THREE.RingGeometry(0.2, 0.4, 24), MAT.nav, 0, 0.22, 0);
  bay.rotation.x = -Math.PI / 2;
  bay.userData.motion = "pulse";
  g.add(bay);
  g.add(mesh(new THREE.SphereGeometry(0.48, 16, 12), MAT.hull, 0, -0.22, 0));
  g.add(mesh(new THREE.SphereGeometry(0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), MAT.glass, 0, 0.22, 0));
  const ring = mesh(new THREE.TorusGeometry(1.42, 0.04, 8, 40), MAT.rim, 0, 0.02, 0);
  ring.rotation.x = Math.PI / 2;
  ring.userData.motion = "orbit";
  g.add(ring);
  for (const side of [-1, 1]) {
    const wing = mesh(new THREE.BoxGeometry(1.95, 0.06, 0.78), MAT.pad, side * 1.9, -0.02, 0);
    wing.userData.motion = "gimbal";
    g.add(wing);
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), MAT.nav, side * 1.08, 0.12, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), MAT.hull, side * 0.55, -0.38, 0.18));
  }
  const bloom = mesh(new THREE.SphereGeometry(0.42, 14, 10), MAT.watchBeam, 0, 0.08, 0);
  g.add(bloom);
  const wash = mesh(new THREE.CylinderGeometry(0.36, 0.1, 1.15, 12, 1, true), MAT.watchBeam, 0, -0.62, 0);
  g.add(wash);
  return g;
}

function tentacle(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, 14, radius, 6, false);
}

export function hollowArtifact() {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe(
        [
          [0.08, 0.4],
          [0.82, 0.5],
          [1.18, 0.92],
          [1.08, 1.42],
          [0.58, 1.82],
          [0.1, 2.02],
        ],
        20,
      ),
      MAT.hide,
    ),
  );
  g.add(mesh(new THREE.SphereGeometry(0.98, 16, 12), MAT.hide, 0, 0.58, 0));
  const maw = mesh(new THREE.ConeGeometry(0.78, 1.15, 8, 1, true), MAT.secret, 0, 0.12, 0);
  maw.rotation.x = Math.PI;
  g.add(maw);
  const glow = mesh(new THREE.CylinderGeometry(0.16, 0.58, 0.95, 10, 1, true), MAT.secretGlow, 0, 0.22, 0);
  g.add(glow);
  const coal = mesh(new THREE.SphereGeometry(0.24, 10, 8), MAT.ember, 0, 0.38, 0);
  coal.userData.motion = "pulse";
  g.add(coal);
  for (const side of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), MAT.secretGlow, side * 0.44, 1.18, 0.74));
    const eye = mesh(new THREE.SphereGeometry(0.12, 10, 8), MAT.ember, side * 0.44, 1.18, 0.74);
    eye.userData.motion = "pulse";
    g.add(eye);
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const reach = 2.05 + (i % 3) * 0.28;
    const dip = i % 2 === 0 ? 0.12 : -0.28;
    const twist = i % 2 === 0 ? 0.4 : -0.32;
    const limb = new THREE.Group();
    limb.userData.motion = "writhe";
    limb.userData.phase = i * 0.85;
    limb.add(
      mesh(
        tentacle(
          [
            [Math.cos(a) * 0.52, 0.52, Math.sin(a) * 0.52],
            [Math.cos(a) * 1.2, 0.22, Math.sin(a) * 1.2],
            [Math.cos(a) * reach, dip, Math.sin(a) * reach],
            [Math.cos(a + twist) * (reach + 0.55), dip - 0.18, Math.sin(a + twist) * (reach + 0.55)],
          ],
          0.145 - (i % 3) * 0.018,
        ),
        MAT.hide,
      ),
    );
    const tip = mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      MAT.ember,
      Math.cos(a + twist) * (reach + 0.55),
      dip - 0.18,
      Math.sin(a + twist) * (reach + 0.55),
    );
    tip.userData.motion = "pulse";
    limb.add(tip);
    g.add(limb);
  }
  bellyLight(g, MAT.secretGlow, -0.22, 0.16);
  return g;
}

export function driftArtifact() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.16, 0.42, 6, 10), MAT.hull);
  body.rotation.z = Math.PI / 2;
  body.userData.motion = "gimbal";
  g.add(body);
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 0.55), MAT.slate, 0, 0, 0));
  const eye = mesh(new THREE.SphereGeometry(0.07, 8, 6), MAT.ion, 0.28, 0, 0);
  eye.userData.motion = "pulse";
  g.add(eye);
  const trail = mesh(new THREE.ConeGeometry(0.1, 0.32, 8, 1, true), MAT.ion, -0.32, 0, 0);
  trail.rotation.z = Math.PI / 2;
  g.add(trail);
  const belly = mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.ion, 0, -0.14, 0);
  belly.userData.motion = "pulse";
  g.add(belly);
  return g;
}

export function entityArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.48, 0.48), MAT.entity));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.06, 0.54), MAT.hull, 0, 0.28, 0));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.06, 0.54), MAT.hull, 0, -0.28, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), MAT.rim, 0.42, 0, 0.28));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), MAT.rim, -0.42, 0, -0.28));
  const lamp = mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.navWarm, 0, 0.38, 0);
  lamp.userData.motion = "pulse";
  g.add(lamp);
  const belly = mesh(new THREE.SphereGeometry(0.07, 8, 6), MAT.navWarm, 0, -0.36, 0);
  belly.userData.motion = "pulse";
  g.add(belly);
  return g;
}

function sitOnCell(group) {
  const box = new THREE.Box3().setFromObject(group);
  if (!Number.isFinite(box.min.y) || box.min.y === 0) {
    return group;
  }
  const lift = -box.min.y;
  for (const child of group.children) {
    child.position.y += lift;
  }
  return group;
}

function hearthBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.14, 12), MAT.stone, 0, 0.07, 0));
  g.add(mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 14), MAT.stoneDark, 0, 0.16, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.08, 10), MAT.coal, 0, 0.12, 0));
  for (const [x, z] of [[-0.16, 0.12], [0.18, 0.08], [0.02, -0.16]]) {
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), MAT.stoneDark, x, 0.16, z));
  }
  const flame = mesh(new THREE.SphereGeometry(0.16, 10, 8), MAT.fire, 0, 0.38, 0);
  flame.userData.motion = "pulse";
  g.add(flame);
  g.add(mesh(new THREE.ConeGeometry(0.12, 0.28, 7), MAT.ember, 0, 0.56, 0));
  const wash = mesh(new THREE.CylinderGeometry(0.22, 0.04, 0.42, 10, 1, true), MAT.fire, 0, 0.42, 0);
  g.add(wash);
  return g;
}

function chairBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.52, 0.06, 0.5), MAT.timber, 0, 0.34, 0));
  g.add(mesh(new THREE.BoxGeometry(0.46, 0.05, 0.44), MAT.linen, 0, 0.39, 0.01));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.62, 0.07), MAT.timber, 0, 0.68, -0.22));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.05, 0.05), MAT.timberDark, 0, 0.92, -0.22));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.04), MAT.timberDark, 0, 0.72, -0.22));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.04), MAT.timberDark, 0, 0.54, -0.22));
  for (const [x, z] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) {
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.34, 0.07), MAT.timberDark, x, 0.17, z));
  }
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), MAT.timberDark, 0, 0.12, 0.18));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), MAT.timberDark, 0, 0.12, -0.18));
  return g;
}

function tableBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.94, 0.07, 0.62), MAT.timber, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.04, 0.58), MAT.timberDark, 0, 0.45, 0));
  g.add(mesh(new THREE.BoxGeometry(0.86, 0.08, 0.54), MAT.timberDark, 0, 0.4, 0));
  for (const [x, z] of [[-0.38, -0.22], [0.38, -0.22], [-0.38, 0.22], [0.38, 0.22]]) {
    g.add(mesh(new THREE.BoxGeometry(0.09, 0.4, 0.09), MAT.timberDark, x, 0.2, z));
  }
  g.add(mesh(new THREE.BoxGeometry(0.76, 0.04, 0.04), MAT.iron, 0, 0.16, -0.22));
  g.add(mesh(new THREE.BoxGeometry(0.76, 0.04, 0.04), MAT.iron, 0, 0.16, 0.22));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.05, 10), MAT.brass, 0.2, 0.56, 0.1));
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.04, 0.12), MAT.archive, -0.22, 0.56, -0.08));
  return g;
}

function lampBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.08, 8), MAT.iron, 0, 0.04, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.72, 8), MAT.iron, 0, 0.42, 0));
  const globe = mesh(new THREE.SphereGeometry(0.16, 12, 10), MAT.lamp, 0, 0.86, 0);
  globe.userData.motion = "pulse";
  g.add(globe);
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.05, 8), MAT.brass, 0, 1.02, 0));
  const wash = mesh(new THREE.CylinderGeometry(0.28, 0.04, 0.55, 10, 1, true), MAT.godFlame, 0, 0.72, 0);
  g.add(wash);
  return g;
}

function bedBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.1, 1.02), MAT.timberDark, 0, 0.18, 0));
  g.add(mesh(new THREE.BoxGeometry(0.68, 0.08, 0.08), MAT.timber, 0, 0.14, -0.47));
  g.add(mesh(new THREE.BoxGeometry(0.68, 0.08, 0.08), MAT.timber, 0, 0.14, 0.47));
  g.add(mesh(new THREE.BoxGeometry(0.64, 0.14, 0.92), MAT.linen, 0, 0.28, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.08, 0.86), MAT.linen, 0, 0.36, 0.04));
  g.add(mesh(new THREE.BoxGeometry(0.52, 0.14, 0.2), MAT.linen, 0, 0.44, -0.32));
  g.add(mesh(new THREE.BoxGeometry(0.74, 0.58, 0.08), MAT.timber, 0, 0.46, -0.5));
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.06, 0.04), MAT.timberDark, 0, 0.62, -0.5));
  g.add(mesh(new THREE.BoxGeometry(0.74, 0.22, 0.08), MAT.timber, 0, 0.24, 0.5));
  for (const [x, z] of [[-0.3, -0.48], [0.3, -0.48], [-0.3, 0.48], [0.3, 0.48]]) {
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), MAT.timberDark, x, 0.1, z));
  }
  return g;
}

function wallBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1, 1, 1), MAT.deck, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(1.02, 0.08, 1.02), MAT.slate, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(1.01, 0.05, 1.01), MAT.rim, 0, 0.975, 0));
  g.add(mesh(new THREE.BoxGeometry(1.01, 0.05, 1.01), MAT.slate, 0, 0.025, 0));
  return g;
}

const SLAB = 0.12;

function wallPlate(axis, sign) {
  const g = new THREE.Group();
  const inset = 0.5 - SLAB / 2;
  if (axis === "z") {
    const z = sign * inset;
    g.add(mesh(new THREE.BoxGeometry(1, 1, SLAB), MAT.deck, 0, 0.5, z));
    g.add(mesh(new THREE.BoxGeometry(1.02, 0.1, SLAB + 0.02), MAT.ion, 0, 0.5, z));
    g.add(mesh(new THREE.BoxGeometry(1.01, 0.05, SLAB + 0.01), MAT.nav, 0, 0.975, z));
    return g;
  }
  if (axis === "x") {
    const x = sign * inset;
    g.add(mesh(new THREE.BoxGeometry(SLAB, 1, 1), MAT.deck, x, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(SLAB + 0.02, 0.1, 1.02), MAT.ion, x, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(SLAB + 0.01, 0.05, 1.01), MAT.nav, x, 0.975, 0));
    return g;
  }
  const y = sign > 0 ? 1 - SLAB / 2 : SLAB / 2;
  g.add(mesh(new THREE.BoxGeometry(1, SLAB, 1), MAT.deck, 0, y, 0));
  g.add(mesh(new THREE.BoxGeometry(1.02, SLAB + 0.02, 0.1), MAT.ion, 0, y, 0));
  g.add(mesh(new THREE.BoxGeometry(0.1, SLAB + 0.02, 1.02), MAT.nav, 0, y, 0));
  return g;
}

function takeChildren(into, from) {
  while (from.children.length > 0) {
    into.add(from.children[0]);
  }
}

function wallFrontBlock() {
  return wallPlate("z", -1);
}

function wallBackBlock() {
  return wallPlate("z", 1);
}

function wallLeftBlock() {
  return wallPlate("x", -1);
}

function wallRightBlock() {
  return wallPlate("x", 1);
}

function wallTopBlock() {
  return wallPlate("y", 1);
}

function wallBottomBlock() {
  return wallPlate("y", -1);
}

function wallLBlock() {
  const g = new THREE.Group();
  takeChildren(g, wallPlate("x", -1));
  takeChildren(g, wallPlate("z", -1));
  return g;
}

function crateBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), MAT.timber, 0, 0.27, 0));
  g.add(mesh(new THREE.BoxGeometry(0.66, 0.06, 0.66), MAT.timberDark, 0, 0.54, 0));
  g.add(mesh(new THREE.BoxGeometry(0.66, 0.06, 0.66), MAT.timberDark, 0, 0.04, 0));
  g.add(mesh(new THREE.BoxGeometry(0.64, 0.06, 0.64), MAT.iron, 0, 0.27, 0));
  for (const [x, z] of [[0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]]) {
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), MAT.iron, x, 0.27, z));
  }
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.04, 0.04), MAT.timberDark, 0, 0.4, 0.32));
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.04, 0.04), MAT.timberDark, 0, 0.4, -0.32));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.05, 0.16), MAT.iron, 0, 0.58, 0));
  return g;
}

function barrelBlock() {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0.2, 0], [0.28, 0.08], [0.34, 0.3], [0.28, 0.54], [0.2, 0.62]], 16), MAT.timber, 0, 0, 0));
  g.add(mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 16), MAT.iron, 0, 0.16, 0));
  g.add(mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 16), MAT.iron, 0, 0.32, 0));
  g.add(mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 16), MAT.iron, 0, 0.48, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 12), MAT.timberDark, 0, 0.62, 0));
  return g;
}

function shelfBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.88, 0.06), MAT.timberDark, 0, 0.46, -0.12));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.88, 0.26), MAT.timberDark, -0.35, 0.46, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.88, 0.26), MAT.timberDark, 0.35, 0.46, 0));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.06, 0.26), MAT.timber, 0, 0.06, 0));
  for (const y of [0.2, 0.46, 0.72]) {
    g.add(mesh(new THREE.BoxGeometry(0.74, 0.05, 0.24), MAT.timber, 0, y, 0));
  }
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.2, 0.1), MAT.archive, -0.18, 0.58, 0.04));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), MAT.archiveDark, -0.06, 0.56, 0.04));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), MAT.cloth, 0.14, 0.55, 0.04));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), MAT.brass, 0.22, 0.3, 0.04));
  return g;
}

function doorBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), MAT.timberDark, -0.32, 0.6, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), MAT.timberDark, 0.32, 0.6, 0));
  g.add(mesh(new THREE.BoxGeometry(0.76, 0.12, 0.12), MAT.timberDark, 0, 1.16, 0));
  g.add(mesh(new THREE.BoxGeometry(0.76, 0.08, 0.12), MAT.timberDark, 0, 0.04, 0));
  g.add(mesh(new THREE.BoxGeometry(0.56, 1.02, 0.07), MAT.timber, 0, 0.58, 0));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.92, 0.03), MAT.timberDark, 0, 0.58, 0.05));
  g.add(mesh(new THREE.BoxGeometry(0.48, 0.04, 0.03), MAT.timberDark, 0, 0.78, 0.05));
  g.add(mesh(new THREE.BoxGeometry(0.48, 0.04, 0.03), MAT.timberDark, 0, 0.38, 0.05));
  g.add(mesh(new THREE.BoxGeometry(0.09, 0.09, 0.12), MAT.brass, 0.18, 0.54, 0.08));
  return g;
}

function windowBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.64, 0.7, 0.08), MAT.timberDark, 0, 0.58, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.56, 0.03), MAT.glass, 0, 0.58, 0.03));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.56, 0.05), MAT.timber, 0, 0.58, 0.04));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), MAT.timber, 0, 0.58, 0.04));
  const glow = mesh(new THREE.BoxGeometry(0.46, 0.5, 0.02), MAT.lamp, 0, 0.58, 0.01);
  glow.userData.motion = "pulse";
  g.add(glow);
  return g;
}

function rugBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.84, 0.03, 0.56), MAT.cloth, 0, 0.02, 0));
  g.add(mesh(new THREE.BoxGeometry(0.68, 0.02, 0.4), MAT.linen, 0, 0.035, 0));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.015, 0.2), MAT.cloth, 0, 0.045, 0));
  return g;
}

function wellBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.42, 14), MAT.stone, 0, 0.21, 0));
  g.add(mesh(new THREE.TorusGeometry(0.38, 0.06, 8, 16), MAT.stoneDark, 0, 0.44, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 14), MAT.water, 0, 0.28, 0));
  g.add(mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), MAT.timber, -0.3, 0.68, 0));
  g.add(mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), MAT.timber, 0.3, 0.68, 0));
  g.add(mesh(new THREE.BoxGeometry(0.68, 0.06, 0.06), MAT.timberDark, 0, 0.94, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.12, 8), MAT.iron, 0, 0.72, 0));
  return g;
}

function fenceBlock() {
  const g = new THREE.Group();
  for (const x of [-0.36, 0, 0.36]) {
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.62, 0.08), MAT.timberDark, x, 0.31, 0));
  }
  g.add(mesh(new THREE.BoxGeometry(0.82, 0.06, 0.05), MAT.timber, 0, 0.22, 0));
  g.add(mesh(new THREE.BoxGeometry(0.82, 0.06, 0.05), MAT.timber, 0, 0.42, 0));
  return g;
}

function gateBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.88, 0.1), MAT.timberDark, -0.36, 0.44, 0));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.88, 0.1), MAT.timberDark, 0.36, 0.44, 0));
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.08, 0.08), MAT.timberDark, 0, 0.86, 0));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.62, 0.05), MAT.timber, -0.16, 0.42, 0));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.62, 0.05), MAT.timber, 0.16, 0.42, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1), MAT.iron, 0.08, 0.44, 0.05));
  return g;
}

function signBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.98, 0.08), MAT.timberDark, 0, 0.49, 0));
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.36, 0.05), MAT.timber, 0, 0.88, 0.06));
  g.add(mesh(new THREE.BoxGeometry(0.48, 0.04, 0.02), MAT.brass, 0, 0.94, 0.1));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.03, 0.02), MAT.brass, 0, 0.84, 0.1));
  return g;
}

function bannerBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 8), MAT.iron, 0, 0.6, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.62, 0.03), MAT.cloth, 0.26, 0.82, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.04), MAT.brass, 0.26, 1.12, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.02), MAT.brass, 0.26, 0.92, 0.02));
  return g;
}

function pathBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.82, 0.05, 0.4), MAT.stone, 0, 0.025, 0));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.04, 0.18), MAT.stoneDark, -0.2, 0.05, 0.05));
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.04, 0.16), MAT.stone, 0.18, 0.05, -0.04));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.035, 0.14), MAT.stoneDark, 0.02, 0.048, 0.08));
  return g;
}

function stepsBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.12, 0.24), MAT.stone, 0, 0.06, 0.2));
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.12, 0.24), MAT.stoneDark, 0, 0.18, 0));
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.12, 0.24), MAT.stone, 0, 0.3, -0.2));
  return g;
}

function awningBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), MAT.timberDark, -0.34, 0.36, 0.18));
  g.add(mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), MAT.timberDark, 0.34, 0.36, 0.18));
  const cloth = mesh(new THREE.BoxGeometry(0.82, 0.05, 0.56), MAT.cloth, 0, 0.76, 0);
  cloth.rotation.x = -0.28;
  g.add(cloth);
  g.add(mesh(new THREE.BoxGeometry(0.82, 0.04, 0.08), MAT.timber, 0, 0.7, -0.24));
  return g;
}

function benchBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.96, 0.07, 0.34), MAT.timber, 0, 0.32, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.04, 0.3), MAT.linen, 0, 0.37, 0.01));
  g.add(mesh(new THREE.BoxGeometry(0.96, 0.32, 0.07), MAT.timber, 0, 0.52, -0.14));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.32, 0.3), MAT.timberDark, -0.4, 0.16, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.32, 0.3), MAT.timberDark, 0.4, 0.16, 0));
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.04, 0.04), MAT.timberDark, 0, 0.12, 0.12));
  return g;
}

function stallBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.96, 0.08, 0.52), MAT.timber, 0, 0.46, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.48), MAT.timberDark, 0, 0.4, 0));
  for (const [x, z] of [[-0.4, 0.2], [0.4, 0.2], [-0.4, -0.2], [0.4, -0.2]]) {
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), MAT.timberDark, x, 0.2, z));
  }
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.48, 0.08), MAT.timberDark, -0.44, 0.7, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.48, 0.08), MAT.timberDark, 0.44, 0.7, 0));
  g.add(mesh(new THREE.BoxGeometry(0.96, 0.05, 0.08), MAT.timber, 0, 0.94, 0));
  const roof = mesh(new THREE.BoxGeometry(1.02, 0.05, 0.62), MAT.cloth, 0, 0.98, 0);
  roof.rotation.x = -0.14;
  g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(0.18, 0.14, 0.16), MAT.timberDark, -0.2, 0.56, 0.06));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), MAT.archive, -0.02, 0.54, 0.08));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 8), MAT.brass, 0.2, 0.56, 0.06));
  return g;
}

function chimneyBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.36, 1.05, 0.36), MAT.stone, 0, 0.52, 0));
  g.add(mesh(new THREE.BoxGeometry(0.44, 0.1, 0.44), MAT.stoneDark, 0, 1.06, 0));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), MAT.coal, 0, 1.14, 0));
  const smoke = mesh(new THREE.SphereGeometry(0.12, 8, 6), MAT.fire, 0, 1.28, 0);
  smoke.userData.motion = "pulse";
  g.add(smoke);
  return g;
}

export const WAKE_LOOT_KINDS = new Set(["guestmark", "cache", "echo", "stirring"]);

export function wakeHasLoot(kind) {
  return typeof kind === "string" && WAKE_LOOT_KINDS.has(kind);
}

export function wakeArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.stoneDark, 0, 0, 0));
  g.add(mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.stone, 0.08, 0.04, -0.06));
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.52, 0.08), MAT.stone, 0, 0.38, 0));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.08, 0.06), MAT.stoneDark, 0, 0.58, 0.02));
  const glint = mesh(new THREE.SphereGeometry(0.07, 8, 6), MAT.lamp, 0.16, 0.18, 0.12);
  glint.userData.motion = "pulse";
  g.add(glint);
  return sitOnCell(g);
}

export function beastArtifact() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.userData.motion = "writhe";
  body.userData.phase = 0.4;
  const base = mesh(new THREE.TorusGeometry(0.38, 0.14, 8, 22), MAT.hide, 0, 0.16, 0);
  base.rotation.x = Math.PI / 2;
  body.add(base);
  const mid = mesh(new THREE.TorusGeometry(0.26, 0.12, 8, 18), MAT.hide, 0.1, 0.34, 0.08);
  mid.rotation.x = 0.95;
  mid.rotation.z = 0.35;
  body.add(mid);
  const neck = mesh(new THREE.TorusGeometry(0.16, 0.1, 8, 16), MAT.hide, 0.22, 0.52, 0.16);
  neck.rotation.x = 1.15;
  body.add(neck);
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.2, 12, 10), MAT.hide, 0.3, 0.68, 0.28));
  const jaw = mesh(new THREE.ConeGeometry(0.13, 0.24, 7, 1, true), MAT.secret, 0.38, 0.64, 0.44);
  jaw.rotation.x = Math.PI / 2;
  g.add(jaw);
  g.add(mesh(new THREE.ConeGeometry(0.06, 0.1, 5), MAT.hide, 0.22, 0.82, 0.22));
  g.add(mesh(new THREE.ConeGeometry(0.05, 0.08, 5), MAT.hide, 0.36, 0.8, 0.2));
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.05, 8, 6), MAT.ember, 0.3 + side * 0.09, 0.76, 0.38);
    eye.userData.motion = "pulse";
    g.add(eye);
  }
  const coal = mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.ember, 0.36, 0.62, 0.34);
  coal.userData.motion = "pulse";
  g.add(coal);
  return sitOnCell(g);
}

export function blockSlab() {
  return pathBlock();
}

export function blockPost() {
  return fenceBlock();
}

export function blockStall() {
  return stallBlock();
}

const BLOCK_BUILDERS = {
  hearth: hearthBlock,
  chair: chairBlock,
  table: tableBlock,
  lamp: lampBlock,
  lantern: lampBlock,
  bed: bedBlock,
  crate: crateBlock,
  box: wallBlock,
  cube: wallBlock,
  wall: wallBlock,
  hull: wallBlock,
  keep: wallBlock,
  hangar: wallBlock,
  dock: wallBlock,
  "wall-front": wallFrontBlock,
  "wall-back": wallBackBlock,
  "wall-left": wallLeftBlock,
  "wall-right": wallRightBlock,
  "wall-top": wallTopBlock,
  "wall-bottom": wallBottomBlock,
  "wall-l": wallLBlock,
  barrel: barrelBlock,
  shelf: shelfBlock,
  door: doorBlock,
  window: windowBlock,
  rug: rugBlock,
  well: wellBlock,
  fence: fenceBlock,
  rail: fenceBlock,
  gate: gateBlock,
  sign: signBlock,
  banner: bannerBlock,
  path: pathBlock,
  steps: stepsBlock,
  awning: awningBlock,
  bench: benchBlock,
  stall: stallBlock,
  chimney: chimneyBlock,
};

export const BLOCK_FORMS = Object.keys(BLOCK_BUILDERS);

export function kindHash(kind) {
  let hash = 2166136261;
  const text = typeof kind === "string" && kind.length > 0 ? kind : "block";
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function blockForm(kind) {
  const key = typeof kind === "string" ? kind.toLowerCase() : "";
  return key in BLOCK_BUILDERS ? key : "wall";
}

const FACE_WALLS = new Set([
  "wall-front",
  "wall-back",
  "wall-left",
  "wall-right",
  "wall-top",
  "wall-bottom",
  "wall-l",
]);

const BLOCK_LIGHTS = {
  hearth: { color: 0xff7a28, intensity: 1.4, distance: 3.6, y: 0.42 },
  lamp: { color: 0xffd089, intensity: 1.2, distance: 3.2, y: 0.72 },
  lantern: { color: 0xffd089, intensity: 1.2, distance: 3.2, y: 0.72 },
  chimney: { color: 0xff6a20, intensity: 0.85, distance: 2.6, y: 1.05 },
  window: { color: 0xffe2a8, intensity: 0.7, distance: 2.4, y: 0.58 },
};

export function blockArtifact(kind) {
  const form = blockForm(kind);
  const built = (BLOCK_BUILDERS[form] ?? crateBlock)();
  const group = FACE_WALLS.has(form) ? built : sitOnCell(built);
  const spec = BLOCK_LIGHTS[form];
  if (spec) {
    carryLight(group, spec.color, spec.intensity, spec.distance, spec.y);
  }
  return group;
}

export function wardenArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), MAT.rim, 0, 0.12, 0));
  return g;
}

export function markArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 8), MAT.stoneDark, 0, 0.06, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 8), MAT.hull, 0, 0.14, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 1.72, 0.08), MAT.iron, 0, 1.02, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), MAT.rim, 0, 1.86, 0));
  g.add(mesh(new THREE.BoxGeometry(0.92, 0.05, 0.05), MAT.iron, 0.42, 1.62, 0));
  const cloth = mesh(new THREE.BoxGeometry(0.72, 0.58, 0.03), MAT.markFlag, 0.48, 1.28, 0.04);
  g.add(cloth);
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.04, 0.04), MAT.holo, 0.48, 1.54, 0.06));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.025, 0.02), MAT.navWarm, 0.42, 1.36, 0.06));
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.02, 0.02), MAT.navWarm, 0.46, 1.24, 0.06));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.02, 0.02), MAT.holo, 0.38, 1.12, 0.06));
  const tip = mesh(new THREE.SphereGeometry(0.07, 8, 6), MAT.holo, 0, 1.96, 0);
  tip.userData.motion = "pulse";
  g.add(tip);
  const ring = mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 16), MAT.holo, 0, 0.18, 0);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}

function landerHull(skin, canopy, lit) {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe(
        [
          [0.04, 0.02],
          [0.22, 0.06],
          [0.58, 0.12],
          [0.78, 0.2],
          [0.72, 0.28],
          [0.42, 0.34],
          [0.16, 0.36],
        ],
        28,
      ),
      skin,
    ),
  );
  const rim = mesh(new THREE.TorusGeometry(0.74, 0.035, 8, 36), lit ? MAT.rim : MAT.echo, 0, 0.22, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), lit ? MAT.slate : MAT.echo, 0, 0.36, 0));
  g.add(mesh(new THREE.SphereGeometry(0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), canopy, 0, 0.36, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.28, 0.06, 16), lit ? MAT.hull : MAT.echo, 0, 0.08, 0));
  const well = mesh(new THREE.CircleGeometry(0.14, 16), lit ? MAT.aqua : MAT.nav, 0, 0.05, 0);
  well.rotation.x = Math.PI / 2;
  g.add(well);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const lamp = mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      lit ? (i % 2 === 0 ? MAT.aqua : MAT.navWarm) : MAT.nav,
      Math.cos(a) * 0.7,
      0.22,
      Math.sin(a) * 0.7,
    );
    if (lit && i % 2 === 0) {
      lamp.userData.motion = "pulse";
    }
    g.add(lamp);
  }
  if (lit) {
    const wash = mesh(new THREE.CylinderGeometry(0.12, 0.32, 0.28, 12, 1, true), MAT.aquaFlame, 0, -0.06, 0);
    g.add(wash);
  }
  return g;
}

export function godArtifact() {
  return landerHull(MAT.hull, MAT.aquaCanopy, true);
}

export function echoArtifact() {
  return landerHull(MAT.echo, MAT.echo, false);
}

export const KNOWN = {
  nexus: cityArtifact,
  cairn: cairnArtifact,
  vantage: vantageArtifact,
  hollow: hollowArtifact,
  drift: driftArtifact,
  warden: wardenArtifact,
  mark: markArtifact,
  identity: godArtifact,
  echo: echoArtifact,
  entity: entityArtifact,
  beast: beastArtifact,
  wake: wakeArtifact,
  crate: crateBlock,
  slab: pathBlock,
  post: fenceBlock,
  stall: stallBlock,
};
