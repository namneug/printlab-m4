/**
 * แถบนำทางของด่าน — ติดบนสุดของพื้นที่ทำงาน บอก "ตอนนี้ทำอะไร" เป็นประโยคสั่งทำประโยคเดียว
 * พร้อมตัวนับขั้น ตัวนับความคืบหน้า และปุ่มหลักของขั้นที่มองเห็นตั้งแต่ต้น (disabled พร้อมบอกว่ายังขาดอะไร)
 * สอนเฉพาะวิธีใช้หน้าจอ ห้ามใส่เนื้อหาวิชาหรือคำตอบ
 */
import { el, clear } from './dom';
import { icon } from './icons';

export interface GuideProgress {
  done: number;
  total: number;
  /** หน่วย เช่น "ชิ้น" "เส้น" "ข้อ" */
  unit?: string;
}

export interface GuidePrimary {
  label: string;
  enabled: boolean;
  /** สิ่งที่ยังขาด แสดงเมื่อปุ่มยังกดไม่ได้ */
  reason?: string;
  onClick: () => void;
  hidden?: boolean;
}

export interface Guide {
  root: HTMLElement;
  setSteps(labels: string[]): void;
  setStep(index: number): void;
  /** ประโยคสั่งทำ 1 ประโยค + ความคืบหน้าของขั้นนี้ (ตัวเลขหรือข้อความสั้น) */
  instruct(text: string, progress?: GuideProgress | string): void;
  primary(p: GuidePrimary): void;
  /** ตรวจว่าขั้นปัจจุบันคือขั้นใด (ใช้ในเทสต์/ทัวร์) */
  readonly step: number;
}

export function createGuide(): Guide {
  const stepsEl = el('ol', { class: 'guide__steps', 'aria-label': 'ขั้นของด่าน' });
  const instruction = el('p', { class: 'guide__text', id: 'guide-text', 'aria-live': 'polite' });
  const progress = el('span', { class: 'guide__progress mono', id: 'guide-progress' });
  const primaryBtn = el('button', { class: 'btn btn--primary guide__primary', type: 'button', id: 'guide-primary', hidden: true }) as HTMLButtonElement;
  const reason = el('span', { class: 'guide__reason', id: 'guide-reason' });
  const root = el('div', { class: 'guide', role: 'region', 'aria-label': 'แถบนำทางของด่าน', id: 'guide' },
    stepsEl,
    el('div', { class: 'guide__row' },
      el('div', { class: 'guide__now' }, icon('arrow-right', 'icon guide__icon'), el('div', {}, el('span', { class: 'guide__label', text: 'ตอนนี้ทำอะไร' }), instruction)),
      el('div', { class: 'guide__side' }, progress, el('div', { class: 'guide__action' }, primaryBtn, reason)),
    ),
  );
  let labels: string[] = [];
  let current = 0;
  let onClick: (() => void) | null = null;

  const renderSteps = (): void => {
    clear(stepsEl);
    labels.forEach((label, i) => {
      stepsEl.appendChild(el('li', { class: `guide__step${i === current ? ' is-current' : i < current ? ' is-done' : ''}`, 'data-step': i + 1 },
        el('span', { class: 'guide__step-num' }, i < current ? icon('check', 'icon icon--sm') : document.createTextNode(String(i + 1))),
        el('span', { class: 'guide__step-label', text: label }),
      ));
    });
  };
  primaryBtn.addEventListener('click', () => {
    if (!primaryBtn.disabled) onClick?.();
  });

  return {
    root,
    get step() {
      return current;
    },
    setSteps(ls) {
      labels = ls;
      renderSteps();
    },
    setStep(i) {
      current = Math.max(0, Math.min(labels.length - 1, i));
      renderSteps();
    },
    instruct(text, prog) {
      instruction.textContent = text;
      if (!prog) progress.textContent = '';
      else if (typeof prog === 'string') progress.textContent = prog;
      else progress.textContent = `${prog.done}/${prog.total}${prog.unit ? ` ${prog.unit}` : ''}`;
      progress.hidden = !progress.textContent;
    },
    primary(p) {
      onClick = p.onClick;
      primaryBtn.hidden = Boolean(p.hidden);
      primaryBtn.textContent = p.label;
      primaryBtn.disabled = !p.enabled;
      primaryBtn.classList.toggle('is-ready', p.enabled);
      reason.textContent = p.enabled ? '' : (p.reason ?? '');
      reason.hidden = p.enabled || !p.reason || Boolean(p.hidden);
    },
  };
}
