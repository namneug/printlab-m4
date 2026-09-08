/**
 * พี่เลี้ยง — เกมเรียกผ่าน interface นี้เท่านั้น
 * เฟส 1: RuleMentor (rule.ts) · เฟส 2: LlmMentor (llm.ts) — สลับได้ที่ createMentor() ไฟล์เดียว
 */
import { RuleMentor } from './rule';

export type MentorMode = 'feed_up' | 'feed_back' | 'feed_forward';
export type MentorSource = 'rule' | 'llm' | 'rule_fallback';
export type HintLevel = 1 | 2 | 3;

export interface MentorContext {
  levelId: string;
  /** trigger ตามข้อ 6 ของบรีฟ เช่น "same_part_wrong_twice" */
  trigger: string;
  /** ระดับคำใบ้ที่ต้องการ (ถูกจำกัดด้วย hintLevelMax ของด่านอีกชั้น) */
  hintLevel: HintLevel;
  /** ค่าจริงของผู้เล่นสำหรับเติมลงเทมเพลต debrief */
  vars?: Record<string, string | number>;
  /** สถานะเกมย่อ ๆ (ไม่เกิน 2 KB) สำหรับเฟส LLM */
  gameState?: Record<string, unknown>;
}

export interface MentorMessage {
  mode: MentorMode;
  text: string;
  /** สำหรับ debrief: ข้อความทั้ง 3 ส่วน */
  sections?: { mode: MentorMode; title: string; text: string }[];
  hintLevel?: HintLevel;
  trigger?: string;
  source: MentorSource;
  revealsAnswer: false;
  /** ข้อความคงที่ด้านความปลอดภัย (ห้ามดัดแปลง) */
  safety?: boolean;
}

export interface MentorProvider {
  hint(ctx: MentorContext): Promise<MentorMessage | null>;
  explainError(ctx: MentorContext): Promise<MentorMessage>;
  debrief(ctx: MentorContext): Promise<MentorMessage>;
}

let instance: MentorProvider | null = null;

/** จุดเดียวที่ตัดสินใจว่าใช้พี่เลี้ยงแบบใด */
export function createMentor(): MentorProvider {
  if (!instance) instance = new RuleMentor();
  return instance;
}
