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
  gold: physical(0xe8b44a, {
    roughness: 0.16,
    metalness: 0.92,
    clearcoat: 0.62,
    clearcoatRoughness: 0.14,
    emissive: 0xffb45a,
    emissiveIntensity: 1.15,
  }),
  brick: physical(0x8a4a38, { roughness: 0.84, metalness: 0.04, clearcoat: 0.06 }),
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
  const hangar = mesh(new THREE.CylinderGeometry(0.62, 0.62, 3.4, 18, 1, false, 0, Math.PI), MAT.hull, 0, 0.52, 2.35);
  hangar.rotation.z = Math.PI / 2;
  g.add(hangar);
  g.add(mesh(new THREE.BoxGeometry(3.2, 0.22, 0.18), MAT.glass, 0, 0.72, 2.78));
  g.add(mesh(new THREE.BoxGeometry(2.4, 0.16, 0.16), MAT.navWarm, 0, 0.58, 2.78));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.85, 10), MAT.hull, 1.55, 1.55, 2.45));
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.38, 0.38, 8), MAT.glass, 1.55, 3.12, 2.45));
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.1, 12), MAT.pad, 1.55, 3.38, 2.45));
  const beacon = mesh(new THREE.SphereGeometry(0.12, 10, 8), MAT.nav, 1.55, 3.55, 2.45);
  beacon.userData.motion = "pulse";
  g.add(beacon);
  g.add(mesh(new THREE.CylinderGeometry(0.72, 0.82, 1.35, 12), MAT.hull, -2.55, 0.75, 0.1));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.55, 0.08), MAT.glass, -2.55, 0.85, 0.82));
  g.add(mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.1, 12), MAT.slate, -2.55, 1.46, 0.1));
  g.add(mesh(new THREE.CylinderGeometry(0.7, 0.78, 1.15, 12), MAT.hull, 2.55, 0.65, 0.1));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.42, 0.08), MAT.slate, 2.55, 0.7, 0.82));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.85, 10), MAT.hull, 2.15, 1.55, 0.35));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), MAT.navWarm, 2.15, 2.52, 0.35));
  for (const side of [-1, 1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35, 8), MAT.rim, side * 1.15, 0.85, -1.35);
    arm.rotation.z = Math.PI / 2;
    g.add(arm);
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 8), MAT.hull, side * 1.85, 0.55, -1.35));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), MAT.nav, side * 0.55, 0.85, -1.35));
  }
  for (let i = 0; i < 6; i += 1) {
    const z = -2.15 - i * 0.32;
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), i % 2 === 0 ? MAT.nav : MAT.navWarm, -0.55, 0.2, z));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), i % 2 === 0 ? MAT.navWarm : MAT.nav, 0.55, 0.2, z));
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const pole = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.85, 8), MAT.hull);
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
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.22, 10), MAT.hull, 0, 0.28, 1.15));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.55, 0.08), MAT.slate, 0, 0.55, 1.38));
  const racks = [
    [0.48, 2.05, -0.62, 1.18, 0.08],
    [0.42, 1.65, 0.42, 0.98, -0.28],
    [0.36, 1.28, 0.78, 0.8, 0.48],
    [0.32, 0.95, -0.12, 0.62, 0.78],
    [0.28, 0.72, -0.85, 0.5, 0.55],
  ];
  for (const [w, h, x, y, z] of racks) {
    g.add(mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.48, h, 10), MAT.vault, x, y, z));
    g.add(mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.5, 0.035, 10), MAT.nav, x, y + h * 0.32, z));
    g.add(mesh(new THREE.CylinderGeometry(w * 0.46, w * 0.46, 0.025, 10), MAT.navWarm, x, y - h * 0.08, z));
    g.add(mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.4, 0.02, 10), MAT.archive, x, y + h * 0.08, z));
  }
  const board = mesh(new THREE.BoxGeometry(1.2, 0.78, 0.05), MAT.glass, 0.08, 1.12, 1.12);
  g.add(board);
  for (let i = 0; i < 5; i += 1) {
    g.add(mesh(new THREE.BoxGeometry(0.92, 0.035, 0.02), MAT.nav, 0.08, 1.38 - i * 0.11, 1.15));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.15, 8), MAT.iron, -0.55, 1.2, 0.15));
  const dish = mesh(new THREE.CylinderGeometry(0.48, 0.14, 0.2, 16, 1, true), MAT.rim, -0.55, 2.28, 0.15);
  g.add(dish);
  const pulse = mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.navWarm, -0.55, 2.4, 0.15);
  pulse.userData.motion = "pulse";
  g.add(pulse);
  return g;
}

