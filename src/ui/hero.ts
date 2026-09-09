/**
 * ปกเกม 3 มิติแบบซีนีมาติก (หน้าแรก) — ใช้โมเดล 18 ชิ้นตัวเดิมจาก parts.json
 * แสงสตูดิโอ: คีย์ไลท์อำพันหน้า-บน · ริมไลท์ซียนด้านหลัง · fill อ่อนมาก · เงานุ่มใต้เครื่อง · fog จาง
 * ข้อบังคับ: DPR ≤ 2 · หยุด requestAnimationFrame เมื่อแท็บถูกซ่อน/ออกจากหน้า · dispose renderer ทั้งหมด
 * prefers-reduced-motion → นิ่งมุมเดียว · ไม่มี WebGL → ใช้พื้นหลังไล่สี (CSS) แทนอัตโนมัติ
 */
import * as THREE from 'three';
import { buildPrinter, type PrinterModel } from '../game/printer';
import { cssColor } from '../game/scene';

export interface Hero {
  /** true เมื่อเรนเดอร์ 3 มิติได้ (false = ใช้พื้นหลังไล่สี) */
  readonly webgl: boolean;
  dispose(): void;
}

const ROTATION_PERIOD_S = 60;

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function createHero(container: HTMLElement): Hero {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!webglAvailable()) {
    container.classList.add('hero--fallback');
    return { webgl: false, dispose() {} };
  }

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    container.classList.add('hero--fallback');
    return { webgl: false, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'hero__canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const bgDeep = cssColor('--bg-deep', '#0f1319');
  const amber = cssColor('--amber', '#f2a13f');
  const cyan = cssColor('--cyan', '#4fd6d2');

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(bgDeep, 2.2, 5.0);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  camera.position.set(1.35, 0.85, 1.75);
  camera.lookAt(0, 0.21, 0);
  camera.rotateZ(-0.035); // เอียงเล็กน้อยแบบซีนีมาติก

  /* แสงสตูดิโอ */
  const key = new THREE.DirectionalLight(amber, 3.2);
  key.position.set(0.9, 1.6, 1.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 6;
  key.shadow.camera.left = -0.9;
  key.shadow.camera.right = 0.9;
  key.shadow.camera.top = 0.9;
  key.shadow.camera.bottom = -0.9;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0006;
  scene.add(key);

  const rim = new THREE.DirectionalLight(cyan, 4.0);
  rim.position.set(-1.1, 0.9, -1.3);
  scene.add(rim);

  const fill = new THREE.HemisphereLight(0xb8c4d0, 0x0a0c10, 0.12);
  scene.add(fill);

  /* พื้นรับเงานุ่ม (มองไม่เห็นตัวพื้น) */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.55 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.001;
  ground.receiveShadow = true;
  scene.add(ground);

  const printer: PrinterModel = buildPrinter();
  const pivot = new THREE.Group();
  pivot.add(printer.root);
  printer.root.position.set(0, 0, 0.02);
  pivot.rotation.y = 0.55;
  scene.add(pivot);

  const resize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    // เครื่องอยู่ค่อนไปทางขวาบนจอกว้าง และอยู่กลาง (จาง) บนจอแคบ
    const narrow = w < 900;
    // จอกว้าง: เครื่องอยู่กึ่งกลางระหว่างชื่อเกม (ซ้าย) กับแผงฟอร์ม (ขวา) · จอแคบ: กลางจอ ค่อนลงล่าง
    camera.setViewOffset(w, h, narrow ? 0 : -w * 0.04, narrow ? -h * 0.08 : h * 0.02, w, h);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let raf = 0;
  let running = false;
  const clock = new THREE.Clock();
  const frame = (): void => {
    const dt = Math.min(0.1, clock.getDelta());
    pivot.rotation.y += (dt * Math.PI * 2) / ROTATION_PERIOD_S;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  const start = (): void => {
    if (running || reduced) return;
    running = true;
    clock.getDelta();
    raf = requestAnimationFrame(frame);
  };
  const stop = (): void => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const onVisibility = (): void => {
    if (document.hidden) stop();
    else start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  if (reduced) renderer.render(scene, camera); // นิ่งมุมเดียว
  else start();
  container.classList.add('hero--webgl');

  return {
    webgl: true,
    dispose() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      printer.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
