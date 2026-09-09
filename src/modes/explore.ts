/** โหมดสำรวจสถาปัตยกรรม — แตะชิ้นส่วน ดูหน้าที่/การเชื่อมต่อ สลับชั้นการไหล 3 ชั้น ตอบคำถามชวนคิด */
import { el, append, clear } from '../ui/dom';
import { icon, type IconName } from '../ui/icons';
import type { Screen } from '../ui/router';
import { createPrinterViewport } from '../game/viewport';
import { buildFlowLayers } from '../game/flows';
import { FLOWS, PARTS, SUBSYSTEMS, partById, subsystemById, type FlowLayerId, type PartSpec } from '../game/printer';
import { getSession, saveData, getProgress } from '../game/session';
import { track } from '../telemetry/events';

const LAYER_ICON: Record<FlowLayerId, IconName> = { control: 'cpu', heat: 'thermo', motion: 'move' };

export const exploreScreen: Screen = (root) => {
  const session = getSession();
  if (!session) return;
  const prev = (getProgress().data['explore'] as { explored?: string[]; answered?: string[] } | undefined) ?? {};
  const explored = new Set<string>(prev.explored ?? []);
  const answered = new Set<string>(prev.answered ?? []);
  let layersToggled = 0;
  let probeCorrect = 0;
  const layerOn: Record<FlowLayerId, boolean> = { control: false, heat: false, motion: false };
  const trackX = (eventType: string, payload: Record<string, unknown> = {}): void => {
    track(eventType, payload, { levelId: 'explore', construct: 'architecture' });
  };
  trackX('explore_open', { explored: explored.size });

  const exploredChip = el('span', { class: 'mono' });
  const bar = el('header', { class: 'levelbar' },
    el('a', { class: 'btn btn--ghost btn--sm', href: '#/map' }, icon('arrow-left'), 'แผนที่'),
    el('div', { class: 'levelbar__title' }, el('div', { class: 'levelbar__num', text: 'โหมดเปิดตลอด' }), el('h1', { class: 'levelbar__name', text: 'สำรวจสถาปัตยกรรม' }), el('p', { class: 'levelbar__status', text: 'แตะชิ้นส่วนในโมเดลหรือรายการเพื่อดูชื่อ หน้าที่ และการเชื่อมต่อ' })),
    el('div', { class: 'levelbar__right' }, el('span', { class: 'chip' }, icon('eye'), el('span', { text: 'สำรวจแล้ว ' }), exploredChip)),
  );
  const body = el('main', { class: 'level-body' });
  const page = el('div', { class: 'screen screen--level screen--wide' }, bar, body);
  root.appendChild(page);

  const split = el('div', { class: 'split split--explore' });
  body.appendChild(split);
  const view = createPrinterViewport(split, { cameraPos: [0.8, 0.5, 0.9] });
  const flows = buildFlowLayers(view.printer);
  view.lab.scene.add(flows.root);

  const panel = el('div', { class: 'stack' });
  split.appendChild(panel);

  /* ชั้นการไหล */
  const layerRow = el('div', { class: 'layer-row' });
  for (const id of Object.keys(FLOWS) as FlowLayerId[]) {
    const spec = FLOWS[id];
    const btn = el('button', { class: 'layer-btn', type: 'button', 'data-layer': id, 'aria-pressed': 'false', style: `--layer-color:${spec.color}` }, icon(LAYER_ICON[id]), el('span', { text: spec.name }));
    btn.addEventListener('click', () => {
      layerOn[id] = !layerOn[id];
      flows.setVisible(id, layerOn[id]);
      btn.setAttribute('aria-pressed', String(layerOn[id]));
      btn.classList.toggle('is-on', layerOn[id]);
      layersToggled++;
      trackX('layer_toggle', { layer: id, on: layerOn[id], layersToggled });
    });
    layerRow.appendChild(btn);
  }

  /* รายการชิ้นส่วนตามระบบ */
  const list = el('div', { class: 'part-list' });
  const listBtns = new Map<string, HTMLElement>();
  for (const s of SUBSYSTEMS) {
    const group = el('div', { class: 'part-list__group' }, el('div', { class: 'part-list__title', style: `--sub-color:${s.color}` }, el('span', { class: 'part-chip__dot' }), el('span', { text: s.name })));
    const items = el('div', { class: 'part-list__items' });
    for (const p of PARTS.filter((x) => x.subsystem === s.id)) {
      const b = el('button', { class: `part-chip${explored.has(p.id) ? ' is-placed' : ''}`, type: 'button', 'data-part': p.id }, el('span', { class: 'part-chip__dot', style: `--sub-color:${s.color}` }), el('span', { text: p.short }));
      b.addEventListener('click', () => select(p.id, 'list'));
      b.addEventListener('pointerenter', () => view.printer.highlight(p.id));
      b.addEventListener('pointerleave', () => view.printer.highlight(selected));
      listBtns.set(p.id, b);
      items.appendChild(b);
    }
    group.appendChild(items);
    list.appendChild(group);
  }

  const info = el('div', { class: 'panel' });
  append(panel,
    el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('layers'), 'ชั้นการไหล (เปิดซ้อนกันได้)'), el('div', { class: 'panel__body' }, layerRow)),
    info,
    el('div', { class: 'panel' }, el('div', { class: 'panel__head' }, icon('list'), 'ชิ้นส่วนทั้ง 18 ชิ้น'), el('div', { class: 'panel__body' }, list)),
  );

  let selected: string | null = null;
  function renderExplored(): void {
    exploredChip.textContent = `${explored.size}/${PARTS.length}`;
  }
  renderExplored();
  renderInfo(null);

  function select(id: string | null, via: 'model' | 'list' | 'link'): void {
    selected = id;
    view.printer.highlight(id);
    for (const [pid, b] of listBtns) b.classList.toggle('is-selected', pid === id);
    if (id) {
      const first = !explored.has(id);
      explored.add(id);
      listBtns.get(id)?.classList.add('is-placed');
      trackX('part_explored', { part: id, via, first, explored: explored.size });
      view.focus(id);
      void persist();
    }
    renderExplored();
    renderInfo(id ? partById(id) ?? null : null);
  }

  function renderInfo(p: PartSpec | null): void {
    clear(info);
    if (!p) {
      append(info, el('div', { class: 'panel__head' }, icon('info'), 'ข้อมูลชิ้นส่วน'), el('div', { class: 'panel__body muted', text: 'ยังไม่ได้เลือกชิ้นส่วน แตะที่โมเดลหรือเลือกจากรายการด้านล่าง' }));
      return;
    }
    const sub = subsystemById(p.subsystem);
    const connects = el('div', { class: 'row' });
    for (const cid of p.connects) {
      const cp = partById(cid);
      if (!cp) continue;
      const b = el('button', { class: 'chip', type: 'button', 'data-connect': cid }, icon('link'), el('span', { text: cp.short }));
      b.addEventListener('click', () => select(cid, 'link'));
      connects.appendChild(b);
    }
    const layersOf = (Object.keys(FLOWS) as FlowLayerId[]).filter((l) => FLOWS[l].edges.some(([a, b]) => a === p.id || b === p.id));
    append(info,
      el('div', { class: 'panel__head', style: `--sub-color:${sub?.color ?? ''}` }, el('span', { class: 'part-chip__dot' }), el('span', { text: p.name })),
      el('div', { class: 'panel__body stack' },
        el('div', { class: 'row' }, el('span', { class: 'tag', text: `ระบบ: ${sub?.name ?? p.subsystem}` }), ...layersOf.map((l) => el('span', { class: 'tag tag--muted', style: `color:${FLOWS[l].color};border-color:${FLOWS[l].color}` }, icon(LAYER_ICON[l]), FLOWS[l].name))),
        el('p', {}, el('strong', { text: 'หน้าที่ ' }), p.function),
        el('div', {}, el('strong', { class: 'small', text: 'เชื่อมต่อกับ' }), connects),
        p.probe ? renderProbe(p) : null,
      ),
    );
  }

  function renderProbe(p: PartSpec): HTMLElement {
    const probe = p.probe;
    if (!probe) return el('div');
    const box = el('div', { class: 'probe' }, el('div', { class: 'probe__q' }, icon('bulb'), el('span', { text: probe.question })));
    const done = answered.has(p.id);
    const feedback = el('p', { class: 'probe__fb', hidden: !done }, done ? probe.explain : '');
    const choices = el('div', { class: 'probe__choices' });
    probe.choices.forEach((c, i) => {
      const b = el('button', { class: 'btn btn--sm probe__choice', type: 'button', 'data-choice': i, disabled: done }, c);
      b.addEventListener('click', () => {
        const correct = i === probe.answer;
        trackX(correct ? 'probe_answer' : 'probe_wrong', { part: p.id, choice: i, correct, errorType: correct ? undefined : 'probe_wrong' });
        if (correct) {
          probeCorrect++;
          answered.add(p.id);
          b.classList.add('is-right');
          choices.querySelectorAll('button').forEach((x) => (x.disabled = true));
          feedback.textContent = probe.explain;
          feedback.hidden = false;
          void persist();
        } else {
          b.classList.add('is-wrong');
          b.disabled = true;
          feedback.textContent = 'ยังไม่ใช่ ลองคิดจากหน้าที่ของชิ้นส่วนนี้และชิ้นที่มันเชื่อมต่อด้วย';
          feedback.hidden = false;
        }
      });
      choices.appendChild(b);
    });
    append(box, choices, feedback);
    return box;
  }

  async function persist(): Promise<void> {
    await saveData('explore', { explored: [...explored], answered: [...answered] });
  }

  view.onHover = (id) => {
    if (!selected) view.printer.highlight(id);
  };
  view.onClick = (id) => select(id, 'model');

  return () => {
    trackX('explore_close', { parts_explored: explored.size, layers_toggled: layersToggled, probe_questions_answered: answered.size, probe_correct_this_visit: probeCorrect });
    flows.dispose();
    view.dispose();
  };
};