export function vantageArtifact() {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe(
        [
          [0.22, -0.1],
          [0.92, -0.04],
          [1.2, 0.04],
          [1.08, 0.14],
          [0.52, 0.16],
        ],
        24,
      ),
      MAT.hull,
    ),
  );
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
    const wing = mesh(new THREE.CylinderGeometry(0.36, 0.4, 1.9, 12), MAT.pad, side * 1.9, -0.02, 0);
    wing.rotation.z = Math.PI / 2;
    wing.userData.motion = "gimbal";
    g.add(wing);
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), MAT.nav, side * 1.08, 0.12, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 8), MAT.hull, side * 0.55, -0.38, 0.18));
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
  const body = mesh(new THREE.CapsuleGeometry(0.18, 0.52, 6, 12), MAT.hull);
  body.rotation.z = Math.PI / 2;
  body.userData.motion = "gimbal";
  g.add(body);
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.28, 0.62), MAT.slate, 0, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.18), MAT.rim, 0, 0.12, 0));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.18), MAT.rim, 0, -0.12, 0));
  const eye = mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.ion, 0.34, 0, 0);
  eye.userData.motion = "pulse";
  g.add(eye);
  const canopy = mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass, 0.12, 0.1, 0);
  canopy.rotation.z = -0.6;
  g.add(canopy);
  const trail = mesh(new THREE.ConeGeometry(0.12, 0.38, 8, 1, true), MAT.ion, -0.4, 0, 0);
  trail.rotation.z = Math.PI / 2;
  g.add(trail);
  const belly = mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.ion, 0, -0.16, 0);
  belly.userData.motion = "pulse";
  g.add(belly);
  return g;
}

export function entityArtifact() {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe(
        [
          [0.05, -0.16],
          [0.2, -0.14],
          [0.28, -0.02],
          [0.26, 0.12],
          [0.16, 0.22],
          [0.07, 0.28],
        ],
        16,
      ),
      MAT.entity,
    ),
  );
  g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.06, 12), MAT.hull, 0, 0.24, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.08, 8), MAT.iron, 0, 0.3, 0));
  const gyro = mesh(new THREE.TorusGeometry(0.32, 0.022, 6, 20), MAT.rim, 0, 0.04, 0);
  gyro.userData.motion = "orbit";
  g.add(gyro);
  const yoke = mesh(new THREE.TorusGeometry(0.3, 0.016, 6, 16), MAT.iron, 0, 0.04, 0);
  yoke.rotation.y = Math.PI / 2;
  yoke.userData.motion = "gimbal";
  g.add(yoke);
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.03), MAT.navWarm, 0, 0.08, 0.25));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), MAT.hull, 0, 0.08, 0.22));
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.52;
    const x = Math.cos(a) * 0.2;
    const z = Math.sin(a) * 0.2;
    g.add(mesh(new THREE.CylinderGeometry(0.028, 0.042, 0.26, 6), MAT.hull, x, -0.28, z));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.035, 0.1), MAT.iron, x * 1.08, -0.42, z * 1.08));
  }
  const lamp = mesh(new THREE.SphereGeometry(0.065, 8, 6), MAT.navWarm, 0, 0.4, 0);
  lamp.userData.motion = "pulse";
  g.add(lamp);
  const belly = mesh(new THREE.SphereGeometry(0.055, 8, 6), MAT.navWarm, 0, -0.06, 0);
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
  g.add(mesh(new THREE.BoxGeometry(0.92, 0.12, 0.62), MAT.stoneDark, 0, 0.06, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.08, 0.48), MAT.stone, 0, 0.14, 0.04));
  g.add(mesh(new THREE.BoxGeometry(0.86, 0.72, 0.12), MAT.stone, 0, 0.5, -0.22));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.72, 0.42), MAT.stoneDark, -0.4, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.72, 0.42), MAT.stoneDark, 0.4, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(0.92, 0.1, 0.16), MAT.stone, 0, 0.88, -0.18));
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 12), MAT.coal, 0, 0.2, 0.06));
  for (const [x, z] of [[-0.14, 0.12], [0.16, 0.08], [0.02, -0.06]]) {
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), MAT.stoneDark, x, 0.24, z));
  }
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.16, 0.16), MAT.iron, -0.16, 0.22, 0.14));
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.16, 0.16), MAT.iron, 0.16, 0.22, 0.14));
  const flame = mesh(new THREE.SphereGeometry(0.16, 10, 8), MAT.fire, 0, 0.42, 0.06);
  flame.userData.motion = "pulse";
  g.add(flame);
  g.add(mesh(new THREE.ConeGeometry(0.12, 0.28, 7), MAT.ember, 0, 0.6, 0.06));
  const wash = mesh(new THREE.CylinderGeometry(0.22, 0.04, 0.42, 10, 1, true), MAT.fire, 0, 0.46, 0.06);
  g.add(wash);
  return g;
}

function chairBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 12), MAT.timber, 0, 0.34, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), MAT.linen, 0, 0.39, 0.01));
  const back = mesh(new THREE.BoxGeometry(0.48, 0.62, 0.06), MAT.timber, 0, 0.68, -0.22);
  back.rotation.x = 0.12;
  g.add(back);
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), MAT.timberDark, 0, 0.92, -0.2));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.035, 0.035), MAT.timberDark, 0, 0.72, -0.2));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.035, 0.035), MAT.timberDark, 0, 0.54, -0.2));
  for (const [x, z] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.34, 8), MAT.timberDark, x, 0.17, z));
  }
  const front = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), MAT.timberDark, 0, 0.12, 0.18);
  front.rotation.z = Math.PI / 2;
  g.add(front);
  const rear = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), MAT.timberDark, 0, 0.12, -0.18);
  rear.rotation.z = Math.PI / 2;
  g.add(rear);
  return g;
}

function tableBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.06, 16), MAT.timber, 0, 0.5, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.05, 14), MAT.timberDark, 0, 0.44, 0));
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.04, 0.04), MAT.timberDark, 0, 0.38, 0));
  for (const [x, z] of [[-0.32, -0.2], [0.32, -0.2], [-0.32, 0.2], [0.32, 0.2]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.042, 0.4, 8), MAT.timberDark, x, 0.2, z));
  }
  const railA = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.64, 8), MAT.iron, 0, 0.16, -0.2);
  railA.rotation.z = Math.PI / 2;
  g.add(railA);
  const railB = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.64, 8), MAT.iron, 0, 0.16, 0.2);
  railB.rotation.z = Math.PI / 2;
  g.add(railB);
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.05, 10), MAT.brass, 0.16, 0.56, 0.08));
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.04, 0.12), MAT.archive, -0.18, 0.56, -0.08));
  return g;
}

function lampBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 8), MAT.stoneDark, 0, 0.05, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), MAT.iron, 0, 0.12, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.05, 8), MAT.iron, 0, 0.66, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.36), MAT.iron, 0.12, 1.16, 0));
  g.add(mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 8), MAT.brass, 0.28, 1.08, 0));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), MAT.brass, 0.28, 1.22, 0));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), MAT.iron, 0.18, 1.06, 0.08));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), MAT.iron, 0.38, 1.06, 0.08));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), MAT.iron, 0.18, 1.06, -0.08));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), MAT.iron, 0.38, 1.06, -0.08));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), MAT.iron, 0.28, 0.9, 0));
  const globe = mesh(new THREE.SphereGeometry(0.14, 12, 10), MAT.lamp, 0.28, 1.06, 0);
  globe.userData.motion = "pulse";
  g.add(globe);
  const wash = mesh(new THREE.CylinderGeometry(0.26, 0.04, 0.5, 10, 1, true), MAT.godFlame, 0.28, 0.88, 0);
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
  g.add(mesh(new THREE.BoxGeometry(1, 1, 1), MAT.stone, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(1.04, 0.1, 1.04), MAT.stoneDark, 0, 0.05, 0));
  g.add(mesh(new THREE.BoxGeometry(1.03, 0.08, 1.03), MAT.stoneDark, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(1.06, 0.1, 1.06), MAT.stoneDark, 0, 0.97, 0));
  g.add(mesh(new THREE.BoxGeometry(0.92, 0.04, 0.92), MAT.slate, 0, 1.03, 0));
  for (const [x, z] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) {
    g.add(mesh(new THREE.BoxGeometry(0.08, 1.02, 0.08), MAT.iron, x, 0.51, z));
  }
  return g;
}

function plateCube(fill, trim, accent) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1, 1, 1), fill, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(1.02, 0.05, 1.02), trim, 0, 0.04, 0));
  g.add(mesh(new THREE.BoxGeometry(1.02, 0.05, 1.02), trim, 0, 0.96, 0));
  if (accent) {
    g.add(mesh(new THREE.BoxGeometry(1.04, 0.03, 0.08), accent, 0, 0.5, 0.5));
    g.add(mesh(new THREE.BoxGeometry(1.04, 0.03, 0.08), accent, 0, 0.5, -0.5));
  }
  return g;
}

function hullBlock() {
  return plateCube(MAT.hull, MAT.slate, MAT.ion);
}

function hangarBlock() {
  return plateCube(MAT.slate, MAT.hull, MAT.deck);
}

function goldBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.22, 0.72), MAT.hull, 0, 0.12, 0));
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.16, 0.58), MAT.gold, 0, 0.28, 0));
  const globe = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), MAT.lamp, 0, 0.58, 0);
  globe.userData.motion = "pulse";
  g.add(globe);
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.04, 0.62), MAT.brass, 0, 0.84, 0));
  const wash = mesh(new THREE.CylinderGeometry(0.55, 0.12, 0.7, 12, 1, true), MAT.godFlame, 0, 0.42, 0);
  g.add(wash);
  return g;
}

function glassBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1, 0.08, 1), MAT.hull, 0, 0.04, 0));
  g.add(mesh(new THREE.BoxGeometry(1, 0.08, 1), MAT.hull, 0, 0.96, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.84, 0.08), MAT.hull, -0.46, 0.5, -0.46));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.84, 0.08), MAT.hull, 0.46, 0.5, -0.46));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.84, 0.08), MAT.hull, -0.46, 0.5, 0.46));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.84, 0.08), MAT.hull, 0.46, 0.5, 0.46));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.84, 0.9), MAT.glass, 0, 0.5, 0));
  return g;
}

function woodBlock() {
  return plateCube(MAT.timber, MAT.timberDark);
}

function brickBlock() {
  return plateCube(MAT.brick, MAT.stoneDark);
}

function oreBlock() {
  return plateCube(MAT.rock, MAT.iron);
}

