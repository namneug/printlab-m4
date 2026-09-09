/**
 * กลไกวินิจฉัยเชิงสาเหตุ — ใช้ร่วมกันระหว่างด่าน 3 และโมดูลซ่อม
 * เคสทั้งหมดมาจาก faults.json (เพิ่มเคสใหม่ได้ด้วย JSON อย่างเดียว)
 */
import faultsData from '../data/faults.json';
import { el, append, clear } from '../ui/dom';
import { icon } from '../ui/icons';
import { illustration } from '../ui/illustrations';
import type { MentorHost } from '../levels/context';
import type { Construct } from '../telemetry/schema';

export interface FaultHypothesis {
  id: string;
  text: string;
  correct?: boolean;
}
export interface FaultTest {
  id: string;
  label: string;
  time_cost: number;
  evidence: string;
  supports: string[];
  eliminates: string[];
}
export interface FaultCase {
  id: string;
  title: string;
  pools: string[];
  illustration: string;
  time_budget: number;
  symptom: string;
  machine: { label: string; value: string }[];
  hypotheses: FaultHypothesis[];
  tests: FaultTest[];
  resolution: string;
}

export const FAULT_CASES: FaultCase[] = (faultsData as { cases: FaultCase[] }).cases;

export function casesForPool(pool: string): FaultCase[] {
  const list = FAULT_CASES.filter((c) => c.pools.includes(pool));
  return list.length ? list : FAULT_CASES;
}

/** เลือกเคสแบบกำหนดจากรหัสผู้เล่น เพื่อให้แต่ละคนได้เคสต่างกันแต่คนเดิมได้เคสเดิม */
export function caseForParticipant(code: string, pool = 'base'): FaultCase {
  const list = casesForPool(pool);
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length] as FaultCase;
}

export function randomCase(pool: string, exclude?: string): FaultCase {
  const list = casesForPool(pool).filter((c) => c.id !== exclude);
  const pick = list[Math.floor(Math.random() * list.length)] ?? FAULT_CASES[0];
  return pick as FaultCase;
}

export interface DiagnosisOutcome {
  case_id: string;
  case_title: string;
  tests_used: number;
  tests_order: string[];
  time_spent: number;
  time_budget: number;
  guess_without_evidence: number;
  hypotheses_eliminated: number;
  wrong_eliminations: number;
  correct_cause: boolean;
  wrong_submits: number;
  evidence_mismatch: number;
  budget_extensions: number;
  duration_ms: number;
}

export interface DiagnosisHost {
  track(eventType: string, payload?: Record<string, unknown>, construct?: Construct): void;
  mentor: MentorHost;
  setStatus(text: string): void;
}

const EXTENSION_MIN = 10;

