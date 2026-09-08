import { el, append, fmtMinSec } from '../dom';
import { icon } from '../icons';
import { navigate, type Screen } from '../router';
import { LEVELS } from '../../levels';
import { getProgress, getSession, isLevelDone } from '../../game/session';
import { track } from '../../telemetry/events';

let freeMode = false;

export const mapScreen: Screen = (root, _params, query) => {
  if (query.get('free') === '1') freeMode = true;
  const session = getSession();
  const progress = getProgress();
  track('map_view', { completed: Object.keys(progress.levels) });

  const page = el('div', { class: 'screen screen--map' });

  const header = el('header', { class: 'topbar' },
    el('div', { class: 'brand' }, icon('printer'), el('span', { class: 'brand__name', text: 'PRINTLAB' })),
    el('div', { class: 'topbar__title', text: 'แผนที่ภารกิจ' }),
    el('div', { class: 'topbar__right' },
      el('span', { class: 'chip' }, icon('user'), el('span', { class: 'mono', text: session?.participantCode ?? '' })),
      el('a', { class: 'btn btn--ghost btn--sm', href: '#/' }, icon('arrow-left'), 'หน้าแรก'),
    ),
  );

  const grid = el('div', { class: 'level-grid' });
  const doneCount = LEVELS.filter((l) => isLevelDone(l.id)).length;

  LEVELS.forEach((lv, i) => {
    const done = isLevelDone(lv.id);
    const prev = i === 0 ? true : isLevelDone(LEVELS[i - 1]?.id ?? '');
    const unlocked = freeMode || done || prev;
    const result = progress.levels[lv.id];

    const card = el('a', {
      class: `level-card${done ? ' is-done' : ''}${unlocked ? '' : ' is-locked'}`,
      href: unlocked ? `#/level/${lv.id}` : undefined,
      'aria-disabled': unlocked ? undefined : 'true',
      tabindex: unlocked ? undefined : -1,
    });
    const num = el('div', { class: 'level-card__num', text: String(lv.number).padStart(2, '0') });
    const status = el('div', { class: 'level-card__status' },
      done ? icon('check') : unlocked ? icon('play') : icon('lock'),
      el('span', { text: done ? 'ผ่านแล้ว' : unlocked ? 'พร้อมเล่น' : 'ยังไม่เปิด' }),
    );
    const meta = el('div', { class: 'level-card__meta' },
      ...lv.indicators.map((ind) => el('span', { class: 'tag', text: ind })),
      el('span', { class: 'tag tag--muted' }, icon('clock'), `≈ ${lv.estimatedMinutes} นาที`),
    );
    append(card,
      el('div', { class: 'level-card__head' }, num, status),
      el('h2', { class: 'level-card__title', text: lv.title }),
      el('p', { class: 'level-card__sub', text: lv.subtitle }),
      el('p', { class: 'level-card__obj', text: lv.objective }),
      meta,
      result ? el('p', { class: 'level-card__result', text: `ใช้เวลา ${fmtMinSec(result.durationMs)} · คำใบ้ ${result.hintsUsed} ครั้ง` }) : null,
    );
    if (!unlocked) {
      card.addEventListener('click', (e) => e.preventDefault());
    }
    grid.appendChild(card);
  });

  const modes = el('div', { class: 'mode-row' },
    modeCard('explore', 'eye', 'สำรวจสถาปัตยกรรม', 'แตะชิ้นส่วนเพื่อดูชื่อ หน้าที่ และการเชื่อมต่อ สลับชั้นการไหล 3 ชั้น'),
    modeCard('repair', 'wrench', 'โมดูลซ่อม', 'ฝึกวินิจฉัยเคสสุ่มจากคลังได้ไม่จำกัด ใช้กลไกเดียวกับด่าน 3'),
  );

  const progressBar = el('div', { class: 'progress' },
    el('div', { class: 'progress__label' }, el('span', { text: 'ความคืบหน้า' }), el('span', { class: 'mono', text: `${doneCount}/${LEVELS.length} ด่าน` })),
    el('div', { class: 'progress__bar' }, el('div', { class: 'progress__fill', style: `width:${(doneCount / LEVELS.length) * 100}%` })),
  );

  append(page, header, el('main', { class: 'map-main' },
    el('section', { class: 'map-section' },
      el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'ด่านภารกิจ' }), el('p', { class: 'section-sub', text: 'เล่นตามลำดับ 1 → 6 ด่าน 5 คือภารกิจเต็มวงจรที่รวมทุกทักษะจากด่าน 1–4' })),
      progressBar,
      grid,
    ),
    el('section', { class: 'map-section' },
      el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'โหมดเปิดตลอด' })),
      modes,
    ),
  ));
  root.appendChild(page);

  function modeCard(path: string, ic: 'eye' | 'wrench', title: string, desc: string): HTMLElement {
    const a = el('a', { class: 'mode-card', href: `#/${path}` }, icon(ic, 'icon icon--lg'), el('div', {}, el('h3', { class: 'mode-card__title', text: title }), el('p', { class: 'mode-card__desc', text: desc })), icon('arrow-right'));
    a.addEventListener('click', () => navigate(`/${path}`));
    return a;
  }
};
