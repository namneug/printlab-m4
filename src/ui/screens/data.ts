import { el, append, clear, fmtMinSec, fmtNum } from '../dom';
import { icon } from '../icons';
import type { Screen } from '../router';
import { getSession } from '../../game/session';
import { allEvents, endpointConfigured, onQueueChange, pendingCount, flush } from '../../telemetry/queue';
import { download, filterEvents, levelStats, stripStored, toCSV, toJSON, toSummaryCSV, stamp, mean } from '../../telemetry/export';
import { CONSTRUCT_LABELS, type Construct } from '../../telemetry/schema';
import { LEVELS } from '../../levels';
import { track } from '../../telemetry/events';
import { helpLink } from '../helpLink';

/** หน้า "ข้อมูลของฉัน" — ดู event ที่บันทึกในเครื่องนี้ และส่งออก CSV/JSON */
export const dataScreen: Screen = (root) => {
  const session = getSession();
  const page = el('div', { class: 'screen screen--map' });
  const header = el('header', { class: 'topbar' },
    el('div', { class: 'brand' }, icon('printer'), el('span', { class: 'brand__name', text: 'PRINTLAB' })),
    el('div', { class: 'topbar__title', text: 'ข้อมูลของฉัน' }),
    el('div', { class: 'topbar__right' }, helpLink(), el('a', { class: 'btn btn--ghost btn--sm', href: '#/map' }, icon('arrow-left'), 'แผนที่')),
  );

  const stats = el('div', { class: 'row' });
  const tableWrap = el('div', { class: 'table-wrap' });
  const levelWrap = el('div', { class: 'table-wrap' });
  const tpSel = el('select', { class: 'input' }, el('option', { value: '', text: 'ทุกช่วงเวลา' }), ...['O1', 'X', 'O2', 'O3', 'O4'].map((t) => el('option', { value: t, text: t }))) as HTMLSelectElement;
  const csSel = el('select', { class: 'input' }, el('option', { value: '', text: 'ทุก construct' }), ...(Object.keys(CONSTRUCT_LABELS) as Construct[]).map((c) => el('option', { value: c, text: CONSTRUCT_LABELS[c] }))) as HTMLSelectElement;
  const btnCsv = el('button', { class: 'btn', type: 'button' }, icon('download'), 'ส่งออก CSV');
  const btnJson = el('button', { class: 'btn', type: 'button' }, icon('download'), 'ส่งออก JSON');
  const btnSummary = el('button', { class: 'btn', type: 'button' }, icon('download'), 'สรุปรายคน CSV');
  const btnFlush = el('button', { class: 'btn btn--ghost', type: 'button', hidden: !endpointConfigured() }, icon('upload'), 'ส่งข้อมูลค้างส่ง');

  const main = el('main', { class: 'map-main' },
    el('section', { class: 'map-section' },
      el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'สถานะการบันทึก' }), el('p', { class: 'section-sub', text: endpointConfigured() ? 'ข้อมูลถูกเก็บในเครื่องก่อน แล้วส่งไปเซิร์ฟเวอร์เมื่อออนไลน์' : 'โหมดออฟไลน์: ข้อมูลเก็บในเบราว์เซอร์นี้ ส่งออกเป็นไฟล์ให้ครูได้จากปุ่มด้านล่าง' })),
      stats,
    ),
    el('section', { class: 'map-section' },
      el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'ส่งออกข้อมูล' }), el('p', { class: 'section-sub', text: 'แยกตามช่วงเวลาและ construct ได้ ไฟล์มีเฉพาะรหัสนิรนาม' })),
      el('div', { class: 'row' }, tpSel, csSel, btnCsv, btnJson, btnSummary, btnFlush),
    ),
    el('section', { class: 'map-section' },
      el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'สรุปรายด่าน' })),
      levelWrap,
    ),
    el('section', { class: 'map-section' },
      el('div', { class: 'section-head' }, el('h2', { class: 'section-title', text: 'event ล่าสุด' })),
      tableWrap,
    ),
  );
  append(page, header, main);
  root.appendChild(page);

  const filterNow = () => ({ timepoint: tpSel.value || undefined, construct: csSel.value || undefined });

  async function refresh(): Promise<void> {
    const rows = stripStored(await allEvents());
    const mine = session ? rows.filter((r) => r.participantCode === session.participantCode) : rows;
    const pending = await pendingCount();
    clear(stats);
    append(stats,
      stat('event ทั้งหมด', fmtNum(rows.length)),
      stat('ของรหัสนี้', fmtNum(mine.length)),
      stat(endpointConfigured() ? 'รอส่ง' : 'เก็บในเครื่อง', fmtNum(endpointConfigured() ? pending : rows.length)),
      stat('ออนไลน์', navigator.onLine ? 'ใช่' : 'ไม่'),
    );

    clear(levelWrap);
    const ls = levelStats(mine);
    const tbl = el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'ด่าน' }), el('th', { class: 'num', text: 'เริ่ม' }), el('th', { class: 'num', text: 'ผ่าน' }), el('th', { class: 'num', text: 'เวลาเฉลี่ย' }), el('th', { class: 'num', text: 'ครั้งที่ลอง' }), el('th', { class: 'num', text: 'คำใบ้' }), el('th', { text: 'ข้อผิดพลาด' }))),
      el('tbody', {}, ...ls.map((s) => el('tr', {},
        el('td', { text: LEVELS.find((l) => l.id === s.levelId)?.title ?? s.levelId }),
        el('td', { class: 'num', text: String(s.starts) }),
        el('td', { class: 'num', text: String(s.completes) }),
        el('td', { class: 'num', text: mean(s.durationsMs) === null ? 'รอเก็บ' : fmtMinSec(mean(s.durationsMs) ?? 0) }),
        el('td', { class: 'num', text: String(s.attempts) }),
        el('td', { class: 'num', text: String(s.hints) }),
        el('td', { text: Object.entries(s.errorsByType).map(([k, v]) => `${k} ×${v}`).join(', ') || '—' }),
      ))),
    );
    levelWrap.appendChild(ls.length ? tbl : el('p', { class: 'muted', text: 'ยังไม่มีข้อมูลด่าน' }));

    clear(tableWrap);
    const last = mine.slice(-25).reverse();
    tableWrap.appendChild(el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'เวลา' }), el('th', { text: 'ด่าน' }), el('th', { text: 'event' }), el('th', { text: 'construct' }), el('th', { text: 'payload' }))),
      el('tbody', {}, ...last.map((e) => el('tr', {},
        el('td', { class: 'mono small', text: e.clientTs.slice(11, 19) }),
        el('td', { text: e.levelId ?? '—' }),
        el('td', { class: 'mono small', text: e.eventType }),
        el('td', { text: e.construct ? CONSTRUCT_LABELS[e.construct] : '—' }),
        el('td', { class: 'small muted', text: JSON.stringify(e.payload).slice(0, 120) }),
      ))),
    ));
  }

  btnCsv.addEventListener('click', async () => {
    const rows = filterEvents(stripStored(await allEvents()), filterNow());
    track('export', { format: 'csv', count: rows.length, ...filterNow() });
    download(`printlab-events-${stamp()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  });
  btnJson.addEventListener('click', async () => {
    const rows = filterEvents(stripStored(await allEvents()), filterNow());
    track('export', { format: 'json', count: rows.length, ...filterNow() });
    download(`printlab-events-${stamp()}.json`, toJSON(rows), 'application/json');
  });
  btnSummary.addEventListener('click', async () => {
    const rows = filterEvents(stripStored(await allEvents()), filterNow());
    track('export', { format: 'summary_csv', count: rows.length, ...filterNow() });
    download(`printlab-summary-${stamp()}.csv`, toSummaryCSV(rows), 'text/csv;charset=utf-8');
  });
  btnFlush.addEventListener('click', async () => {
    const n = await flush();
    btnFlush.replaceChildren(icon('upload'), `ส่งแล้ว ${n} รายการ`);
    void refresh();
  });

  const off = onQueueChange(() => void refresh());
  void refresh();

  function stat(label: string, value: string): HTMLElement {
    return el('div', { class: 'stat' }, el('span', { class: 'stat__label', text: label }), el('span', { class: 'stat__value mono', text: value }));
  }
  return () => off();
};
