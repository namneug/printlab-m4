/** ผังแบบโหนด–ลูกศรบน SVG ที่ผู้เล่นลากเส้นเชื่อมเองได้ (ใช้ในด่าน 1 และโหมดอื่นที่ต้องต่อผัง) */
import { el } from './dom';

const NS = 'http://www.w3.org/2000/svg';

export interface DiagramNode {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  cls?: string;
}

export interface DiagramLink {
  from: string;
  to: string;
  cls?: string;
}

export type LinkVerdict = 'ok' | 'wrong' | 'duplicate';

export interface DiagramOptions {
  width: number;
  height: number;
  nodes: DiagramNode[];
  /** ตัดสินเส้นที่ผู้เล่นลาก */
  onLink(from: string, to: string): LinkVerdict;
  onHover?: (id: string | null) => void;
}

export interface Diagram {
  root: HTMLElement;
  svg: SVGSVGElement;
  links: DiagramLink[];
  addLink(from: string, to: string, cls?: string): void;
  flashWrong(from: string, to: string): void;
  setHover(id: string | null): void;
  dispose(): void;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

export function createDiagram(opts: DiagramOptions): Diagram {
  const root = el('div', { class: 'diagram' });
  const svg = svgEl('svg', { viewBox: `0 0 ${opts.width} ${opts.height}`, role: 'img' });
  root.appendChild(svg);

  const defs = svgEl('defs');
  for (const [id, color] of [['arrow', 'var(--cyan)'], ['arrow-red', 'var(--red)'], ['arrow-amber', 'var(--amber)']] as const) {
    const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' });
    const p = svgEl('path', { d: 'M0 0L10 5L0 10z', fill: color });
    m.appendChild(p);
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  const linkLayer = svgEl('g');
  const draft = svgEl('path', { class: 'dlink dlink--draft', d: '' });
  draft.style.display = 'none';
  const nodeLayer = svgEl('g');
  svg.append(linkLayer, draft, nodeLayer);

  const nodeMap = new Map<string, DiagramNode & { w: number; h: number; g: SVGGElement }>();
  const links: DiagramLink[] = [];

  for (const n of opts.nodes) {
    const w = n.w ?? 150;
    const h = n.h ?? 66;
    const g = svgEl('g', { class: `dnode ${n.cls ?? ''}`, tabindex: 0, role: 'button', 'data-id': n.id });
    g.setAttribute('aria-label', n.label);
    g.appendChild(svgEl('rect', { x: n.x - w / 2, y: n.y - h / 2, width: w, height: h }));
    const t = svgEl('text', { x: n.x, y: n.y + (n.sub ? -3 : 6), 'text-anchor': 'middle' });
    t.textContent = n.label;
    g.appendChild(t);
    if (n.sub) {
      const s = svgEl('text', { x: n.x, y: n.y + 17, 'text-anchor': 'middle', class: 'dnode__sub' });
      s.textContent = n.sub;
      g.appendChild(s);
    }
    nodeLayer.appendChild(g);
    nodeMap.set(n.id, { ...n, w, h, g });
  }

  /** จุดบนขอบสี่เหลี่ยมในทิศทางไปยังอีกจุด */
  function edgePoint(id: string, tx: number, ty: number): [number, number] {
    const n = nodeMap.get(id);
    if (!n) return [tx, ty];
    const dx = tx - n.x;
    const dy = ty - n.y;
    if (dx === 0 && dy === 0) return [n.x, n.y];
    const sx = Math.abs(dx) > 0 ? (n.w / 2) / Math.abs(dx) : Infinity;
    const sy = Math.abs(dy) > 0 ? (n.h / 2) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return [n.x + dx * s, n.y + dy * s];
  }

  function pathFor(from: string, to: string): string {
    const a = nodeMap.get(from);
    const b = nodeMap.get(to);
    if (!a || !b) return '';
    const [x1, y1] = edgePoint(from, b.x, b.y);
    const [x2, y2] = edgePoint(to, a.x, a.y);
    // โค้งเล็กน้อยเพื่อให้เส้นไป–กลับระหว่างสองโหนดไม่ทับกัน
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const off = 18;
    const cx = mx - (dy / len) * off;
    const cy = my + (dx / len) * off;
    return `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
  }

  function addLink(from: string, to: string, cls = ''): void {
    links.push({ from, to, cls });
    const p = svgEl('path', { class: `dlink ${cls}`, d: pathFor(from, to) });
    linkLayer.appendChild(p);
    p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  }

  function flashWrong(from: string, to: string): void {
    const p = svgEl('path', { class: 'dlink dlink--wrong', d: pathFor(from, to) });
    linkLayer.appendChild(p);
    p.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 900 }).onfinish = () => p.remove();
  }

  /* ---------- การลาก ---------- */
  let source: string | null = null;
  let dragging = false;
  let downPos: { x: number; y: number } | null = null;
  let downId: string | null = null;

  const setSource = (id: string | null): void => {
    for (const n of nodeMap.values()) n.g.classList.toggle('is-source', n.id === id);
    source = id;
  };

  function toSvg(ev: PointerEvent): { x: number; y: number } {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }

  function nodeAt(ev: PointerEvent): string | null {
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    const g = target?.closest<SVGGElement>('.dnode');
    return g?.dataset['id'] ?? null;
  }

  function tryLink(from: string, to: string): void {
    if (from === to) return;
    const verdict = opts.onLink(from, to);
    if (verdict === 'ok') addLink(from, to);
    else if (verdict === 'wrong') flashWrong(from, to);
  }

  const onDown = (ev: PointerEvent): void => {
    const id = nodeAt(ev);
    if (!id) return;
    ev.preventDefault();
    downPos = { x: ev.clientX, y: ev.clientY };
    downId = id;
    dragging = false;
    svg.setPointerCapture(ev.pointerId);
  };
  const onMove = (ev: PointerEvent): void => {
    const hoverId = nodeAt(ev);
    for (const n of nodeMap.values()) n.g.classList.toggle('is-hover', n.id === hoverId);
    opts.onHover?.(hoverId);
    if (!downPos) return;
    if (!dragging && Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y) > 6) {
      dragging = true;
      if (downId) setSource(downId);
    }
    if (dragging && source) {
      const p = toSvg(ev);
      const [x1, y1] = edgePoint(source, p.x, p.y);
      draft.setAttribute('d', `M${x1} ${y1} L${p.x} ${p.y}`);
      draft.style.display = '';
    }
  };
  const onUp = (ev: PointerEvent): void => {
    draft.style.display = 'none';
    const id = nodeAt(ev);
    if (!downPos) return;
    downPos = null;
    if (dragging) {
      if (source && id && id !== source) {
        tryLink(source, id);
        setSource(null);
      } else if (!id) {
        setSource(null);
      }
      dragging = false;
      return;
    }
    // คลิก (ไม่ลาก): คลิกแรกเลือกต้นทาง คลิกที่สองเลือกปลายทาง
    if (id && source && id !== source) {
      tryLink(source, id);
      setSource(null);
    } else if (id && source === id) {
      setSource(null);
    } else if (id) {
      setSource(id);
    }
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const g = (ev.target as Element).closest<SVGGElement>('.dnode');
    const id = g?.dataset['id'];
    if (!id) return;
    ev.preventDefault();
    if (source && source !== id) {
      tryLink(source, id);
      setSource(null);
    } else if (source === id) setSource(null);
    else setSource(id);
  };
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('keydown', onKey);

  return {
    root,
    svg,
    links,
    addLink,
    flashWrong,
    setHover(id) {
      for (const n of nodeMap.values()) n.g.classList.toggle('is-hover', n.id === id);
    },
    dispose() {
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
