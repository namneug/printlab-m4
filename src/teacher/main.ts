/**
 * แดชบอร์ดครูและนักวิจัย (/teacher/) — แสดงเฉพาะรหัสนิรนาม
 * ป้องกันด้วยรหัสผ่านอย่างง่ายจาก VITE_TEACHER_PASSWORD (ตั้งตอน build)
 * ถ้าไม่ได้ตั้ง จะใช้รหัสสำรอง FALLBACK_PASSWORD ในโค้ดและขึ้นคำเตือนบนหน้าจอว่ายังไม่ได้ตั้งรหัสจริง (ไม่ปิดการเข้าถึง)
 * แหล่งข้อมูล: IndexedDB ของเบราว์เซอร์นี้ + ไฟล์ export ของนักเรียน (JSON/CSV) + api/teacher (ถ้าตั้ง VITE_TEACHER_API)
 */
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/teacher.css';
import { el, append, clear, fmtMinSec, fmtNum } from '../ui/dom';
import { icon } from '../ui/icons';
import { allEvents } from '../telemetry/queue';
import { download, levelStats, mean, participantSummaries, stripStored, toCSV, toJSON, toSummaryCSV, stamp } from '../telemetry/export';
import type { GameEvent } from '../telemetry/schema';
import { LEVELS } from '../levels';
import { ROSTER_SIZE } from '../game/session';
import { helpLink } from '../ui/helpLink';

const ENV_PASSWORD = (import.meta.env['VITE_TEACHER_PASSWORD'] as string | undefined)?.trim() ?? '';
/** รหัสสำรองเมื่อยังไม่ได้ตั้ง secret TEACHER_PASSWORD — เปลี่ยนได้ที่นี่ และควรตั้ง secret จริงโดยเร็ว */
const FALLBACK_PASSWORD = 'printlab-teacher';
const USING_FALLBACK = ENV_PASSWORD === '';
const PASSWORD = USING_FALLBACK ? FALLBACK_PASSWORD : ENV_PASSWORD;
const API = (import.meta.env['VITE_TEACHER_API'] as string | undefined)?.trim() ?? '';
const TIMEPOINTS = ['O1', 'X', 'O2', 'O3', 'O4'] as const;
const TP_LABEL: Record<string, string> = { O1: 'O1 ก่อนเรียน', X: 'X ระหว่างเรียน', O2: 'O2 หลังเรียน', O3: 'O3 ติดตาม 2 สัปดาห์', O4: 'O4 ติดตาม 4 สัปดาห์' };

interface Assessment { participantCode: string; timepoint: string; score: number; maxScore?: number }

const app = document.getElementById('app');
if (!app) throw new Error('ไม่พบ #app');

/* ---------- ประตูรหัสผ่าน ---------- */
function gate(onPass: () => void): void {
  const ok = (): boolean => sessionStorage.getItem('printlab-teacher') === '1';
  if (ok()) {
    onPass();
    return;
  }
  const input = el('input', { class: 'input', type: 'password', id: 'teacher-pass', placeholder: 'รหัสผ่าน', autocomplete: 'current-password' }) as HTMLInputElement;
  const err = el('p', { class: 'error', hidden: true, text: 'รหัสผ่านไม่ถูกต้อง' });
  const form = el('form', { class: 'form' }, el('div', { class: 'field' }, el('label', { class: 'label', for: 'teacher-pass', text: 'รหัสผ่านครู/นักวิจัย' }), input, err), el('button', { class: 'btn btn--primary', type: 'submit' }, icon('lock'), 'เข้าสู่แดชบอร์ด'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value === PASSWORD) {
      sessionStorage.setItem('printlab-teacher', '1');
      onPass();
    } else {
      err.hidden = false;
      input.select();
    }
  });
  clear(app as HTMLElement);
  (app as HTMLElement).appendChild(el('div', { class: 'gate' }, el('div', { class: 'card' },
    el('div', { class: 'brand brand--lg' }, icon('printer'), el('span', { class: 'brand__name', text: 'PRINTLAB' })),
    el('h1', { class: 'title', text: 'แดชบอร์ดครูและนักวิจัย' }),
    USING_FALLBACK ? fallbackWarning() : null,
    form,
    el('p', { class: 'help', text: 'แดชบอร์ดแสดงเฉพาะรหัสนิรนาม (ANON-xxx) ไม่มีข้อมูลระบุตัวตนของนักเรียน' }),
  )));
  input.focus();
}

