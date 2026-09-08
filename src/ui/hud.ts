import { icon } from './icons';

/** สร้าง HUD ด้วย DOM ล้วน (ไม่ใช้เฟรมเวิร์ก UI) */
export function createHud(root: HTMLElement): HTMLElement {
  const hud = document.createElement('div');
  hud.className = 'hud';

  // แถบบน: ชื่อโปรเจกต์ + สถานะ
  const top = document.createElement('div');
  top.className = 'hud__top';

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.appendChild(icon('printer'));
  const name = document.createElement('span');
  name.className = 'brand__name';
  name.textContent = 'PRINTLAB';
  const tag = document.createElement('span');
  tag.className = 'brand__tag';
  tag.textContent = 'ห้องปฏิบัติการเครื่องพิมพ์ 3 มิติ';
  brand.append(name, tag);

  const status = document.createElement('div');
  status.className = 'chip chip--muted';
  status.appendChild(icon('grid'));
  const statusText = document.createElement('span');
  statusText.textContent = 'M1 · โมเดลเครื่องพิมพ์';
  status.appendChild(statusText);

  top.append(brand, status);

  // แถบล่าง: คำแนะนำการควบคุมกล้อง
  const bottom = document.createElement('div');
  bottom.className = 'hud__bottom';

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.appendChild(icon('orbit'));
  hint.append(kbd('ลากซ้าย'), text(' หมุน  '));
  hint.appendChild(icon('zoom'));
  hint.append(kbd('ล้อเมาส์'), text(' ซูม  '), kbd('ลากขวา'), text(' เลื่อน'));

  bottom.append(hint);

  hud.append(top, bottom);
  root.appendChild(hud);
  return hud;
}

function kbd(label: string): HTMLElement {
  const el = document.createElement('kbd');
  el.textContent = label;
  return el;
}

function text(value: string): Text {
  return document.createTextNode(value);
}
