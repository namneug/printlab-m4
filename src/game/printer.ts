import * as THREE from 'three';
import partsData from '../data/parts.json';

/* ---------- ชนิดข้อมูลจาก parts.json ---------- */
export type SubsystemId = 'structure' | 'motion' | 'extrusion_thermal' | 'control' | 'build_plate';
export type FlowLayerId = 'control' | 'heat' | 'motion';

export interface PrimitiveSpec {
  type: 'box' | 'cylinder' | 'cone';
  /** box: [w,h,d] · cylinder: [rTop,rBottom,h] · cone: [r,h] */
  size: number[];
  pos: [number, number, number];
  rot?: [number, number, number];
  color?: string;
}

export interface ProbeQuestion {
  question: string;
  choices: string[];
  answer: number;
  explain: string;
}

export interface PartSpec {
  id: string;
  name: string;
  short: string;
  subsystem: SubsystemId;
  function: string;
  connects: string[];
  color: string;
  probe?: ProbeQuestion;
  geometry: PrimitiveSpec[];
}

export interface SubsystemSpec {
  id: SubsystemId;
  name: string;
  description: string;
  color: string;
}

export interface FlowLayerSpec {
  name: string;
  color: string;
  edges: [string, string][];
}

interface PartsFile {
  subsystems: SubsystemSpec[];
  parts: PartSpec[];
  feedback_loop: string[];
  flows: Record<FlowLayerId, FlowLayerSpec>;
}

export const PARTS_DATA = partsData as unknown as PartsFile;
export const PARTS: PartSpec[] = PARTS_DATA.parts;
export const SUBSYSTEMS: SubsystemSpec[] = PARTS_DATA.subsystems;
export const FLOWS = PARTS_DATA.flows;
export const FEEDBACK_LOOP = PARTS_DATA.feedback_loop;

export function partById(id: string): PartSpec | undefined {
  return PARTS.find((p) => p.id === id);
}

export function subsystemById(id: string): SubsystemSpec | undefined {
  return SUBSYSTEMS.find((s) => s.id === id);
}

/* ---------- โมเดลเครื่องพิมพ์ ---------- */
export interface PrinterModel {
  root: THREE.Group;
  /** กลุ่มของแต่ละชิ้นส่วน (userData.partId) */
  parts: Map<string, THREE.Group>;
  /** จุดกึ่งกลางของแต่ละชิ้น (พิกัดโลกของ root) */
  centers: Map<string, THREE.Vector3>;
  /** ไฮไลต์ชิ้นส่วน (null = ยกเลิกทั้งหมด) */
  highlight(partId: string | null, color?: THREE.ColorRepresentation): void;
  /** หรี่ชิ้นส่วนอื่นเพื่อเน้นชุดที่เลือก (null = ปกติ) */
  isolate(partIds: string[] | null): void;
  /** ดึงชิ้นส่วนที่เป็นพ่อของ Object3D ที่ raycast โดน */
  partOf(obj: THREE.Object3D | null): string | null;
  dispose(): void;
}

const DEG = Math.PI / 180;

function makeGeometry(spec: PrimitiveSpec): THREE.BufferGeometry {
  const s = spec.size;
  switch (spec.type) {
    case 'box':
      return new THREE.BoxGeometry(s[0] ?? 0.01, s[1] ?? 0.01, s[2] ?? 0.01);
    case 'cylinder':
      return new THREE.CylinderGeometry(s[0] ?? 0.01, s[1] ?? 0.01, s[2] ?? 0.01, 24);
    case 'cone':
      return new THREE.ConeGeometry(s[0] ?? 0.01, s[1] ?? 0.01, 24);
  }
}

interface MatState {
  base: THREE.Color;
  emissive: THREE.Color;
}

/** ประกอบเครื่องพิมพ์จาก primitive ตาม parts.json */
export function buildPrinter(): PrinterModel {
  const root = new THREE.Group();
  root.name = 'printer';
  const parts = new Map<string, THREE.Group>();
  const centers = new Map<string, THREE.Vector3>();
  const materials = new Map<THREE.MeshStandardMaterial, MatState>();

  for (const part of PARTS) {
    const group = new THREE.Group();
    group.name = part.id;
    group.userData['partId'] = part.id;
    const bbox = new THREE.Box3();

    for (const prim of part.geometry) {
      const mat = new THREE.MeshStandardMaterial({
        color: prim.color ?? part.color,
        roughness: 0.55,
        metalness: 0.25,
      });
      materials.set(mat, { base: mat.color.clone(), emissive: mat.emissive.clone() });
      const mesh = new THREE.Mesh(makeGeometry(prim), mat);
      mesh.position.set(...prim.pos);
      if (prim.rot) mesh.rotation.set(prim.rot[0] * DEG, prim.rot[1] * DEG, prim.rot[2] * DEG);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData['partId'] = part.id;
      group.add(mesh);
      mesh.updateMatrixWorld();
      bbox.expandByObject(mesh);
    }

    const center = new THREE.Vector3();
    bbox.getCenter(center);
    centers.set(part.id, center);
    parts.set(part.id, group);
    root.add(group);
  }

  const highlight = (partId: string | null, color: THREE.ColorRepresentation = 0x4fd6d2): void => {
    for (const [mat, st] of materials) {
      mat.emissive.copy(st.emissive);
      mat.emissiveIntensity = 1;
    }
    if (!partId) return;
    const group = parts.get(partId);
    group?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (mat && materials.has(mat)) {
        mat.emissive.set(color);
        mat.emissiveIntensity = 0.55;
      }
    });
  };

  const isolate = (partIds: string[] | null): void => {
    const keep = partIds ? new Set(partIds) : null;
    for (const [id, group] of parts) {
      const dim = keep !== null && !keep.has(id);
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (mat && materials.has(mat)) {
          mat.transparent = dim;
          mat.opacity = dim ? 0.12 : 1;
          mat.depthWrite = !dim;
        }
      });
    }
  };

  const partOf = (obj: THREE.Object3D | null): string | null => {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const id = cur.userData['partId'];
      if (typeof id === 'string') return id;
      cur = cur.parent;
    }
    return null;
  };

  const dispose = (): void => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    for (const mat of materials.keys()) mat.dispose();
    root.removeFromParent();
  };

  return { root, parts, centers, highlight, isolate, partOf, dispose };
}