function fallbackWarning(): HTMLElement {
  return el('div', { class: 'notice notice--warn', id: 'teacher-fallback-warning' }, icon('alert'), el('div', {},
    el('strong', { text: 'ยังไม่ได้ตั้งรหัสผ่านจริง กำลังใช้รหัสสำรองจากโค้ด' }),
    el('p', { text: 'ตั้ง secret TEACHER_PASSWORD ใน GitHub Actions (หรือ VITE_TEACHER_PASSWORD ตอน build) แล้ว deploy ใหม่โดยเร็ว รหัสสำรองอยู่ในไฟล์ src/teacher/main.ts' }),
  ));
}

/* ---------- แดชบอร์ด ---------- */
async function dashboard(): Promise<void> {
  const root = app as HTMLElement;
  clear(root);
  let events: GameEvent[] = [];
  let assessments: Assessment[] = [];
  const sources = new Set<string>();

  const header = el('header', { class: 'topbar' },
    el('div', { class: 'brand' }, icon('printer'), el('span', { class: 'brand__name', text: 'PRINTLAB' })),
    el('div', { class: 'topbar__title', text: 'แดชบอร์ดครูและนักวิจัย' }),
    el('div', { class: 'topbar__right' }, el('span', { class: 'chip chip--muted' }, icon('shield'), el('span', { text: 'แสดงเฉพาะรหัสนิรนาม' })), helpLink('คู่มือนักเรียน'), el('a', { class: 'btn btn--ghost btn--sm', href: '../' }, icon('arrow-left'), 'หน้าเกม')),
  );
  const srcInfo = el('span', { class: 'muted small' });
  const kpis = el('div', { class: 'kpis' });
  const tpGrid = el('div', { class: 'tp-grid' });
  const scoreWrap = el('div', { class: 'table-wrap' });
  const levelWrap = el('div', { class: 'table-wrap' });
  const peopleWrap = el('div', { class: 'table-wrap' });
  const main = el('main', { class: 'teacher-main' });
  append(root, header, main);
  if (USING_FALLBACK) main.appendChild(fallbackWarning());

  /* แหล่งข้อมูล */
  const btnLocal = el('button', { class: 'btn btn--sm', type: 'button', id: 'src-local' }, icon('refresh'), 'โหลดจากเบราว์เซอร์นี้');
  const fileJson = el('input', { type: 'file', accept: '.json,.csv', multiple: true, id: 'src-file' }) as HTMLInputElement;
  const btnFile = el('label', { class: 'btn btn--sm file-btn', for: 'src-file' }, icon('upload'), 'นำเข้าไฟล์ export ของนักเรียน (JSON/CSV)', fileJson);
  const fileAssess = el('input', { type: 'file', accept: '.csv', id: 'src-assess' }) as HTMLInputElement;
  const btnAssess = el('label', { class: 'btn btn--sm file-btn', for: 'src-assess' }, icon('upload'), 'นำเข้าคะแนนแบบทดสอบ (CSV: participant_code,timepoint,score)', fileAssess);
  const tokenInput = el('input', { class: 'input', type: 'password', placeholder: 'TEACHER_TOKEN', style: 'max-width:200px', hidden: !API }) as HTMLInputElement;
  const btnApi = el('button', { class: 'btn btn--sm', type: 'button', hidden: !API }, icon('download'), 'ดึงจากเซิร์ฟเวอร์');
  const btnCsv = el('button', { class: 'btn btn--sm', type: 'button', id: 'exp-csv' }, icon('download'), 'ส่งออก event CSV');
  const btnJson = el('button', { class: 'btn btn--sm', type: 'button' }, icon('download'), 'ส่งออก event JSON');
  const btnSum = el('button', { class: 'btn btn--sm', type: 'button', id: 'exp-summary' }, icon('download'), 'ส่งออกสรุปรายคน CSV');

  append(main,
    el('section', { class: 'map-section' },
      el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'แหล่งข้อมูล' }), srcInfo),
      el('div', { class: 'src-row' }, btnLocal, btnFile, btnAssess, tokenInput, btnApi),
    ),
    el('section', { class: 'map-section' }, el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'ภาพรวม' })), kpis),
    el('section', { class: 'map-section' }, el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'การเข้าร่วมและผู้ที่ยังไม่เข้าร่วม (attrition) รายจุดเวลา' }), el('p', { class: 'section-sub', text: `รายชื่อรหัส ANON-001 ถึง ANON-${String(ROSTER_SIZE).padStart(3, '0')} (ตั้งจำนวนด้วย VITE_ROSTER_SIZE)` })), tpGrid),
    el('section', { class: 'map-section' }, el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'คะแนนเฉลี่ยตามจุดเวลา O1–O4' }), el('p', { class: 'section-sub', text: 'จากคะแนนแบบทดสอบที่ครูนำเข้า แสดง "รอเก็บ" เมื่อยังไม่มีข้อมูล' })), scoreWrap),
    el('section', { class: 'map-section' }, el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'สรุปรายด่าน' })), levelWrap),
    el('section', { class: 'map-section' }, el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'ตารางรายบุคคล (รหัสนิรนาม)' })), peopleWrap),
    el('section', { class: 'map-section' }, el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'ส่งออก' })), el('div', { class: 'row' }, btnCsv, btnJson, btnSum)),
    el('p', { class: 'foot', text: 'ข้อมูลทั้งหมดรายงานในภาพรวมด้วยรหัสนิรนาม ตารางจับคู่รหัสกับชื่ออยู่นอกระบบกับอาจารย์ที่ปรึกษาโครงการ' }),
  );

  function merge(list: GameEvent[]): void {
    const seen = new Set(events.map((e) => e.eventId));
    for (const e of list) if (e && typeof e.eventId === 'string' && !seen.has(e.eventId)) {
      events.push(e);
      seen.add(e.eventId);
    }
    events.sort((a, b) => a.clientTs.localeCompare(b.clientTs));
  }

  async function loadLocal(): Promise<void> {
    merge(stripStored(await allEvents()));
    sources.add('เบราว์เซอร์นี้');
    render();
  }

  function parseCsvEvents(text: string): GameEvent[] {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const header = splitCsv(lines[0] ?? '');
    const idx = (k: string): number => header.indexOf(k);
    const out: GameEvent[] = [];
    for (const line of lines.slice(1)) {
      const c = splitCsv(line);
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(c[idx('payload')] ?? '{}') as Record<string, unknown>;
      } catch {
        payload = {};
      }
      out.push({
        eventId: c[idx('eventId')] ?? '', participantCode: c[idx('participantCode')] ?? '', sessionId: c[idx('sessionId')] ?? '',
        timepoint: (c[idx('timepoint')] ?? 'X') as GameEvent['timepoint'], levelId: c[idx('levelId')] || null, eventType: c[idx('eventType')] ?? '',
        construct: (c[idx('construct')] || null) as GameEvent['construct'], payload, clientTs: c[idx('clientTs')] ?? '',
      });
    }
    return out.filter((e) => e.eventId && e.participantCode);
  }

  fileJson.addEventListener('change', async () => {
    for (const f of fileJson.files ?? []) {
      const text = await f.text();
      if (f.name.endsWith('.json')) {
        try {
          const data = JSON.parse(text) as { events?: GameEvent[] } | GameEvent[];
          merge(Array.isArray(data) ? data : data.events ?? []);
        } catch {
          alert(`อ่านไฟล์ ${f.name} ไม่ได้`);
        }
      } else merge(parseCsvEvents(text));
      sources.add(f.name);
    }
    fileJson.value = '';
    render();
  });

  fileAssess.addEventListener('change', async () => {
    const f = fileAssess.files?.[0];
    if (!f) return;
    const lines = (await f.text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const header = splitCsv(lines[0] ?? '').map((h) => h.trim().toLowerCase());
    const ci = header.indexOf('participant_code');
    const ti = header.indexOf('timepoint');
    const si = header.indexOf('score');
    const mi = header.indexOf('max_score');
    for (const line of lines.slice(1)) {
      const c = splitCsv(line);
      const code = c[ci]?.trim().toUpperCase() ?? '';
      const tp = c[ti]?.trim().toUpperCase() ?? '';
      const score = Number(c[si]);
      if (!/^ANON-\d{3}$/.test(code) || !TIMEPOINTS.includes(tp as (typeof TIMEPOINTS)[number]) || Number.isNaN(score)) continue;
      const rec: Assessment = { participantCode: code, timepoint: tp, score };
      if (mi >= 0 && c[mi]) rec.maxScore = Number(c[mi]);
      assessments = assessments.filter((a) => !(a.participantCode === code && a.timepoint === tp));
      assessments.push(rec);
    }
    fileAssess.value = '';
    sources.add(`คะแนน: ${f.name}`);
    render();
  });

  btnApi.addEventListener('click', async () => {
    try {
      const res = await fetch(API, { headers: { 'x-teacher-token': tokenInput.value } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { events: GameEvent[]; assessments: { participant_code: string; timepoint: string; score: number; max_score?: number }[] };
      merge(data.events);
      for (const a of data.assessments ?? []) {
        const rec: Assessment = { participantCode: a.participant_code, timepoint: a.timepoint, score: Number(a.score) };
        if (a.max_score !== undefined && a.max_score !== null) rec.maxScore = Number(a.max_score);
        assessments.push(rec);
      }
      sources.add('เซิร์ฟเวอร์');
      render();
    } catch (err) {
      alert(`ดึงข้อมูลไม่สำเร็จ (${String(err)})`);
    }
  });
  btnLocal.addEventListener('click', () => void loadLocal());
  btnCsv.addEventListener('click', () => download(`printlab-events-all-${stamp()}.csv`, toCSV(events), 'text/csv;charset=utf-8'));
  btnJson.addEventListener('click', () => download(`printlab-events-all-${stamp()}.json`, toJSON(events), 'application/json'));
  btnSum.addEventListener('click', () => download(`printlab-summary-${stamp()}.csv`, toSummaryCSV(events, roster()), 'text/csv;charset=utf-8'));

  function roster(): string[] {
    return Array.from({ length: ROSTER_SIZE }, (_, i) => `ANON-${String(i + 1).padStart(3, '0')}`);
  }

  function render(): void {
    srcInfo.textContent = sources.size ? `ที่มา: ${[...sources].join(' · ')} · ${fmtNum(events.length)} event` : 'ยังไม่ได้โหลดข้อมูล';
    const people = participantSummaries(events);
    const completedAll = people.filter((p) => LEVELS.every((l) => p.levelsCompleted.includes(l.id))).length;
    const avgTotal = mean(people.filter((p) => p.levelsCompleted.length).map((p) => p.totalDurationMs));
    const stat = (label: string, value: string, sub = ''): HTMLElement => el('div', { class: 'stat' }, el('span', { class: 'stat__label', text: label }), el('span', { class: 'stat__value mono', text: value }), sub ? el('span', { class: 'stat__src', text: sub }) : null);
    clear(kpis);
    append(kpis,
      stat('ผู้เข้าร่วมที่มีข้อมูล', `${people.length} / ${ROSTER_SIZE}`),
      stat('เล่นครบ 6 ด่าน', `${completedAll} คน`),
      stat('เวลาเฉลี่ยรวมทุกด่านที่ผ่าน', avgTotal === null ? 'รอเก็บ' : fmtMinSec(avgTotal)),
      stat('คำใบ้เฉลี่ยต่อคน', people.length ? fmtNum(mean(people.map((p) => p.hints)) ?? 0, 1) : 'รอเก็บ'),
      stat('event ทั้งหมด', fmtNum(events.length)),
    );

    /* attrition รายจุดเวลา */
    clear(tpGrid);
    const all = roster();
    for (const tp of TIMEPOINTS) {
      const present = new Set(events.filter((e) => e.timepoint === tp).map((e) => e.participantCode));
      if (tp !== 'X') for (const a of assessments) if (a.timepoint === tp) present.add(a.participantCode);
      const missing = all.filter((c) => !present.has(c));
      tpGrid.appendChild(el('div', { class: 'tp-card', 'data-tp': tp },
        el('span', { class: 'tp-card__name', text: TP_LABEL[tp] ?? tp }),
        el('div', { class: 'tp-card__row' }, el('span', { text: 'เข้าร่วม' }), el('b', { class: 'dot-ok', text: String(present.size) })),
        el('div', { class: 'tp-card__row' }, el('span', { text: 'ยังไม่เข้าร่วม' }), el('b', { class: missing.length ? 'error' : 'dot-no', text: String(missing.length) })),
        el('span', { class: 'tp-card__missing', text: present.size === 0 ? 'รอเก็บ' : missing.length ? missing.slice(0, 12).join(', ') + (missing.length > 12 ? ` … อีก ${missing.length - 12}` : '') : 'ครบทุกคน' }),
      ));
    }

    /* คะแนนตามจุดเวลา */
    clear(scoreWrap);
    scoreWrap.appendChild(el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'จุดเวลา' }), el('th', { class: 'num', text: 'จำนวน' }), el('th', { class: 'num', text: 'เฉลี่ย' }), el('th', { class: 'num', text: 'ต่ำสุด' }), el('th', { class: 'num', text: 'สูงสุด' }))),
      el('tbody', {}, ...(['O1', 'O2', 'O3', 'O4'] as const).map((tp) => {
        const xs = assessments.filter((a) => a.timepoint === tp).map((a) => a.score);
        const m = mean(xs);
        return el('tr', { 'data-score-tp': tp }, el('td', { text: TP_LABEL[tp] ?? tp }), el('td', { class: 'num', text: String(xs.length) }),
          el('td', { class: `num${m === null ? ' pending' : ''}`, text: m === null ? 'รอเก็บ' : fmtNum(m, 2) }),
          el('td', { class: `num${m === null ? ' pending' : ''}`, text: m === null ? 'รอเก็บ' : fmtNum(Math.min(...xs), 1) }),
          el('td', { class: `num${m === null ? ' pending' : ''}`, text: m === null ? 'รอเก็บ' : fmtNum(Math.max(...xs), 1) }));
      })),
    ));

    /* รายด่าน */
    clear(levelWrap);
    const ls = levelStats(events);
    levelWrap.appendChild(el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'ด่าน' }), el('th', { class: 'num', text: 'เริ่ม' }), el('th', { class: 'num', text: 'ผ่าน' }), el('th', { class: 'num', text: 'เวลาเฉลี่ย' }), el('th', { class: 'num', text: 'ครั้งที่ลอง' }), el('th', { class: 'num', text: 'คำใบ้' }), el('th', { text: 'ข้อผิดพลาดที่พบบ่อย' }))),
      el('tbody', {}, ...LEVELS.map((lv) => {
        const s = ls.find((x) => x.levelId === lv.id);
        const m = s ? mean(s.durationsMs) : null;
        const errs = s ? Object.entries(s.errorsByType).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ×${v}`).join(', ') : '';
        return el('tr', {}, el('td', { text: `${lv.number}. ${lv.title}` }), el('td', { class: 'num', text: String(s?.starts ?? 0) }), el('td', { class: 'num', text: String(s?.completes ?? 0) }),
          el('td', { class: `num${m === null ? ' pending' : ''}`, text: m === null ? 'รอเก็บ' : fmtMinSec(m) }), el('td', { class: 'num', text: String(s?.attempts ?? 0) }), el('td', { class: 'num', text: String(s?.hints ?? 0) }), el('td', { text: errs || '—' }));
      })),
    ));

    /* รายบุคคล */
    clear(peopleWrap);
    const scoreOf = (code: string, tp: string): string => {
      const a = assessments.find((x) => x.participantCode === code && x.timepoint === tp);
      return a ? fmtNum(a.score, 1) : '—';
    };
    peopleWrap.appendChild(el('table', { class: 'table mini-table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'รหัส' }), ...LEVELS.map((l) => el('th', { class: 'num', text: `ด่าน ${l.number}` })), el('th', { class: 'num', text: 'O1' }), el('th', { class: 'num', text: 'O2' }), el('th', { class: 'num', text: 'O3' }), el('th', { class: 'num', text: 'O4' }), el('th', { class: 'num', text: 'คำใบ้' }), el('th', { class: 'num', text: 'เวลารวม' }), el('th', { text: 'ล่าสุด' }))),
      el('tbody', {}, ...people.map((p) => el('tr', { 'data-code': p.participantCode },
        el('td', { class: 'mono', text: p.participantCode }),
        ...LEVELS.map((l) => el('td', { class: 'num' }, p.levelsCompleted.includes(l.id) ? icon('check', 'icon icon--sm dot-ok') : el('span', { class: 'dot-no', text: '–' }))),
        ...['O1', 'O2', 'O3', 'O4'].map((tp) => el('td', { class: 'num', text: scoreOf(p.participantCode, tp) })),
        el('td', { class: 'num', text: String(p.hints) }),
        el('td', { class: 'num', text: p.totalDurationMs ? fmtMinSec(p.totalDurationMs) : '—' }),
        el('td', { class: 'small muted', text: p.lastSeen.slice(0, 16).replace('T', ' ') }),
      ))),
    ));
    if (!people.length) peopleWrap.appendChild(el('p', { class: 'muted', text: 'ยังไม่มีข้อมูล โหลดจากเบราว์เซอร์นี้หรือนำเข้าไฟล์' }));
  }

  render();
  await loadLocal();
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

gate(() => void dashboard());
