import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** อ่านค่าสีจากตัวแปร CSS ใน tokens.css เพื่อให้ฉาก 3 มิติใช้โทนเดียวกับ UI */
function cssColor(name: string, fallback: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value || fallback);
}

export interface LabScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  dispose(): void;
}

/** สร้างฉากว่าง: กริดพื้น แสง และกล้องที่หมุน/ซูม/แพนได้ */
export function createLabScene(container: HTMLElement): LabScene {
  const bgDeep = cssColor('--bg-deep', '#0f1319');
  const line = cssColor('--line', '#2a323d');
  const line2 = cssColor('--line-2', '#262e38');
  const cyan = cssColor('--cyan', '#4fd6d2');
  const amber = cssColor('--amber', '#f2a13f');

  // ตัวเรนเดอร์
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(bgDeep, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // ฉาก
  const scene = new THREE.Scene();
  scene.background = bgDeep;
  scene.fog = new THREE.Fog(bgDeep, 18, 46);

  // กล้อง
  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    200,
  );
  camera.position.set(7, 5.5, 8);

  // การควบคุมกล้อง: ลากซ้ายหมุน ล้อเมาส์ซูม ลากขวาแพน
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  // แสง
  const hemi = new THREE.HemisphereLight(0xdfe7f0, 0x1a2029, 0.9);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(6, 10, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const fill = new THREE.DirectionalLight(cyan, 0.35);
  fill.position.set(-8, 4, -6);
  scene.add(fill);

  const rim = new THREE.PointLight(amber, 6, 20, 2);
  rim.position.set(-3, 3, 5);
  scene.add(rim);

  // พื้นรับเงา
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: bgDeep, roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  scene.add(floor);

  // กริดพื้น
  const grid = new THREE.GridHelper(40, 40, line, line2);
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.85;
  scene.add(grid);

  const gridFine = new THREE.GridHelper(40, 200, line2, line2);
  const gridFineMat = gridFine.material as THREE.Material;
  gridFineMat.transparent = true;
  gridFineMat.opacity = 0.28;
  gridFine.position.y = -0.001;
  scene.add(gridFine);

  // จุดกำเนิดของฉาก (ไว้อ้างอิงทิศทาง)
  const axes = new THREE.AxesHelper(1.2);
  axes.position.y = 0.002;
  scene.add(axes);

  // ปรับขนาดตามหน้าต่าง
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

  // ลูปเรนเดอร์
  let raf = 0;
  const tick = (): void => {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const dispose = (): void => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { renderer, scene, camera, controls, dispose };
}
