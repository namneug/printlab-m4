/**
 * ด่าน 4 — เลือกวัสดุและความปลอดภัย
 * 3 โจทย์: เลือกวัสดุ + ให้เหตุผลจากตารางสมบัติ + ตั้งค่าอย่างปลอดภัย
 * เหตุการณ์ความปลอดภัย (อุณหภูมิเกินพิกัด / ABS ในห้องปิด) ใช้ข้อความคงที่จาก hints.json → safety
 */
import materialsData from '../data/materials.json';
import { el, append, clear } from '../ui/dom';
import { icon } from '../ui/icons';
import type { LevelContext, LevelModule } from './context';

interface PropertyDef { key: string; label: string; unit: string }
interface Material {
  id: string; name: string; full: string; color: string; summary: string;
  props: Record<string, string | number>;
  max_safe_temp_c: number; closed_room_unsafe: boolean;
}
interface Task { id: string; title: string; scenario: string; correct: string; key_properties: string[]; why: string; wrong_feedback: Record<string, string> }
interface MaterialsFile { properties: PropertyDef[]; materials: Material[]; tasks: Task[] }

const DATA = materialsData as unknown as MaterialsFile;
const TEMP_MIN = 170;
const TEMP_MAX = 290;

function recommendedRange(m: Material): [number, number] {
  const s = String(m.props['print_temp']);
  const m2 = s.match(/(\d+)\D+(\d+)/);
  return m2 ? [Number(m2[1]), Number(m2[2])] : [190, 220];
}