function archway(fill, trim, accent, axis) {
  const g = new THREE.Group();
  const pier = 0.2;
  const depth = 0.42;
  const rise = 1.08;
  if (axis === "x") {
    g.add(mesh(new THREE.BoxGeometry(depth, rise, pier), fill, 0, rise / 2, -0.4));
    g.add(mesh(new THREE.BoxGeometry(depth, rise, pier), fill, 0, rise / 2, 0.4));
    g.add(mesh(new THREE.BoxGeometry(depth + 0.04, 0.22, 1), fill, 0, rise + 0.08, 0));
    g.add(mesh(new THREE.BoxGeometry(depth + 0.08, 0.06, 1.04), trim, 0, rise + 0.2, 0));
    if (accent) {
      g.add(mesh(new THREE.BoxGeometry(depth + 0.1, 0.08, 0.22), accent, 0, rise + 0.08, 0));
    }
    return g;
  }
  g.add(mesh(new THREE.BoxGeometry(pier, rise, depth), fill, -0.4, rise / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(pier, rise, depth), fill, 0.4, rise / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(1, 0.22, depth + 0.04), fill, 0, rise + 0.08, 0));
  g.add(mesh(new THREE.BoxGeometry(1.04, 0.06, depth + 0.08), trim, 0, rise + 0.2, 0));
  if (accent) {
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.08, depth + 0.1), accent, 0, rise + 0.08, 0));
  }
  return g;
}

function keepGateBlock() {
  return archway(MAT.hull, MAT.slate, MAT.ion, "z");
}

function archBlock() {
  return archway(MAT.stone, MAT.stoneDark, MAT.gold, "x");
}

function spanBlock() {
  return archway(MAT.stone, MAT.stoneDark, MAT.brass, "z");
}

const SLAB = 0.12;

function wallPlate(axis, sign, skin) {
  const fill = skin?.fill ?? MAT.stone;
  const trim = skin?.trim ?? MAT.stoneDark;
  const accent = skin?.accent ?? MAT.iron;
  const thick = skin?.pane ? 0.08 : SLAB;
  const g = new THREE.Group();
  const inset = 0.5 - thick / 2;
  if (axis === "z") {
    const z = sign * inset;
    g.add(mesh(new THREE.BoxGeometry(1, 1, thick), fill, 0, 0.5, z));
    g.add(mesh(new THREE.BoxGeometry(1.02, 0.1, thick + 0.04), trim, 0, 0.5, z));
    g.add(mesh(new THREE.BoxGeometry(1.04, 0.08, thick + 0.02), trim, 0, 0.97, z));
    g.add(mesh(new THREE.BoxGeometry(0.08, 1.02, thick + 0.03), accent, -0.46, 0.51, z));
    g.add(mesh(new THREE.BoxGeometry(0.08, 1.02, thick + 0.03), accent, 0.46, 0.51, z));
    return g;
  }
  if (axis === "x") {
    const x = sign * inset;
    g.add(mesh(new THREE.BoxGeometry(thick, 1, 1), fill, x, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(thick + 0.04, 0.1, 1.02), trim, x, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(thick + 0.02, 0.08, 1.04), trim, x, 0.97, 0));
    g.add(mesh(new THREE.BoxGeometry(thick + 0.03, 1.02, 0.08), accent, x, 0.51, -0.46));
    g.add(mesh(new THREE.BoxGeometry(thick + 0.03, 1.02, 0.08), accent, x, 0.51, 0.46));
    return g;
  }
  const y = sign > 0 ? 1 - thick / 2 : thick / 2;
  g.add(mesh(new THREE.BoxGeometry(1, thick, 1), fill, 0, y, 0));
  g.add(mesh(new THREE.BoxGeometry(1.04, thick + 0.02, 1.04), trim, 0, y, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, thick + 0.03, 1.02), accent, -0.46, y, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, thick + 0.03, 1.02), accent, 0.46, y, 0));
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
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.38, 0.48), MAT.timber, 0, 0.22, 0));
  const lid = mesh(new THREE.BoxGeometry(0.82, 0.07, 0.52), MAT.timberDark, 0.02, 0.44, 0);
  lid.rotation.z = -0.08;
  g.add(lid);
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.05, 0.5), MAT.timberDark, 0, 0.03, 0));
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.05, 0.5), MAT.iron, 0, 0.22, 0));
  for (const [x, z] of [[0.36, 0.2], [-0.36, 0.2], [0.36, -0.2], [-0.36, -0.2]]) {
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.38, 0.05), MAT.iron, x, 0.22, z));
  }
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.03, 0.03), MAT.timberDark, 0, 0.34, 0.24));
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.03, 0.03), MAT.timberDark, 0, 0.34, -0.24));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.04, 0.14), MAT.iron, 0.38, 0.42, 0));
  return g;
}

