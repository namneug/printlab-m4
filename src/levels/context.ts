import type { Construct } from '../telemetry/schema';
import type { Session } from '../game/session';
import type { MentorMode } from '../mentor';

export interface LevelConcept {
  term: string;
  definition: string;
  example: string;
  bridge: string;
}

export interface LevelMeta {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  indicators: string[];
  constructs: Construct[];
  hintLevelMax: 1 | 2 | 3;
  estimatedMinutes: number;
  objective: string;
  concept: LevelConcept;
  success: string;
  evidence: string[];
}

/** ส่วนติดต่อพี่เลี้ยงที่ด่านใช้ (กรอบด่านเป็นผู้จัดการ log และระดับคำใบ้) */
export interface MentorHost {
  /** trigger ปัจจุบันสำหรับกรณีผู้เล่นกดขอคำใบ้เอง */
  setTrigger(trigger: string | null, vars?: Record<string, string | number>): void;
  /** ระบบเสนอคำใบ้เองตามเงื่อนไขสถานะเกม */
  offer(trigger: string, vars?: Record<string, string | number>): Promise<void>;
  /** อธิบายข้อผิดพลาด (feed back) */
  explain(trigger: string, vars?: Record<string, string | number>): Promise<void>;
  /** ข้อความคงที่ด้านความปลอดภัย (ห้ามดัดแปลง) */
  safety(key: string): void;
  /** ข้อความตรงจากด่าน (ระบุโหมดตาม Hattie & Timperley) */
  say(text: string, mode: MentorMode): void;
  readonly hintsUsed: number;
}

export interface LevelContext {
  meta: LevelMeta;
  root: HTMLElement;
  session: Session;
  startedAt: number;
  track(eventType: string, payload?: Record<string, unknown>, construct?: Construct): void;
  mentor: MentorHost;
  /** จบด่าน: บันทึกหลักฐาน แล้วแสดง debrief (vars ใช้เติมเทมเพลต) */
  complete(evidence: Record<string, unknown>, vars?: Record<string, string | number>): void;
  /** ข้อความสถานะสั้น ๆ ใต้ชื่อด่าน */
  setStatus(text: string): void;
}

export interface LevelModule {
  mount(ctx: LevelContext): () => void;
}