export const level: LevelModule = {
  mount(ctx: LevelContext) {
    const root = el('div', { class: 'l4-root' });
    ctx.root.appendChild(root);
    const st = {
      taskIndex: 0,
      material: null as string | null,
      temp: 200,
      room: 'closed' as 'closed' | 'ventilated',
      tableOpens: 0,
      tableOpen: false,
      violations: [] as string[],
      tempLowWarnings: 0,
      perTask: {} as Record<string, { correct_first: boolean; wrong_attempts: number; justified: boolean; justification_attempts: number; violations: number }>,
      justificationWarned: false,
    };
    ctx.mentor.setTrigger('general');

    const layout = el('div', { class: 'l4' });
    const left = el('div', { class: 'stack' });
    const right = el('div', { class: 'stack' });
    append(layout, left, right);
    root.appendChild(layout);

    const steps = el('div', { class: 'task-steps' });
    const taskCard = el('div', { class: 'panel' });
    const matGrid = el('div', { class: 'mat-grid' });
    const tableWrap = el('div', { class: 'table-wrap', hidden: true });
    const tableBtn = el('button', { class: 'btn btn--sm', type: 'button', id: 'l4-table-toggle' }, icon('list'), 'เปิดตารางสมบัติ');
    const justify = el('div', { class: 'justify' });
    const tempInput = el('input', { type: 'range', min: TEMP_MIN, max: TEMP_MAX, step: 5, value: st.temp, id: 'l4-temp', 'aria-label': 'อุณหภูมิหัวฉีด' }) as HTMLInputElement;
    const tempValue = el('span', { class: 'slider__value' });
    const tempScale = el('div', { class: 'temp-scale' });
    const roomOpts = el('div', { class: 'room-opts' });
    const submitBtn = el('button', { class: 'btn btn--primary btn--lg', type: 'button', id: 'l4-submit' }, icon('check'), 'ยืนยันวัสดุและการตั้งค่า');
    const feedback = el('div', { class: 'stack' });

    /* ตารางสมบัติ */
    const table = el('table', { class: 'table mat-table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'สมบัติ' }), ...DATA.materials.map((m) => el('th', { 'data-mat': m.id, style: `--mat-color:${m.color}`, text: m.name })))),
      el('tbody', {}, ...DATA.properties.map((p) => el('tr', { 'data-prop': p.key },
        el('td', {}, p.label, p.unit ? el('span', { class: 'muted small', text: ` (${p.unit})` }) : null),
        ...DATA.materials.map((m) => {
          const v = m.props[p.key];
          const td = el('td', { class: 'num' });
          if (typeof v === 'number') {
            const r = el('span', { class: 'rating', 'aria-label': `${v} จาก 5` });
            for (let i = 1; i <= 5; i++) r.appendChild(el('i', { class: i <= v ? 'on' : '' }));
            td.appendChild(r);
          } else td.textContent = String(v);
          return td;
        }),
      ))),
    );
    tableWrap.appendChild(table);
    tableBtn.addEventListener('click', () => {
      st.tableOpen = !st.tableOpen;
      tableWrap.hidden = !st.tableOpen;
      tableBtn.replaceChildren(icon('list'), st.tableOpen ? 'ซ่อนตาราง' : 'เปิดตารางสมบัติ');
      if (st.tableOpen) {
        st.tableOpens++;
        ctx.track('table_open', { task: currentTask().id, opens: st.tableOpens }, 'operation');
      }
    });

    /* การ์ดวัสดุ */
    for (const m of DATA.materials) {
      const card = el('button', { class: 'mat-card', type: 'button', 'data-mat': m.id, style: `--mat-color:${m.color}` },
        el('span', { class: 'mat-card__name', text: m.name }), el('span', { class: 'mat-card__full', text: m.full }), el('span', { class: 'mat-card__sum', text: m.summary }));
      card.addEventListener('click', () => {
        st.material = m.id;
        matGrid.querySelectorAll('.mat-card').forEach((c) => c.classList.toggle('is-selected', c === card));
        ctx.track('material_select', { task: currentTask().id, material: m.id }, 'operation');
        renderTempScale();
      });
      matGrid.appendChild(card);
    }

    /* เหตุผลจากตาราง */
    for (const p of DATA.properties) {
      justify.appendChild(el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'justify', value: p.key, class: 'checkbox' }), el('span', { text: p.label })));
    }

    /* การตั้งค่า */
    tempInput.addEventListener('input', () => {
      st.temp = Number(tempInput.value);
      renderTempScale();
    });
    for (const [id, label, ic] of [['closed', 'ห้องปิด ไม่มีระบายอากาศ', 'box'], ['ventilated', 'เปิดระบายอากาศ / ตู้ครอบมีท่อดูด', 'leaf']] as const) {
      const b = el('button', { class: `room-opt${st.room === id ? ' is-selected' : ''}`, type: 'button', 'data-room': id }, icon(ic), el('span', { text: label }));
      b.addEventListener('click', () => {
        st.room = id;
        roomOpts.querySelectorAll('.room-opt').forEach((x) => x.classList.toggle('is-selected', x === b));
        ctx.track('room_select', { task: currentTask().id, room: id }, 'safety');
      });
      roomOpts.appendChild(b);
    }

    function renderTempScale(): void {
      tempValue.replaceChildren(document.createTextNode(String(st.temp)), el('span', { class: 'slider__unit', text: '°C' }));
      clear(tempScale);
      const m = st.material ? DATA.materials.find((x) => x.id === st.material) : null;
      if (m) {
        const [lo, hi] = recommendedRange(m);
        const pct = (t: number): number => ((t - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * 100;
        tempScale.appendChild(el('div', { class: 'temp-scale__safe', style: `left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%`, title: `ช่วงแนะนำ ${lo}–${hi} °C` }));
        tempScale.appendChild(el('div', { class: 'temp-scale__max', style: `left:${pct(m.max_safe_temp_c)}%`, title: `พิกัดสูงสุด ${m.max_safe_temp_c} °C` }));
      }
    }

    function currentTask(): Task {
      return DATA.tasks[st.taskIndex] as Task;
    }

    function renderTask(): void {
      const t = currentTask();
      clear(steps);
      DATA.tasks.forEach((x, i) => steps.appendChild(el('div', { class: `task-step${i === st.taskIndex ? ' is-current' : i < st.taskIndex ? ' is-done' : ''}`, text: `โจทย์ ${i + 1}: ${x.title}` })));
      clear(taskCard);
      append(taskCard,
        el('div', { class: 'panel__head' }, icon('target'), `โจทย์ ${st.taskIndex + 1} จาก ${DATA.tasks.length}: ${t.title}`),
        el('div', { class: 'panel__body' }, el('p', { text: t.scenario })),
      );
      st.material = null;
      st.justificationWarned = false;
      st.perTask[t.id] = { correct_first: false, wrong_attempts: 0, justified: false, justification_attempts: 0, violations: 0 };
      matGrid.querySelectorAll('.mat-card').forEach((c) => c.classList.remove('is-selected'));
      justify.querySelectorAll<HTMLInputElement>('input').forEach((i) => (i.checked = false));
      clear(feedback);
      renderTempScale();
      submitBtn.disabled = false;
      ctx.setStatus(`โจทย์ ${st.taskIndex + 1}/${DATA.tasks.length}: ${t.title}`);
      ctx.track('task_start', { task: t.id }, 'operation');
    }

    function submit(): void {
      const t = currentTask();
      const per = st.perTask[t.id];
      if (!per) return;
      const m = st.material ? DATA.materials.find((x) => x.id === st.material) : null;
      clear(feedback);
      if (!m) {
        feedback.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: 'เลือกวัสดุก่อน' })));
        return;
      }
      /* 1) ความปลอดภัยต้องผ่านก่อนเสมอ */
      const violations: string[] = [];
      if (st.temp > m.max_safe_temp_c) violations.push('over_temp');
      if (m.closed_room_unsafe && st.room === 'closed') violations.push('abs_closed_room');
      if (violations.length) {
        for (const v of violations) {
          st.violations.push(v);
          per.violations++;
          ctx.track('safety_violation', { task: t.id, material: m.id, type: v, temp: st.temp, room: st.room, errorType: v }, 'safety');
          ctx.mentor.safety(v);
          feedback.appendChild(el('div', { class: 'notice notice--danger', 'data-violation': v }, icon('alert'), el('div', {}, el('strong', { text: v === 'over_temp' ? `อุณหภูมิ ${st.temp} °C เกินพิกัด ${m.max_safe_temp_c} °C ของ ${m.name}` : `${m.name} ในห้องปิด` }), el('p', { text: 'แก้การตั้งค่าให้ปลอดภัยก่อนจึงจะยืนยันได้' }))));
        }
        return;
      }
      /* 2) เตือนเรื่องคุณภาพ (ไม่บล็อก) */
      const [lo] = recommendedRange(m);
      if (st.temp < lo) {
        st.tempLowWarnings++;
        ctx.track('temp_low_warning', { task: t.id, material: m.id, temp: st.temp }, 'operation');
        void ctx.mentor.explain('temp_low');
      }
      /* 3) ยังไม่เคยเปิดตาราง */
      if (st.tableOpens === 0) void ctx.mentor.offer('table_not_opened');
      /* 4) ตรวจวัสดุ */
      const justSel = [...justify.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value);
      const correct = m.id === t.correct;
      ctx.track('material_submit', { task: t.id, material: m.id, correct, justification: justSel, temp: st.temp, room: st.room, tableOpened: st.tableOpens > 0 }, 'operation');
      if (!correct) {
        per.wrong_attempts++;
        ctx.track('material_wrong', { task: t.id, material: m.id, errorType: 'wrong_material' }, 'operation');
        void ctx.mentor.explain('material_wrong', { feedback: t.wrong_feedback[m.id] ?? 'ยังไม่ใช่วัสดุที่เหมาะที่สุด ลองเทียบในตารางอีกครั้ง' });
        feedback.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: t.wrong_feedback[m.id] ?? 'ยังไม่ใช่วัสดุที่เหมาะที่สุด' })));
        return;
      }
      /* 5) เหตุผลจากตาราง */
      if (justSel.length === 0) {
        feedback.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: 'เลือกสมบัติจากตารางที่เป็นเหตุผลของการเลือกอย่างน้อย 1 ข้อ' })));
        return;
      }
      per.justification_attempts++;
      const justified = justSel.some((k) => t.key_properties.includes(k));
      if (!justified && !st.justificationWarned) {
        st.justificationWarned = true;
        ctx.track('justification_weak', { task: t.id, justification: justSel, errorType: 'justification_weak' }, 'operation');
        void ctx.mentor.explain('justification_weak');
        feedback.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: 'วัสดุถูกแล้ว แต่เหตุผลยังไม่ตรงกับเงื่อนไขหลักของโจทย์ ลองเลือกสมบัติที่ตอบว่า "ถ้าไม่มีสมบัตินี้ ชิ้นงานจะล้มเหลวอย่างไร"' })));
        return;
      }
      per.correct_first = per.wrong_attempts === 0;
      per.justified = justified;
      ctx.track('task_complete', { task: t.id, material: m.id, correct_first: per.correct_first, justified, justification: justSel, violations: per.violations }, 'operation');
      submitBtn.disabled = true;
      const next = el('button', { class: 'btn btn--cyan', type: 'button', id: 'l4-next' }, st.taskIndex + 1 < DATA.tasks.length ? 'โจทย์ถัดไป' : 'สรุปด่าน', icon('arrow-right'));
      next.addEventListener('click', () => {
        st.taskIndex++;
        if (st.taskIndex >= DATA.tasks.length) finish();
        else renderTask();
      });
      feedback.appendChild(el('div', { class: 'notice notice--ok' }, icon('check'), el('div', {}, el('strong', { text: `${m.name} เหมาะกับโจทย์นี้` }), el('p', { text: t.why }))));
      feedback.appendChild(el('div', { class: 'row row--end' }, next));
    }
    submitBtn.addEventListener('click', submit);

    append(left,
      steps,
      taskCard,
      el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('box'), 'เลือกวัสดุ'), el('div', { class: 'panel__body stack' }, matGrid, el('div', { class: 'row' }, tableBtn), tableWrap)),
    );
    append(right,
      el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('list'), 'เหตุผล: สมบัติในตารางที่ทำให้เลือก'), el('div', { class: 'panel__body' }, justify)),
      el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('thermo'), 'ตั้งค่าการพิมพ์'), el('div', { class: 'panel__body settings' },
        el('div', { class: 'slider' }, el('label', { class: 'slider__label', for: 'l4-temp', text: 'อุณหภูมิหัวฉีด' }), tempValue, tempInput, tempScale, el('div', { class: 'temp-scale__labels' }, el('span', { text: `${TEMP_MIN} °C` }), el('span', { text: `${TEMP_MAX} °C` })), el('p', { class: 'help', style: 'grid-column:1/-1', text: 'กรอบเขียว = ช่วงที่แนะนำของวัสดุที่เลือก · เส้นแดง = พิกัดสูงสุดที่ปลอดภัย' })),
        el('div', { class: 'field' }, el('span', { class: 'label', text: 'สภาพห้องที่ตั้งเครื่อง' }), roomOpts),
      )),
      submitBtn,
      feedback,
    );
    renderTask();

    function finish(): void {
      const tasks = Object.entries(st.perTask);
      ctx.complete(
        {
          material_choice_correct: Object.fromEntries(tasks.map(([id, p]) => [id, p.correct_first])),
          material_correct_first_count: tasks.filter(([, p]) => p.correct_first).length,
          material_wrong_attempts: tasks.reduce((a, [, p]) => a + p.wrong_attempts, 0),
          justification_from_property_table: Object.fromEntries(tasks.map(([id, p]) => [id, p.justified])),
          justified_count: tasks.filter(([, p]) => p.justified).length,
          safety_violations: st.violations.length,
          safety_violation_types: st.violations,
          table_opens: st.tableOpens,
          temp_low_warnings: st.tempLowWarnings,
        },
        {
          correct_first: tasks.filter(([, p]) => p.correct_first).length,
          justified: tasks.filter(([, p]) => p.justified).length,
          table_opens: st.tableOpens,
          violations: st.violations.length,
        },
      );
    }

    return () => root.remove();
  },
};
