import { el } from './dom';
import { icon } from './icons';

/** URL ของคู่มือนักเรียน (หน้าสถิต /help/ ใต้ base เดียวกับเกม) */
export const HELP_URL = `${import.meta.env.BASE_URL}help/`;

/** ลิงก์คู่มือสำหรับแถบบนของทุกหน้า — เปิดแท็บใหม่เพื่อไม่ให้หลุดจากด่านที่กำลังเล่น */
export function helpLink(label = 'คู่มือ', cls = 'btn btn--ghost btn--sm'): HTMLAnchorElement {
  return el('a', { class: cls, href: HELP_URL, target: '_blank', rel: 'noopener', title: 'คู่มือนักเรียน (เปิดแท็บใหม่)' }, icon('info'), label);
}
