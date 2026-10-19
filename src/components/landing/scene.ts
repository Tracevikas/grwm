import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * The landing page's 3D scene: the arched mirror with soft, glossy garments
 * orbiting it. Everything is built from code (no model files to download).
 * `progress` (0–1, driven by scroll) moves the camera and gathers the pieces.
 */
export type SceneControls = {
  /** 0 at the top of the page, 1 at sign-in. */
  setProgress: (p: number) => void;
  /** Pointer position, -1..1 on each axis, for a little parallax. */
  setPointer: (x: number, y: number) => void;
  dispose: () => void;
};

const PASTELS = ["#c9b6f2", "#f5b8d2", "#b9e6d3", "#f7d9a8", "#b7cdf5", "#e9c2f0"];

function tee() {
  const s = new THREE.Shape();
  s.moveTo(-0.22, 0.62);
  s.quadraticCurveTo(0, 0.46, 0.22, 0.62);
  s.lineTo(0.62, 0.5);
  s.lineTo(0.95, 0.12);
  s.lineTo(0.72, -0.04);
  s.lineTo(0.5, 0.16);
  s.lineTo(0.5, -0.78);
  s.quadraticCurveTo(0, -0.84, -0.5, -0.78);
  s.lineTo(-0.5, 0.16);
  s.lineTo(-0.72, -0.04);
  s.lineTo(-0.95, 0.12);
  s.lineTo(-0.62, 0.5);
  s.closePath();
  return s;
}

function dress() {
  const s = new THREE.Shape();
  s.moveTo(-0.16, 0.86);
  s.quadraticCurveTo(0, 0.72, 0.16, 0.86);
  s.lineTo(0.3, 0.84);
  s.quadraticCurveTo(0.26, 0.5, 0.3, 0.18);
  s.quadraticCurveTo(0.24, 0.08, 0.26, 0.02);
  s.quadraticCurveTo(0.6, -0.4, 0.82, -0.92);
  s.quadraticCurveTo(0, -1.02, -0.82, -0.92);
  s.quadraticCurveTo(-0.6, -0.4, -0.26, 0.02);
  s.quadraticCurveTo(-0.24, 0.08, -0.3, 0.18);
  s.quadraticCurveTo(-0.26, 0.5, -0.3, 0.84);
  s.closePath();
  return s;
}

function trousers() {
  const s = new THREE.Shape();
  s.moveTo(-0.46, 0.82);
  s.lineTo(0.46, 0.82);
  s.lineTo(0.58, -0.92);
  s.lineTo(0.12, -0.92);
  s.lineTo(0, 0.18);
  s.lineTo(-0.12, -0.92);
  s.lineTo(-0.58, -0.92);
  s.closePath();
  return s;
}

function bag() {
  const s = new THREE.Shape();
  const w = 0.62;
  const h = 0.5;
  const r = 0.12;
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w * 0.86, h - r);
  s.quadraticCurveTo(w * 0.86, h, w * 0.86 - r, h);
  s.lineTo(-w * 0.86 + r, h);
  s.quadraticCurveTo(-w * 0.86, h, -w * 0.86, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

function arch(w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-w, -h);
  s.lineTo(w, -h);
  s.lineTo(w, h - w);
  s.absarc(0, h - w, w, 0, Math.PI, false);
  s.lineTo(-w, -h);
  return s;
}

const EXTRUDE: THREE.ExtrudeGeometryOptions = {
  depth: 0.1,
  bevelEnabled: true,
  bevelThickness: 0.07,
  bevelSize: 0.06,
  bevelSegments: 8,
  curveSegments: 28,
};

function fabric(color: string) {
  // Sheen reads as soft fabric; clearcoat gives the candy-gloss highlight.
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    sheen: 1,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color("#ffffff"),
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });
}

