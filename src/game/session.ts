import { kvGet, kvSet, kvDelete } from '../telemetry/idb';

export type Timepoint = 'O1' | 'X' | 'O2' | 'O3' | 'O4';

export const TIMEPOINTS: { id: Timepoint; label: string }[] = [
  { id: 'O1', label: 'O1 · ก่อนเรียน' },
  { id: 'X', label: 'X · ระหว่างเรียน' },
  { id: 'O2', label: 'O2 · หลังเรียน' },
  { id: 'O3', label: 'O3 · ติดตามผล 2 สัปดาห์' },
  { id: 'O4', label: 'O4 · ติดตามผล 4 สัปดาห์' },
];

export interface Session {
  participantCode: string;
  sessionId: string;
  timepoint: Timepoint;
  startedAt: string;
}

export interface LevelResult {
  levelId: string;
  completedAt: string;
  durationMs: number;
  hintsUsed: number;
  /** หลักฐาน (evidence) ที่ผูกกับ construct — โครงสร้างต่างกันตามด่าน */
  evidence: Record<string, unknown>;
}

export interface Progress {
  participantCode: string;
  levels: Record<string, LevelResult>;
  /** ข้อมูลระหว่างทางที่ด่านอื่นใช้ (เช่น รอบทดลองของด่าน 2 ให้ด่าน 6 ดึงไปคำนวณ) */
  data: Record<string, unknown>;
}

export const PARTICIPANT_RE = /^ANON-\d{3}$/;
export const ROSTER_SIZE = Number(import.meta.env['VITE_ROSTER_SIZE'] ?? 50);

export function isValidParticipant(code: string): boolean {
  if (!PARTICIPANT_RE.test(code)) return false;
  const n = Number(code.slice(5));
  return n >= 1 && n <= ROSTER_SIZE;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let session: Session | null = null;
let progress: Progress | null = null;

export async function restoreSession(): Promise<Session | null> {
  session = (await kvGet<Session>('session')) ?? null;
  if (session) progress = (await kvGet<Progress>(`progress:${session.participantCode}`)) ?? emptyProgress(session.participantCode);
  return session;
}

function emptyProgress(code: string): Progress {
  return { participantCode: code, levels: {}, data: {} };
}

export async function startSession(participantCode: string, timepoint: Timepoint): Promise<Session> {
  session = { participantCode, sessionId: uuid(), timepoint, startedAt: new Date().toISOString() };
  await kvSet('session', session);
  progress = (await kvGet<Progress>(`progress:${participantCode}`)) ?? emptyProgress(participantCode);
  await kvSet(`progress:${participantCode}`, progress);
  return session;
}

export async function endSession(): Promise<void> {
  session = null;
  progress = null;
  await kvDelete('session');
}

export function getSession(): Session | null {
  return session;
}

export function requireSession(): Session {
  if (!session) throw new Error('ยังไม่มี session');
  return session;
}

export function getProgress(): Progress {
  if (!progress) {
    const code = session?.participantCode ?? 'ANON-000';
    progress = emptyProgress(code);
  }
  return progress;
}

export async function saveLevelResult(result: LevelResult): Promise<void> {
  const p = getProgress();
  p.levels[result.levelId] = result;
  await kvSet(`progress:${p.participantCode}`, p);
}

export async function saveData(key: string, value: unknown): Promise<void> {
  const p = getProgress();
  p.data[key] = value;
  await kvSet(`progress:${p.participantCode}`, p);
}

export function isLevelDone(levelId: string): boolean {
  return Boolean(getProgress().levels[levelId]);
}

export function newId(): string {
  return uuid();
}
