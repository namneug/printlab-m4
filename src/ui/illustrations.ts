/** ภาพประกอบอาการเสีย — inline SVG แบบเส้น (ไม่ใช้รูปภาพภายนอก) เพิ่ม key ใหม่ได้ที่นี่เมื่อเพิ่มเคสใน faults.json */
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const BED = `<line x1="10" y1="110" x2="190" y2="110" ${S} stroke="var(--tx-dim)"/>`;
const NOZ = (x: number, y: number): string => `<path d="M${x - 12} ${y - 30}h24l-4 18h-16z M${x - 4} ${y - 12}l4 8 4-8" ${S} stroke="var(--amber)"/>`;

const DRAWINGS: Record<string, string> = {
  first_layer: `${BED}${NOZ(100, 60)}<path d="M40 108c10-14 20-6 30-4s20-4 30 2 20 10 30-2 20-8 30 0" ${S} stroke="var(--red)" stroke-dasharray="6 5"/><path d="M60 100c6-10 14-8 18-2" ${S} stroke="var(--red)"/><path d="M130 96c8-8 14-4 16 4" ${S} stroke="var(--red)"/>`,
  layer_shift: `${BED}<path d="M60 110V62h60v48" ${S} stroke="var(--tx-2)"/><path d="M78 62V20h60v42" ${S} stroke="var(--red)"/><line x1="66" y1="62" x2="150" y2="62" ${S} stroke="var(--line)"/><path d="M60 78h60M60 94h60M78 36h60M78 50h60" ${S} stroke="var(--line)"/><path d="M150 40l14 0m-4-4 4 4-4 4" ${S} stroke="var(--red)"/>`,
  nozzle_clog: `${BED}${NOZ(100, 90)}<circle cx="100" cy="72" r="6" ${S} stroke="var(--red)"/><path d="M96 68l8 8m0-8-8 8" ${S} stroke="var(--red)"/><path d="M70 40c4-6 8-6 12 0s8 6 12 0" ${S} stroke="var(--tx-dim)"/><path d="M40 108h120" ${S} stroke="var(--line)"/><text x="100" y="128" text-anchor="middle" font-size="10" fill="var(--tx-dim)">ไม่มีเส้นออก</text>`,
  under_extrusion: `${BED}<rect x="50" y="40" width="100" height="70" rx="2" ${S} stroke="var(--tx-2)"/><path d="M50 60h20m10 0h15m12 0h20m8 0h15M50 80h30m12 0h20m10 0h28M50 100h15m14 0h25m10 0h36" ${S} stroke="var(--red)"/>`,
  stringing: `${BED}<path d="M50 110V50h20v60M130 110V50h20v60" ${S} stroke="var(--tx-2)"/><path d="M70 58c20 4 40-4 60 2M70 72c20-6 40 6 60-2M70 86c20 4 40-4 60 2M70 100c20-4 40 4 60-2" ${S} stroke="var(--red)" stroke-width="1"/>`,
  warping: `${BED}<path d="M40 110c6-12 12-16 20-18h80c8 2 14 6 20 18" ${S} stroke="var(--red)"/><path d="M60 92V40h80v52" ${S} stroke="var(--tx-2)"/><path d="M60 56h80M60 72h80" ${S} stroke="var(--line)"/><path d="M44 104l-6-10m118 10 6-10" ${S} stroke="var(--red)"/>`,
  generic: `${BED}<rect x="60" y="50" width="80" height="60" rx="3" ${S} stroke="var(--tx-2)"/><path d="M100 68v14m0 6v.5" ${S} stroke="var(--amber)"/>`,
};

export function illustration(key: string, className = 'illus'): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = className;
  wrap.innerHTML = `<svg viewBox="0 0 200 140" role="img" aria-label="ภาพประกอบอาการ">${DRAWINGS[key] ?? DRAWINGS['generic']}</svg>`;
  return wrap;
}

export function hasIllustration(key: string): boolean {
  return key in DRAWINGS;
}
