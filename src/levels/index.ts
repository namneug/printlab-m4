import levelsData from '../data/levels.json';
import type { LevelMeta, LevelModule } from './context';

export const LEVELS: LevelMeta[] = (levelsData as { levels: LevelMeta[] }).levels;

export function levelMeta(id: string): LevelMeta | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function nextLevel(id: string): LevelMeta | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}

/** โหลดโมดูลของด่านแบบแยกไฟล์ (code-splitting) — ด่านที่ยังไม่มีคืน null */
export async function loadLevel(id: string): Promise<LevelModule | null> {
  switch (id) {
    case 'l1':
      return (await import('./l1-system')).level;
    case 'l2':
      return (await import('./l2-params')).level;
    default:
      return null;
  }
}
