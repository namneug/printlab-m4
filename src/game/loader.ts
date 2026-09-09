import type * as THREE from 'three';
import { buildPrinter, type PrinterModel } from './printer';

/**
 * ชั้นโหลดโมเดล — ตอนนี้ใช้ primitive จาก parts.json
 * เมื่อมีโมเดล glTF จริง ให้ตั้ง VITE_PRINTER_MODEL_URL แล้วเติม mapping ชื่อ node → partId ใน loadGltfPrinter
 */
export async function loadPrinterModel(): Promise<PrinterModel> {
  const url = import.meta.env['VITE_PRINTER_MODEL_URL'] as string | undefined;
  if (url) {
    try {
      return await loadGltfPrinter(url);
    } catch (err) {
      console.warn('โหลด glTF ไม่สำเร็จ ใช้โมเดล primitive แทน', err);
    }
  }
  return buildPrinter();
}

async function loadGltfPrinter(url: string): Promise<PrinterModel> {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  // ใช้โครงเดียวกับ primitive: ชื่อ node ในไฟล์ glTF ต้องตรงกับ part.id ใน parts.json
  const model = buildPrinter();
  const scene: THREE.Group = gltf.scene;
  scene.traverse((o) => {
    const target = model.parts.get(o.name);
    if (target) {
      target.clear();
      target.add(o.clone());
    }
  });
  return model;
}
