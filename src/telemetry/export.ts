/** ส่งออกข้อมูลวิจัยเป็น CSV/JSON และสรุปสถิติเชิงบรรยาย */
import type { GameEvent } from './schema';
import type { StoredEvent } from './queue';

export type ExportFilter = {
  timepoint?: string | undefined;
  construct?: string | undefined;
  participantCode?: string | undefined;
};

export function stripStored(rows: (StoredEvent | GameEvent)[]): GameEvent[] {
  return rows.map((r) => {
    const { sent: _s, ...ev } = r as StoredEvent;
    return ev;
  });
}

export function filterEvents(rows: GameEvent[], f: ExportFilter): GameEvent[] {
  return rows.filter(
    (e) =>
      (!f.timepoint || e.timepoint === f.timepoint) &&
      (!f.construct || e.construct === f.construct) &&
      (!f.participantCode || e.participantCode === f.participantCode),
  );
}

const COLUMNS = ['eventId', 'participantCode', 'sessionId', 'timepoint', 'levelId', 'eventType', 'construct', 'clientTs', 'payload'] as const;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 1 แถว = 1 event · payload เป็น JSON ในคอลัมน์เดียว + คอลัมน์ payload.* ที่พบบ่อยแยกให้ */
export function toCSV(rows: GameEvent[]): string {
  const extra = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.payload)) if (typeof r.payload[k] !== 'object') extra.add(k);
  const extraCols = [...extra].sort();
  const header = [...COLUMNS, ...extraCols.map((k) => `payload.${k}`)];
  const lines = [header.join(',')];
  for (const r of rows) {
    const base = COLUMNS.map((c) => csvCell(r[c]));
    const ex = extraCols.map((k) => csvCell(r.payload[k]));
    lines.push([...base, ...ex].join(','));
  }
  // BOM เพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง
  return '﻿' + lines.join('\r\n');
}

export function toJSON(rows: GameEvent[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, events: rows }, null, 2);
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/* ---------- สรุปสถิติเชิงบรรยาย ---------- */
export interface LevelStat {
  levelId: string;
  starts: number;
  completes: number;
  durationsMs: number[];
  attempts: number;
  errorsByType: Record<string, number>;
  hints: number;
}

export interface ParticipantSummary {
  participantCode: string;
  timepoints: string[];
  sessions: number;
  events: number;
  levelsCompleted: string[];
  hints: number;
  totalDurationMs: number;
  safetyViolations: number;
  lastSeen: string;
}

const ATTEMPT_EVENTS = new Set(['trial_run', 'group_drop', 'diagnosis_submit', 'test_run', 'material_submit', 'design_test', 'link_drawn', 'probe_answer', 'argument_submit']);
const ERROR_EVENTS = new Set(['group_drop_wrong', 'diagnosis_wrong', 'material_wrong', 'link_wrong', 'probe_wrong', 'safety_violation', 'edp_skip_blocked', 'submit_without_evidence']);

export function levelStats(rows: GameEvent[]): LevelStat[] {
  const map = new Map<string, LevelStat>();
  const get = (id: string): LevelStat => {
    let s = map.get(id);
    if (!s) {
      s = { levelId: id, starts: 0, completes: 0, durationsMs: [], attempts: 0, errorsByType: {}, hints: 0 };
      map.set(id, s);
    }
    return s;
  };
  for (const e of rows) {
    if (!e.levelId) continue;
    const s = get(e.levelId);
    if (e.eventType === 'level_start') s.starts++;
    if (e.eventType === 'level_complete') {
      s.completes++;
      const d = Number(e.payload['durationMs']);
      if (Number.isFinite(d)) s.durationsMs.push(d);
    }
    if (ATTEMPT_EVENTS.has(e.eventType)) s.attempts++;
    if (ERROR_EVENTS.has(e.eventType)) {
      const t = String(e.payload['errorType'] ?? e.eventType);
      s.errorsByType[t] = (s.errorsByType[t] ?? 0) + 1;
    }
    if (e.eventType === 'hint_shown') s.hints++;
  }
  return [...map.values()].sort((a, b) => a.levelId.localeCompare(b.levelId));
}

export function participantSummaries(rows: GameEvent[]): ParticipantSummary[] {
  const map = new Map<string, ParticipantSummary>();
  const sessions = new Map<string, Set<string>>();
  for (const e of rows) {
    let s = map.get(e.participantCode);
    if (!s) {
      s = { participantCode: e.participantCode, timepoints: [], sessions: 0, events: 0, levelsCompleted: [], hints: 0, totalDurationMs: 0, safetyViolations: 0, lastSeen: e.clientTs };
      map.set(e.participantCode, s);
      sessions.set(e.participantCode, new Set());
    }
    s.events++;
    if (!s.timepoints.includes(e.timepoint)) s.timepoints.push(e.timepoint);
    sessions.get(e.participantCode)?.add(e.sessionId);
    if (e.eventType === 'level_complete' && e.levelId && !s.levelsCompleted.includes(e.levelId)) {
      s.levelsCompleted.push(e.levelId);
      s.totalDurationMs += Number(e.payload['durationMs']) || 0;
    }
    if (e.eventType === 'hint_shown') s.hints++;
    if (e.eventType === 'safety_violation') s.safetyViolations++;
    if (e.clientTs > s.lastSeen) s.lastSeen = e.clientTs;
  }
  for (const [code, set] of sessions) {
    const s = map.get(code);
    if (s) s.sessions = set.size;
  }
  return [...map.values()].sort((a, b) => a.participantCode.localeCompare(b.participantCode));
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