/** วางกลไกวินิจฉัยลงใน root และเรียก onDone เมื่อปิดเคสสำเร็จ */
export function runDiagnosis(root: HTMLElement, c: FaultCase, host: DiagnosisHost, onDone: (o: DiagnosisOutcome) => void): () => void {
  const startedAt = Date.now();
  const st = {
    timeSpent: 0,
    budget: c.time_budget,
    testsDone: [] as string[],
    evidence: [] as FaultTest[],
    eliminated: new Set<string>(),
    wrongElims: 0,
    guesses: 0,
    wrongSubmits: 0,
    mismatches: 0,
    extensions: 0,
    chosen: null as string | null,
    solved: false,
  };
  const correctId = c.hypotheses.find((h) => h.correct)?.id ?? '';
  host.track('case_start', { case: c.id, budget: c.time_budget }, 'maintenance');
  host.mentor.setTrigger('general');

  const wrap = el('div', { class: 'diag' });
  root.appendChild(wrap);

  /* ---------- ซ้าย: อาการ ---------- */
  const budgetFill = el('div', { class: 'budget__fill', style: 'width:0%' });
  const budgetLabel = el('span', { class: 'mono' });
  const budget = el('div', { class: 'budget' },
    el('div', { class: 'budget__label' }, el('span', { text: 'งบเวลาที่ใช้ไป' }), budgetLabel),
    el('div', { class: 'budget__bar' }, budgetFill),
  );
  const left = el('div', { class: 'stack' },
    el('div', { class: 'panel' },
      el('div', { class: 'panel__head' }, icon('alert'), `อาการ: ${c.title}`),
      el('div', { class: 'panel__body stack' },
        illustration(c.illustration),
        el('p', { text: c.symptom }),
        el('dl', { class: 'kv' }, ...c.machine.flatMap((m) => [el('dt', { text: m.label }), el('dd', { text: m.value })])),
      ),
    ),
    el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('clock'), 'งบเวลา'), el('div', { class: 'panel__body' }, budget)),
  );

  /* ---------- ขวา: สมมติฐาน / การทดสอบ / หลักฐาน / สรุป ---------- */
  const hypoList = el('div', { class: 'hypo' });
  const testList = el('div', { class: 'tests' });
  const evidenceList = el('div', { class: 'evidence' });
  const formWrap = el('div', { class: 'diag-form' });
  const right = el('div', { class: 'stack' },
    el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('search'), 'สมมติฐาน (จริง 1 ข้อ)'), el('div', { class: 'panel__body' }, hypoList)),
    el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('beaker'), 'การทดสอบที่เลือกได้'), el('div', { class: 'panel__body' }, testList)),
    el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('list'), 'หลักฐานที่เก็บได้'), el('div', { class: 'panel__body' }, evidenceList)),
    el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('flag'), 'สรุปสาเหตุ'), el('div', { class: 'panel__body' }, formWrap)),
  );
  append(wrap, left, right);

  const remaining = (): number => st.budget - st.timeSpent;

  function renderBudget(): void {
    const pct = Math.min(100, (st.timeSpent / st.budget) * 100);
    budgetFill.style.width = `${pct}%`;
    budgetFill.classList.toggle('is-warn', pct > 50 && pct < 100);
    budgetFill.classList.toggle('is-over', pct >= 100);
    budgetLabel.textContent = `${st.timeSpent} / ${st.budget} นาที`;
    host.setStatus(`เคส ${c.title} · ใช้เวลา ${st.timeSpent}/${st.budget} นาที · ทดสอบ ${st.testsDone.length} · ตัดออก ${st.eliminated.size}`);
  }

  /* สมมติฐาน + ปุ่มตัดออก */
  function renderHypotheses(): void {
    clear(hypoList);
    c.hypotheses.forEach((h, i) => {
      const elim = st.eliminated.has(h.id);
      const item = el('div', { class: `hypo__item${elim ? ' is-eliminated' : ''}${st.chosen === h.id ? ' is-chosen' : ''}`, 'data-hypo': h.id },
        el('span', { class: 'hypo__mark', text: String.fromCharCode(65 + i) }),
        el('span', { class: 'hypo__text' }, h.text, elim ? el('span', { class: 'hypo__note', text: 'ถูกตัดออกด้วยหลักฐาน' }) : null),
      );
      if (!elim && !st.solved) {
        const btn = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-elim': h.id }, icon('x', 'icon icon--sm'), 'ตัดออก');
        btn.addEventListener('click', () => openEliminate(h, item));
        item.appendChild(btn);
      }
      hypoList.appendChild(item);
    });
  }

  function openEliminate(h: FaultHypothesis, item: HTMLElement): void {
    hypoList.querySelectorAll('.picker').forEach((p) => p.remove());
    const picker = el('div', { class: 'picker' }, el('span', { class: 'picker__title', text: `หลักฐานชิ้นใดขัดกับ "${h.text}"` }));
    if (st.evidence.length === 0) {
      picker.appendChild(el('p', { class: 'muted small', text: 'ยังไม่มีหลักฐาน ต้องเลือกการทดสอบก่อน' }));
    } else {
      const name = `elim-${h.id}`;
      for (const ev of st.evidence) {
        picker.appendChild(el('label', { class: 'check' }, el('input', { type: 'radio', name, value: ev.id, class: 'checkbox' }), el('span', { text: ev.evidence })));
      }
      const ok = el('button', { class: 'btn btn--sm', type: 'button', 'data-confirm-elim': h.id }, 'ยืนยันตัดออก');
      ok.addEventListener('click', () => {
        const sel = picker.querySelector<HTMLInputElement>('input:checked');
        if (!sel) return;
        const ev = st.evidence.find((e) => e.id === sel.value);
        if (!ev) return;
        const valid = ev.eliminates.includes(h.id);
        host.track(valid ? 'hypothesis_eliminate' : 'elimination_wrong', { case: c.id, hypothesis: h.id, evidence: ev.id, valid, errorType: valid ? undefined : 'elimination_wrong' }, 'problem_solving');
        if (valid) {
          st.eliminated.add(h.id);
          if (st.chosen === h.id) st.chosen = null;
          renderHypotheses();
          renderForm();
          renderBudget();
        } else {
          st.wrongElims++;
          picker.remove();
          item.classList.add('is-shaking');
          setTimeout(() => item.classList.remove('is-shaking'), 400);
          void host.mentor.explain('elimination_wrong');
        }
      });
      picker.appendChild(el('div', { class: 'row' }, ok, el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'ยกเลิก' })));
      picker.querySelector('button.btn--ghost')?.addEventListener('click', () => picker.remove());
    }
    item.after(picker);
  }

  /* การทดสอบ */
  function renderTests(): void {
    clear(testList);
    for (const t of c.tests) {
      const done = st.testsDone.includes(t.id);
      const afford = t.time_cost <= remaining();
      const btn = el('button', { class: `test${done ? ' is-done' : ''}${!done && !afford ? ' is-unaffordable' : ''}`, type: 'button', 'data-test': t.id, disabled: st.solved },
        icon(done ? 'check' : 'beaker', 'icon icon--sm'),
        el('span', { text: t.label }),
        el('span', { class: 'test__cost' }, icon('clock'), el('span', { text: done ? 'ทำแล้ว' : `${t.time_cost} นาที` })),
      );
      btn.addEventListener('click', () => runTest(t));
      testList.appendChild(btn);
    }
    const noAffordable = c.tests.every((t) => st.testsDone.includes(t.id) || t.time_cost > remaining());
    if (noAffordable && !st.solved && st.testsDone.length < c.tests.length) {
      const ext = el('button', { class: 'btn btn--danger btn--sm', type: 'button', id: 'diag-extend' }, icon('clock'), `ขอเวลาเพิ่ม ${EXTENSION_MIN} นาที (บันทึกไว้)`);
      ext.addEventListener('click', () => {
        st.extensions++;
        st.budget += EXTENSION_MIN;
        host.track('budget_extension', { case: c.id, extensions: st.extensions, newBudget: st.budget }, 'problem_solving');
        void host.mentor.explain('budget_extension');
        renderBudget();
        renderTests();
      });
      testList.appendChild(ext);
    }
  }

  function runTest(t: FaultTest): void {
    if (st.solved) return;
    if (st.testsDone.includes(t.id)) {
      host.track('test_repeat', { case: c.id, test: t.id }, 'problem_solving');
      void host.mentor.offer('test_repeat').then((shown) => {
        if (!shown) host.mentor.say('การทดสอบนี้ทำไปแล้ว หลักฐานอยู่ในรายการด้านล่าง', 'feed_back');
      });
      return;
    }
    if (t.time_cost > remaining()) return;
    st.timeSpent += t.time_cost;
    st.testsDone.push(t.id);
    st.evidence.push(t);
    host.track('test_run', { case: c.id, test: t.id, cost: t.time_cost, timeSpent: st.timeSpent, remaining: remaining() }, 'maintenance');
    host.track('evidence_received', { case: c.id, test: t.id, supports: t.supports, eliminates: t.eliminates }, 'maintenance');
    renderBudget();
    renderTests();
    renderEvidence();
    renderForm();
    if (st.timeSpent > c.time_budget / 2 && st.eliminated.size === 0) {
      void host.mentor.offer('half_budget_no_elimination');
      host.mentor.setTrigger('half_budget_no_elimination');
    }
  }

  function renderEvidence(): void {
    clear(evidenceList);
    for (const ev of st.evidence) {
      const t = c.tests.find((x) => x.id === ev.id);
      evidenceList.appendChild(el('div', { class: 'evi', 'data-evi': ev.id },
        el('span', { class: 'evi__from', text: `จาก: ${t?.label ?? ev.id}` }),
        el('span', { text: ev.evidence }),
      ));
    }
  }

  /* ฟอร์มสรุป */
  function renderForm(): void {
    clear(formWrap);
    if (st.solved) return;
    const causeSel = el('div', { class: 'stack' });
    for (const h of c.hypotheses) {
      if (st.eliminated.has(h.id)) continue;
      const input = el('input', { type: 'radio', name: 'cause', value: h.id, class: 'checkbox', checked: st.chosen === h.id }) as HTMLInputElement;
      input.addEventListener('change', () => {
        st.chosen = h.id;
        host.track('hypothesis_select', { case: c.id, hypothesis: h.id }, 'problem_solving');
        renderHypotheses();
      });
      causeSel.appendChild(el('label', { class: 'check' }, input, el('span', { text: h.text })));
    }
    const cite = el('div', { class: 'stack' });
    if (st.evidence.length === 0) cite.appendChild(el('p', { class: 'muted small', text: 'ยังไม่มีหลักฐานให้อ้าง' }));
    for (const ev of st.evidence) {
      cite.appendChild(el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'cite', value: ev.id, class: 'checkbox' }), el('span', { text: ev.evidence })));
    }
    const submit = el('button', { class: 'btn btn--primary', type: 'button', id: 'diag-submit' }, icon('flag'), 'ส่งคำวินิจฉัย');
    submit.addEventListener('click', submitDiagnosis);
    append(formWrap,
      el('div', { class: 'field' }, el('span', { class: 'label', text: '1) สาเหตุที่แท้จริงคือ' }), causeSel),
      el('div', { class: 'field' }, el('span', { class: 'label', text: '2) หลักฐานที่สนับสนุน (อย่างน้อย 1 ชิ้น)' }), cite),
      el('div', { class: 'row row--end' }, submit),
    );
  }

  function submitDiagnosis(): void {
    const cause = formWrap.querySelector<HTMLInputElement>('input[name=cause]:checked')?.value ?? null;
    const cited = [...formWrap.querySelectorAll<HTMLInputElement>('input[name=cite]:checked')].map((i) => i.value);
    if (!cause) {
      host.mentor.say('เลือกสาเหตุที่คุณสรุปก่อน', 'feed_back');
      return;
    }
    if (cited.length === 0) {
      st.guesses++;
      host.track('submit_without_evidence', { case: c.id, hypothesis: cause, errorType: 'no_evidence' }, 'problem_solving');
      void host.mentor.offer('submit_no_evidence').then((shown) => {
        if (!shown) host.mentor.say('ยังส่งไม่ได้ อะไรยืนยันข้อสรุปนี้ เลือกหลักฐานอย่างน้อย 1 ชิ้นที่สนับสนุนสาเหตุ', 'feed_back');
      });
      host.mentor.setTrigger('submit_no_evidence');
      return;
    }
    const correct = cause === correctId;
    const supported = cited.some((id) => st.evidence.find((e) => e.id === id)?.supports.includes(cause));
    host.track('diagnosis_submit', { case: c.id, hypothesis: cause, cited, correct, supported, timeSpent: st.timeSpent }, 'problem_solving');
    if (!correct) {
      st.wrongSubmits++;
      host.track('diagnosis_wrong', { case: c.id, hypothesis: cause, errorType: 'wrong_cause' }, 'problem_solving');
      void host.mentor.explain('diagnosis_wrong');
      return;
    }
    if (!supported) {
      st.mismatches++;
      host.track('evidence_mismatch', { case: c.id, cited, errorType: 'evidence_mismatch' }, 'problem_solving');
      void host.mentor.explain('evidence_mismatch');
      return;
    }
    st.solved = true;
    renderHypotheses();
    renderTests();
    clear(formWrap);
    const done = el('button', { class: 'btn btn--cyan btn--lg', type: 'button', id: 'diag-done' }, icon('check'), 'ปิดเคส');
    append(formWrap, el('div', { class: 'diag-result' },
      el('div', { class: 'notice notice--ok' }, icon('check'), el('div', {}, el('strong', { text: 'วินิจฉัยถูกต้องและมีหลักฐานสนับสนุน' }), el('p', { text: c.resolution }))),
      el('div', { class: 'row row--end' }, done),
    ));
    host.mentor.say(`สรุปได้จากหลักฐาน ${cited.length} ชิ้น ใช้การทดสอบ ${st.testsDone.length} อย่างใน ${st.timeSpent} นาที`, 'feed_back');
    done.addEventListener('click', () => {
      const outcome: DiagnosisOutcome = {
        case_id: c.id,
        case_title: c.title,
        tests_used: st.testsDone.length,
        tests_order: [...st.testsDone],
        time_spent: st.timeSpent,
        time_budget: c.time_budget,
        guess_without_evidence: st.guesses,
        hypotheses_eliminated: st.eliminated.size,
        wrong_eliminations: st.wrongElims,
        correct_cause: true,
        wrong_submits: st.wrongSubmits,
        evidence_mismatch: st.mismatches,
        budget_extensions: st.extensions,
        duration_ms: Date.now() - startedAt,
      };
      host.track('case_complete', { ...outcome }, 'maintenance');
      onDone(outcome);
    });
  }

  renderBudget();
  renderHypotheses();
  renderTests();
  renderEvidence();
  renderForm();

  return () => {
    wrap.remove();
  };
}
