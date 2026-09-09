/**
 * ด่าน 6 — ผลกระทบและความยั่งยืน
 * รวมตัวเลขจริงของผู้เล่นจากด่าน 2 (รอบทดลอง) และด่าน 5 (รอบสร้าง–ทดสอบ) → ประเมินผลกระทบ 4 ด้าน → ตัดสินใจเชิงนโยบายโดยอ้างตัวเลขของตัวเอง
 * ค่าคงที่การประมาณอยู่ใน src/data/impact.json
 */
import impactData from '../data/impact.json';
import { el, append, clear, fmtNum } from '../ui/dom';
import { icon } from '../ui/icons';
import { getProgress } from '../game/session';
import type { LevelContext, LevelModule } from './context';

interface Dimension { id: string; name: string; color: string; desc: string }
interface Statement { id: string; text: string; dimension: string; sign: '+' | '-' }
interface ImpactFile {
  constants: { printer_power_kw: number; electricity_thb_per_kwh: number; co2_kg_per_kwh: number; filament_thb_per_kg: number; support_waste_fraction: number; class_size: number; printer_cost_thb: number; class_minutes: number };
  dimensions: Dimension[];
  statements: Statement[];
  decision: { question: string; options: { id: string; text: string }[] };
  generic_claims: { id: string; text: string }[];
  min_own_data: number;
}
const D = impactData as unknown as ImpactFile;
const K = D.constants;

interface OwnNumbers {
  prints: number;
  failed: number;
  machineMin: number;
  materialG: number;
  wasteG: number;
  energyKwh: number;
  energyThb: number;
  co2Kg: number;
  filamentThb: number;
  avgMin: number;
  classHours: number;
  classPeriods: number;
  sources: string[];
  hasData: boolean;
}

/** รวมตัวเลขจากความคืบหน้าของผู้เล่นเอง */
export function collectOwnNumbers(): OwnNumbers {
  const p = getProgress();
  const l2 = p.levels['l2']?.evidence as { trials?: { time: number; material: number; passed: number }[] } | undefined;
  const l5 = p.levels['l5']?.evidence as { rounds?: { time: number; material_g: number; passed: number }[] } | undefined;
  const sources: string[] = [];
  let prints = 0;
  let failed = 0;
  let machineMin = 0;
  let materialG = 0;
  let wasteG = 0;
  for (const t of l2?.trials ?? []) {
    prints++;
    machineMin += t.time;
    materialG += t.material;
    if (t.passed < 3) {
      failed++;
      wasteG += t.material;
    } else wasteG += t.material * K.support_waste_fraction;
  }
  if (l2?.trials?.length) sources.push(`ด่าน 2: ${l2.trials.length} รอบทดลอง`);
  for (const r of l5?.rounds ?? []) {
    prints++;
    machineMin += r.time;
    materialG += r.material_g;
    if (r.passed < 6) {
      failed++;
      wasteG += r.material_g;
    } else wasteG += r.material_g * K.support_waste_fraction;
  }
  if (l5?.rounds?.length) sources.push(`ด่าน 5: ${l5.rounds.length} รอบสร้าง–ทดสอบ`);
  const energyKwh = (machineMin / 60) * K.printer_power_kw;
  const avgMin = prints ? machineMin / prints : 0;
  const classMin = avgMin * K.class_size;
  return {
    prints,
    failed,
    machineMin: Math.round(machineMin),
    materialG: Math.round(materialG * 10) / 10,
    wasteG: Math.round(wasteG * 10) / 10,
    energyKwh: Math.round(energyKwh * 100) / 100,
    energyThb: Math.round(energyKwh * K.electricity_thb_per_kwh * 100) / 100,
    co2Kg: Math.round(energyKwh * K.co2_kg_per_kwh * 100) / 100,
    filamentThb: Math.round((materialG / 1000) * K.filament_thb_per_kg),
    avgMin: Math.round(avgMin),
    classHours: Math.round((classMin / 60) * 10) / 10,
    classPeriods: Math.ceil(classMin / K.class_minutes),
    sources,
    hasData: prints > 0,
  };
}

