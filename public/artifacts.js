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
  g.add(mesh(new THREE.BoxGeometry(1.55, 0.95, 1.25), MAT.hull, -2.55, 0.55, 0.15));
  g.add(mesh(new THREE.BoxGeometry(1.15, 0.55, 0.08), MAT.slate, -2.55, 0.55, 0.78));
  g.add(mesh(new THREE.BoxGeometry(1.55, 0.95, 1.25), MAT.hull, 2.55, 0.55, 0.15));
  g.add(mesh(new THREE.BoxGeometry(1.15, 0.55, 0.08), MAT.slate, 2.55, 0.55, 0.78));
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
  g.add(mesh(new THREE.CylinderGeometry(1.85, 2.05, 0.18, 8), MAT.hull, 0, 0.02, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.06, 8), MAT.vault, 0, 0.12, 0));
  const racks = [
    [0.42, 1.85, 0.55, -0.55, 1.08, 0.15],
    [0.38, 1.45, 0.48, 0.35, 0.88, -0.25],
    [0.32, 1.15, 0.4, 0.72, 0.72, 0.45],
    [0.28, 0.85, 0.36, -0.15, 0.58, 0.72],
  ];
  for (const [w, h, d, x, y, z] of racks) {
    g.add(mesh(new THREE.BoxGeometry(w, h, d), MAT.vault, x, y, z));
    g.add(mesh(new THREE.BoxGeometry(w * 0.72, 0.04, 0.04), MAT.nav, x, y + h * 0.28, z + d * 0.42));
    g.add(mesh(new THREE.BoxGeometry(w * 0.55, 0.03, 0.03), MAT.navWarm, x, y - h * 0.12, z + d * 0.42));
  }
  const board = mesh(new THREE.BoxGeometry(1.15, 0.72, 0.04), MAT.glass, 0.05, 1.05, 1.05);
  g.add(board);
  for (let i = 0; i < 4; i += 1) {
    g.add(mesh(new THREE.BoxGeometry(0.85, 0.04, 0.02), MAT.nav, 0.05, 1.28 - i * 0.12, 1.08));
  }
  const dish = mesh(new THREE.CylinderGeometry(0.42, 0.12, 0.18, 16, 1, true), MAT.rim, -0.55, 2.12, 0.15);
  g.add(dish);
  const seam = mesh(new THREE.BoxGeometry(0.05, 2.05, 0.05), MAT.navWarm, -0.55, 1.15, 0.15);
  g.add(seam);
  const pulse = mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.navWarm, -0.55, 2.22, 0.15);
  pulse.userData.motion = "pulse";
  g.add(pulse);
  bellyLight(g, MAT.navWarm, -0.2, 0.12);
  return g;
}

export function vantageArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.22, 24), MAT.hull, 0, 0, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 24), MAT.pad, 0, 0.14, 0));
  const bay = mesh(new THREE.RingGeometry(0.22, 0.38, 24), MAT.nav, 0, 0.2, 0);
  bay.rotation.x = -Math.PI / 2;
  bay.userData.motion = "pulse";
  g.add(bay);
  g.add(mesh(new THREE.SphereGeometry(0.42, 16, 12), MAT.hull, 0, -0.28, 0));
  const ring = mesh(new THREE.TorusGeometry(1.35, 0.045, 8, 40), MAT.rim, 0, 0, 0);
  ring.rotation.x = Math.PI / 2;
  ring.userData.motion = "orbit";
  g.add(ring);
  for (const side of [-1, 1]) {
    const wing = mesh(new THREE.BoxGeometry(1.85, 0.04, 0.72), MAT.pad, side * 1.85, -0.05, 0);
    wing.userData.motion = "gimbal";
    g.add(wing);
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), MAT.nav, side * 1.05, 0.08, 0));
  }
  const bloom = mesh(new THREE.SphereGeometry(0.55, 14, 10), MAT.watchBeam, 0, 0.05, 0);
  g.add(bloom);
  const wash = mesh(new THREE.CylinderGeometry(0.42, 0.12, 1.35, 12, 1, true), MAT.watchBeam, 0, -0.55, 0);
  g.add(wash);
  bellyLight(g, MAT.nav, -0.58, 0.1);
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

export function wardenArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), MAT.rim, 0, 0.12, 0));
  return g;
}

export function markArtifact() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.1, 10), MAT.hull, 0, 0.05, 0));
  g.add(mesh(new THREE.BoxGeometry(0.07, 1.85, 0.07), MAT.iron, 0, 1.0, 0));
  const plate = mesh(new THREE.BoxGeometry(0.95, 0.62, 0.03), MAT.holo, 0.52, 1.35, 0);
  g.add(plate);
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.04, 0.02), MAT.navWarm, 0.5, 1.5, 0.03));
  g.add(mesh(new THREE.BoxGeometry(0.48, 0.03, 0.02), MAT.navWarm, 0.44, 1.36, 0.03));
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.03, 0.02), MAT.navWarm, 0.48, 1.22, 0.03));
  const tip = mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.holo, 0, 1.98, 0);
  tip.userData.motion = "pulse";
  g.add(tip);
  bellyLight(g, MAT.holo, -0.08, 0.07);
  return g;
}

function landerHull(skin, canopy, lit) {
  const g = new THREE.Group();
  g.add(
    mesh(
      lathe(
        [
          [0.02, 0],
          [0.26, 0.06],
          [0.4, 0.2],
          [0.34, 0.4],
          [0.14, 0.55],
          [0.03, 0.64],
        ],
        20,
      ),
      skin,
    ),
  );
  g.add(mesh(new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), canopy, 0, 0.4, 0));
  for (const yaw of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const fin = mesh(new THREE.BoxGeometry(0.06, 0.1, 0.26), MAT.rim, Math.sin(yaw) * 0.3, 0.1, Math.cos(yaw) * 0.3);
    fin.rotation.y = yaw;
    g.add(fin);
  }
  if (lit) {
    g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), MAT.lamp, 0, 0.38, 0));
    const wake = mesh(new THREE.ConeGeometry(0.2, 0.48, 10, 1, true), MAT.godFlame, 0, -0.08, 0);
    wake.rotation.x = Math.PI;
    g.add(wake);
    const corona = mesh(new THREE.SphereGeometry(0.26, 12, 10), MAT.godFlame, 0, 0.38, 0);
    corona.userData.motion = "pulse";
    g.add(corona);
    bellyLight(g, MAT.navWarm, -0.14, 0.08);
  } else {
    const wake = mesh(new THREE.ConeGeometry(0.16, 0.36, 8, 1, true), MAT.echo, 0, -0.04, 0);
    wake.rotation.x = Math.PI;
    g.add(wake);
    bellyLight(g, MAT.nav, -0.12, 0.07);
  }
  return g;
}

export function godArtifact() {
  return landerHull(MAT.hull, MAT.canopy, true);
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
};
