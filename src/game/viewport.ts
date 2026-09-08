import * as THREE from 'three';
import { createLabScene, type LabScene, type LabSceneOptions } from './scene';
import { buildPrinter, type PrinterModel } from './printer';
import { el } from '../ui/dom';

export interface PrinterViewport {
  container: HTMLElement;
  lab: LabScene;
  printer: PrinterModel;
  /** เรียกเมื่อผู้ใช้ชี้/เลิกชี้ชิ้นส่วน */
  onHover: ((partId: string | null) => void) | null;
  /** เรียกเมื่อผู้ใช้คลิกชิ้นส่วน (คลิกพื้นที่ว่าง = null) */
  onClick: ((partId: string | null) => void) | null;
  /** โฟกัสกล้องไปที่ชิ้นส่วน */
  focus(partId: string | null): void;
  dispose(): void;
}

/** สร้างพื้นที่ 3 มิติที่มีเครื่องพิมพ์ + ตัวจับการชี้/คลิกชิ้นส่วน */
export function createPrinterViewport(parent: HTMLElement, opts: LabSceneOptions & { hint?: boolean } = {}): PrinterViewport {
  const container = el('div', { class: 'viewport', 'aria-label': 'โมเดลเครื่องพิมพ์ 3 มิติ' });
  parent.appendChild(container);
  const lab = createLabScene(container, {
    gridSize: 2,
    target: [0, 0.22, 0],
    cameraPos: [0.75, 0.55, 0.85],
    ...opts,
  });
  const printer = buildPrinter();
  lab.scene.add(printer.root);

  if (opts.hint !== false) {
    container.appendChild(el('div', { class: 'viewport__hint' }, el('kbd', { text: 'ลาก' }), 'หมุน ', el('kbd', { text: 'ล้อ' }), 'ซูม ', el('kbd', { text: 'ชี้/คลิก' }), 'ชิ้นส่วน'));
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = lab.renderer.domElement;
  let hovered: string | null = null;
  let down: { x: number; y: number } | null = null;

  const view: PrinterViewport = {
    container,
    lab,
    printer,
    onHover: null,
    onClick: null,
    focus(partId) {
      const c = partId ? printer.centers.get(partId) : null;
      const target = c ? c.clone() : new THREE.Vector3(0, 0.22, 0);
      const from = lab.controls.target.clone();
      const t0 = performance.now();
      const step = (): void => {
        const k = Math.min(1, (performance.now() - t0) / 400);
        const e = k * k * (3 - 2 * k);
        lab.controls.target.lerpVectors(from, target, e);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      printer.dispose();
      lab.dispose();
      container.remove();
    },
  };

  function pick(ev: PointerEvent): string | null {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, lab.camera);
    const hits = raycaster.intersectObject(printer.root, true);
    for (const h of hits) {
      const mat = (h.object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && mat.transparent && mat.opacity < 0.5) continue; // ข้ามชิ้นที่ถูกหรี่
      return printer.partOf(h.object);
    }
    return null;
  }

  function onMove(ev: PointerEvent): void {
    if (down) return;
    const id = pick(ev);
    if (id !== hovered) {
      hovered = id;
      canvas.style.cursor = id ? 'pointer' : '';
      view.onHover?.(id);
    }
  }
  function onDown(ev: PointerEvent): void {
    down = { x: ev.clientX, y: ev.clientY };
  }
  function onUp(ev: PointerEvent): void {
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    down = null;
    if (moved < 6) view.onClick?.(pick(ev));
  }
  function onLeave(): void {
    if (hovered) {
      hovered = null;
      view.onHover?.(null);
    }
  }
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  return view;
}
