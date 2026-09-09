import { el, append, clear, fmtMinSec } from '../dom';
import { icon } from '../icons';
import { navigate, type Screen } from '../router';
import { levelMeta, loadLevel, nextLevel } from '../../levels';
import type { LevelContext, LevelMeta } from '../../levels/context';
import { getSession, saveLevelResult } from '../../game/session';
import { track } from '../../telemetry/events';
import { createMentor } from '../../mentor';
import { createMentorDock, MODE_LABEL } from '../mentorDock';
import type { Construct } from '../../telemetry/schema';
import { helpLink } from '../helpLink';

export const levelScreen: Screen = (root, params) => {
  const found = levelMeta(params['id'] ?? '');
  const session = getSession();
  if (!found || !session) {
    navigate('/map', true);
    return;
  }
  const meta: LevelMeta = found;
  const mentor = createMentor();
  const levelId = meta.id;
  let disposed = false;
  let unmount: (() => void) | null = null;
  let startedAt = 0;

  function trackLevel(eventType: string, payload: Record<string, unknown> = {}, construct?: Construct): void {
    track(eventType, { ...payload, elapsedMs: startedAt ? Date.now() - startedAt : 0 }, { levelId, construct: construct ?? meta.constructs[0] });
  }

  const dock = createMentorDock({ hintsKey: levelId, hintLevelMax: meta.hintLevelMax, track: trackLevel });
  const page = el('div', { class: 'screen screen--level' });

  /* ---------- แถบบน ---------- */
  const status = el('p', { class: 'levelbar__status', text: meta.objective });
  const timer = el('span', { class: 'mono', text: '0:00' });
  const bar = el('header', { class: 'levelbar' },
    el('a', { class: 'btn btn--ghost btn--sm', href: '#/map' }, icon('arrow-left'), 'แผนที่'),
    el('div', { class: 'levelbar__title' },
      el('div', { class: 'levelbar__num', text: `ด่าน ${meta.number}` }),
      el('h1', { class: 'levelbar__name', text: meta.title }),
      status,
    ),
    el('div', { class: 'levelbar__right' },
      helpLink(),
      el('span', { class: 'chip chip--muted' }, icon('clock'), timer),
      el('span', { class: 'chip' }, dock.dots),
      dock.hintBtn,
    ),
  );

  const body = el('main', { class: 'level-body' });

  /* ---------- หน้าอธิบายแนวคิดก่อนเข้าด่าน ---------- */
  const intro = el('section', { class: 'intro' },
    el('div', { class: 'intro__card' },
      el('div', { class: 'intro__eyebrow' }, icon('flag'), el('span', { text: `ด่าน ${meta.number} · ${meta.subtitle}` })),
      el('h2', { class: 'intro__title', text: meta.title }),
      el('div', { class: 'intro__tags' }, ...meta.indicators.map((t) => el('span', { class: 'tag', text: t }))),
      el('div', { class: 'concept' },
        el('div', { class: 'concept__term' }, icon('info'), el('span', { text: meta.concept.term })),
        el('p', { class: 'concept__def', text: meta.concept.definition }),
        el('div', { class: 'concept__ex' }, el('strong', { text: 'ตัวอย่างในชีวิตจริง' }), el('p', { text: meta.concept.example })),
        el('p', { class: 'concept__bridge', text: meta.concept.bridge }),
      ),
      el('div', { class: 'intro__goal' }, icon('target'), el('div', {}, el('strong', { text: 'ภารกิจ' }), el('p', { text: meta.objective }), el('p', { class: 'muted', text: `สำเร็จเมื่อ: ${meta.success}` }))),
      el('button', { class: 'btn btn--primary btn--lg', type: 'button', id: 'level-start' }, icon('play'), 'เริ่มด่าน'),
    ),
  );

  append(page, bar, body, dock.root);
  root.appendChild(page);
  body.appendChild(intro);
  trackLevel('level_intro_view');

  let timerId = 0;
  const startTimer = (): void => {
    timerId = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
  };

  (intro.querySelector('#level-start') as HTMLButtonElement).addEventListener('click', async () => {
    startedAt = Date.now();
    trackLevel('level_start', { hintLevelMax: meta.hintLevelMax });
    startTimer();
    clear(body);
    const mod = await loadLevel(levelId);
    if (disposed) return;
    if (!mod) {
      body.appendChild(el('div', { class: 'empty' }, icon('box', 'icon icon--lg'), el('h2', { text: 'ด่านนี้ยังไม่เปิดให้เล่น' }), el('p', { class: 'muted', text: 'เนื้อหาของด่านกำลังพัฒนา กลับไปแผนที่ภารกิจก่อน' }), el('a', { class: 'btn btn--ghost', href: '#/map' }, 'กลับแผนที่')));
      return;
    }
    dock.host.say(`เป้าหมายของด่านนี้: ${meta.objective}`, 'feed_up');
    const ctx: LevelContext = {
      meta,
      root: body,
      session,
      startedAt,
      track: trackLevel,
      mentor: dock.host,
      complete,
      setStatus(text) {
        status.textContent = text;
      },
    };
    unmount = mod.mount(ctx);
  });

  /* ---------- จบด่าน + debrief ---------- */
  async function complete(evidence: Record<string, unknown>, vars: Record<string, string | number> = {}): Promise<void> {
    const durationMs = Date.now() - startedAt;
    const hintsUsed = dock.host.hintsUsed;
    window.clearInterval(timerId);
    trackLevel('level_complete', { durationMs, hintsUsed, evidence });
    await saveLevelResult({ levelId, completedAt: new Date().toISOString(), durationMs, hintsUsed, evidence });
    unmount?.();
    unmount = null;

    const allVars = { time: fmtMinSec(durationMs), hints: hintsUsed, objective: meta.objective, ...vars };
    const msg = await mentor.debrief({ levelId, trigger: 'debrief', hintLevel: 1, vars: allVars });
    trackLevel('debrief_shown', { mentorSource: msg.source });

    const next = nextLevel(levelId);
    const debrief = el('section', { class: 'debrief' },
      el('div', { class: 'debrief__card' },
        el('div', { class: 'debrief__eyebrow' }, icon('check'), el('span', { text: `ผ่านด่าน ${meta.number}` })),
        el('h2', { class: 'debrief__title', text: meta.title }),
        el('div', { class: 'debrief__stats' },
          stat('เวลาที่ใช้', fmtMinSec(durationMs)),
          stat('คำใบ้ที่ใช้', `${hintsUsed} ครั้ง`),
        ),
        el('div', { class: 'debrief__sections' },
          ...(msg.sections ?? []).map((s) => el('div', { class: `debrief__sec debrief__sec--${s.mode}` }, el('span', { class: 'mentor__mode', text: MODE_LABEL[s.mode] }), el('h3', { text: s.title }), el('p', { text: s.text }))),
        ),
        el('div', { class: 'row' },
          el('a', { class: 'btn btn--ghost', href: '#/map' }, icon('map'), 'แผนที่ภารกิจ'),
          next ? el('a', { class: 'btn btn--primary', href: `#/level/${next.id}` }, `ไปด่าน ${next.number}`, icon('arrow-right')) : el('a', { class: 'btn btn--primary', href: '#/map' }, 'จบภารกิจทั้งหมด', icon('check')),
        ),
      ),
    );
    clear(body);
    body.appendChild(debrief);
    debrief.scrollIntoView({ block: 'start' });

    function stat(label: string, value: string): HTMLElement {
      return el('div', { class: 'stat' }, el('span', { class: 'stat__label', text: label }), el('span', { class: 'stat__value mono', text: value }));
    }
  }

  return () => {
    disposed = true;
    window.clearInterval(timerId);
    if (startedAt && unmount) trackLevel('level_exit', { durationMs: Date.now() - startedAt, hintsUsed: dock.host.hintsUsed });
    unmount?.();
  };
};
