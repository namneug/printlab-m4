/** จุดบันทึก event กลาง — ทุกการกระทำในเกมผ่านฟังก์ชันนี้ */
import type { Construct, GameEvent } from './schema';
import { getSession, newId } from '../game/session';
import { enqueue } from './queue';

const DEBUG = import.meta.env.DEV || (import.meta.env['VITE_DEBUG_EVENTS'] as string | undefined) === '1';

export function track(
  eventType: string,
  payload: Record<string, unknown> = {},
  opts: { levelId?: string | null | undefined; construct?: Construct | undefined } = {},
): GameEvent | null {
  const s = getSession();
  if (!s) return null;
  const ev: GameEvent = {
    eventId: newId(),
    participantCode: s.participantCode,
    sessionId: s.sessionId,
    timepoint: s.timepoint,
    levelId: opts.levelId ?? null,
    eventType,
    construct: opts.construct ?? null,
    payload,
    clientTs: new Date().toISOString(),
  };
  if (DEBUG) console.debug('[event]', ev.eventType, ev.levelId ?? '-', ev.construct ?? '-', ev.payload);
  void enqueue(ev);
  return ev;
}