function barrelBlock() {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe(
        [
          [0.18, 0],
          [0.26, 0.04],
          [0.32, 0.14],
          [0.36, 0.32],
          [0.32, 0.5],
          [0.26, 0.6],
          [0.18, 0.64],
        ],
        18,
      ),
      MAT.timber,
    ),
  );
  g.add(mesh(new THREE.TorusGeometry(0.27, 0.028, 6, 16), MAT.iron, 0, 0.1, 0));
  g.add(mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 16), MAT.iron, 0, 0.24, 0));
  g.add(mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 16), MAT.iron, 0, 0.4, 0));
  g.add(mesh(new THREE.TorusGeometry(0.27, 0.028, 6, 16), MAT.iron, 0, 0.54, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), MAT.timberDark, 0, 0.64, 0));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 14), MAT.iron, 0, 0.66, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8), MAT.brass, 0.22, 0.36, 0.22));
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.58, 0.02), MAT.timberDark, 0, 0.32, 0.34));
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
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.88, 0.1), MAT.timberDark, 0, 0.58, 0));
  g.add(mesh(new THREE.BoxGeometry(0.86, 0.08, 0.16), MAT.timber, 0, 0.12, 0.04));
  g.add(mesh(new THREE.BoxGeometry(0.86, 0.08, 0.14), MAT.timber, 0, 1.04, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.88, 0.12), MAT.timber, -0.38, 0.58, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.88, 0.12), MAT.timber, 0.38, 0.58, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.62, 0.03), MAT.glass, 0, 0.58, 0.04));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.62, 0.05), MAT.timberDark, 0, 0.58, 0.06));
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.05, 0.05), MAT.timberDark, 0, 0.58, 0.06));
  const glow = mesh(new THREE.BoxGeometry(0.54, 0.56, 0.02), MAT.lamp, 0, 0.58, 0.02);
  glow.userData.motion = "pulse";
  g.add(glow);
  return g;
}

function rugBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.96, 0.025, 0.64), MAT.cloth, 0, 0.014, 0));
  g.add(mesh(new THREE.BoxGeometry(0.82, 0.02, 0.5), MAT.linen, 0, 0.03, 0));
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.016, 0.38), MAT.cloth, 0, 0.04, 0));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.018, 0.22), MAT.linen, 0, 0.05, 0));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.016, 0.1), MAT.cloth, 0, 0.058, 0));
  for (const z of [-0.34, 0.34]) {
    for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) {
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.08), MAT.linen, x, 0.01, z));
    }
  }
  return g;
}

function wellBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.1, 14), MAT.stoneDark, 0, 0.05, 0));
  g.add(
    mesh(
      lathe(
        [
          [0.22, 0.08],
          [0.4, 0.1],
          [0.42, 0.28],
          [0.38, 0.48],
          [0.4, 0.56],
        ],
        16,
      ),
      MAT.stone,
    ),
  );
  g.add(mesh(new THREE.TorusGeometry(0.4, 0.055, 8, 16), MAT.stoneDark, 0, 0.56, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.06, 14), MAT.coal, 0, 0.22, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 16), MAT.water, 0, 0.34, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), MAT.timberDark, -0.34, 0.82, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), MAT.timberDark, 0.34, 0.82, 0));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.07, 0.07), MAT.timber, 0, 1.16, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10), MAT.iron, 0, 1.1, 0));
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), MAT.iron, 0.14, 1.1, 0));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), MAT.iron, 0.24, 1.02, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), MAT.iron, 0, 0.86, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.12, 10), MAT.timber, 0, 0.66, 0));
  g.add(mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 10), MAT.iron, 0, 0.72, 0));
  return g;
}

function fenceBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1, 0.1, 0.16), MAT.stoneDark, 0, 0.05, 0));
  for (const x of [-0.44, 0, 0.44]) {
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1), MAT.timberDark, x, 0.45, 0));
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.06, 0.14), MAT.timber, x, 0.86, 0));
  }
  g.add(mesh(new THREE.BoxGeometry(0.98, 0.06, 0.06), MAT.timber, 0, 0.28, 0));
  g.add(mesh(new THREE.BoxGeometry(0.98, 0.06, 0.06), MAT.timber, 0, 0.5, 0));
  g.add(mesh(new THREE.BoxGeometry(0.98, 0.05, 0.05), MAT.timber, 0, 0.7, 0));
  for (const x of [-0.22, 0.22]) {
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.58, 0.05), MAT.timberDark, x, 0.42, 0));
  }
  return g;
}

function gateBlock() {
  return keepGateBlock();
}

function signBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.1, 8), MAT.stoneDark, 0, 0.05, 0));
  g.add(mesh(new THREE.BoxGeometry(0.09, 1.18, 0.09), MAT.timberDark, 0, 0.64, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.06, 0.12), MAT.iron, 0, 1.22, 0));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.42), MAT.iron, 0, 1.12, 0.18));
  const board = mesh(new THREE.BoxGeometry(0.72, 0.42, 0.06), MAT.timber, 0, 0.86, 0.28);
  g.add(board);
  g.add(mesh(new THREE.BoxGeometry(0.76, 0.05, 0.08), MAT.timberDark, 0, 1.08, 0.28));
  g.add(mesh(new THREE.BoxGeometry(0.76, 0.05, 0.08), MAT.timberDark, 0, 0.64, 0.28));
  g.add(mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 8), MAT.iron, -0.2, 1.1, 0.22));
  g.add(mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 8), MAT.iron, 0.2, 1.1, 0.22));
  g.add(mesh(new THREE.BoxGeometry(0.48, 0.035, 0.02), MAT.brass, 0, 0.96, 0.32));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.03, 0.02), MAT.brass, 0, 0.86, 0.32));
  g.add(mesh(new THREE.BoxGeometry(0.32, 0.025, 0.02), MAT.brass, 0, 0.76, 0.32));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), MAT.timberDark, -0.18, 0.42, 0.08));
  return g;
}

function bannerBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.1, 8), MAT.stoneDark, 0, 0.05, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.42, 8), MAT.iron, 0, 0.76, 0));
  g.add(mesh(new THREE.ConeGeometry(0.07, 0.16, 7), MAT.brass, 0, 1.54, 0));
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.05, 0.05), MAT.iron, 0.3, 1.36, 0));
  const cloth = mesh(new THREE.BoxGeometry(0.58, 0.72, 0.03), MAT.cloth, 0.32, 0.96, 0.02);
  cloth.rotation.z = 0.04;
  g.add(cloth);
  const fold = mesh(new THREE.BoxGeometry(0.2, 0.58, 0.025), MAT.cloth, 0.58, 0.9, 0.04);
  fold.rotation.y = 0.35;
  fold.rotation.z = 0.08;
  g.add(fold);
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.05, 0.04), MAT.brass, 0.32, 1.34, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.12, 0.02), MAT.brass, 0.32, 1.12, 0.04));
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.16, 0.02), MAT.cloth, 0.18, 0.54, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.14, 0.02), MAT.cloth, 0.32, 0.53, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.12, 0.02), MAT.cloth, 0.46, 0.52, 0.02));
  g.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 5, 8), MAT.brass, 0.12, 1.36, 0));
  g.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 5, 8), MAT.brass, 0.52, 1.36, 0));
  return g;
}

function pathBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1, 0.04, 0.52), MAT.stoneDark, 0, 0.02, 0));
  g.add(mesh(new THREE.BoxGeometry(0.36, 0.05, 0.22), MAT.stone, -0.28, 0.05, 0.06));
  g.add(mesh(new THREE.BoxGeometry(0.32, 0.05, 0.2), MAT.stone, 0.08, 0.05, -0.08));
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.045, 0.18), MAT.stoneDark, 0.32, 0.048, 0.1));
  g.add(mesh(new THREE.BoxGeometry(0.26, 0.045, 0.16), MAT.stone, -0.06, 0.048, 0.14));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.04, 0.14), MAT.stoneDark, -0.3, 0.046, -0.12));
  g.add(mesh(new THREE.BoxGeometry(0.18, 0.035, 0.12), MAT.stone, 0.2, 0.044, -0.16));
  g.add(mesh(new THREE.BoxGeometry(1, 0.06, 0.06), MAT.stone, 0, 0.03, -0.24));
  g.add(mesh(new THREE.BoxGeometry(1, 0.06, 0.06), MAT.stone, 0, 0.03, 0.24));
  return g;
}

function stepsBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.86, 0.1, 0.22), MAT.stone, 0, 0.05, 0.32));
  g.add(mesh(new THREE.BoxGeometry(0.86, 0.1, 0.22), MAT.stoneDark, 0, 0.15, 0.12));
  g.add(mesh(new THREE.BoxGeometry(0.86, 0.1, 0.22), MAT.stone, 0, 0.25, -0.08));
  g.add(mesh(new THREE.BoxGeometry(0.86, 0.1, 0.22), MAT.stoneDark, 0, 0.35, -0.28));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.42, 0.86), MAT.stoneDark, -0.43, 0.22, 0));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.42, 0.86), MAT.stoneDark, 0.43, 0.22, 0));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.03, 0.08), MAT.stone, 0, 0.11, 0.38));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.03, 0.08), MAT.stone, 0, 0.21, 0.18));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.03, 0.08), MAT.stone, 0, 0.31, -0.02));
  g.add(mesh(new THREE.BoxGeometry(0.78, 0.03, 0.08), MAT.stone, 0, 0.41, -0.22));
  return g;
}

