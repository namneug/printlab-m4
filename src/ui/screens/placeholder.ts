import { el } from '../dom';
import { icon, type IconName } from '../icons';
import type { Screen } from '../router';

/** หน้าชั่วคราวสำหรับโหมดที่ยังไม่พัฒนา */
export function placeholderScreen(title: string, ic: IconName): Screen {
  return (root) => {
    root.appendChild(
      el('div', { class: 'screen screen--center' },
        el('div', { class: 'empty' },
          icon(ic, 'icon icon--lg'),
          el('h2', { text: title }),
          el('p', { class: 'muted', text: 'โหมดนี้กำลังพัฒนา จะเปิดใน milestone ถัดไป' }),
          el('a', { class: 'btn btn--ghost', href: '#/map' }, icon('arrow-left'), 'กลับแผนที่'),
        ),
      ),
    );
  };
}
