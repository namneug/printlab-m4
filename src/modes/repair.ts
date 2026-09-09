/** โมดูลซ่อม — สุ่มเคสจากคลัง ฝึกซ้ำได้ไม่จำกัด ใช้กลไกเดียวกับด่าน 3 */
import { el, append, clear } from '../ui/dom';
import { icon } from '../ui/icons';
import type { Screen } from '../ui/router';
import { createMentorDock } from '../ui/mentorDock';
import { getSession } from '../game/session';
import { track } from '../telemetry/events';
import { randomCase, runDiagnosis, type DiagnosisOutcome } from './diagnosis';
import type { Construct } from '../telemetry/schema';

export const repairScreen: Screen = (root) => {
  const session = getSession();
  if (!session) return;
  const pool = session.timepoint === 'O3' || session.timepoint === 'O4' ? 'followup' : 'base';
  let lastCase: string | undefined;
  let stop: (() => void) | null = null;
  let solved = 0;

  const trackRepair = (eventType: string, payload: Record<string, unknown> = {}, construct?: Construct): void => {
    track(eventType, { ...payload, mode: 'repair', pool }, { levelId: 'repair', construct: construct ?? 'maintenance' });
  };
  const dock = createMentorDock({ hintsKey: 'l3', hintLevelMax: 2, track: trackRepair });

  const status = el('p', { class: 'levelbar__status', text: 'สุ่มเคสจากคลัง ฝึกได้ไม่จำกัด' });
  const counter = el('span', { class: 'mono', text: '0' });
  const bar = el('header', { class: 'levelbar' },
    el('a', { class: 'btn btn--ghost btn--sm', href: '#/map' }, icon('arrow-left'), 'แผนที่'),
    el('div', { class: 'levelbar__title' }, el('div', { class: 'levelbar__num', text: 'โหมดเปิดตลอด' }), el('h1', { class: 'levelbar__name', text: 'โมดูลซ่อม' }), status),
    el('div', { class: 'levelbar__right' }, el('span', { class: 'chip chip--green' }, icon('wrench'), el('span', { text: 'ปิดเคสแล้ว ' }), counter), el('span', { class: 'chip' }, dock.dots), dock.hintBtn),
  );
  const body = el('main', { class: 'level-body' });
  const page = el('div', { class: 'screen screen--level' }, bar, body, dock.root);
  root.appendChild(page);
  trackRepair('repair_open');

  function startCase(): void {
    stop?.();
    clear(body);
    dock.reset();
    const c = randomCase(pool, lastCase);
    lastCase = c.id;
    dock.host.say(`เคสใหม่: ${c.title} หาสาเหตุจากหลักฐานภายในงบเวลา ${c.time_budget} นาที`, 'feed_up');
    const wrap = el('div');
    body.appendChild(wrap);
    stop = runDiagnosis(wrap, c, { track: trackRepair, mentor: dock.host, setStatus: (t) => (status.textContent = t) }, (o) => showSummary(o));
  }

  function showSummary(o: DiagnosisOutcome): void {
    solved++;
    counter.textContent = String(solved);
    stop?.();
    stop = null;
    clear(body);
    const next = el('button', { class: 'btn btn--primary', type: 'button', id: 'repair-next' }, icon('refresh'), 'เคสถัดไป');
    next.addEventListener('click', startCase);
    append(body, el('section', { class: 'debrief' }, el('div', { class: 'debrief__card' },
      el('div', { class: 'debrief__eyebrow' }, icon('check'), el('span', { text: 'ปิดเคสสำเร็จ' })),
      el('h2', { class: 'debrief__title', text: o.case_title }),
      el('div', { class: 'debrief__stats' },
        stat('การทดสอบที่ใช้', `${o.tests_used} อย่าง`),
        stat('เวลาที่ใช้', `${o.time_spent}/${o.time_budget} นาที`),
        stat('ตัดสมมติฐานด้วยหลักฐาน', `${o.hypotheses_eliminated} ข้อ`),
        stat('สรุปโดยไม่มีหลักฐาน', `${o.guess_without_evidence} ครั้ง`),
      ),
      el('div', { class: 'row' }, el('a', { class: 'btn btn--ghost', href: '#/map' }, icon('map'), 'แผนที่ภารกิจ'), next),
    )));
    function stat(label: string, value: string): HTMLElement {
      return el('div', { class: 'stat' }, el('span', { class: 'stat__label', text: label }), el('span', { class: 'stat__value mono', text: value }));
    }
  }

  startCase();
  return () => {
    stop?.();
  };
};
