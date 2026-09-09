import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ticker } from './ticker';

/** อ่านค่าสีจากตัวแปร CSS ใน tokens.css เพื่อให้ฉาก 3 มิติใช้โทนเดียวกับ UI */
export function cssColor(name: string, fallback: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value || fallback);
}

export interface LabSceneOptions {
  /** ระยะกริดพื้น (เมตร) */
  gridSize?: number;
  /** จุดที่กล้องมอง */
  target?: [number, number, number];
  /** ตำแหน่งกล้องเริ่มต้น */
  cameraPos?: [number, number, number];
  minDistance?: number;
  maxDistance?: number;
  /** หมุนอัตโนมัติช้า ๆ เมื่อผู้ใช้ไม่ได้แตะ */
  autoRotate?: boolean;
}

export interface LabScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** เรียกเมื่อคอนเทนเนอร์เปลี่ยนขนาด (เรียกอัตโนมัติผ่าน ResizeObserver อยู่แล้ว) */
  resize(): void;
  dispose(): void;
}

/** สร้างฉากห้องแล็บ: กริดพื้น แสง และกล้องที่หมุน/ซูม/แพนได้ */
export function createLabScene(container: HTMLElement, opts: LabSceneOptions = {}): LabScene {
  const bgDeep = cssColor('--bg-deep', '#0f1319');
  const line = cssColor('--line', '#2a323d');
  const line2 = cssColor('--line-2', '#262e38');
  const cyan = cssColor('--cyan', '#4fd6d2');
  const amber = cssColor('--amber', '#f2a13f');

  const gridSize = opts.gridSize ?? 4;
  const target = opts.target ?? [0, 0.25, 0];
  const cameraPos = opts.cameraPos ?? [0.9, 0.7, 1.1];

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
  renderer.setClearColor(bgDeep, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = bgDeep;
  scene.fog = new THREE.Fog(bgDeep, gridSize * 1.2, gridSize * 3.2);

  const camera = new THREE.PerspectiveCamera(
    40,
    Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
    0.01,
    100,
  );
  camera.position.set(...cameraPos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = opts.minDistance ?? 0.35;
  controls.maxDistance = opts.maxDistance ?? gridSize * 1.5;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.autoRotate = opts.autoRotate ?? false;
  controls.autoRotateSpeed = 0.6;
  controls.update();
  // หยุดหมุนอัตโนมัติทันทีที่ผู้ใช้เริ่มควบคุมเอง
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
  });

  // แสง
  scene.add(new THREE.HemisphereLight(0xdfe7f0, 0x1a2029, 0.9));

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1.5, 2.5, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 10;
  const s = gridSize * 0.6;
  key.shadow.camera.left = -s;
  key.shadow.camera.right = s;
  key.shadow.camera.top = s;
  key.shadow.camera.bottom = -s;
  key.shadow.bias = -0.0008;
  scene.add(key);

  const fill = new THREE.DirectionalLight(cyan, 0.35);
  fill.position.set(-2, 1, -1.5);
  scene.add(fill);

  const rim = new THREE.PointLight(amber, 1.2, 6, 2);
  rim.position.set(-0.8, 0.8, 1.2);
  scene.add(rim);

  // พื้นรับเงา + กริด
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(gridSize * 4, gridSize * 4),
    new THREE.MeshStandardMaterial({ color: bgDeep, roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.0015;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(gridSize, gridSize * 10, line, line2);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.8;
  scene.add(grid);

  const gridFine = new THREE.GridHelper(gridSize, gridSize * 50, line2, line2);
  (gridFine.material as THREE.Material).transparent = true;
  (gridFine.material as THREE.Material).opacity = 0.25;
  gridFine.position.y = -0.001;
  scene.add(gridFine);

  const resize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  const clock = new THREE.Clock();
  let raf = 0;
  const loop = (): void => {
    const dt = Math.min(0.05, clock.getDelta());
    ticker.update(dt);
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const dispose = (): void => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    controls.dispose();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { renderer, scene, camera, controls, resize, dispose };
}
