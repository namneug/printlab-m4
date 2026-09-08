import { el, append, clear, fmtMinSec } from '../dom';
import { icon } from '../icons';
import { navigate, type Screen } from '../router';
import { levelMeta, loadLevel, nextLevel } from '../../levels';
import type { LevelContext, LevelMeta, MentorHost } from '../../levels/context';
import { getSession, saveLevelResult } from '../../game/session';
import { track } from '../../telemetry/events';
import { createMentor, type HintLevel, type MentorMode, type MentorMessage } from '../../mentor';
import { safetyMessage } from '../../mentor/rule';
import type { Construct } from '../../telemetry/schema';

const MODE_LABEL: Record<MentorMode, string> = {
  feed_up: 'เป้าหมาย',
  feed_back: 'ผลที่ทำ',
  feed_forward: 'ก้าวต่อไป',
};

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
  let hintsUsed = 0;
  let currentTrigger: string | null = null;
  let currentVars: Record<string, string | number> = {};
  let lastOfferAt = 0;
  const offered = new Map<string, number>();

  const page = el('div', { class: 'screen screen--level' });

  /* ---------- แถบบน ---------- */
  const status = el('p', { class: 'levelbar__status', text: meta.objective });
  const timer = el('span', { class: 'mono', text: '0:00' });
  const hintBtn = el('button', { class: 'btn btn--hint', type: 'button', title: 'ขอคำใบ้จากพี่เลี้ยง' }, icon('bulb'), el('span', { text: 'ขอคำใบ้' }));
  const hintDots = el('span', { class: 'hint-dots', 'aria-label': 'ระดับคำใบ้ที่ใช้ได้' });
  const renderDots = (): void => {
    clear(hintDots);
    for (let i = 1; i <= 3; i++) {
      hintDots.appendChild(el('i', { class: `dot${i <= meta.hintLevelMax ? (i <= hintsUsed ? ' is-used' : ' is-open') : ''}` }));
    }
  };
  renderDots();

  const bar = el('header', { class: 'levelbar' },
    el('a', { class: 'btn btn--ghost btn--sm', href: '#/map' }, icon('arrow-left'), 'แผนที่'),
    el('div', { class: 'levelbar__title' },
      el('div', { class: 'levelbar__num', text: `ด่าน ${meta.number}` }),
      el('h1', { class: 'levelbar__name', text: meta.title }),
      status,
    ),
    el('div', { class: 'levelbar__right' },
      el('span', { class: 'chip chip--muted' }, icon('clock'), timer),
      el('span', { class: 'chip' }, hintDots),
      hintBtn,
    ),
  );

  /* ---------- พื้นที่ด่าน ---------- */
  const body = el('main', { class: 'level-body' });

  /* ---------- พี่เลี้ยง ---------- */
  const mentorLog = el('div', { class: 'mentor__log', role: 'log', 'aria-live': 'polite' });
  const mentorDock = el('aside', { class: 'mentor', 'aria-label': 'พี่เลี้ยง' },
    el('div', { class: 'mentor__head' }, icon('compass'), el('span', { text: 'พี่เลี้ยง' }), el('span', { class: 'mentor__src', text: 'แบบมีกฎ' })),
    mentorLog,
  );

  const pushMessage = (m: MentorMessage): void => {
    const item = el('div', { class: `mentor__msg mentor__msg--${m.mode}${m.safety ? ' mentor__msg--safety' : ''}` },
      el('span', { class: 'mentor__mode', text: m.safety ? 'ความปลอดภัย' : MODE_LABEL[m.mode] }),
      el('p', { text: m.text }),
    );
    mentorLog.appendChild(item);
    while (mentorLog.children.length > 6) mentorLog.firstElementChild?.remove();
    mentorLog.scrollTop = mentorLog.scrollHeight;
    item.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  };

  const showHint = async (trigger: string, requestedBy: 'player' | 'system', vars: Record<string, string | number>): Promise<boolean> => {
    const level = Math.min(meta.hintLevelMax, hintsUsed + 1) as HintLevel;
    if (hintsUsed >= meta.hintLevelMax && requestedBy === 'player') {
      pushMessage({ mode: 'feed_forward', text: 'คุณใช้คำใบ้ครบระดับที่ด่านนี้เปิดให้แล้ว ลองใช้สิ่งที่รู้ตอนนี้ตัดสินใจ แล้วดูผลที่ได้', source: 'rule', revealsAnswer: false });
      trackLevel('hint_request', { trigger, requestedBy, hintLevel: level, denied: 'max_level', mentorSource: 'rule' });
      return false;
    }
    const msg = await mentor.hint({ levelId, trigger, hintLevel: level, vars });
    trackLevel('hint_request', { trigger, requestedBy, hintLevel: level, available: Boolean(msg), mentorSource: 'rule' });
    if (!msg) {
      if (requestedBy === 'player') pushMessage({ mode: 'feed_forward', text: 'ตอนนี้ยังไม่มีคำใบ้เพิ่มเติม ลองทบทวนเป้าหมายของด่านแล้วสังเกตสิ่งที่ยังไม่ได้ทำ', source: 'rule', revealsAnswer: false });
      return false;
    }
    hintsUsed++;
    renderDots();
    pushMessage(msg);
    trackLevel('hint_shown', { trigger, hintLevel: msg.hintLevel, requestedBy, mentorSource: msg.source, shownAt: new Date().toISOString() });
    return true;
  };

  const host: MentorHost = {
    setTrigger(trigger, vars = {}) {
      currentTrigger = trigger;
      currentVars = vars;
    },
    async offer(trigger, vars = {}) {
      const now = Date.now();
      // ระบบเสนอเองไม่ถี่เกิน 20 วินาที และไม่ซ้ำ trigger เดิมภายใน 60 วินาที
      if (now - lastOfferAt < 20_000) return;
      if (now - (offered.get(trigger) ?? 0) < 60_000) return;
      lastOfferAt = now;
      offered.set(trigger, now);
      await showHint(trigger, 'system', vars);
    },
    async explain(trigger, vars = {}) {
      const msg = await mentor.explainError({ levelId, trigger, hintLevel: 1, vars });
      pushMessage(msg);
      trackLevel('mentor_explain', { trigger, mentorSource: msg.source });
    },
    safety(key) {
      const text = safetyMessage(key);
      if (!text) return;
      pushMessage({ mode: 'feed_back', text, source: 'rule', revealsAnswer: false, safety: true });
      trackLevel('safety_message', { key, mentorSource: 'rule' }, 'safety');
    },
    say(text, mode) {
      pushMessage({ mode, text, source: 'rule', revealsAnswer: false });
    },
    get hintsUsed() {
      return hintsUsed;
    },
  };

  hintBtn.addEventListener('click', () => {
    void showHint(currentTrigger ?? 'general', 'player', currentVars);
  });

  function trackLevel(eventType: string, payload: Record<string, unknown> = {}, construct?: Construct): void {
    track(eventType, { ...payload, elapsedMs: startedAt ? Date.now() - startedAt : 0 }, { levelId, construct: construct ?? meta.constructs[0] });
  }

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

  append(page, bar, body, mentorDock);
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
    host.say(`เป้าหมายของด่านนี้: ${meta.objective}`, 'feed_up');
    const ctx: LevelContext = {
      meta,
      root: body,
      session,
      startedAt,
      track: trackLevel,
      mentor: host,
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
    if (startedAt && unmount) trackLevel('level_exit', { durationMs: Date.now() - startedAt, hintsUsed });
    unmount?.();
  };
};
