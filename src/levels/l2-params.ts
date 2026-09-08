/**
 * ด่าน 2 — ห้องปฏิบัติการพารามิเตอร์ (Parameter Lab)
 * ปรับตัวแปร 4 ตัว → ทดลองพิมพ์ (deterministic) → ผ่านเงื่อนไข 3 ข้อพร้อมกัน
 * หัวใจของการวัด: จำนวนตัวแปรที่เปลี่ยนต่อรอบ (การควบคุมตัวแปร)
 */
import { el, append, clear, fmtNum } from '../ui/dom';
import { icon } from '../ui/icons';
import type { LevelContext, LevelModule } from './context';
import {
  CONSTRAINTS, DEFAULT_PARAMS, PARAM_SPECS, changedKeys, checkConstraints, qualityLabel, simulatePrint,
  type ConstraintCheck, type PrintParams, type PrintResult,
} from './l2-params.model';

const SHORT: Record<keyof PrintParams, string> = { layer_height: 'ชั้น', infill: 'infill', speed: 'เร็ว', nozzle_temp: '°C' };

interface Trial {
  round: number;
  params: PrintParams;
  changed: (keyof PrintParams)[];
  result: PrintResult;
  check: ConstraintCheck;
}

const CONSTRAINT_DEFS = [
  { id: 'strength', label: `แรงรับน้ำหนัก ≥ ${CONSTRAINTS.strength_min_kg} กก.`, short: 'แรง' },
  { id: 'time', label: `เวลาพิมพ์ ≤ ${CONSTRAINTS.time_max_min} นาที`, short: 'เวลา' },
  { id: 'material', label: `วัสดุ ≤ ${CONSTRAINTS.material_max_g} กรัม`, short: 'วัสดุ' },
] as const;
type ConstraintId = (typeof CONSTRAINT_DEFS)[number]['id'];

