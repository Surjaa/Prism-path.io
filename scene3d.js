// scene3d.js: the 3D board view (Three.js). Exposes the same small API as the 2D fallback in main.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T, DIRS } from './puzzle.js';

const BEAM_Y = 0.5;   // height of the light path above the board
const TILE_TOP = 0.14;
const orientAngle = (o) => (o === 0 ? Math.PI / 4 : -Math.PI / 4);
const UP = new THREE.Vector3(0, 1, 0);

// Throws if WebGL is unavailable. main.js catches that and uses the 2D view.
export function createView3D(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const BG = new THREE.Color(0x0a0c1c);
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 28, 70);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.3;

  scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x1a1030, 0.7));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
  key.position.set(6, 14, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fa8ff, 0.9);
  rim.position.set(-8, 6, -8);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0x12152a, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.6;
  ground.receiveShadow = true;
  scene.add(ground);

  const dustPos = new Float32Array(220 * 3);
  for (let i = 0; i < 220; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 26;
    dustPos[i * 3 + 1] = Math.random() * 9 - 1;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 26;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xbfd0ff, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  scene.add(dust);

  const M = {
    base: new THREE.MeshStandardMaterial({ color: 0x1b2140, roughness: 0.45, metalness: 0.5 }),
    tile: new THREE.MeshStandardMaterial({ color: 0x2c3566, roughness: 0.55, metalness: 0.1 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x080a14, roughness: 0.35, metalness: 0.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6ecff, roughness: 0.06, metalness: 1 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd9a64a, roughness: 0.25, metalness: 1 }),
    emitter: new THREE.MeshStandardMaterial({ color: 0x222842, roughness: 0.4, metalness: 0.7 }),
    emitterLens: new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffa030, emissiveIntensity: 2 }),
    receptorOff: new THREE.MeshStandardMaterial({ color: 0x3a4478, emissive: 0x6fe3ff, emissiveIntensity: 0.15, roughness: 0.3, metalness: 0.6 }),
    receptorOn: new THREE.MeshStandardMaterial({ color: 0x9ff7c8, emissive: 0x7af0b0, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.2 }),
    beam: new THREE.MeshStandardMaterial({ color: 0xffc26b, emissive: 0xffa030, emissiveIntensity: 3, roughness: 0.2 }),
    halo: new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  const G = {
    tile: new RoundedBoxGeometry(0.92, TILE_TOP, 0.92, 3, 0.05),
    wall: new RoundedBoxGeometry(0.9, 0.5, 0.9, 3, 0.08),
    plate: new RoundedBoxGeometry(1.25, 0.72, 0.05, 2, 0.02),
    emitter: new THREE.CylinderGeometry(0.34, 0.4, 0.36, 24),
    lens: new THREE.SphereGeometry(0.16, 24, 16),
    ring: new THREE.TorusGeometry(0.3, 0.06, 16, 48),
    beamCore: new THREE.CylinderGeometry(0.045, 0.045, 1, 12).translate(0, 0.5, 0),
    beamHalo: new THREE.CylinderGeometry(0.13, 0.13, 1, 12, 1, true).translate(0, 0.5, 0),
    joint: new THREE.SphereGeometry(0.05, 12, 8),
  };

  const boardGroup = new THREE.Group();
  const beamGroup = new THREE.Group();
  scene.add(boardGroup, beamGroup);

  let gridN = 5;
  let plates = [];
  let pickables = [];
  let beamAnim = [];
  let time = 0;
  let baseGeo = null;

  // Post-processing: bloom gives the beam its glow.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.82));
  composer.addPass(new OutputPass());

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function toWorld(x, y, h) {
    const half = (gridN - 1) / 2;
    return new THREE.Vector3(x - half, h, -(y - half));
  }

  function build(level) {
    boardGroup.clear();
    pickables = [];
    plates = [];
    gridN = level.n;
    const { n, cells } = level;

    if (baseGeo) baseGeo.dispose();
    const size = n + 0.9;
    baseGeo = new RoundedBoxGeometry(size + 0.5, 0.4, size + 0.5, 4, 0.18);
    const base = new THREE.Mesh(baseGeo, M.base);
    base.position.y = -0.2;
    base.castShadow = true;
    base.receiveShadow = true;
    boardGroup.add(base);

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const cell = cells[y][x];
        cell.view = {};
        const p = toWorld(x, y, 0);

        const tile = new THREE.Mesh(G.tile, M.tile);
        tile.position.set(p.x, TILE_TOP / 2, p.z);
        tile.castShadow = true;
        tile.receiveShadow = true;
        tile.userData.cell = cell;
        boardGroup.add(tile);
        pickables.push(tile);

        if (cell.type === T.WALL) {
          const w = new THREE.Mesh(G.wall, M.wall);
          w.position.set(p.x, TILE_TOP + 0.25, p.z);
          w.castShadow = true;
          w.receiveShadow = true;
          boardGroup.add(w);
        }

        if (cell.type === T.MIRROR) {
          const plate = new THREE.Mesh(G.plate, cell.locked ? M.brass : M.chrome);
          plate.position.set(p.x, BEAM_Y, p.z);
          plate.rotation.y = orientAngle(cell.orient);
          plate.userData.target = plate.rotation.y;
          plate.userData.cell = cell;
          plate.castShadow = true;
          plate.receiveShadow = true;
          boardGroup.add(plate);
          pickables.push(plate);
          cell.view.plate = plate;
          plates.push(plate);
        }

        if (cell.type === T.SOURCE) {
          const e = new THREE.Mesh(G.emitter, M.emitter);
          e.position.set(p.x, TILE_TOP + 0.18, p.z);
          e.castShadow = true;
          const lens = new THREE.Mesh(G.lens, M.emitterLens);
          lens.position.set(p.x, BEAM_Y, p.z);
          boardGroup.add(e, lens);
        }

        if (cell.type === T.TARGET) {
          const ring = new THREE.Mesh(G.ring, M.receptorOff);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(p.x, TILE_TOP + 0.02, p.z);
          const lens = new THREE.Mesh(G.lens, M.receptorOff);
          lens.position.set(p.x, BEAM_Y, p.z);
          boardGroup.add(ring, lens);
          cell.view.ring = ring;
          cell.view.lens = lens;
        }
      }
    }
  }

  function setMirror(cell) {
    cell.view.plate.userData.target = orientAngle(cell.orient);
  }

  function setReceptor(level, lit) {
    const v = level.cells[level.target.y][level.target.x].view;
    if (!v.ring) return;
    v.ring.material = lit ? M.receptorOn : M.receptorOff;
    v.lens.material = lit ? M.receptorOn : M.receptorOff;
  }

  function addSegment(a, b, delay) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return;
    dir.normalize();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(G.beamCore, M.beam), new THREE.Mesh(G.beamHalo, M.halo));
    g.position.copy(a);
    g.quaternion.setFromUnitVectors(UP, dir);
    g.scale.set(1, 0.0001, 1);
    beamGroup.add(g);
    beamAnim.push({ obj: g, t0: time + delay, dur: 0.1, len });
  }

  function grow(entry, now) {
    const p = THREE.MathUtils.clamp((now - entry.t0) / entry.dur, 0, 1);
    if (entry.len) entry.obj.scale.set(1, Math.max(p * entry.len, 0.0001), 1);
    else entry.obj.scale.setScalar(Math.max(p, 0.0001));
  }

  // res = traceBeam() result for this level
  function beam(res, level) {
    beamGroup.clear();
    beamAnim = [];
    const last = res.points[res.points.length - 1];
    const pts = res.points.map((p) => toWorld(p.x, p.y, BEAM_Y));
    if (res.exit === 'edge') {
      const d = DIRS[res.endDir];
      pts.push(toWorld(last.x + d.x * 0.7, last.y + d.y * 0.7, BEAM_Y));
    }
    for (let i = 0; i < pts.length - 1; i++) addSegment(pts[i], pts[i + 1], i * 0.09);
    for (let i = 1; i < pts.length - 1; i++) {
      const j = new THREE.Mesh(G.joint, M.beam);
      j.position.copy(pts[i]);
      j.scale.setScalar(0.0001);
      beamGroup.add(j);
      beamAnim.push({ obj: j, t0: time + i * 0.09, dur: 0.1, len: 0 });
    }
    setReceptor(level, res.reached);
  }

  function fit(n) {
    const half = (n + 0.9) / 2 + 0.6;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = Math.max(half / Math.tan(vfov / 2), half / Math.tan(hfov / 2)) * 1.05;
    camera.position.set(0, dist * 0.82, dist * 0.6);
    controls.target.set(0, 0, 0);
    controls.minDistance = dist * 0.45;
    controls.maxDistance = dist * 1.8;
    controls.update();
  }

  function tick(dt, won) {
    time += dt;
    controls.update();
    for (const p of plates) {
      p.rotation.y += (p.userData.target - p.rotation.y) * Math.min(1, dt * 14);
    }
    for (const e of beamAnim) grow(e, time);
    M.emitterLens.emissiveIntensity = 2 + Math.sin(time * 3) * 0.4;
    if (won) M.receptorOn.emissiveIntensity = 2.4 + Math.sin(time * 4) * 0.6;
    dust.rotation.y += dt * 0.02;
    composer.render();
  }

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.cell : null;
  }

  stage.appendChild(renderer.domElement);
  return { kind: '3d', build, setMirror, beam, fit, tick, resize, pick };
}
