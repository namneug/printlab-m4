/**
 * ทัวร์แนะนำหน้าจอ (coach marks) — ชี้องค์ประกอบจริงทีละจุด สอนเฉพาะวิธีใช้อินเทอร์เฟซ
 * ขึ้นเหมือนกันทุกคนทุกครั้ง (ไม่สุ่ม) กดข้ามได้ และเรียกดูซ้ำได้
 * log แยกจากคำใบ้: tutorial_shown / tutorial_step / tutorial_skipped / tutorial_completed
 */
import { el, clear } from './dom';
import { icon } from './icons';

export interface TourStep {
  /** selector หรือ element จริงบนหน้าจอ (ถ้าไม่พบจะข้ามจุดนั้น) */
  target: string | Element;
  title: string;
  text: string;
}

export interface TourOptions {
  levelId: string;
  requestedBy: 'auto' | 'player';
  track(eventType: string, payload?: Record<string, unknown>): void;
  onEnd?: () => void;
}

let active: (() => void) | null = null;

export function endTour(): void {
  active?.();
}

export function startTour(steps: TourStep[], opts: TourOptions): void {
  endTour();
  const resolved = steps
    .map((s) => ({ ...s, el: typeof s.target === 'string' ? document.querySelector<HTMLElement>(s.target) : (s.target as HTMLElement) }))
    .filter((s): s is TourStep & { el: HTMLElement } => Boolean(s.el));
  if (resolved.length === 0) return;

  const overlay = el('div', { class: 'tour', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'ทัวร์แนะนำหน้าจอ' });
  const spot = el('div', { class: 'tour__spot' });
  const pop = el('div', { class: 'tour__pop' });
  overlay.append(spot, pop);
  document.body.appendChild(overlay);
  document.body.classList.add('has-tour');
  let i = 0;
  opts.track('tutorial_shown', { levelId: opts.levelId, steps: resolved.length, requestedBy: opts.requestedBy, targets: resolved.map((s) => (typeof s.target === 'string' ? s.target : 'element')) });

  const finish = (how: 'completed' | 'skipped'): void => {
    if (how === 'skipped') opts.track('tutorial_skipped', { levelId: opts.levelId, atStep: i + 1, steps: resolved.length, requestedBy: opts.requestedBy });
    else opts.track('tutorial_completed', { levelId: opts.levelId, steps: resolved.length, requestedBy: opts.requestedBy });
    window.removeEventListener('resize', place);
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.classList.remove('has-tour');
    active = null;
    opts.onEnd?.();
  };
  active = () => finish('skipped');

  function place(): void {
    const s = resolved[i];
    if (!s) return;
    s.el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const r = s.el.getBoundingClientRect();
    const pad = 8;
    spot.style.left = `${r.left - pad}px`;
    spot.style.top = `${r.top - pad}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;
    // วางกล่องข้อความใต้เป้า ถ้าไม่พอวางเหนือ
    const pw = Math.min(360, window.innerWidth - 24);
    let left = Math.min(Math.max(12, r.left), window.innerWidth - pw - 12);
    pop.style.width = `${pw}px`;
    pop.style.left = `${left}px`;
    const below = r.bottom + pad + 12;
    const ph = pop.offsetHeight || 160;
    if (below + ph < window.innerHeight - 12) {
      pop.style.top = `${below}px`;
      pop.classList.remove('is-above');
    } else {
      pop.style.top = `${Math.max(12, r.top - pad - 12 - ph)}px`;
      pop.classList.add('is-above');
    }
  }

  function render(): void {
    const s = resolved[i];
    if (!s) return;
    clear(pop);
    const next = el('button', { class: 'btn btn--primary btn--sm', type: 'button', id: 'tour-next' }, i === resolved.length - 1 ? 'เริ่มเลย' : 'ถัดไป', icon('arrow-right', 'icon icon--sm'));
    const skip = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', id: 'tour-skip' }, 'ข้ามทัวร์');
    next.addEventListener('click', () => {
      if (i === resolved.length - 1) finish('completed');
      else {
        i++;
        opts.track('tutorial_step', { levelId: opts.levelId, step: i + 1, steps: resolved.length, target: typeof resolved[i]?.target === 'string' ? resolved[i]?.target : 'element', requestedBy: opts.requestedBy });
        render();
      }
    });
    skip.addEventListener('click', () => finish('skipped'));
    pop.append(
      el('div', { class: 'tour__head' }, icon('info', 'icon icon--sm'), el('span', { class: 'tour__count mono', text: `${i + 1}/${resolved.length}` })),
      el('h3', { class: 'tour__title', text: s.title }),
      el('p', { class: 'tour__text', text: s.text }),
      el('div', { class: 'tour__actions' }, skip, next),
    );
    place();
    next.focus({ preventScroll: true });
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') finish('skipped');
  };
  window.addEventListener('resize', place);
  window.addEventListener('keydown', onKey);
  opts.track('tutorial_step', { levelId: opts.levelId, step: 1, steps: resolved.length, target: typeof resolved[0]?.target === 'string' ? resolved[0]?.target : 'element', requestedBy: opts.requestedBy });
  render();
}
