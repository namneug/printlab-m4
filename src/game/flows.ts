/** ชั้นการไหล 3 ชั้นในโมเดล 3 มิติ: สัญญาณควบคุม · การถ่ายเทความร้อน · แรงและการเคลื่อนที่ */
import * as THREE from 'three';
import { FLOWS, type FlowLayerId, type PrinterModel } from './printer';

export interface FlowLayers {
  root: THREE.Group;
  groups: Record<FlowLayerId, THREE.Group>;
  setVisible(layer: FlowLayerId, on: boolean): void;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);

function arrow(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 1e-4) return g;
  dir.normalize();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false });
  const shaftLen = Math.max(0.01, len - 0.02);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, shaftLen, 8), mat);
  shaft.position.copy(from).addScaledVector(dir, shaftLen / 2);
  shaft.quaternion.setFromUnitVectors(UP, dir);
  shaft.renderOrder = 10;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.02, 10), mat);
  head.position.copy(from).addScaledVector(dir, shaftLen + 0.01);
  head.quaternion.setFromUnitVectors(UP, dir);
  head.renderOrder = 10;
  g.add(shaft, head);
  return g;
}

export function buildFlowLayers(printer: PrinterModel): FlowLayers {
  const root = new THREE.Group();
  root.name = 'flows';
  const groups = {} as Record<FlowLayerId, THREE.Group>;
  for (const id of Object.keys(FLOWS) as FlowLayerId[]) {
    const spec = FLOWS[id];
    const g = new THREE.Group();
    g.name = `flow-${id}`;
    g.visible = false;
    for (const [a, b] of spec.edges) {
      const pa = printer.centers.get(a);
      const pb = printer.centers.get(b);
      if (!pa || !pb) continue;
      g.add(arrow(pa, pb, spec.color));
    }
    groups[id] = g;
    root.add(g);
  }
  return {
    root,
    groups,
    setVisible(layer, on) {
      groups[layer].visible = on;
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
      root.removeFromParent();
    },
  };
}