function awningBlock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), MAT.timberDark, -0.4, 0.41, 0.22));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), MAT.timberDark, 0.4, 0.41, 0.22));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), MAT.timberDark, -0.4, 0.5, -0.22));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), MAT.timberDark, 0.4, 0.5, -0.22));
  g.add(mesh(new THREE.BoxGeometry(0.92, 0.06, 0.08), MAT.timber, 0, 0.84, 0.22));
  g.add(mesh(new THREE.BoxGeometry(0.92, 0.06, 0.08), MAT.timber, 0, 0.86, -0.22));
  const cloth = mesh(new THREE.BoxGeometry(0.94, 0.05, 0.62), MAT.cloth, 0, 0.9, 0);
  cloth.rotation.x = -0.22;
  g.add(cloth);
  const valance = mesh(new THREE.BoxGeometry(0.94, 0.12, 0.04), MAT.cloth, 0, 0.78, 0.28);
  g.add(valance);
  for (const x of [-0.28, 0, 0.28]) {
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), MAT.cloth, x, 0.7, 0.28));
  }
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.48), MAT.iron, -0.4, 0.62, 0));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.48), MAT.iron, 0.4, 0.62, 0));
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
  g.add(mesh(new THREE.BoxGeometry(0.48, 0.16, 0.48), MAT.stoneDark, 0, 0.08, 0));
  g.add(mesh(new THREE.BoxGeometry(0.4, 1.12, 0.4), MAT.stone, 0, 0.7, 0));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), MAT.stoneDark, 0, 0.42, 0));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), MAT.stoneDark, 0, 0.78, 0));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), MAT.stoneDark, 0, 1.12, 0));
  g.add(mesh(new THREE.BoxGeometry(0.52, 0.1, 0.52), MAT.stone, 0, 1.3, 0));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), MAT.coal, 0, 1.42, 0));
  g.add(mesh(new THREE.BoxGeometry(0.26, 0.04, 0.26), MAT.iron, 0, 1.52, 0));
  const smoke = mesh(new THREE.SphereGeometry(0.12, 8, 6), MAT.fire, 0, 1.64, 0);
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
  g.add(mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.stoneDark, 0, 0, 0));
  const collar = mesh(new THREE.TorusGeometry(0.2, 0.028, 6, 14), MAT.iron, 0, 0.16, 0);
  collar.rotation.x = Math.PI / 2;
  g.add(collar);
  const lid = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10), MAT.slate, 0.08, 0.22, -0.04);
  lid.rotation.z = 0.28;
  lid.rotation.x = 0.12;
  g.add(lid);
  g.add(mesh(new THREE.BoxGeometry(0.045, 0.44, 0.045), MAT.iron, -0.22, 0.34, 0.16));
  const glint = mesh(new THREE.SphereGeometry(0.055, 8, 6), MAT.lamp, 0.02, 0.18, 0.02);
  glint.userData.motion = "pulse";
  g.add(glint);
  return sitOnCell(g);
}

export function beastArtifact() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.userData.motion = "writhe";
  body.userData.phase = 0.4;
  const trunk = mesh(
    lathe(
      [
        [0.05, 0],
        [0.18, 0.08],
        [0.3, 0.22],
        [0.32, 0.42],
        [0.24, 0.64],
        [0.12, 0.82],
        [0.04, 0.92],
      ],
      12,
    ),
    MAT.hide,
  );
  trunk.rotation.z = Math.PI / 2;
  trunk.position.set(-0.18, 0.22, 0);
  body.add(trunk);
  body.add(mesh(new THREE.BoxGeometry(0.38, 0.07, 0.2), MAT.iron, -0.06, 0.4, 0));
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), MAT.hide, 0.36, 0.3, 0.04));
  const jaw = mesh(new THREE.ConeGeometry(0.11, 0.2, 6, 1, true), MAT.secret, 0.5, 0.26, 0.16);
  jaw.rotation.x = Math.PI / 2;
  g.add(jaw);
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.04, 8, 6), MAT.ember, 0.4, 0.4, side * 0.09);
    eye.userData.motion = "pulse";
    g.add(eye);
  }
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
  stone: wallBlock,
  block: wallBlock,
  hull: hullBlock,
  keep: hullBlock,
  hangar: hangarBlock,
  dock: hullBlock,
  gold: goldBlock,
  "gold-light": goldBlock,
  glass: glassBlock,
  airlock: glassBlock,
  wood: woodBlock,
  brick: brickBlock,
  ore: oreBlock,
  arch: archBlock,
  span: spanBlock,
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

const FACE_WALLS = new Set([
  "wall-front",
  "wall-back",
  "wall-left",
  "wall-right",
  "wall-top",
  "wall-bottom",
  "wall-l",
]);

const FACE_DIR = {
  front: { axis: "z", sign: -1 },
  back: { axis: "z", sign: 1 },
  left: { axis: "x", sign: -1 },
  right: { axis: "x", sign: 1 },
  top: { axis: "y", sign: 1 },
  bottom: { axis: "y", sign: -1 },
};

const SKIN = {
  wall: { fill: MAT.stone, trim: MAT.stoneDark, accent: MAT.iron },
  stone: { fill: MAT.stone, trim: MAT.stoneDark, accent: MAT.iron },
  brick: { fill: MAT.brick, trim: MAT.stoneDark, accent: MAT.iron },
  wood: { fill: MAT.timber, trim: MAT.timberDark, accent: MAT.iron },
  ore: { fill: MAT.rock, trim: MAT.iron, accent: MAT.iron },
  hull: { fill: MAT.hull, trim: MAT.slate, accent: MAT.ion },
  keep: { fill: MAT.hull, trim: MAT.slate, accent: MAT.ion },
  dock: { fill: MAT.hull, trim: MAT.slate, accent: MAT.ion },
  coil: { fill: MAT.hull, trim: MAT.slate, accent: MAT.ion },
  hangar: { fill: MAT.slate, trim: MAT.hull, accent: MAT.deck },
  gold: { fill: MAT.gold, trim: MAT.brass, accent: MAT.lamp },
  glass: { fill: MAT.glass, trim: MAT.hull, accent: MAT.ion, pane: true },
  airlock: { fill: MAT.glass, trim: MAT.hull, accent: MAT.ion, pane: true },
};