export const level: LevelModule = {
  mount(ctx: LevelContext) {
    const root = el('div', { class: 'l6 stack' });
    ctx.root.appendChild(root);
    const own = collectOwnNumbers();
    const st = {
      placed: new Map<string, string>(),
      wrong: 0,
      wrongByStatement: new Map<string, number>(),
      decision: null as string | null,
      selectedChips: new Set<string>(),
    };
    ctx.mentor.setTrigger('general');
    ctx.track('own_numbers', { ...own }, 'architecture');

    /* ---------- ขั้น A: ตัวเลขของฉัน ---------- */
    function renderNumbers(): void {
      clear(root);
      const grid = el('div', { class: 'numbers' });
      const card = (label: string, value: string, src: string): HTMLElement => el('div', { class: 'stat' }, el('span', { class: 'stat__label', text: label }), el('span', { class: 'stat__value mono', text: value }), el('span', { class: 'stat__src', text: src }));
      append(grid,
        card('งานพิมพ์ทั้งหมด', `${own.prints} ชิ้น`, `เสีย/ไม่ผ่าน ${own.failed} ชิ้น`),
        card('เวลาเครื่องรวม', `${own.machineMin} นาที`, `เฉลี่ย ${own.avgMin} นาที/ชิ้น`),
        card('พลังงานประมาณ', `${fmtNum(own.energyKwh, 2)} kWh`, `≈ ${fmtNum(own.energyThb, 2)} บาท · CO₂ ${fmtNum(own.co2Kg, 2)} กก.`),
        card('เส้นพลาสติกที่ใช้', `${fmtNum(own.materialG, 1)} กรัม`, `≈ ${own.filamentThb} บาท`),
        card('เศษวัสดุ', `${fmtNum(own.wasteG, 1)} กรัม`, 'งานเสีย + support ประมาณ 10%'),
        card(`ถ้าทั้งห้อง ${K.class_size} คนพิมพ์คนละชิ้น`, `${own.classHours} ชั่วโมง`, `≈ ${own.classPeriods} คาบเรียน (${K.class_minutes} นาที)`),
      );
      const next = el('button', { class: 'btn btn--primary', type: 'button', id: 'l6-to-impact' }, 'ประเมินผลกระทบ 4 ด้าน', icon('arrow-right'));
      next.addEventListener('click', renderImpact);
      append(root,
        el('div', { class: 'phase-head' }, el('span', { class: 'phase-head__num', text: 'A' }), el('div', {}, el('h2', { text: 'ตัวเลขของฉันจากด่าน 1–5' }), el('p', { text: own.hasData ? `ที่มา: ${own.sources.join(' · ')}` : 'ยังไม่มีข้อมูลจากด่าน 2 และ 5 (ตัวเลขเป็น 0) กลับไปเล่นด่านก่อนหน้าเพื่อให้ตัวเลขมีความหมาย' }))),
        grid,
        el('p', { class: 'help', text: `สมมติฐานการประมาณ: กำลังไฟเครื่อง ${K.printer_power_kw * 1000} W · ค่าไฟ ${K.electricity_thb_per_kwh} บาท/kWh · คาร์บอน ${K.co2_kg_per_kwh} kg/kWh · เส้น ${K.filament_thb_per_kg} บาท/กก.` }),
        el('div', { class: 'row row--end' }, next),
      );
      ctx.setStatus('ขั้น A: ตัวเลขของฉัน');
    }

    /* ---------- ขั้น B: จัดข้อความผลกระทบเข้า 4 ด้าน ---------- */
    let selectedStmt: string | null = null;
    function renderImpact(): void {
      clear(root);
      ctx.setStatus(`ขั้น B: จัดผลกระทบ ${st.placed.size}/${D.statements.length}`);
      const tray = el('div', { class: 'l1-tray', 'aria-label': 'ข้อความผลกระทบ' });
      const bins = el('div', { class: 'impact-bins' });
      const chips = new Map<string, HTMLElement>();
      const binItems = new Map<string, HTMLElement>();
      const setSel = (id: string | null): void => {
        selectedStmt = id;
        for (const [sid, c] of chips) c.classList.toggle('is-selected', sid === id);
      };
      for (const s of shuffle(D.statements)) {
        const chip = el('button', { class: 'stmt-chip', type: 'button', 'data-stmt': s.id }, el('span', { class: `sign ${s.sign === '+' ? 'sign--plus' : 'sign--minus'}`, text: s.sign }), el('span', { text: s.text }));
        chip.addEventListener('click', () => {
          if (st.placed.has(s.id)) return;
          setSel(selectedStmt === s.id ? null : s.id);
        });
        chips.set(s.id, chip);
        tray.appendChild(chip);
      }
      for (const d of D.dimensions) {
        const items = el('div', { class: 'bin__items' });
        binItems.set(d.id, items);
        const bin = el('button', { class: 'bin impact-bin', type: 'button', 'data-dim': d.id, style: `--sub-color:${d.color}` }, el('div', { class: 'bin__title' }, el('span', { text: d.name })), el('p', { class: 'bin__desc', text: d.desc }), items);
        bin.addEventListener('click', () => {
          if (!selectedStmt) return;
          const s = D.statements.find((x) => x.id === selectedStmt);
          if (!s) return;
          const correct = s.dimension === d.id;
          const prior = st.wrongByStatement.get(s.id) ?? 0;
          ctx.track(correct ? 'impact_assign' : 'impact_assign_wrong', { statement: s.id, target: d.id, correct, priorWrong: prior, errorType: correct ? undefined : 'impact_wrong' }, 'architecture');
          if (correct) {
            st.placed.set(s.id, d.id);
            const chip = chips.get(s.id);
            if (chip) {
              chip.classList.add('is-placed');
              chip.classList.remove('is-selected');
              items.appendChild(chip);
            }
            setSel(null);
            ctx.setStatus(`ขั้น B: จัดผลกระทบ ${st.placed.size}/${D.statements.length}`);
            if (st.placed.size === D.statements.length) {
              ctx.track('impact_done', { wrong: st.wrong }, 'architecture');
              const next = el('button', { class: 'btn btn--primary', type: 'button', id: 'l6-to-decision' }, 'ตัดสินใจเชิงนโยบาย', icon('arrow-right'));
              next.addEventListener('click', renderDecision);
              root.appendChild(el('div', { class: 'row row--end' }, next));
            }
          } else {
            st.wrong++;
            st.wrongByStatement.set(s.id, prior + 1);
            bin.classList.remove('is-wrong');
            void bin.offsetWidth;
            bin.classList.add('is-wrong');
            setSel(null);
            void ctx.mentor.explain('impact_wrong', { dim: D.dimensions.find((x) => x.id === s.dimension)?.name ?? '' });
          }
        });
        bins.appendChild(bin);
      }
      append(root,
        el('div', { class: 'phase-head' }, el('span', { class: 'phase-head__num', text: 'B' }), el('div', {}, el('h2', { text: 'ผลกระทบ 4 ด้านของเครื่องพิมพ์ 3 มิติในโรงเรียน' }), el('p', { text: 'คลิกข้อความ แล้วคลิกด้านที่มันกระทบมากที่สุด (+ ผลบวก − ผลลบ)' }))),
        tray, bins,
      );
    }

    /* ---------- ขั้น C: นโยบาย + ข้อโต้แย้งจากตัวเลขของตัวเอง ---------- */
    function renderDecision(): void {
      clear(root);
      ctx.setStatus('ขั้น C: ตัดสินใจเชิงนโยบาย');
      const opts = el('div', { class: 'options' });
      for (const o of D.decision.options) {
        const b = el('button', { class: 'option', type: 'button', 'data-option': o.id }, icon('flag'), el('span', { text: o.text }));
        b.addEventListener('click', () => {
          st.decision = o.id;
          opts.querySelectorAll('.option').forEach((x) => x.classList.toggle('is-selected', x === b));
          ctx.track('decision_select', { decision: o.id }, 'problem_solving');
        });
        opts.appendChild(b);
      }
      const ownChips: { id: string; text: string; own: boolean }[] = [
        { id: 'own_avg', text: `เวลาเครื่องเฉลี่ยของฉัน ${own.avgMin} นาที/ชิ้น → ${K.class_size} ชิ้น ≈ ${own.classHours} ชั่วโมง (${own.classPeriods} คาบ)`, own: true },
        { id: 'own_fail', text: `งานของฉันเสีย ${own.failed} จาก ${own.prints} ชิ้น (${own.prints ? Math.round((own.failed / own.prints) * 100) : 0}%) แต่ละชิ้นที่เสียคือเวลาเครื่องที่คนอื่นเสียโอกาส`, own: true },
        { id: 'own_energy', text: `พลังงาน ${fmtNum(own.energyKwh, 2)} kWh ≈ ${fmtNum(own.energyThb, 2)} บาท และ CO₂ ${fmtNum(own.co2Kg, 2)} กก. จากงานของฉันคนเดียว`, own: true },
        { id: 'own_material', text: `เส้นที่ใช้ ${fmtNum(own.materialG, 1)} กรัม ≈ ${own.filamentThb} บาท เศษวัสดุ ${fmtNum(own.wasteG, 1)} กรัม`, own: true },
        { id: 'own_cost', text: `เครื่องเพิ่ม 1 เครื่อง ${fmtNum(K.printer_cost_thb)} บาท เทียบกับค่าไฟ+เส้นของฉัน ${fmtNum(own.energyThb + own.filamentThb, 0)} บาทต่อ ${own.prints} ชิ้น`, own: true },
        ...D.generic_claims.map((g) => ({ id: g.id, text: g.text, own: false })),
      ];
      const arg = el('div', { class: 'argument' });
      for (const c of shuffle(ownChips)) {
        arg.appendChild(el('label', { class: `stmt${c.own ? ' is-own' : ''}` }, el('input', { type: 'checkbox', name: 'arg', value: c.id }), el('span', { text: c.text })));
      }
      const fb = el('div');
      const submit = el('button', { class: 'btn btn--cyan btn--lg', type: 'button', id: 'l6-submit' }, icon('check'), 'สรุปนโยบายพร้อมเหตุผล');
      submit.addEventListener('click', () => {
        clear(fb);
        if (!st.decision) {
          fb.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: 'เลือกทางเลือกนโยบายก่อน' })));
          return;
        }
        const chosen = [...arg.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value);
        const ownCount = chosen.filter((id) => ownChips.find((c) => c.id === id)?.own).length;
        const generic = chosen.length - ownCount;
        ctx.track('argument_submit', { decision: st.decision, chips: chosen, ownData: ownCount, generic }, 'problem_solving');
        if (ownCount < D.min_own_data) {
          ctx.track('argument_no_own_data', { ownData: ownCount, errorType: 'no_own_data' }, 'problem_solving');
          void ctx.mentor.explain('no_own_data', { min: D.min_own_data });
          void ctx.mentor.offer('no_own_data');
          fb.appendChild(el('div', { class: 'notice notice--warn' }, icon('alert'), el('p', { text: `ต้องอ้างตัวเลขของตัวเอง (แถบสีฟ้า) อย่างน้อย ${D.min_own_data} ค่า` })));
          return;
        }
        finish(chosen, ownCount, generic);
      });
      append(root,
        el('div', { class: 'phase-head' }, el('span', { class: 'phase-head__num', text: 'C' }), el('div', {}, el('h2', { text: 'ตัดสินใจเชิงนโยบาย' }), el('p', { text: D.decision.question }))),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('flag'), 'ทางเลือก'), el('div', { class: 'panel__body' }, opts)),
        el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('chart'), 'เหตุผลสนับสนุน (แถบสีฟ้า = ตัวเลขของคุณเอง)'), el('div', { class: 'panel__body' }, arg)),
        fb,
        el('div', { class: 'row row--end' }, submit),
      );
    }

    function finish(chips: string[], ownCount: number, generic: number): void {
      const dimsCovered = new Set([...st.placed.values()]).size;
      const firstTry = D.statements.filter((s) => !st.wrongByStatement.has(s.id)).length;
      const decisionText = D.decision.options.find((o) => o.id === st.decision)?.text ?? '';
      ctx.complete(
        {
          used_own_data_in_argument: ownCount >= 1,
          own_data_count: ownCount,
          generic_claims_count: generic,
          impact_dimensions_covered: dimsCovered,
          impact_first_try_correct: firstTry,
          impact_wrong_assignments: st.wrong,
          decision: st.decision,
          argument_chips: chips,
          own_numbers: { prints: own.prints, failed: own.failed, machineMin: own.machineMin, materialG: own.materialG, wasteG: own.wasteG, energyKwh: own.energyKwh, co2Kg: own.co2Kg },
        },
        { correct: firstTry, dims: dimsCovered, decision: decisionText, own: ownCount, generic },
      );
    }

    renderNumbers();
    return () => root.remove();
  },
};

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