export function createScene(canvas: HTMLCanvasElement, opts: { animate: boolean }): SceneControls {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  scene.add(new THREE.HemisphereLight("#f4ecff", "#ffe3ef", 1.1));
  const key = new THREE.DirectionalLight("#ffffff", 1.6);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.PointLight("#b9e6d3", 30, 20);
  rim.position.set(-4, -2, 3);
  scene.add(rim);

  const world = new THREE.Group();
  scene.add(world);

  // The arched mirror: pearly glass in a soft lavender frame.
  const mirror = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.ExtrudeGeometry(arch(0.95, 1.55), { ...EXTRUDE, depth: 0.04, bevelSize: 0.02, bevelThickness: 0.02 }),
    new THREE.MeshPhysicalMaterial({ color: "#efe8ff", metalness: 0.15, roughness: 0.06, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1 }),
  );
  const frameShape = arch(1.12, 1.72);
  frameShape.holes.push(arch(0.95, 1.55));
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, EXTRUDE), fabric("#b8a4e8"));
  frame.position.z = -0.04;
  mirror.add(glass, frame);
  world.add(mirror);

  // Garments orbiting the mirror.
  const shapes = [tee(), dress(), trousers(), bag(), tee(), dress(), trousers(), bag()];
  const pieces = shapes.map((shape, i) => {
    const geometry = new THREE.ExtrudeGeometry(shape, EXTRUDE);
    geometry.center();
    const mesh = new THREE.Mesh(geometry, fabric(PASTELS[i % PASTELS.length]));
    const angle = (i / shapes.length) * Math.PI * 2;
    const orbit = { angle, radius: 2.6 + (i % 3) * 0.45, height: Math.sin(i * 1.7) * 1.3, scale: 0.55 + (i % 4) * 0.08, phase: i * 0.9 };
    mesh.scale.setScalar(orbit.scale);
    world.add(mesh);
    return { mesh, orbit };
  });

  // Little pearls for sparkle.
  const pearlGeo = new THREE.SphereGeometry(1, 24, 24);
  const pearlMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.15, iridescence: 1, clearcoat: 1 });
  const pearls = Array.from({ length: 14 }, (_, i) => {
    const m = new THREE.Mesh(pearlGeo, pearlMat);
    m.scale.setScalar(0.05 + (i % 4) * 0.025);
    m.position.set(Math.cos(i * 2.4) * (2 + (i % 5) * 0.6), Math.sin(i * 1.3) * 2.4, Math.sin(i * 0.7) * 1.5 - 0.5);
    world.add(m);
    return m;
  });

  let progress = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens pull back so the orbit still fits.
    camera.position.z = w / h < 0.8 ? 12.5 : 9;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const clock = new THREE.Clock();
  let frameId = 0;

  function render() {
    const t = opts.animate ? clock.getElapsedTime() : 0;
    const p = progress;
    // Chapters: spread out (0–0.35), swing round (0.35–0.75), gather in a halo (0.75–1).
    const spread = 1 + Math.sin(Math.min(p / 0.35, 1) * Math.PI) * 0.35;
    const gather = THREE.MathUtils.smoothstep(p, 0.72, 1);

    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;

    world.rotation.y = p * Math.PI * 1.6 + pointer.sx * 0.25;
    world.rotation.x = pointer.sy * 0.12 + Math.sin(p * Math.PI) * 0.15;
    mirror.rotation.y = -world.rotation.y * 0.85 + Math.sin(t * 0.4) * 0.08; // keeps facing us, mostly
    mirror.position.y = Math.sin(t * 0.8) * 0.06;

    for (const { mesh, orbit } of pieces) {
      const a = orbit.angle + t * 0.12;
      const r = THREE.MathUtils.lerp(orbit.radius * spread, 2.1, gather);
      const y = THREE.MathUtils.lerp(orbit.height, Math.sin(orbit.angle) * 0.6, gather) + Math.sin(t * 0.9 + orbit.phase) * 0.12;
      mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r * 0.75);
      mesh.rotation.set(Math.sin(t * 0.6 + orbit.phase) * 0.3, -a + Math.PI / 2 + t * 0.2, Math.sin(t * 0.5 + orbit.phase) * 0.25);
    }
    pearls.forEach((m, i) => (m.position.y += Math.sin(t * 1.2 + i) * 0.0015));

    camera.position.y = THREE.MathUtils.lerp(0.2, -0.3, p) + pointer.sy * 0.2;
    camera.position.x = pointer.sx * 0.35;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    if (opts.animate) frameId = requestAnimationFrame(render);
  }

  // Don't spend battery while the tab is hidden.
  const onVisibility = () => {
    cancelAnimationFrame(frameId);
    if (!document.hidden && opts.animate) frameId = requestAnimationFrame(render);
  };
  document.addEventListener("visibilitychange", onVisibility);
  render();

  return {
    setProgress(p) {
      progress = p;
      if (!opts.animate) render();
    },
    setPointer(x, y) {
      pointer.x = x;
      pointer.y = y;
    },
    dispose() {
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
