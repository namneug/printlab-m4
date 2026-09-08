import type { Timepoint } from '../game/session';

export type Construct = 'architecture' | 'operation' | 'maintenance' | 'problem_solving' | 'safety';

/** Event schema ตามข้อ 7 ของ CLAUDE.md */
export interface GameEvent {
  eventId: string;
  participantCode: string;
  sessionId: string;
  timepoint: Timepoint;
  levelId: string | null;
  eventType: string;
  construct: Construct | null;
  payload: Record<string, unknown>;
  clientTs: string;
}

export const CONSTRUCT_LABELS: Record<Construct, string> = {
  architecture: 'สถาปัตยกรรม',
  operation: 'การใช้งาน',
  maintenance: 'การซ่อมบำรุง',
  problem_solving: 'การแก้ปัญหา',
  safety: 'ความปลอดภัย',
};
