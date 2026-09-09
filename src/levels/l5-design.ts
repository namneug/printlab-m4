/**
 * ด่าน 5 — ภารกิจออกแบบเต็มวงจร (EDP 5 ขั้น บังคับลำดับ ข้ามไม่ได้ วนรอบที่ 2 อย่างน้อย 1 ครั้ง)
 * โจทย์และเกณฑ์อยู่ใน src/data/mission.json · การจำลองผลใช้แบบจำลองด่าน 2 คูณ factor ของแบบร่าง
 * rubric 5 องค์ประกอบ 4 ระดับ ให้คะแนนจากพฤติกรรมในเกม (ไม่ใช่ประเมินตนเอง)
 */
import missionData from '../data/mission.json';
import { el, append, clear, fmtNum } from '../ui/dom';
import { icon } from '../ui/icons';
import type { LevelContext, LevelModule } from './context';
import { DEFAULT_PARAMS, PARAM_SPECS, simulatePrint, type PrintParams } from './l2-params.model';

interface Requirement { id: string; text: string; relevant: boolean }
interface DataCard { id: string; title: string; body: string; key?: string }
interface Sketch { id: string; name: string; desc: string; volume_factor: number; strength_factor: number; needs_tools: boolean; fits_25mm: boolean }
interface MissionMaterial { id: string; strength_factor: number; toughness: number; temp_range: [number, number]; max_safe_temp: number }
interface Reason { id: string; text: string; good_for: string[] }
interface ChangeReason { id: string; text: string; test: string | null }
interface Mission {
  title: string; scenario: string; requirements: Requirement[]; min_requirements: number;
  data_cards: DataCard[]; min_cards: number; measurement_question: { text: string; answer: number; unit: string };
  sketches: Sketch[]; materials: MissionMaterial[];
  tests: { load_min_kg: number; bump_min_toughness: number; time_max_min: number; material_max_g: number };
  design_reasons: Reason[]; change_reasons: ChangeReason[];
}
const M = missionData as unknown as Mission;

type TestId = 'load' | 'bump' | 'time' | 'material' | 'temp' | 'install';
const TEST_DEFS: { id: TestId; name: string }[] = [
  { id: 'load', name: `รับน้ำหนัก ≥ ${M.tests.load_min_kg} กก.` },
  { id: 'bump', name: 'ทนกระแทก (ความเหนียว ≥ 3/5)' },
  { id: 'time', name: `เวลาพิมพ์ ≤ ${M.tests.time_max_min} นาที` },
  { id: 'material', name: `เส้น ≤ ${M.tests.material_max_g} กรัม` },
  { id: 'temp', name: 'อุณหภูมิอยู่ในช่วงวัสดุ' },
  { id: 'install', name: 'ติดตั้งไม่ใช้เครื่องมือ' },
];

interface Round {
  round: number;
  sketch: string;
  material: string;
  params: PrintParams;
  reason: string;
  results?: { strength: number; time: number; material_g: number; toughness: number; tempOk: boolean; install: boolean; safety: boolean };
  tests?: Record<TestId, boolean>;
  passed?: number;
}

/** ด่าน 5 ให้ตั้งอุณหภูมิได้กว้างกว่าด่าน 2 เพราะมีวัสดุหลายชนิด (PETG/ABS ต้องใช้ 230–260 °C) */
const L5_PARAM_SPECS = PARAM_SPECS.map((s) => (s.key === 'nozzle_temp' ? { ...s, min: 180, max: 270, step: 10 } : s));

const STEP_NAMES = ['ระบุปัญหาและเงื่อนไข', 'รวบรวมข้อมูล', 'ออกแบบ', 'สร้างและทดสอบ', 'ปรับปรุงและนำเสนอ'];
const MAT_COLORS: Record<string, string> = { PLA: '#6cc08d', PETG: '#4fd6d2', ABS: '#f2a13f', TPU: '#8f7ae0' };

const SKETCH_SVG: Record<string, string> = {
  hook_clip: '<svg viewBox="0 0 160 100"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="20" y="30" width="80" height="14" fill="var(--panel-3)"/><path d="M100 30v-8h10v30h-10v-8"/><path d="M110 52c14 0 14 18 0 18"/></g></svg>',
  clamp_holder: '<svg viewBox="0 0 160 100"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="20" y="36" width="80" height="14" fill="var(--panel-3)"/><path d="M100 30h16v26h-16"/><path d="M116 30v-8h-24"/><path d="M116 56v10h-24"/><path d="M116 66c16 0 16 20 0 20"/><path d="M116 22c16 0 16 -14 0 -14" opacity="0.6"/></g></svg>',
  block_bracket: '<svg viewBox="0 0 160 100"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="20" y="36" width="80" height="14" fill="var(--panel-3)"/><rect x="100" y="14" width="36" height="58" fill="var(--panel-2)"/><circle cx="118" cy="26" r="4"/><circle cx="118" cy="60" r="4"/><path d="M136 40c18 0 18 24 0 24"/></g></svg>',
};

