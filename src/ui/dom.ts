/** ตัวช่วยสร้าง DOM สั้น ๆ — UI ทั้งเกมเป็น DOM ล้วน */
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('data-') || k.startsWith('aria-')) node.setAttribute(k, String(v));
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  append(node, ...children);
  return node;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function fmtMinSec(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m} นาที ${r} วินาที` : `${r} วินาที`;
}

export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString('th-TH', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** เลื่อนแบบนุ่มนวลไปยัง element ถ้าอยู่นอกจอ */
export function reveal(node: HTMLElement): void {
  node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
