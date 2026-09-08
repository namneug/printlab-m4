/**
 * แบบจำลองผลการพิมพ์สำหรับด่าน 2 — ห้องปฏิบัติการพารามิเตอร์
 *
 * คำเตือน: นี่คือแบบจำลองอย่างง่ายเพื่อการเรียนรู้ (educational toy model)
 * ไม่ใช่การจำลองเชิงฟิสิกส์ ตัวเลขถูกปรับให้แนวโน้มถูกทิศทางและมีการแลกได้แลกเสียชัดเจน
 * สัมประสิทธิ์ทุกตัวอยู่ในไฟล์นี้ไฟล์เดียว พร้อมที่มาโดยย่อ เพื่อให้ผู้เชี่ยวชาญตรวจ IOC ได้
 * ค่าที่เป็น "ดุลยพินิจของผู้ออกแบบ" ระบุไว้ว่า [ดุลยพินิจ]
 */

export interface PrintParams {
  /** ความสูงชั้น (มม.) 0.12–0.32 */
  layer_height: number;
  /** ความหนาแน่นภายใน (%) 10–80 */
  infill: number;
  /** ความเร็วพิมพ์ (มม./วินาที) 30–100 */
  speed: number;
  /** อุณหภูมิหัวฉีด (°C) 190–230 */
  nozzle_temp: number;
}

export interface PrintResult {
  /** เวลาพิมพ์ (นาที) */
  print_time_min: number;
  /** วัสดุที่ใช้ (กรัม) */
  material_g: number;
  /** น้ำหนักที่รับได้ก่อนหัก (กก.) */
  strength_kg: number;
  /** คุณภาพผิว 0–100 */
  surface_quality: number;
}

export const PARAM_SPECS: { key: keyof PrintParams; label: string; unit: string; min: number; max: number; step: number; default: number }[] = [
  { key: 'layer_height', label: 'ความสูงชั้น', unit: 'มม.', min: 0.12, max: 0.32, step: 0.04, default: 0.2 },
  { key: 'infill', label: 'ความหนาแน่นภายใน', unit: '%', min: 10, max: 80, step: 10, default: 20 },
  { key: 'speed', label: 'ความเร็วพิมพ์', unit: 'มม./วิ', min: 30, max: 100, step: 10, default: 60 },
  { key: 'nozzle_temp', label: 'อุณหภูมิหัวฉีด', unit: '°C', min: 190, max: 230, step: 10, default: 200 },
];

export const DEFAULT_PARAMS: PrintParams = { layer_height: 0.2, infill: 20, speed: 60, nozzle_temp: 200 };

/** เงื่อนไขของโจทย์ (ต้องผ่านพร้อมกันทั้งสามข้อ) [ดุลยพินิจ] */
export const CONSTRAINTS = {
  strength_min_kg: 2.0,
  time_max_min: 90,
  material_max_g: 25,
} as const;

/* ---------- สัมประสิทธิ์ ---------- */

/** ปริมาตรทึบของชิ้นงานอ้างอิง (ขอยึดชาร์จข้างโต๊ะ ~ 30 ซม.³) หน่วย มม.³ [ดุลยพินิจ] */
const PART_VOLUME_MM3 = 30_000;
/** ความสูงชิ้นงาน (มม.) ใช้คำนวณจำนวนชั้น [ดุลยพินิจ] */
const PART_HEIGHT_MM = 40;
/** สัดส่วนปริมาตรที่เป็นผนัง/ฝาบน–ล่าง ซึ่งพิมพ์ทึบเสมอไม่ขึ้นกับ infill (ผนัง 2 ชั้น + ฝา 4 ชั้น ของชิ้นงานขนาดนี้) [ประมาณจากสไลเซอร์] */
const SHELL_FRACTION = 0.35;
/** ความหนาแน่น PLA 1.24 g/cm³ (ข้อมูลผู้ผลิตเส้น PLA ทั่วไป) */
const PLA_DENSITY_G_CM3 = 1.24;
/** ความกว้างเส้นที่หัวฉีด 0.4 มม. วางออกมา (เท่ากับขนาดหัวฉีด) */
const LINE_WIDTH_MM = 0.4;
/** ประสิทธิภาพความเร็วจริงเทียบกับที่ตั้ง (การเร่ง–หน่วง การเดินทางเปล่า) ~ 60 % [ประมาณจากเวลาจริงของสไลเซอร์เทียบกับความเร็วตั้ง] */
const SPEED_EFFICIENCY = 0.6;
/** เวลาต่อชั้นขั้นต่ำ (วินาที) จากการเปลี่ยนชั้นและรอให้ชั้นเย็น [ค่าเริ่มต้นของสไลเซอร์ทั่วไป ~ 2 วิ] */
const LAYER_OVERHEAD_S = 2;
/** ตัวคูณแรงฐาน (กก.) ให้ชิ้นงานที่ตั้งค่ากลาง ๆ รับได้ราว 2–2.5 กก. [ดุลยพินิจ ปรับให้เงื่อนไขท้าทาย] */
const STRENGTH_SCALE_KG = 4.3;
/** เลขชี้กำลังของผลจาก infill ต่อความแข็งแรง (ผลตอบแทนลดลงเมื่อ infill สูง) [แนวโน้มจากงานทดสอบแรงดึงชิ้นงาน FDM] */
const INFILL_EXPONENT = 0.8;
/** การยึดเกาะระหว่างชั้นตามอุณหภูมิ PLA: ต่ำไปเชื่อมไม่ดี สูงไปเริ่มเสื่อม [แนวโน้มจากคู่มือเส้น PLA: ช่วงแนะนำ 200–220 °C] */
const ADHESION_BY_TEMP: [number, number][] = [
  [190, 0.7],
  [200, 0.85],
  [210, 0.95],
  [220, 1.0],
  [230, 0.97],
];
/** ชั้นบางกว่าเชื่อมกันดีกว่าเล็กน้อย: 0.12 มม. = 1.05, 0.32 มม. = 0.80 [ดุลยพินิจ] */
const LAYER_STRENGTH_AT_MIN = 1.05;
const LAYER_STRENGTH_DROP = 0.25;
/** ความเร็วสูงทำให้เส้นมีเวลาเชื่อมกับชั้นก่อนน้อยลง: 30 มม./วิ = 1.0, 100 มม./วิ = 0.85 [ดุลยพินิจ] */
const SPEED_STRENGTH_DROP = 0.15;
/** คุณภาพผิว: ชั้นหนาเห็นรอยชั้นชัด (ลดสูงสุด 55 คะแนน), เร็วเกิดรอยสั่น (ลดสูงสุด 15), ร้อนเกินเกิดใย (-8), เย็นเกินเส้นไม่ต่อเนื่อง (-10) [ดุลยพินิจ] */
const QUALITY_LAYER_PENALTY = 55;
const QUALITY_SPEED_PENALTY = 15;
const QUALITY_HOT_PENALTY = 8;
const QUALITY_COLD_PENALTY = 10;