export const level: LevelModule = {
  mount(ctx: LevelContext) {
    const root = el('div', { class: 'l5' });
    ctx.root.appendChild(root);
    const st = {
      step: 1,
      done: new Set<number>(),
      round: 1,
      rounds: [] as Round[],
      reqs: new Set<string>(),
      cards: new Set<string>(),
      measureOk: false,
      measureAttempts: 0,
      skips: 0,
      stepStarted: Date.now(),
      stepTimes: {} as Record<string, number>,
      draft: { sketch: null as string | null, material: null as string | null, params: { ...DEFAULT_PARAMS }, reason: null as string | null },
      changeReason: null as string | null,
      changeReasonAttempts: 0,
      violations: 0,
    };
    ctx.mentor.setTrigger('general');
    const g = ctx.guide;
    g.setSteps(STEP_NAMES);
    ctx.defineTour([
      { target: '.edp-steps', title: 'แถบขั้นทั้ง 5', text: 'ด่านนี้มี 5 ขั้น ทำตามลำดับ ขั้นที่ทำอยู่มีขอบสีส้ม ขั้นที่ผ่านแล้วมีขอบสีเขียว กดขั้นที่ผ่านแล้วเพื่อกลับไปดูได้ แต่ข้ามไปขั้นข้างหน้าไม่ได้' },
      { target: '.l5 .stack', title: 'พื้นที่ของขั้นปัจจุบัน', text: 'เนื้อหาตรงนี้เปลี่ยนตามขั้น ทำตามหัวข้อที่มีตัวเลขวงกลม แล้วกดปุ่มสีส้มด้านล่างขวา (หรือปุ่มหลักในแถบนำทางด้านบน) เพื่อไปขั้นถัดไป' },
    ]);
    const setPrimary = (label: string, enabled: boolean, reason: string, onClick: () => void): void => g.primary({ label, enabled, reason, onClick });

    const stepsBar = el('div', { class: 'edp-steps' });
    const content = el('div', { class: 'stack' });
    append(root, stepsBar, content);

    function maxUnlocked(): number {
      let m = 1;
      for (let s = 1; s <= 5; s++) if (st.done.has(s)) m = s + 1;
      return Math.min(5, m);
    }

    function renderSteps(): void {
      clear(stepsBar);
      STEP_NAMES.forEach((name, i) => {
        const n = i + 1;
        const b = el('button', { class: `edp-step${n === st.step ? ' is-current' : ''}${st.done.has(n) ? ' is-done' : ''}${n > maxUnlocked() ? ' is-locked' : ''}`, type: 'button', 'data-step': n },
          el('span', { class: 'edp-step__num', text: `ขั้น ${n}` }), el('span', { class: 'edp-step__name', text: name }));
        b.addEventListener('click', () => goStep(n, true));
        stepsBar.appendChild(b);
      });
    }

    function goStep(n: number, byUser: boolean): void {
      if (byUser && n > maxUnlocked()) {
        st.skips++;
        const missing = STEP_NAMES.slice(maxUnlocked() - 1, n - 1).map((s, i) => `ขั้น ${maxUnlocked() + i} ${s}`).join(', ');
        ctx.track('edp_skip_blocked', { from: st.step, to: n, errorType: 'edp_skip' }, 'problem_solving');
        void ctx.mentor.explain('edp_skip', { step: n, missing });
        return;
      }
      st.stepTimes[`step${st.step}`] = (st.stepTimes[`step${st.step}`] ?? 0) + (Date.now() - st.stepStarted);
      st.stepStarted = Date.now();
      st.step = n;
      ctx.track('edp_step_enter', { step: n, round: st.round }, 'problem_solving');
      ctx.setStatus(`ขั้น ${n}/5 ${STEP_NAMES[n - 1] ?? ''} · รอบที่ ${st.round}`);
      g.setStep(n - 1);
      renderSteps();
      clear(content);
      if (n === 1) renderStep1();
      else if (n === 2) renderStep2();
      else if (n === 3) renderStep3();
      else if (n === 4) renderStep4();
      else renderStep5();
    }

    function completeStep(n: number): void {
      st.done.add(n);
      ctx.track('edp_step_complete', { step: n, round: st.round }, 'problem_solving');
      goStep(Math.min(5, n + 1), false);
    }

    function head(n: number, title: string, desc: string): HTMLElement {
      return el('div', { class: 'phase-head' }, el('span', { class: 'phase-head__num', text: String(n) }), el('div', {}, el('h2', { text: title }), el('p', { text: desc })), st.round > 1 && n >= 3 ? el('span', { class: 'round-badge', style: 'margin-left:auto' }, icon('refresh', 'icon icon--sm'), `รอบที่ ${st.round}`) : null);
    }

    /* ---------- ขั้น 1 ---------- */
    function renderStep1(): void {
      const list = el('div', { class: 'stack' });
      const guide1 = (): void => {
        const n = st.reqs.size;
        g.instruct('อ่านสถานการณ์ แล้วติ๊กเงื่อนไขที่คิดว่าชิ้นงานต้องผ่านจริง จากนั้นกดปุ่ม "ยืนยันเงื่อนไข"', `เลือกแล้ว ${n} ข้อ`);
        setPrimary('ยืนยันเงื่อนไข', n >= M.min_requirements, `ต้องเลือกอย่างน้อย ${M.min_requirements} ข้อ`, () => btn.click());
      };
      for (const r of M.requirements) {
        const input = el('input', { type: 'checkbox', class: 'checkbox', value: r.id, checked: st.reqs.has(r.id) }) as HTMLInputElement;
        input.addEventListener('change', () => {
          if (input.checked) st.reqs.add(r.id);
          else st.reqs.delete(r.id);
          guide1();
        });
        list.appendChild(el('label', { class: 'check', 'data-req': r.id }, input, el('span', { text: r.text })));
      }
      const btn = el('button', { class: 'btn btn--primary', type: 'button', id: 'l5-step1-ok' }, 'ยืนยันเงื่อนไข', icon('arrow-right'));
      guide1();
      btn.addEventListener('click', () => {
        const relevant = [...st.reqs].filter((id) => M.requirements.find((r) => r.id === id)?.relevant).length;
        const irrelevant = st.reqs.size - relevant;
        ctx.track('requirements_submit', { selected: [...st.reqs], relevant, irrelevant }, 'problem_solving');
        if (relevant < M.min_requirements) {
          void ctx.mentor.explain('requirements_short');
          return;
        }
        completeStep(1);
      });
      append(content,
        head(1, 'ระบุปัญหาและเงื่อนไข', 'อ่านสถานการณ์ แล้วเลือกเงื่อนไขที่ชิ้นงานต้องผ่านจริง ๆ (บางข้อไม่เกี่ยว)'),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('flag'), M.title), el('div', { class: 'panel__body' }, el('p', { text: M.scenario }))),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('list'), 'เงื่อนไขที่เกี่ยวข้อง'), el('div', { class: 'panel__body' }, list)),
        el('div', { class: 'row row--end' }, btn),
      );
    }

    /* ---------- ขั้น 2 ---------- */
    function renderStep2(): void {
      const grid = el('div', { class: 'cards' });
      for (const c of M.data_cards) {
        const body = el('p', { class: 'dcard__body', text: c.body, hidden: !st.cards.has(c.id) });
        const card = el('button', { class: `dcard${st.cards.has(c.id) ? ' is-open' : ''}`, type: 'button', 'data-card': c.id }, el('span', { class: 'dcard__title' }, icon('search'), el('span', { text: c.title })), body);
        card.addEventListener('click', () => {
          if (!st.cards.has(c.id)) {
            st.cards.add(c.id);
            ctx.track('data_card_open', { card: c.id, opened: st.cards.size }, 'problem_solving');
          }
          body.hidden = false;
          card.classList.add('is-open');
          guide2();
        });
        grid.appendChild(card);
      }
      const input = el('input', { class: 'input mono', type: 'number', id: 'l5-measure', placeholder: '?', style: 'max-width:140px' }) as HTMLInputElement;
      const fb = el('p', { class: 'help' });
      const btn = el('button', { class: 'btn btn--primary', type: 'button', id: 'l5-step2-ok' }, 'ยืนยันข้อมูล', icon('arrow-right'));
      function guide2(): void {
        const n = st.cards.size;
        g.instruct(`คลิกการ์ดข้อมูลเพื่อเปิดอ่าน (อย่างน้อย ${M.min_cards} ใบ) แล้วกรอกตัวเลขในช่องด้านล่าง จากนั้นกดปุ่ม "ยืนยันข้อมูล"`, `เปิดแล้ว ${n}/${M.min_cards} ใบ`);
        setPrimary('ยืนยันข้อมูล', n >= M.min_cards && input.value.trim() !== '', n < M.min_cards ? `เปิดการ์ดอีก ${M.min_cards - n} ใบ` : 'กรอกตัวเลขในช่องคำตอบ', () => btn.click());
      }
      input.addEventListener('input', guide2);
      guide2();
      btn.addEventListener('click', () => {
        st.measureAttempts++;
        st.measureOk = Number(input.value) === M.measurement_question.answer;
        ctx.track('measurement_answer', { value: input.value, correct: st.measureOk, cards: st.cards.size }, 'problem_solving');
        if (st.cards.size < M.min_cards || !st.measureOk) {
          fb.textContent = !st.measureOk ? 'ค่าที่กรอกยังไม่ตรงกับข้อมูลที่วัดได้ ลองเปิดการ์ดข้อมูลที่เกี่ยวกับโต๊ะ' : '';
          void ctx.mentor.explain('cards_short', { min: M.min_cards });
          return;
        }
        completeStep(2);
      });
      append(content,
        head(2, 'รวบรวมข้อมูล', `เปิดการ์ดข้อมูลอย่างน้อย ${M.min_cards} ใบ แล้วตอบคำถามวัดค่า`),
        grid,
        el('div', { class: 'panel' }, el('div', { class: 'panel__body row' }, el('label', { class: 'label', for: 'l5-measure', text: M.measurement_question.text }), input, el('span', { class: 'muted', text: M.measurement_question.unit }), fb)),
        el('div', { class: 'row row--end' }, btn),
      );
    }

    /* ---------- ขั้น 3 ---------- */
    function renderStep3(): void {
      const d = st.draft;
      const sketches = el('div', { class: 'sketches' });
      for (const s of M.sketches) {
        const b = el('button', { class: `sketch${d.sketch === s.id ? ' is-selected' : ''}`, type: 'button', 'data-sketch': s.id, html: SKETCH_SVG[s.id] ?? '' }, el('span', { class: 'sketch__name', text: s.name }), el('span', { class: 'sketch__desc', text: s.desc }));
        b.addEventListener('click', () => {
          d.sketch = s.id;
          sketches.querySelectorAll('.sketch').forEach((x) => x.classList.toggle('is-selected', x === b));
          guide3();
        });
        sketches.appendChild(b);
      }
      const mats = el('div', { class: 'mat-pills' });
      for (const m of M.materials) {
        const b = el('button', { class: `mat-pill${d.material === m.id ? ' is-selected' : ''}`, type: 'button', 'data-material': m.id, style: `--mat-color:${MAT_COLORS[m.id] ?? '#fff'}`, text: m.id });
        b.addEventListener('click', () => {
          d.material = m.id;
          mats.querySelectorAll('.mat-pill').forEach((x) => x.classList.toggle('is-selected', x === b));
          guide3();
        });
        mats.appendChild(b);
      }
      const sliders = el('div', { class: 'stack' });
      for (const spec of L5_PARAM_SPECS) {
        const input = el('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step, value: d.params[spec.key], id: `l5-${spec.key}`, 'aria-label': spec.label }) as HTMLInputElement;
        const val = el('span', { class: 'slider__value', text: `${d.params[spec.key]} ${spec.unit}` });
        input.addEventListener('input', () => {
          d.params = { ...d.params, [spec.key]: Number(input.value) };
          val.textContent = `${input.value} ${spec.unit}`;
        });
        sliders.appendChild(el('div', { class: 'slider' }, el('label', { class: 'slider__label', for: `l5-${spec.key}`, text: spec.label }), val, input));
      }
      const reasons = el('div', { class: 'stack' });
      for (const r of M.design_reasons) {
        const input = el('input', { type: 'radio', name: 'design-reason', value: r.id, class: 'checkbox', checked: d.reason === r.id }) as HTMLInputElement;
        input.addEventListener('change', () => {
          d.reason = r.id;
          guide3();
        });
        reasons.appendChild(el('label', { class: 'check' }, input, el('span', { text: r.text })));
      }
      const fb = el('div');
      const btn = el('button', { class: 'btn btn--primary', type: 'button', id: 'l5-step3-ok' }, 'ยืนยันแบบ แล้วไปสร้างและทดสอบ', icon('arrow-right'));
      function guide3(): void {
        const have = [d.sketch, d.material, d.reason].filter(Boolean).length;
        const missing = [!d.sketch && 'แบบร่าง', !d.material && 'วัสดุ', !d.reason && 'เหตุผล'].filter(Boolean).join(', ');
        g.instruct(st.round > 1 ? `รอบที่ ${st.round}: แก้แบบร่าง วัสดุ หรือสไลเดอร์อย่างน้อย 1 อย่างจากรอบก่อน แล้วกดปุ่ม "ยืนยันแบบ"` : 'คลิกเลือกแบบร่าง 1 แบบ วัสดุ 1 ชนิด ปรับสไลเดอร์ตามต้องการ แล้วติ๊กเหตุผล จากนั้นกดปุ่ม "ยืนยันแบบ"', `เลือกแล้ว ${have}/3 อย่าง`);
        setPrimary('ยืนยันแบบ แล้วไปทดสอบ', have === 3, `ยังไม่ได้เลือก: ${missing}`, () => btn.click());
      }
      guide3();
      btn.addEventListener('click', () => {
        clear(fb);
        if (!d.sketch || !d.material || !d.reason) {
          fb.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: 'เลือกแบบร่าง วัสดุ และเหตุผลให้ครบ' })));
          return;
        }
        const prev = st.rounds[st.rounds.length - 1];
        const same = prev && prev.sketch === d.sketch && prev.material === d.material && PARAM_SPECS.every((s) => prev.params[s.key] === d.params[s.key]);
        if (st.round > 1 && same) {
          ctx.track('no_change_round2', { round: st.round, errorType: 'no_change' }, 'problem_solving');
          void ctx.mentor.explain('no_change');
          void ctx.mentor.offer('no_change_round2');
          fb.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: 'รอบนี้ยังเหมือนรอบก่อนทุกอย่าง ผลทดสอบรอบก่อนบอกว่าอะไรควรแก้' })));
          return;
        }
        const round: Round = { round: st.round, sketch: d.sketch, material: d.material, params: { ...d.params }, reason: d.reason };
        if (st.rounds.length >= st.round) st.rounds[st.round - 1] = round;
        else st.rounds.push(round);
        ctx.track('design_submit', { round: st.round, sketch: d.sketch, material: d.material, params: d.params, reason: d.reason, changed: prev ? { sketch: prev.sketch !== d.sketch, material: prev.material !== d.material, params: !PARAM_SPECS.every((s) => prev.params[s.key] === d.params[s.key]) } : null }, 'problem_solving');
        completeStep(3);
      });
      append(content,
        head(3, 'ออกแบบ', 'เลือกแบบร่าง 1 จาก 3 วัสดุ และตั้งค่าการพิมพ์ พร้อมเหตุผลที่เลือกแบบนี้'),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('compass'), 'แบบร่าง'), el('div', { class: 'panel__body' }, sketches)),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('box'), 'วัสดุ'), el('div', { class: 'panel__body' }, mats)),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('layers'), 'พารามิเตอร์การพิมพ์'), el('div', { class: 'panel__body' }, sliders)),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('info'), 'เหตุผลที่เลือกแบบนี้'), el('div', { class: 'panel__body' }, reasons)),
        fb,
        el('div', { class: 'row row--end' }, btn),
      );
    }

    /* ---------- ขั้น 4 ---------- */
    function evaluate(r: Round): void {
      const sk = M.sketches.find((s) => s.id === r.sketch) as Sketch;
      const mat = M.materials.find((m) => m.id === r.material) as MissionMaterial;
      // แปลงอุณหภูมิให้สัมพัทธ์กับช่วงแนะนำของวัสดุ ก่อนส่งเข้าแบบจำลองด่าน 2 (ซึ่งปรับเทียบกับ PLA 190–230 °C)
      const [lo, hi] = mat.temp_range;
      const rel = 190 + ((r.params.nozzle_temp - lo) / (hi - lo)) * 40;
      const base = simulatePrint({ ...r.params, nozzle_temp: Math.max(190, Math.min(230, rel)) });
      const strength = Math.round(base.strength_kg * sk.strength_factor * mat.strength_factor * 100) / 100;
      const time = Math.round(base.print_time_min * sk.volume_factor);
      const material_g = Math.round(base.material_g * sk.volume_factor * 10) / 10;
      const t = r.params.nozzle_temp;
      const tempOk = t >= mat.temp_range[0] && t <= mat.temp_range[1];
      const safety = t > mat.max_safe_temp;
      const tests: Record<TestId, boolean> = {
        load: strength >= M.tests.load_min_kg,
        bump: mat.toughness >= M.tests.bump_min_toughness,
        time: time <= M.tests.time_max_min,
        material: material_g <= M.tests.material_max_g,
        temp: tempOk && !safety,
        install: !sk.needs_tools,
      };
      r.results = { strength, time, material_g, toughness: mat.toughness, tempOk, install: !sk.needs_tools, safety };
      r.tests = tests;
      r.passed = Object.values(tests).filter(Boolean).length;
    }

    function renderStep4(): void {
      const r = st.rounds[st.round - 1];
      if (!r) {
        goStep(3, false);
        return;
      }
      const grid = el('div', { class: 'test-grid' });
      const fb = el('div');
      const runBtn = el('button', { class: 'btn btn--primary btn--lg', type: 'button', id: 'l5-run-test' }, icon('play'), 'สร้างและทดสอบ (จำลอง)');
      const nextBtn = el('button', { class: 'btn btn--cyan', type: 'button', id: 'l5-step4-ok', hidden: true }, 'ไปขั้น 5: ปรับปรุงและนำเสนอ', icon('arrow-right'));
      const show = (): void => {
        clear(grid);
        const res = r.results;
        const tests = r.tests;
        if (!res || !tests) return;
        const vals: Record<TestId, string> = {
          load: `${fmtNum(res.strength, 2)} กก.`,
          bump: `ความเหนียว ${res.toughness}/5`,
          time: `${res.time} นาที`,
          material: `${fmtNum(res.material_g, 1)} กรัม`,
          temp: res.safety ? `${r.params.nozzle_temp} °C เกินพิกัด` : `${r.params.nozzle_temp} °C`,
          install: res.install ? 'ไม่ต้องใช้เครื่องมือ' : 'ต้องขันสกรู',
        };
        for (const t of TEST_DEFS) {
          const ok = tests[t.id];
          grid.appendChild(el('div', { class: `test-card ${ok ? 'is-pass' : 'is-fail'}`, 'data-test': t.id },
            el('span', { class: 'test-card__name', text: t.name }), el('span', { class: 'test-card__val mono', text: vals[t.id] }),
            el('span', { class: 'test-card__verdict' }, icon(ok ? 'check' : 'x'), el('span', { text: ok ? 'ผ่าน' : 'ไม่ผ่าน' }))));
        }
      };
      const guide4 = (): void => {
        if (r.results) {
          g.instruct('ดูผลการทดสอบทั้ง 6 ใบ (เขียว = ผ่าน แดง = ไม่ผ่าน) แล้วกดปุ่ม "ไปขั้น 5"', `ผ่าน ${r.passed ?? 0}/6`);
          setPrimary('ไปขั้น 5: ปรับปรุงและนำเสนอ', true, '', () => nextBtn.click());
        } else {
          g.instruct('กดปุ่ม "สร้างและทดสอบ" เพื่อจำลองการพิมพ์และดูผลการทดสอบ 6 อย่าง', `รอบที่ ${r.round}`);
          setPrimary('สร้างและทดสอบ (จำลอง)', true, '', () => runBtn.click());
        }
      };
      if (r.results) {
        show();
        runBtn.hidden = true;
        nextBtn.hidden = false;
      }
      guide4();
      runBtn.addEventListener('click', () => {
        evaluate(r);
        if (r.results?.safety) {
          st.violations++;
          ctx.track('safety_violation', { round: r.round, type: 'over_temp', temp: r.params.nozzle_temp, material: r.material, errorType: 'over_temp' }, 'safety');
          ctx.mentor.safety('over_temp');
        }
        ctx.track('design_test', { round: r.round, results: r.results, tests: r.tests, passed: r.passed, sketch: r.sketch, material: r.material }, 'problem_solving');
        show();
        runBtn.hidden = true;
        nextBtn.hidden = false;
        guide4();
        ctx.mentor.say(`รอบที่ ${r.round}: ผ่าน ${r.passed}/6 การทดสอบ ${r.passed === 6 ? 'ผ่านหมดแล้ว แต่กระบวนการยังต้องมีรอบปรับปรุงเพื่อยืนยันว่าแบบนี้ดีที่สุดจริง' : 'ดูว่าข้อที่ไม่ผ่านเกี่ยวกับแบบ วัสดุ หรือการตั้งค่า'}`, 'feed_back');
      });
      nextBtn.addEventListener('click', () => completeStep(4));
      append(content,
        head(4, 'สร้างและทดสอบ', 'ระบบจำลองการพิมพ์และการทดสอบ 6 อย่างจากแบบที่คุณเลือก'),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('beaker'), `${M.sketches.find((s) => s.id === r.sketch)?.name ?? ''} · ${r.material} · ชั้น ${r.params.layer_height} มม. · infill ${r.params.infill}% · ${r.params.speed} มม./วิ · ${r.params.nozzle_temp} °C`), el('div', { class: 'panel__body stack' }, grid, fb, el('div', { class: 'row' }, runBtn, nextBtn))),
      );
    }

    /* ---------- ขั้น 5 ---------- */
    function renderStep5(): void {
      const last = st.rounds[st.rounds.length - 1];
      if (!last?.tests) {
        goStep(4, false);
        return;
      }
      const first = st.rounds[0] as Round;
      const failedFirst = TEST_DEFS.filter((t) => first.tests && !first.tests[t.id]);
      const summary = el('div', { class: 'stack' });
      for (const r of st.rounds) {
        summary.appendChild(el('p', {}, el('strong', { text: `รอบที่ ${r.round}: ` }), `${M.sketches.find((s) => s.id === r.sketch)?.name ?? ''} · ${r.material} · ผ่าน ${r.passed}/6` + (r.tests ? ` (ไม่ผ่าน: ${TEST_DEFS.filter((t) => !r.tests?.[t.id]).map((t) => t.name).join(', ') || 'ไม่มี'})` : '')));
      }
      const iterateBtn = el('button', { class: 'btn btn--primary', type: 'button', id: 'l5-iterate' }, icon('refresh'), `ปรับปรุง: เริ่มรอบที่ ${st.round + 1}`);
      iterateBtn.addEventListener('click', () => {
        ctx.track('iteration_start', { round: st.round + 1, failedBefore: TEST_DEFS.filter((t) => !last.tests?.[t.id]).map((t) => t.id) }, 'problem_solving');
        st.round++;
        st.done.delete(3);
        st.done.delete(4);
        st.done.delete(5);
        goStep(3, false);
      });
      append(content, head(5, 'ปรับปรุงและนำเสนอ', st.rounds.length < 2 ? 'ผลทดสอบรอบแรกคือข้อมูลสำหรับรอบถัดไป กระบวนการนี้ต้องวนอย่างน้อย 2 รอบ' : 'อธิบายว่าเปลี่ยนอะไรเพราะอะไร แล้วนำเสนอด้วยหลักฐานจากการทดสอบของคุณ'),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('chart'), 'ผลทดสอบทุกรอบ'), el('div', { class: 'panel__body' }, summary)));
      if (st.rounds.length < 2) {
        append(content, el('div', { class: 'notice' }, icon('info'), el('p', { text: 'ยังนำเสนอไม่ได้ ต้องปรับปรุงและทดสอบอีกอย่างน้อย 1 รอบ (แม้รอบแรกจะผ่านหมด ก็ลองปรับให้ประหยัดหรือเร็วขึ้น)' })), el('div', { class: 'row row--end' }, iterateBtn));
        g.instruct('ดูผลรอบแรก แล้วกดปุ่ม "ปรับปรุง: เริ่มรอบที่ 2" เพื่อกลับไปแก้แบบในขั้น 3', `รอบที่ ${st.rounds.length}`);
        setPrimary(`ปรับปรุง: เริ่มรอบที่ ${st.round + 1}`, true, '', () => iterateBtn.click());
        return;
      }
      /* เหตุผลการเปลี่ยน */
      const reasons = el('div', { class: 'stack' });
      for (const r of M.change_reasons) {
        const input = el('input', { type: 'radio', name: 'change-reason', value: r.id, class: 'checkbox', checked: st.changeReason === r.id }) as HTMLInputElement;
        input.addEventListener('change', () => (st.changeReason = r.id));
        reasons.appendChild(el('label', { class: 'check' }, input, el('span', { text: r.text })));
      }
      /* การนำเสนอ */
      const stmts: { id: string; text: string; own: boolean }[] = [
        { id: 'problem', text: `ปัญหา: ${M.title} — สายชาร์จบนพื้นทำให้สะดุด ต้องเกี่ยวขอบโต๊ะ 25 มม. โดยไม่เจาะ`, own: false },
        { id: 'solution', text: `แนวทาง: ${M.sketches.find((s) => s.id === last.sketch)?.name ?? ''} วัสดุ ${last.material}`, own: false },
        ...st.rounds.map((r) => ({ id: `ev-${r.round}`, text: `หลักฐานรอบ ${r.round}: รับน้ำหนัก ${fmtNum(r.results?.strength ?? 0, 2)} กก. เวลา ${r.results?.time ?? 0} นาที เส้น ${fmtNum(r.results?.material_g ?? 0, 1)} กรัม ผ่าน ${r.passed}/6`, own: true })),
        { id: 'change', text: `การเปลี่ยนจากรอบ 1 → ${st.rounds.length}: ${describeChange(first, last)}`, own: true },
        { id: 'gen1', text: 'แบบนี้สวยที่สุดในสามแบบ', own: false },
        { id: 'gen2', text: 'เพื่อน ๆ บอกว่าชอบ', own: false },
      ];
      const stmtList = el('div', { class: 'stack' });
      const fb = el('div');
      const presentBtn = el('button', { class: 'btn btn--cyan btn--lg', type: 'button', id: 'l5-present' }, icon('flag'), 'นำเสนอและจบภารกิจ');
      const guide5 = (): void => {
        const n = stmtList.querySelectorAll('input:checked').length;
        g.instruct('เลือกเหตุผลของการเปลี่ยน 1 ข้อ ติ๊กข้อความนำเสนออย่างน้อย 3 ข้อ (ต้องมีแถบสีฟ้า) แล้วกดปุ่ม "นำเสนอและจบภารกิจ"', `ติ๊กแล้ว ${n}/3 ข้อ`);
        setPrimary('นำเสนอและจบภารกิจ', Boolean(st.changeReason) && n >= 3, !st.changeReason ? 'เลือกเหตุผลของการเปลี่ยน 1 ข้อ' : `ติ๊กข้อความนำเสนออีก ${3 - n} ข้อ`, () => presentBtn.click());
      };
      for (const s of stmts) {
        const cb = el('input', { type: 'checkbox', name: 'stmt', value: s.id });
        cb.addEventListener('change', guide5);
        stmtList.appendChild(el('label', { class: `stmt${s.own ? ' is-own' : ''}` }, cb, el('span', { text: s.text })));
      }
      for (const inp of reasons.querySelectorAll('input')) inp.addEventListener('change', guide5);
      guide5();
      presentBtn.addEventListener('click', () => {
        clear(fb);
        const reason = M.change_reasons.find((r) => r.id === st.changeReason);
        if (!reason) {
          fb.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: 'เลือกเหตุผลของการเปลี่ยนแปลงก่อน' })));
          return;
        }
        st.changeReasonAttempts++;
        const reasonMatches = failedFirst.length === 0 ? reason.test !== null : failedFirst.some((t) => t.id === reason.test);
        ctx.track('change_reason', { reason: reason.id, matches: reasonMatches, failedFirst: failedFirst.map((t) => t.id) }, 'problem_solving');
        if (!reasonMatches && st.changeReasonAttempts < 2) {
          void ctx.mentor.explain('reason_mismatch');
          fb.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: 'เหตุผลยังไม่ตรงกับผลทดสอบรอบแรก ลองดูว่าข้อไหนไม่ผ่าน' })));
          return;
        }
        const chosen = [...stmtList.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value);
        const ownCount = chosen.filter((id) => stmts.find((s) => s.id === id)?.own).length;
        ctx.track('presentation_submit', { statements: chosen, ownEvidence: ownCount }, 'problem_solving');
        if (chosen.length < 3 || ownCount === 0) {
          void ctx.mentor.explain('presentation_no_evidence');
          fb.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: 'เลือกอย่างน้อย 3 ข้อ และต้องมีหลักฐานจากผลทดสอบของคุณเอง (แถบสีฟ้า) อย่างน้อย 1 ข้อ' })));
          return;
        }
        finish(reason, reasonMatches, chosen, ownCount);
      });
      append(content,
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('refresh'), 'เปลี่ยนอะไร เพราะอะไร'), el('div', { class: 'panel__body' }, reasons)),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('flag'), 'เลือกข้อความสำหรับนำเสนอ (อย่างน้อย 3 ข้อ มีหลักฐานของคุณเอง)'), el('div', { class: 'panel__body' }, stmtList)),
        fb,
        el('div', { class: 'row row--end' }, iterateBtn, presentBtn),
      );
    }

    function describeChange(a: Round, b: Round): string {
      const parts: string[] = [];
      if (a.sketch !== b.sketch) parts.push(`เปลี่ยนแบบเป็น ${M.sketches.find((s) => s.id === b.sketch)?.name ?? b.sketch}`);
      if (a.material !== b.material) parts.push(`เปลี่ยนวัสดุ ${a.material} → ${b.material}`);
      for (const s of PARAM_SPECS) if (a.params[s.key] !== b.params[s.key]) parts.push(`${s.label} ${a.params[s.key]} → ${b.params[s.key]} ${s.unit}`);
      return parts.join(', ') || 'ไม่มีการเปลี่ยนแปลง';
    }

    /* ---------- rubric จากพฤติกรรม ---------- */
    function finish(reason: ChangeReason, reasonMatches: boolean, statements: string[], ownCount: number): void {
      const first = st.rounds[0] as Round;
      const last = st.rounds[st.rounds.length - 1] as Round;
      const relevant = [...st.reqs].filter((id) => M.requirements.find((r) => r.id === id)?.relevant).length;
      const irrelevant = st.reqs.size - relevant;
      const lvl = (v: number): number => Math.max(1, Math.min(4, v));
      const problem = relevant >= 4 && irrelevant === 0 ? 4 : relevant >= 3 && irrelevant <= 1 ? 3 : relevant >= 2 ? 2 : 1;
      const info = st.cards.size >= 4 && st.measureAttempts === 1 ? 4 : st.cards.size >= 3 ? 3 : st.cards.size >= 2 ? 2 : 1;
      const sk = M.sketches.find((s) => s.id === last.sketch) as Sketch;
      const reasonGood = M.design_reasons.find((r) => r.id === last.reason)?.good_for.includes(last.sketch) ?? false;
      const fits = !sk.needs_tools && sk.fits_25mm;
      const design = fits && reasonGood && (last.passed ?? 0) === 6 ? 4 : fits && reasonGood ? 3 : fits ? 2 : 1;
      const test = (last.passed ?? 0) === 6 && st.rounds.length >= 2 ? 4 : last.tests?.load ? 3 : 2;
      const changed = describeChange(first, last) !== 'ไม่มีการเปลี่ยนแปลง';
      const improve = changed && reasonMatches && ownCount >= 1 ? 4 : changed && reasonMatches ? 3 : changed ? 2 : 1;
      const rubric = { problem: lvl(problem), info: lvl(info), design: lvl(design), test: lvl(test), improve: lvl(improve) };
      st.stepTimes[`step${st.step}`] = (st.stepTimes[`step${st.step}`] ?? 0) + (Date.now() - st.stepStarted);
      ctx.complete(
        {
          edp_rubric: rubric,
          edp_rubric_total: Object.values(rubric).reduce((a, b) => a + b, 0),
          iterations: st.rounds.length,
          changed_after_test: changed,
          change_reason: reason.id,
          change_reason_matches_test: reasonMatches,
          requirements_relevant: relevant,
          requirements_irrelevant: irrelevant,
          data_cards_opened: st.cards.size,
          measurement_attempts: st.measureAttempts,
          skip_attempts: st.skips,
          safety_violations: st.violations,
          presentation_statements: statements,
          presentation_own_evidence: ownCount,
          rounds: st.rounds.map((r) => ({ round: r.round, sketch: r.sketch, material: r.material, params: r.params, time: r.results?.time ?? 0, material_g: r.results?.material_g ?? 0, strength: r.results?.strength ?? 0, passed: r.passed ?? 0, tests: r.tests })),
          step_times_ms: st.stepTimes,
        },
        {
          reqs: relevant,
          cards: st.cards.size,
          iterations: st.rounds.length,
          r1_pass: first.passed ?? 0,
          final_pass: last.passed ?? 0,
          changed: changed ? `คือ ${describeChange(first, last)}` : 'ไม่มี',
          skips: st.skips,
        },
      );
    }

    goStep(1, false);
    return () => root.remove();
  },
};
