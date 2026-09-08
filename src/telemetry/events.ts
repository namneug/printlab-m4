/** จุดบันทึก event กลาง — M2 เขียนลง console ก่อน M3 จะต่อคิว IndexedDB */
import type { Construct, GameEvent } from './schema';
import { getSession, newId } from '../game/session';

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
  console.debug('[event]', ev.eventType, ev.levelId, ev.payload);
  return ev;
}
