/**
 * ด่าน 1 — ถอดรหัสระบบ (System Teardown)
 * ระยะ 1: ลากชิ้นส่วน 18 ชิ้นเข้า 5 ระบบย่อย
 * ระยะ 2: ต่อผัง ตัวป้อน → กระบวนการ → ผลผลิต → ข้อมูลย้อนกลับ ของทั้งเครื่อง
 * ระยะ 3: ระบุวงจรป้อนกลับ thermistor → mainboard → heater
 */
import { el, append, clear } from '../ui/dom';
import { icon } from '../ui/icons';
import { createDiagram, type Diagram } from '../ui/diagram';
import { createPrinterViewport } from '../game/viewport';
import { PARTS, SUBSYSTEMS, FEEDBACK_LOOP, partById, subsystemById, type PartSpec } from '../game/printer';
import type { LevelContext, LevelModule } from './context';

const FLOW_NODES = [
  { id: 'input', label: 'ตัวป้อน', sub: 'เส้นพลาสติก · ไฟฟ้า · ไฟล์ G-code', x: 130, y: 110, w: 230, cls: 'dnode--input' },
  { id: 'process', label: 'กระบวนการ', sub: 'หลอมและวางเส้นทีละชั้น', x: 400, y: 110, w: 200, cls: 'dnode--process' },
  { id: 'output', label: 'ผลผลิต', sub: 'ชิ้นงาน 3 มิติ', x: 670, y: 110, w: 200, cls: 'dnode--output' },
  { id: 'feedback', label: 'ข้อมูลย้อนกลับ', sub: 'อุณหภูมิที่วัดได้', x: 400, y: 260, w: 200, cls: 'dnode--feedback' },
];
const FLOW_REQUIRED: [string, string][] = [['input', 'process'], ['process', 'output'], ['process', 'feedback'], ['feedback', 'process']];