function interp(table: [number, number][], x: number): number {
  const first = table[0];
  const last = table[table.length - 1];
  if (!first || !last) return 1;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (a && b && x >= a[0] && x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return last[1];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** คำนวณผลการพิมพ์แบบ deterministic — ค่าเดียวกันให้ผลเดียวกันเสมอ */
export function simulatePrint(p: PrintParams): PrintResult {
  const lh = clamp(p.layer_height, 0.12, 0.32);
  const infill = clamp(p.infill, 10, 80) / 100;
  const speed = clamp(p.speed, 30, 100);
  const temp = clamp(p.nozzle_temp, 190, 230);

  // ปริมาตรที่ต้องอัดรีดจริง = ผนังทึบ + ภายในตาม infill
  const solidFraction = SHELL_FRACTION + (1 - SHELL_FRACTION) * infill;
  const extrudedMm3 = PART_VOLUME_MM3 * solidFraction;

  const material_g = (extrudedMm3 / 1000) * PLA_DENSITY_G_CM3;

  // ความยาวเส้นทางหัวฉีด = ปริมาตร / (พื้นที่หน้าตัดเส้น = ความสูงชั้น × ความกว้างเส้น)
  const pathMm = extrudedMm3 / (lh * LINE_WIDTH_MM);
  const layers = PART_HEIGHT_MM / lh;
  const print_time_min = pathMm / (speed * SPEED_EFFICIENCY) / 60 + (layers * LAYER_OVERHEAD_S) / 60;

  const adhesion = interp(ADHESION_BY_TEMP, temp);
  const layerFactor = LAYER_STRENGTH_AT_MIN - LAYER_STRENGTH_DROP * ((lh - 0.12) / 0.2);
  const speedFactor = 1 - SPEED_STRENGTH_DROP * ((speed - 30) / 70);
  const strength_kg = STRENGTH_SCALE_KG * Math.pow(solidFraction, INFILL_EXPONENT) * adhesion * layerFactor * speedFactor;

  const surface_quality = clamp(
    100 -
      ((lh - 0.12) / 0.2) * QUALITY_LAYER_PENALTY -
      ((speed - 30) / 70) * QUALITY_SPEED_PENALTY -
      (temp >= 228 ? QUALITY_HOT_PENALTY : 0) -
      (temp <= 195 ? QUALITY_COLD_PENALTY : 0),
    0,
    100,
  );

  return {
    print_time_min: Math.round(print_time_min * 10) / 10,
    material_g: Math.round(material_g * 10) / 10,
    strength_kg: Math.round(strength_kg * 100) / 100,
    surface_quality: Math.round(surface_quality),
  };
}

export interface ConstraintCheck {
  strength: boolean;
  time: boolean;
  material: boolean;
  passed: number;
  all: boolean;
}

export function checkConstraints(r: PrintResult): ConstraintCheck {
  const strength = r.strength_kg >= CONSTRAINTS.strength_min_kg;
  const time = r.print_time_min <= CONSTRAINTS.time_max_min;
  const material = r.material_g <= CONSTRAINTS.material_max_g;
  const passed = [strength, time, material].filter(Boolean).length;
  return { strength, time, material, passed, all: passed === 3 };
}

export function qualityLabel(q: number): string {
  if (q >= 85) return 'เรียบมาก';
  if (q >= 70) return 'เรียบ';
  if (q >= 55) return 'พอใช้';
  return 'หยาบ เห็นรอยชั้นชัด';
}

/** นับว่าพารามิเตอร์ชุดใหม่ต่างจากชุดก่อนกี่ตัว */
export function changedKeys(prev: PrintParams | null, next: PrintParams): (keyof PrintParams)[] {
  if (!prev) return [];
  return PARAM_SPECS.map((s) => s.key).filter((k) => Math.abs(prev[k] - next[k]) > 1e-9);
}
