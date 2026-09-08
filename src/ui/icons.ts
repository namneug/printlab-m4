/** ไอคอนทั้งหมดเป็น inline SVG แบบเส้น (stroke) ห้ามใช้อิโมจิ */
const NS = 'http://www.w3.org/2000/svg';

type IconName = 'printer' | 'orbit' | 'zoom' | 'grid' | 'info';

const PATHS: Record<IconName, string[]> = {
  printer: [
    'M6 9V4h12v5',
    'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
    'M6 14h12v6H6z',
  ],
  orbit: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M3 12h18',
    'M12 3c2.5 2.6 3.75 5.6 3.75 9s-1.25 6.4-3.75 9c-2.5-2.6-3.75-5.6-3.75-9S9.5 5.6 12 3z',
  ],
  zoom: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35', 'M8 11h6', 'M11 8v6'],
  grid: ['M3 3h18v18H3z', 'M3 9h18', 'M3 15h18', 'M9 3v18', 'M15 3v18'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16v-4', 'M12 8h.01'],
};

export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  const paths = PATHS[name];
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}