export const level: LevelModule = {
  mount(ctx: LevelContext) {
    const root = el('div', { class: 'l2' });
    ctx.root.appendChild(root);
    const trials: Trial[] = [];
    let priority: ConstraintId[] = ['strength', 'time', 'material'];
    let params: PrintParams = { ...DEFAULT_PARAMS };
    let lastRun: PrintParams | null = null;
    let converged = false;
    const timers: number[] = [];

    /* ========== ขั้น 0: จัดลำดับความสำคัญของเงื่อนไข ========== */
    function showPriority(): void {
      clear(root);
      ctx.mentor.setTrigger('general');
      ctx.setStatus('จัดลำดับความสำคัญของเงื่อนไขก่อนเริ่มทดลอง');
      const list = el('div', { class: 'priority__list' });
      const render = (): void => {
        clear(list);
        priority.forEach((id, i) => {
          const def = CONSTRAINT_DEFS.find((c) => c.id === id);
          if (!def) return;
          const up = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': 'เลื่อนขึ้น', disabled: i === 0 }, icon('arrow-left', 'icon icon--sm'));
          up.style.transform = 'rotate(90deg)';
          const down = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': 'เลื่อนลง', disabled: i === priority.length - 1 }, icon('arrow-left', 'icon icon--sm'));
          down.style.transform = 'rotate(-90deg)';
          up.addEventListener('click', () => {
            [priority[i - 1], priority[i]] = [priority[i] as ConstraintId, priority[i - 1] as ConstraintId];
            render();
          });
          down.addEventListener('click', () => {
            [priority[i + 1], priority[i]] = [priority[i] as ConstraintId, priority[i + 1] as ConstraintId];
            render();
          });
          list.appendChild(el('div', { class: 'priority__item', 'data-id': id }, el('span', { class: 'priority__rank', text: String(i + 1) }), el('span', { text: def.label }), el('span', { class: 'spacer' }), up, down));
        });
      };
      render();
      const confirm = el('button', { class: 'btn btn--primary', type: 'button', id: 'l2-priority-ok' }, 'ยืนยันลำดับ แล้วเข้าห้องแล็บ', icon('arrow-right'));
      confirm.addEventListener('click', () => {
        ctx.track('constraint_priority', { order: [...priority] }, 'problem_solving');
        showLab();
      });
      append(root,
        el('div', { class: 'intro__card', style: 'max-width:720px;margin:0 auto' },
          el('div', { class: 'phase-head' }, el('span', { class: 'phase-head__num', text: '0' }), el('div', {}, el('h2', { text: 'ถ้าผ่านครบทั้ง 3 ข้อไม่ได้ในทันที คุณจะยอมเสียข้อไหนก่อน' }), el('p', { text: 'จัดลำดับจากสำคัญที่สุด (1) ไปน้อยที่สุด (3) ลำดับนี้จะช่วยคุณตัดสินใจเมื่อเจอการแลกได้แลกเสีย' }))),
          el('div', { class: 'priority' }, list),
          el('p', { class: 'muted small', text: 'โจทย์: ขอยึดสายชาร์จข้างโต๊ะเรียน ต้องรับน้ำหนักได้ ≥ 2.0 กก. พิมพ์เสร็จใน ≤ 90 นาที และใช้เส้นพลาสติก ≤ 25 กรัม' }),
          el('div', { class: 'row row--end' }, confirm),
        ),
      );
    }

    /* ========== ขั้น 1: ห้องแล็บ ========== */
    const sliderEls = new Map<keyof PrintParams, { wrap: HTMLElement; input: HTMLInputElement; value: HTMLElement }>();
    const resultsEl = el('div', { class: 'results' });
    const trialsBody = el('tbody');
    const xsec = el('div');
    const statusRow = el('div', { class: 'constraints' });
    const runBtn = el('button', { class: 'btn btn--primary btn--lg', type: 'button', id: 'l2-run' }, icon('play'), 'ทดลองพิมพ์');
    const finishWrap = el('div', { class: 'row row--end', hidden: true });

    function showLab(): void {
      clear(root);
      ctx.setStatus('รอบทดลองที่ 1 — ตั้งค่าแล้วกดทดลองพิมพ์');
      const left = el('div', { class: 'stack' });
      const right = el('div', { class: 'stack' });
      for (const spec of PARAM_SPECS) {
        const input = el('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step, value: params[spec.key], id: `l2-${spec.key}`, 'aria-label': spec.label }) as HTMLInputElement;
        const value = el('span', { class: 'slider__value' });
        const wrap = el('div', { class: 'slider' },
          el('label', { class: 'slider__label', for: `l2-${spec.key}`, text: spec.label }),
          value,
          input,
          el('div', { class: 'slider__range' }, el('span', { text: `${spec.min}` }), el('span', { text: `${spec.max} ${spec.unit}` })),
        );
        input.addEventListener('input', () => {
          params = { ...params, [spec.key]: Number(input.value) };
          refreshSliders();
        });
        sliderEls.set(spec.key, { wrap, input, value });
        left.appendChild(wrap);
      }
      refreshSliders();
      renderXsec();
      append(left, el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('layers'), 'ภาพตัดขวางชิ้นงาน (ตามค่าที่ตั้ง)'), el('div', { class: 'panel__body' }, xsec)), runBtn);

      append(right,
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('target'), 'เงื่อนไขที่ต้องผ่านพร้อมกัน'), el('div', { class: 'panel__body' }, statusRow)),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('chart'), 'ผลการพิมพ์รอบล่าสุด'), el('div', { class: 'panel__body' }, resultsEl)),
        finishWrap,
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('list'), 'บันทึกรอบทดลอง'), el('div', { class: 'table-wrap panel__body' }, el('table', { class: 'table trials' },
          el('thead', {}, el('tr', {}, el('th', { text: 'รอบ' }), el('th', { text: 'เปลี่ยน' }), el('th', { class: 'num', text: 'ชั้น' }), el('th', { class: 'num', text: 'infill' }), el('th', { class: 'num', text: 'เร็ว' }), el('th', { class: 'num', text: '°C' }), el('th', { class: 'num', text: 'แรง' }), el('th', { class: 'num', text: 'นาที' }), el('th', { class: 'num', text: 'กรัม' }), el('th', { text: 'ผ่าน' }))),
          trialsBody,
        ))),
      );
      renderConstraints(null);
      renderResults(null, null);
      runBtn.addEventListener('click', runTrial);
      root.appendChild(el('div', { class: 'lab' }, left, right));
      ctx.mentor.say('ค่าเริ่มต้นที่ให้มายังไม่ผ่านเงื่อนไข ลองเปลี่ยนทีละตัวเพื่อดูว่าอะไรส่งผลต่ออะไร', 'feed_forward');
    }

    function refreshSliders(): void {
      for (const spec of PARAM_SPECS) {
        const s = sliderEls.get(spec.key);
        if (!s) continue;
        const v = params[spec.key];
        s.value.replaceChildren(document.createTextNode(spec.key === 'layer_height' ? v.toFixed(2) : String(v)), el('span', { class: 'slider__unit', text: spec.unit }));
        s.wrap.classList.toggle('is-changed', lastRun !== null && Math.abs(lastRun[spec.key] - v) > 1e-9);
      }
      renderXsec();
    }

    function renderXsec(): void {
      const W = 320;
      const H = 150;
      const lhPx = 3 + ((params.layer_height - 0.12) / 0.2) * 9;
      const gap = 6 + (1 - (params.infill - 10) / 70) * 30;
      const wobble = ((params.speed - 30) / 70) * 1.6;
      const t = (params.nozzle_temp - 190) / 40;
      const color = `color-mix(in srgb, var(--amber) ${Math.round(40 + t * 60)}%, var(--red) ${Math.round(t * 40)}%)`;
      let layers = '';
      for (let y = 12; y < H - 12; y += lhPx) {
        const w = wobble ? ` translate(${((y / lhPx) % 2 ? 1 : -1) * wobble} 0)` : '';
        layers += `<line x1="16" y1="${y}" x2="${W - 16}" y2="${y}" stroke="var(--line)" stroke-width="1" transform="${w.trim()}"/>`;
      }
      let hatch = '';
      for (let x = -H; x < W; x += gap) {
        hatch += `<line x1="${x}" y1="${H - 12}" x2="${x + H}" y2="12" stroke="${color}" stroke-width="1.5" opacity="0.8"/>`;
      }
      xsec.innerHTML = `<svg class="xsec" viewBox="0 0 ${W} ${H}" role="img" aria-label="ภาพตัดขวางชิ้นงาน">
        <defs><clipPath id="l2clip"><rect x="16" y="12" width="${W - 32}" height="${H - 24}"/></clipPath></defs>
        <g clip-path="url(#l2clip)">${hatch}${layers}</g>
        <rect x="16" y="12" width="${W - 32}" height="${H - 24}" fill="none" stroke="${color}" stroke-width="5"/>
        <text x="${W / 2}" y="${H - 2}" text-anchor="middle" font-size="9" fill="var(--tx-dim)" font-family="var(--font-display)">ผนัง 2 ชั้น · ภายใน ${params.infill}% · ชั้นละ ${params.layer_height.toFixed(2)} มม.</text>
      </svg>`;
    }

    function renderConstraints(check: ConstraintCheck | null): void {
      clear(statusRow);
      for (const c of CONSTRAINT_DEFS) {
        const state = check ? check[c.id] : null;
        statusRow.appendChild(el('span', { class: `chip ${state === null ? 'chip--muted' : state ? 'chip--green' : 'chip--red'}` }, icon(state === null ? 'target' : state ? 'check' : 'x'), el('span', { text: c.label })));
      }
    }

    function renderResults(r: PrintResult | null, prev: PrintResult | null): void {
      clear(resultsEl);
      if (!r) {
        resultsEl.appendChild(el('p', { class: 'muted', text: 'ยังไม่มีผล กดทดลองพิมพ์เพื่อดูผลลัพธ์ 4 อย่างจากค่าที่ตั้ง' }));
        return;
      }
      const check = checkConstraints(r);
      const delta = (cur: number, before: number | null, digits: number, goodWhenUp: boolean): HTMLElement => {
        if (before === null) return el('span', { class: 'delta delta--flat', text: 'รอบแรก' });
        const d = cur - before;
        if (Math.abs(d) < 1e-9) return el('span', { class: 'delta delta--flat', text: 'เท่าเดิม' });
        const good = goodWhenUp ? d > 0 : d < 0;
        return el('span', { class: `delta ${good ? 'delta--up' : 'delta--down'}`, text: `${d > 0 ? '+' : ''}${fmtNum(d, digits)} จากรอบก่อน` });
      };
      const card = (label: string, ic: 'zap' | 'clock' | 'box' | 'layers', value: string, unit: string, pass: boolean | null, extra: HTMLElement): HTMLElement =>
        el('div', { class: `result ${pass === null ? 'result--info' : pass ? 'result--pass' : 'result--fail'}` },
          el('span', { class: 'result__label' }, icon(ic), el('span', { text: label })),
          el('span', { class: 'result__value mono' }, value, el('small', { text: unit })),
          pass === null ? extra : el('span', { class: 'result__check' }, icon(pass ? 'check' : 'x'), el('span', { text: pass ? 'ผ่านเงื่อนไข' : 'ยังไม่ผ่าน' }), extra),
        );
      append(resultsEl,
        card('แรงรับน้ำหนัก', 'zap', fmtNum(r.strength_kg, 2), 'กก.', check.strength, delta(r.strength_kg, prev?.strength_kg ?? null, 2, true)),
        card('เวลาพิมพ์', 'clock', fmtNum(r.print_time_min, 0), 'นาที', check.time, delta(r.print_time_min, prev?.print_time_min ?? null, 0, false)),
        card('วัสดุที่ใช้', 'box', fmtNum(r.material_g, 1), 'กรัม', check.material, delta(r.material_g, prev?.material_g ?? null, 1, false)),
        card('คุณภาพผิว', 'layers', String(r.surface_quality), `/100 · ${qualityLabel(r.surface_quality)}`, null, delta(r.surface_quality, prev?.surface_quality ?? null, 0, true)),
      );
    }

    function runTrial(): void {
      const changed = changedKeys(lastRun, params);
      const result = simulatePrint(params);
      const check = checkConstraints(result);
      const trial: Trial = { round: trials.length + 1, params: { ...params }, changed, result, check };
      const prev = trials[trials.length - 1] ?? null;
      trials.push(trial);
      lastRun = { ...params };
      ctx.track('trial_run', {
        round: trial.round,
        params: trial.params,
        changed,
        changedCount: changed.length,
        result,
        constraints: { strength: check.strength, time: check.time, material: check.material },
        passed: check.passed,
        converged: check.all,
      }, 'problem_solving');

      renderResults(result, prev?.result ?? null);
      renderConstraints(check);
      refreshSliders();
      const tr = el('tr', { class: check.all ? 'is-pass' : '' },
        el('td', { class: 'mono', text: String(trial.round) }),
        el('td', { title: changed.map((k) => PARAM_SPECS.find((s) => s.key === k)?.label ?? k).join(', ') }, el('span', { class: `changed${changed.length >= 2 ? ' changed--many' : ''}`, text: trial.round === 1 ? 'ตั้งต้น' : changed.length === 0 ? 'ไม่เปลี่ยน' : `${changed.length} ตัว` }), changed.length ? el('span', { class: 'muted small', text: ` ${changed.map((k) => SHORT[k]).join('+')}` }) : null),
        el('td', { class: 'num', text: trial.params.layer_height.toFixed(2) }),
        el('td', { class: 'num', text: `${trial.params.infill}%` }),
        el('td', { class: 'num', text: String(trial.params.speed) }),
        el('td', { class: 'num', text: String(trial.params.nozzle_temp) }),
        el('td', { class: `num ${check.strength ? '' : 'error'}`, text: fmtNum(result.strength_kg, 2) }),
        el('td', { class: `num ${check.time ? '' : 'error'}`, text: fmtNum(result.print_time_min, 0) }),
        el('td', { class: `num ${check.material ? '' : 'error'}`, text: fmtNum(result.material_g, 1) }),
        el('td', { class: 'mono', text: `${check.passed}/3` }),
      );
      trialsBody.prepend(tr);
      ctx.setStatus(`รอบทดลองที่ ${trial.round}: ผ่าน ${check.passed}/3 ข้อ`);

      if (check.all && !converged) {
        converged = true;
        ctx.track('converged', { round: trial.round, params: trial.params }, 'problem_solving');
        ctx.mentor.say(`ผ่านครบทั้ง 3 ข้อในรอบที่ ${trial.round} คุณจะทดลองต่อเพื่อดูผลของตัวแปรอื่นก็ได้ หรือสรุปด่านได้เลย`, 'feed_back');
        finishWrap.hidden = false;
        const done = el('button', { class: 'btn btn--cyan btn--lg', type: 'button', id: 'l2-finish' }, icon('check'), 'สรุปด่าน');
        done.addEventListener('click', finish);
        finishWrap.replaceChildren(el('div', { class: 'notice notice--ok', style: 'flex:1' }, icon('check'), el('div', {}, el('strong', { text: 'ผ่านเงื่อนไขครบทั้ง 3 ข้อ' }), el('p', { text: `ชั้น ${trial.params.layer_height.toFixed(2)} มม. · infill ${trial.params.infill}% · ${trial.params.speed} มม./วิ · ${trial.params.nozzle_temp} °C` }))), done);
        return;
      }
      if (!check.all) {
        const failed = CONSTRAINT_DEFS.filter((c) => !check[c.id]).map((c) => c.short).join(', ');
        if (trial.round > 1) void ctx.mentor.explain('not_converged', { passed: check.passed, failed });
      }
      evaluateTriggers();
    }

    /* trigger ตามข้อ 6 ของบรีฟ — ตรวจจากสถานะเกม ไม่ใช่การสุ่ม */
    function evaluateTriggers(): void {
      const n = trials.length;
      const last = trials[n - 1];
      const prev = trials[n - 2];
      if (last && prev && last.changed.length >= 2 && prev.changed.length >= 2) {
        void ctx.mentor.offer('multi_var_twice', { changed: last.changed.length });
        ctx.mentor.setTrigger('multi_var_twice', { changed: last.changed.length });
        return;
      }
      if (n >= 4 && !trials.some((t) => t.check.time)) {
        void ctx.mentor.offer('time_not_met_after_4');
        ctx.mentor.setTrigger('time_not_met_after_4');
        return;
      }
      if (n >= 3) {
        const last3 = trials.slice(-3);
        if (last3.every((t) => t.check.passed === 2)) {
          const failing = CONSTRAINT_DEFS.find((c) => last3.every((t) => !t.check[c.id]));
          if (failing) {
            const metric = (t: Trial): number => failing.id === 'strength' ? -t.result.strength_kg : failing.id === 'time' ? t.result.print_time_min : t.result.material_g;
            const worsening = last3.every((t, i) => i === 0 || metric(t) > metric(last3[i - 1] as Trial));
            if (worsening) {
              void ctx.mentor.offer('tradeoff');
              ctx.mentor.setTrigger('tradeoff');
              return;
            }
          }
        }
      }
      ctx.mentor.setTrigger('general');
    }

    function finish(): void {
      const changedPerTrial = trials.map((t) => t.changed.length);
      const single = trials.filter((t, i) => i > 0 && t.changed.length === 1).length;
      const multi = trials.filter((t) => t.changed.length >= 2).length;
      const freq = new Map<string, number>();
      for (const t of trials) for (const k of t.changed) freq.set(k, (freq.get(k) ?? 0) + 1);
      const mostKey = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const most = PARAM_SPECS.find((s) => s.key === mostKey)?.label ?? 'ไม่มี';
      const final = trials[trials.length - 1];
      ctx.complete(
        {
          variables_changed_per_trial: changedPerTrial,
          trials_count: trials.length,
          single_var_trials: single,
          multi_var_trials: multi,
          converged,
          constraint_priority_order: priority,
          most_changed_variable: mostKey ?? null,
          final_params: final?.params ?? null,
          final_result: final?.result ?? null,
          trials: trials.map((t) => ({ round: t.round, changed: t.changed.length, time: t.result.print_time_min, material: t.result.material_g, strength: t.result.strength_kg, passed: t.check.passed })),
          total_machine_time_min: Math.round(trials.reduce((a, t) => a + t.result.print_time_min, 0)),
          total_material_g: Math.round(trials.reduce((a, t) => a + t.result.material_g, 0) * 10) / 10,
          failed_trials: trials.filter((t) => !t.check.all).length,
        },
        {
          trials: trials.length,
          single,
          multi,
          most_changed: most,
          priority: priority.map((id, i) => `${i + 1}) ${CONSTRAINT_DEFS.find((c) => c.id === id)?.short ?? id}`).join(' '),
        },
      );
    }

    showPriority();
    return () => {
      for (const t of timers) window.clearTimeout(t);
      root.remove();
    };
  },
};
