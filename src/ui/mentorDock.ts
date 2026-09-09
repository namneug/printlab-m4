/** แผงพี่เลี้ยง (ใช้ร่วมกันระหว่างกรอบด่านและโหมดซ่อม) — จัดการระดับคำใบ้จางลงและการ log */
import { el, clear } from './dom';
import { icon } from './icons';
import { createMentor, type HintLevel, type MentorMessage, type MentorMode } from '../mentor';
import { safetyMessage } from '../mentor/rule';
import type { MentorHost } from '../levels/context';
import type { Construct } from '../telemetry/schema';

export const MODE_LABEL: Record<MentorMode, string> = {
  feed_up: 'เป้าหมาย',
  feed_back: 'ผลที่ทำ',
  feed_forward: 'ก้าวต่อไป',
};

export interface MentorDockOptions {
  /** key สำหรับค้นคำใบ้ใน hints.json (levelId) */
  hintsKey: string;
  hintLevelMax: 1 | 2 | 3;
  track(eventType: string, payload?: Record<string, unknown>, construct?: Construct): void;
}

export interface MentorDock {
  root: HTMLElement;
  hintBtn: HTMLButtonElement;
  dots: HTMLElement;
  host: MentorHost;
  push(m: MentorMessage): void;
  /** เริ่มนับคำใบ้ใหม่ (เช่น เคสถัดไปในโหมดซ่อม) */
  reset(): void;
}

export function createMentorDock(opts: MentorDockOptions): MentorDock {
  const mentor = createMentor();
  let hintsUsed = 0;
  let currentTrigger: string | null = null;
  let currentVars: Record<string, string | number> = {};
  let lastOfferAt = 0;
  const offered = new Map<string, number>();

  const log = el('div', { class: 'mentor__log', role: 'log', 'aria-live': 'polite' });
  const toggle = el('button', { class: 'mentor__toggle', type: 'button', 'aria-label': 'พับ/ขยายพี่เลี้ยง' }, icon('list'));
  const root = el('aside', { class: 'mentor', 'aria-label': 'พี่เลี้ยง' },
    el('div', { class: 'mentor__head' }, icon('compass'), el('span', { text: 'พี่เลี้ยง' }), el('span', { class: 'mentor__src', text: 'แบบมีกฎ' }), toggle),
    log,
  );
  toggle.addEventListener('click', () => root.classList.toggle('is-collapsed'));

  const hintBtn = el('button', { class: 'btn btn--hint', type: 'button', title: 'ขอคำใบ้จากพี่เลี้ยง' }, icon('bulb'), el('span', { text: 'ขอคำใบ้' })) as HTMLButtonElement;
  const dots = el('span', { class: 'hint-dots', 'aria-label': 'ระดับคำใบ้ที่ใช้ได้' });
  const renderDots = (): void => {
    clear(dots);
    for (let i = 1; i <= 3; i++) dots.appendChild(el('i', { class: `dot${i <= opts.hintLevelMax ? (i <= hintsUsed ? ' is-used' : ' is-open') : ''}` }));
  };
  renderDots();

  const push = (m: MentorMessage): void => {
    const item = el('div', { class: `mentor__msg mentor__msg--${m.mode}${m.safety ? ' mentor__msg--safety' : ''}` },
      el('span', { class: 'mentor__mode', text: m.safety ? 'ความปลอดภัย' : MODE_LABEL[m.mode] }),
      el('p', { text: m.text }),
    );
    log.appendChild(item);
    root.classList.remove('is-collapsed');
    while (log.children.length > 8) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
    item.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  };

  async function showHint(trigger: string, requestedBy: 'player' | 'system', vars: Record<string, string | number>): Promise<boolean> {
    const level = Math.min(opts.hintLevelMax, hintsUsed + 1) as HintLevel;
    if (hintsUsed >= opts.hintLevelMax && requestedBy === 'player') {
      push({ mode: 'feed_forward', text: 'คุณใช้คำใบ้ครบระดับที่ด่านนี้เปิดให้แล้ว ลองใช้สิ่งที่รู้ตอนนี้ตัดสินใจ แล้วดูผลที่ได้', source: 'rule', revealsAnswer: false });
      opts.track('hint_request', { trigger, requestedBy, hintLevel: level, denied: 'max_level', mentorSource: 'rule' });
      return false;
    }
    if (hintsUsed >= opts.hintLevelMax) return false;
    const msg = await mentor.hint({ levelId: opts.hintsKey, trigger, hintLevel: level, vars });
    opts.track('hint_request', { trigger, requestedBy, hintLevel: level, available: Boolean(msg), mentorSource: 'rule' });
    if (!msg) {
      if (requestedBy === 'player') push({ mode: 'feed_forward', text: 'ตอนนี้ยังไม่มีคำใบ้เพิ่มเติม ลองทบทวนเป้าหมายของด่านแล้วสังเกตสิ่งที่ยังไม่ได้ทำ', source: 'rule', revealsAnswer: false });
      return false;
    }
    hintsUsed++;
    renderDots();
    push(msg);
    opts.track('hint_shown', { trigger, hintLevel: msg.hintLevel, requestedBy, mentorSource: msg.source, shownAt: new Date().toISOString() });
    return true;
  }

  hintBtn.addEventListener('click', () => {
    void showHint(currentTrigger ?? 'general', 'player', currentVars);
  });

  const host: MentorHost = {
    setTrigger(trigger, vars = {}) {
      currentTrigger = trigger;
      currentVars = vars;
    },
    async offer(trigger, vars = {}) {
      const now = Date.now();
      // ระบบเสนอเองไม่ถี่เกิน 20 วินาที และไม่ซ้ำ trigger เดิมภายใน 60 วินาที
      if (now - lastOfferAt < 20_000) return false;
      if (now - (offered.get(trigger) ?? 0) < 60_000) return false;
      lastOfferAt = now;
      offered.set(trigger, now);
      return showHint(trigger, 'system', vars);
    },
    async explain(trigger, vars = {}) {
      const msg = await mentor.explainError({ levelId: opts.hintsKey, trigger, hintLevel: 1, vars });
      push(msg);
      opts.track('mentor_explain', { trigger, mentorSource: msg.source });
    },
    safety(key) {
      const text = safetyMessage(key);
      if (!text) return;
      push({ mode: 'feed_back', text, source: 'rule', revealsAnswer: false, safety: true });
      opts.track('safety_message', { key, mentorSource: 'rule' }, 'safety');
    },
    say(text, mode) {
      push({ mode, text, source: 'rule', revealsAnswer: false });
    },
    get hintsUsed() {
      return hintsUsed;
    },
  };

  return {
    root,
    hintBtn,
    dots,
    host,
    push,
    reset() {
      hintsUsed = 0;
      offered.clear();
      lastOfferAt = 0;
      renderDots();
      clear(log);
    },
  };
}