const LOOP_CANDIDATES = ['thermistor', 'mainboard', 'hotend_heater', 'touchscreen', 'nozzle'];

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export const level: LevelModule = {
  mount(ctx: LevelContext) {
    const root = el('div', { class: 'l1' });
    ctx.root.appendChild(root);
    const split = el('div', { class: 'split' });
    root.appendChild(split);
    const view = createPrinterViewport(split);
    const panel = el('div', { class: 'l1-panel' });
    split.appendChild(panel);

    const state = {
      placed: new Set<string>(),
      wrongByPart: new Map<string, number>(),
      drops: 0,
      wrongDrops: 0,
      firstTry: 0,
      flowWrong: 0,
      flowLinks: 0,
      loopAttempts: 0,
      loopWrong: 0,
      loopIdentified: false,
    };
    let disposed = false;
    const timers: number[] = [];

    /* ---------- แผงข้อมูลชิ้นส่วน ---------- */
    const info = el('div', { class: 'part-info is-empty', text: 'ชี้ที่ชิ้นส่วนในโมเดลหรือที่ป้ายชื่อเพื่อดูหน้าที่' });
    const showInfo = (id: string | null): void => {
      const p = id ? partById(id) : undefined;
      clear(info);
      if (!p) {
        info.classList.add('is-empty');
        info.textContent = 'ชี้ที่ชิ้นส่วนในโมเดลหรือที่ป้ายชื่อเพื่อดูหน้าที่';
        return;
      }
      info.classList.remove('is-empty');
      append(info, el('strong', { text: p.name }), el('span', { text: p.function }));
    };

    /* ========== ระยะ 1: จัดกลุ่ม ========== */
    const chips = new Map<string, HTMLElement>();
    let selected: string | null = null;

    const setSelected = (id: string | null): void => {
      selected = id;
      for (const [pid, c] of chips) c.classList.toggle('is-selected', pid === id);
    };

    const tray = el('div', { class: 'l1-tray', 'aria-label': 'ชิ้นส่วนที่ยังไม่จัดกลุ่ม' });
    const bins = el('div', { class: 'bins' });
    const binEls = new Map<string, { el: HTMLElement; items: HTMLElement; count: HTMLElement }>();

    for (const s of SUBSYSTEMS) {
      const items = el('div', { class: 'bin__items' });
      const count = el('span', { class: 'bin__count', text: '0 ชิ้น' });
      const bin = el('button', { class: 'bin', type: 'button', 'data-sub': s.id, style: `--sub-color:${s.color}` },
        el('div', { class: 'bin__title' }, el('span', { text: s.name }), count),
        el('p', { class: 'bin__desc', text: s.description }),
        items,
      );
      bin.addEventListener('click', () => {
        if (selected) drop(selected, s.id);
      });
      bins.appendChild(bin);
      binEls.set(s.id, { el: bin, items, count });
    }

    const makeChip = (p: PartSpec): HTMLElement => {
      const chip = el('button', { class: 'part-chip', type: 'button', 'data-part': p.id, 'aria-label': `${p.name} (ลากหรือกด Enter เพื่อเลือก)` }, el('span', { class: 'part-chip__dot' }), el('span', { text: p.short }));
      chip.addEventListener('pointerenter', () => {
        view.printer.highlight(p.id);
        showInfo(p.id);
      });
      chip.addEventListener('pointerleave', () => {
        view.printer.highlight(null);
        showInfo(null);
      });
      chip.addEventListener('focus', () => showInfo(p.id));
      chip.addEventListener('pointerdown', (ev) => startDrag(ev, p.id, chip));
      chip.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          setSelected(selected === p.id ? null : p.id);
        }
      });
      return chip;
    };

    for (const p of shuffle(PARTS)) {
      const chip = makeChip(p);
      chips.set(p.id, chip);
      tray.appendChild(chip);
    }

    /* การลากด้วย pointer events (รองรับเมาส์และสัมผัส) */
    function startDrag(ev: PointerEvent, partId: string, chip: HTMLElement): void {
      if (state.placed.has(partId)) return;
      ev.preventDefault();
      const start = { x: ev.clientX, y: ev.clientY };
      let ghost: HTMLElement | null = null;
      let over: HTMLElement | null = null;
      let moved = false;

      const move = (e: PointerEvent): void => {
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        if (!ghost) {
          moved = true;
          ghost = chip.cloneNode(true) as HTMLElement;
          ghost.classList.add('drag-ghost');
          document.body.appendChild(ghost);
          chip.classList.add('is-dragging');
          setSelected(partId);
        }
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.bin') ?? null;
        if (target !== over) {
          over?.classList.remove('is-over');
          over = target;
          over?.classList.add('is-over');
        }
      };
      const up = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        ghost?.remove();
        chip.classList.remove('is-dragging');
        over?.classList.remove('is-over');
        if (moved) {
          const sub = over?.dataset['sub'];
          if (sub) drop(partId, sub);
          else setSelected(null);
        } else {
          // แตะเฉย ๆ = เลือก/ยกเลิกเลือก
          setSelected(selected === partId ? null : partId);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    function drop(partId: string, subId: string): void {
      const p = partById(partId);
      const bin = binEls.get(subId);
      const sub = subsystemById(subId);
      if (!p || !bin || !sub || state.placed.has(partId)) return;
      state.drops++;
      const correct = p.subsystem === subId;
      const priorWrong = state.wrongByPart.get(partId) ?? 0;
      ctx.track(correct ? 'group_drop' : 'group_drop_wrong', { part: partId, target: subId, correct, priorWrong, errorType: correct ? undefined : 'wrong_subsystem' }, 'architecture');

      if (correct) {
        if (priorWrong === 0) state.firstTry++;
        state.placed.add(partId);
        const chip = chips.get(partId);
        if (chip) {
          chip.classList.add('is-placed');
          chip.classList.remove('is-selected');
          chip.prepend(icon('check', 'icon icon--sm'));
          chip.style.setProperty('--sub-color', sub.color);
          bin.items.appendChild(chip);
        }
        bin.count.textContent = `${bin.items.children.length} ชิ้น`;
        bin.el.classList.add('is-right');
        timers.push(window.setTimeout(() => bin.el.classList.remove('is-right'), 500));
        setSelected(null);
        ctx.setStatus(`จัดกลุ่มแล้ว ${state.placed.size}/18 ชิ้น`);
        if (state.placed.size === PARTS.length) finishGrouping();
      } else {
        state.wrongDrops++;
        state.wrongByPart.set(partId, priorWrong + 1);
        bin.el.classList.remove('is-wrong');
        void bin.el.offsetWidth;
        bin.el.classList.add('is-wrong');
        setSelected(null);
        void ctx.mentor.explain('wrong_subsystem', { part: p.name, group: sub.name });
        if (priorWrong + 1 >= 2) void ctx.mentor.offer('same_part_wrong_twice', { part: p.name });
      }
    }

    view.onHover = (id) => {
      for (const [pid, c] of chips) c.classList.toggle('is-hover', pid === id);
      showInfo(id);
      view.printer.highlight(id);
    };
    view.onClick = (id) => {
      if (id && !state.placed.has(id)) {
        setSelected(id);
        chips.get(id)?.focus({ preventScroll: true });
      }
    };

    ctx.mentor.setTrigger('general');
    append(panel,
      el('div', { class: 'phase-head' }, el('span', { class: 'phase-head__num', text: '1' }), el('div', {}, el('h2', { text: 'จัดชิ้นส่วนเข้าระบบย่อย' }), el('p', { text: 'ลากป้ายชื่อไปวางในกล่องระบบ หรือคลิกเลือกป้ายแล้วคลิกกล่อง ชี้ที่โมเดลเพื่อดูว่าชิ้นไหนอยู่ตรงไหน' }))),
      tray,
      info,
      bins,
    );
    ctx.setStatus('จัดกลุ่มแล้ว 0/18 ชิ้น');

    /* ========== ระยะ 2: ผังระบบ ========== */
    function finishGrouping(): void {
      ctx.track('grouping_done', { drops: state.drops, wrongDrops: state.wrongDrops, firstTry: state.firstTry }, 'architecture');
      const next = el('div', { class: 'row row--end', style: 'margin-top:16px' }, el('button', { class: 'btn btn--primary', type: 'button', id: 'l1-to-flow' }, 'ต่อผังระบบของทั้งเครื่อง', icon('arrow-right')));
      panel.appendChild(next);
      next.querySelector('button')?.addEventListener('click', startFlow);
      ctx.mentor.say('ครบ 18 ชิ้นแล้ว ต่อไปลองมองทั้งเครื่องเป็นระบบเดียว: อะไรเข้า อะไรออก และอะไรวกกลับมา', 'feed_forward');
    }

    let diagram: Diagram | null = null;
    const found = new Set<string>();

    function startFlow(): void {
      clear(panel);
      view.onHover = null;
      view.onClick = null;
      view.printer.highlight(null);
      view.printer.isolate(null);
      ctx.mentor.setTrigger('flow');
      ctx.setStatus('ต่อผังระบบ: ต่อถูกแล้ว 0/4 เส้น');

      const progress = el('span', { class: 'mono', text: '0/4 เส้น' });
      diagram = createDiagram({
        width: 800,
        height: 330,
        nodes: FLOW_NODES,
        onLink(from, to) {
          const key = `${from}>${to}`;
          if (found.has(key)) return 'duplicate';
          const ok = FLOW_REQUIRED.some(([a, b]) => a === from && b === to);
          state.flowLinks++;
          ctx.track(ok ? 'link_drawn' : 'link_wrong', { diagram: 'flow', from, to, correct: ok, errorType: ok ? undefined : 'flow_direction' }, 'architecture');
          if (!ok) {
            state.flowWrong++;
            const name = (id: string): string => FLOW_NODES.find((n) => n.id === id)?.label ?? id;
            void ctx.mentor.explain('link_wrong', { from: name(from), to: name(to) });
            return 'wrong';
          }
          found.add(key);
          progress.textContent = `${found.size}/4 เส้น`;
          ctx.setStatus(`ต่อผังระบบ: ต่อถูกแล้ว ${found.size}/4 เส้น`);
          if (found.size === FLOW_REQUIRED.length) timers.push(window.setTimeout(startLoop, 600));
          return 'ok';
        },
      });
      append(panel,
        el('div', { class: 'phase-head' }, el('span', { class: 'phase-head__num', text: '2' }), el('div', {}, el('h2', { text: 'ต่อผังระบบของทั้งเครื่อง' }), el('p', { text: 'ลากจากกล่องต้นทางไปยังกล่องปลายทาง (หรือคลิกต้นทางแล้วคลิกปลายทาง) ให้ครบทุกเส้นที่ของและข้อมูลเดินทางจริง' }))),
        diagram.root,
      );
      diagram.root.appendChild(el('div', { class: 'diagram__toolbar' }, icon('link'), el('span', { text: 'ต้องมี 4 เส้น รวมเส้นที่วกกลับ' }), el('span', { class: 'spacer' }), progress));
    }

    /* ========== ระยะ 3: วงจรป้อนกลับ ========== */
    const loopFound = new Set<string>();
    let loopIdle = 0;

    function startLoop(): void {
      diagram?.dispose();
      diagram = null;
      clear(panel);
      ctx.mentor.setTrigger('feedback_loop');
      ctx.setStatus('ระบุวงจรป้อนกลับของอุณหภูมิ');
      view.printer.isolate(LOOP_CANDIDATES);
      view.focus('hotend_heater');

      const [a, b, c] = FEEDBACK_LOOP as [string, string, string];
      const required: [string, string][] = [[a, b], [b, c]];
      const closing: [string, string] = [c, a];

      const cx = 400;
      const cy = 175;
      const r = 120;
      const nodes = LOOP_CANDIDATES.map((id, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / LOOP_CANDIDATES.length;
        const p = partById(id);
        return { id, label: p?.short ?? id, sub: p?.subsystem === 'control' ? 'ควบคุม' : p?.subsystem === 'extrusion_thermal' ? 'ความร้อน' : '', x: cx + Math.cos(ang) * r * 1.9, y: cy + Math.sin(ang) * r, w: 150 };
      });
      const progress = el('span', { class: 'mono', text: '0/2 เส้น' });
      // ระบบเสนอคำใบ้ถ้ายังไม่ลากเส้นหลังผ่าน 3 นาที
      loopIdle = window.setTimeout(() => {
        if (loopFound.size === 0) void ctx.mentor.offer('feedback_loop_idle');
      }, 180_000);
      timers.push(loopIdle);

      diagram = createDiagram({
        width: 800,
        height: 350,
        nodes,
        onHover(id) {
          view.printer.highlight(id);
          showInfo(id);
        },
        onLink(from, to) {
          const key = `${from}>${to}`;
          if (loopFound.has(key)) return 'duplicate';
          state.loopAttempts++;
          const isRequired = required.some(([x, y]) => x === from && y === to);
          const isClosing = closing[0] === from && closing[1] === to;
          ctx.track(isRequired || isClosing ? 'link_drawn' : 'link_wrong', { diagram: 'feedback_loop', from, to, correct: isRequired || isClosing, errorType: isRequired || isClosing ? undefined : 'loop_wrong' }, 'architecture');
          if (!isRequired && !isClosing) {
            state.loopWrong++;
            void ctx.mentor.explain('loop_wrong', { from: partById(from)?.short ?? from, to: partById(to)?.short ?? to });
            return 'wrong';
          }
          if (isRequired) {
            loopFound.add(key);
            progress.textContent = `${loopFound.size}/2 เส้น`;
            if (loopFound.size === required.length) {
              state.loopIdentified = true;
              window.clearTimeout(loopIdle);
              timers.push(window.setTimeout(finish, 700));
            }
          }
          return 'ok';
        },
      });
      append(panel,
        el('div', { class: 'phase-head' }, el('span', { class: 'phase-head__num', text: '3' }), el('div', {}, el('h2', { text: 'ระบุวงจรป้อนกลับของอุณหภูมิ' }), el('p', { text: 'ลากเส้นแสดงเส้นทางของ ค่าอุณหภูมิ จากชิ้นที่วัด ไปยังชิ้นที่ตัดสินใจ แล้วไปยังชิ้นที่ถูกสั่งให้ปรับ (มีชิ้นที่ไม่เกี่ยวปนอยู่)' }))),
        diagram.root,
        info,
      );
      diagram.root.appendChild(el('div', { class: 'diagram__toolbar' }, icon('refresh'), el('span', { text: 'ต้องมี 2 เส้นตามลำดับ วัด → คิด → ลงมือ' }), el('span', { class: 'spacer' }), progress));
    }

    function finish(): void {
      if (disposed) return;
      const timeOnTask = Date.now() - ctx.startedAt;
      const accuracy = state.firstTry / PARTS.length;
      ctx.complete(
        {
          grouping_accuracy: Number(accuracy.toFixed(3)),
          grouping_first_try: state.firstTry,
          grouping_drops: state.drops,
          grouping_wrong_drops: state.wrongDrops,
          grouping_wrong_by_part: Object.fromEntries(state.wrongByPart),
          flow_links_attempted: state.flowLinks,
          flow_wrong_links: state.flowWrong,
          feedback_loop_identified: state.loopIdentified,
          feedback_loop_attempts: state.loopAttempts,
          feedback_loop_wrong: state.loopWrong,
          time_on_task: timeOnTask,
          hint_used: ctx.mentor.hintsUsed,
        },
        {
          first_try: state.firstTry,
          accuracy: Math.round(accuracy * 100),
          wrong_count: state.wrongDrops + state.flowWrong + state.loopWrong,
          loop_attempts: state.loopAttempts,
        },
      );
    }

    return () => {
      disposed = true;
      for (const t of timers) window.clearTimeout(t);
      diagram?.dispose();
      view.dispose();
      root.remove();
    };
  },
};
