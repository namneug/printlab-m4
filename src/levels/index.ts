import levelsData from '../data/levels.json';
import type { LevelMeta, LevelModule } from './context';
// import แบบ static ทั้งหมด เพื่อให้เล่นได้ครบทุกด่านแม้ออฟไลน์หลังโหลดหน้าแรกครั้งเดียว (ห้ามใช้ dynamic import ที่นี่)
import { level as l1 } from './l1-system';
import { level as l2 } from './l2-params';
import { level as l3 } from './l3-diagnosis';
import { level as l4 } from './l4-materials';
import { level as l5 } from './l5-design';
import { level as l6 } from './l6-impact';

export const LEVELS: LevelMeta[] = (levelsData as { levels: LevelMeta[] }).levels;

const MODULES: Record<string, LevelModule> = { l1, l2, l3, l4, l5, l6 };

export function levelMeta(id: string): LevelMeta | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function nextLevel(id: string): LevelMeta | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}

/** คืนโมดูลของด่าน (null ถ้าไม่มี) — คง async ไว้เพื่อให้กรอบด่านไม่ต้องเปลี่ยนเมื่อมีด่านเพิ่มภายหลัง */
export async function loadLevel(id: string): Promise<LevelModule | null> {
  return MODULES[id] ?? null;
}