function parseCompound(key) {
  const parts = key.split("-").filter((part) => part.length > 0);
  if (parts.length < 2) {
    return null;
  }
  const face = parts[parts.length - 1];
  const head = parts.slice(0, -1).join("-");
  const skin = SKIN[head] ?? SKIN[parts[0]];
  if (skin === undefined) {
    return null;
  }
  if (face === "l") {
    return { cache: key, skin, plate: true, ell: true };
  }
  const dir = FACE_DIR[face];
  if (dir !== undefined) {
    return { cache: key, skin, plate: true, axis: dir.axis, sign: dir.sign };
  }
  if (face === "arch") {
    return { cache: key, skin, arch: "x" };
  }
  if (face === "span" || face === "gate") {
    return { cache: key, skin, arch: "z" };
  }
  if (face === "lamp" || face === "lantern" || face === "light") {
    return { cache: key, lamp: true, lightKey: "gold" };
  }
  if (face === "glass" || face === "window") {
    return { cache: key, glass: true, lightKey: "glass" };
  }
  return null;
}

function buildCompound(spec) {
  if (spec.ell) {
    const g = new THREE.Group();
    takeChildren(g, wallPlate("x", -1, spec.skin));
    takeChildren(g, wallPlate("z", -1, spec.skin));
    return g;
  }
  if (spec.plate) {
    return wallPlate(spec.axis, spec.sign, spec.skin);
  }
  if (spec.arch) {
    return archway(spec.skin.fill, spec.skin.trim, spec.skin.accent, spec.arch);
  }
  if (spec.lamp) {
    return goldBlock();
  }
  if (spec.glass) {
    return glassBlock();
  }
  return wallBlock();
}

export function blockForm(kind) {
  const key = typeof kind === "string" ? kind.toLowerCase() : "";
  if (key in BLOCK_BUILDERS) {
    return key;
  }
  const compound = parseCompound(key);
  return compound !== null ? compound.cache : "wall";
}

const MASS_ALIAS = {
  hull: "hull",
  keep: "hull",
  dock: "hull",
  coil: "hull",
  hangar: "hangar",
  stone: "stone",
  wall: "stone",
  block: "stone",
  cube: "stone",
  box: "stone",
  brick: "brick",
  wood: "wood",
  ore: "ore",
};

export function massForm(kind) {
  return MASS_ALIAS[blockForm(kind)] ?? null;
}

export function massKey(kind) {
  const aliased = massForm(kind);
  if (aliased !== null) {
    return aliased;
  }
  const key = typeof kind === "string" ? kind.toLowerCase() : "";
  if (FACE_WALLS.has(key)) {
    return key;
  }
  const compound = parseCompound(key);
  if (compound !== null && compound.plate) {
    return compound.cache;
  }
  return null;
}

export function blockArtifact(kind) {
  const key = typeof kind === "string" ? kind.toLowerCase() : "";
  if (key in BLOCK_BUILDERS) {
    const built = BLOCK_BUILDERS[key]();
    return FACE_WALLS.has(key) ? built : sitOnCell(built);
  }
  const compound = parseCompound(key);
  if (compound !== null) {
    const built = buildCompound(compound);
    return compound.plate ? built : sitOnCell(built);
  }
  return sitOnCell(wallBlock());
}

export function turretArtifact(kind) {
  const coil = String(kind ?? "").toLowerCase() !== "keep";
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 10), MAT.hull, 0, 0.06, 0));
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), MAT.slate, 0, 0.2, 0));
  const barrel = mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.78, 8),
    coil ? MAT.iron : MAT.gold,
    0,
    0.3,
    0.32,
  );
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  const glow = mesh(new THREE.SphereGeometry(0.07, 8, 6), coil ? MAT.ion : MAT.lamp, 0, 0.3, 0.7);
  glow.userData.motion = "pulse";
  g.add(glow);
  return sitOnCell(g);
}

export function wardenArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.28, 6), MAT.iron, 0, 0.14, 0));
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.04, 0.16), MAT.slate, 0, 0.3, 0));
  g.add(mesh(new THREE.OctahedronGeometry(0.18, 0), MAT.watch, 0, 0.46, 0));
  const eye = mesh(new THREE.SphereGeometry(0.07, 8, 6), MAT.watchEye, 0, 0.46, 0);
  eye.userData.motion = "pulse";
  g.add(eye);
  const ring = mesh(new THREE.TorusGeometry(0.13, 0.016, 6, 14), MAT.brass, 0, 0.46, 0);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
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
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe(
        [
          [0.04, 0.04],
          [0.2, 0.08],
          [0.52, 0.14],
          [0.68, 0.2],
          [0.58, 0.26],
          [0.22, 0.3],
        ],
        18,
      ),
      MAT.echo,
    ),
  );
  const rim = mesh(new THREE.TorusGeometry(0.64, 0.022, 6, 22, Math.PI * 1.4), MAT.echo, 0, 0.2, 0);
  rim.rotation.x = Math.PI / 2;
  rim.rotation.z = 0.35;
  g.add(rim);
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.04, 12), MAT.echo, 0, 0.3, 0));
  const well = mesh(new THREE.RingGeometry(0.05, 0.12, 14), MAT.nav, 0, 0.33, 0);
  well.rotation.x = -Math.PI / 2;
  g.add(well);
  const ghost = mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.echo, 0.08, 0.38, 0.04);
  ghost.userData.motion = "pulse";
  g.add(ghost);
  g.rotation.z = 0.16;
  g.rotation.x = 0.08;
  return g;
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
