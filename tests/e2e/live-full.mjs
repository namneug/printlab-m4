/**
 * ทดสอบกับ URL จริงบนเน็ต: BASE_URL=https://namneug.github.io/printlab-m4/ node tests/e2e/live-full.mjs
 * เล่นครบ 6 ด่าน + โหมดสำรวจ + โมดูลซ่อม + ส่งออกไฟล์นักเรียน + หน้าครูนำเข้าไฟล์ เก็บ console error และ request ล้มเหลวทุกหน้า
 */
import { readFileSync, copyFileSync } from 'node:fs';
import { dismissTour, launch, assert, report, getEvents, routedContext, BASE, OUT } from './lib.mjs';

const parts = JSON.parse(readFileSync(new URL('../../src/data/parts.json', import.meta.url), 'utf8'));
const faults = JSON.parse(readFileSync(new URL('../../src/data/faults.json', import.meta.url), 'utf8'));
const impact = JSON.parse(readFileSync(new URL('../../src/data/impact.json', import.meta.url), 'utf8'));
const subOf = Object.fromEntries(parts.parts.map((p) => [p.id, p.subsystem]));
const CODE = process.env.CODE ?? 'ANON-002';
const TEACHER_PASS = process.env.TEACHER_PASS ?? 'printlab-teacher';

const { page, errors, failed, fontIssues, shot, close } = await launch();
const t0 = Date.now();
const step = (s) => console.log(`  … ${s} (${Math.round((Date.now() - t0) / 1000)}s, errors ${errors.length}, failed ${failed.length})`);
try {
  console.log('BASE', BASE);
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await shot('live-start');
  await page.fill('#code', CODE);
  await page.selectOption('#timepoint', 'X');
  await page.check('#consent');
  await page.click('button[type=submit]');
  await page.waitForSelector('.level-grid');
  step('session ' + CODE);

  /* ด่าน 1 */
  await page.click('.level-card[href="#/level/l1"]');
  await page.click('#level-start'); await dismissTour(page);
  await page.waitForSelector('.l1-tray .part-chip');
  for (const id of Object.keys(subOf)) { await page.click(`.l1-tray .part-chip[data-part="${id}"]`); await page.click(`.bin[data-sub="${subOf[id]}"]`); }
  await page.click('#l1-to-flow');
  for (const [a, b] of [['input', 'process'], ['process', 'output'], ['process', 'feedback'], ['feedback', 'process']]) { await page.click(`.dnode[data-id="${a}"]`); await page.click(`.dnode[data-id="${b}"]`); }
  await page.click('#guide-primary');
  await page.waitForSelector('.dnode[data-id="thermistor"]');
  for (const [a, b] of [['thermistor', 'mainboard'], ['mainboard', 'hotend_heater']]) { await page.click(`.dnode[data-id="${a}"]`); await page.click(`.dnode[data-id="${b}"]`); }
  await page.click('#guide-primary');
  await page.waitForSelector('.debrief');
  await shot('live-l1');
  await page.click('.debrief a.btn--primary');
  step('ด่าน 1');

  /* ด่าน 2 */
  await page.waitForSelector('#level-start'); await page.click('#level-start'); await dismissTour(page); await dismissTour(page);
  await page.click('#l2-priority-ok');
  await page.click('#l2-run');
  await page.locator('#l2-infill').fill('30'); await page.click('#l2-run');
  await page.locator('#l2-speed').fill('90'); await page.click('#l2-run');
  await page.locator('#l2-nozzle_temp').fill('220'); await page.click('#l2-run');
  await page.click('.btn--hint');
  await page.waitForSelector('#l2-finish'); await page.click('#l2-finish');
  await page.waitForSelector('.debrief'); await page.click('.debrief a.btn--primary');
  step('ด่าน 2');

  /* ด่าน 3 */
  const solveCase = async () => {
    await page.waitForSelector('.diag');
    const title = (await page.locator('.diag .panel__head').first().textContent()).replace('อาการ: ', '').trim();
    const c = faults.cases.find((x) => x.title === title);
    assert(c, 'ไม่พบเคส ' + title);
    const correct = c.hypotheses.find((h) => h.correct).id;
    const support = c.tests.find((t) => t.supports.includes(correct));
    await page.click(`.test[data-test="${support.id}"]`);
    const elim = c.tests.find((t) => t.id !== support.id && t.eliminates.length && t.time_cost <= c.time_budget - support.time_cost);
    if (elim) {
      await page.click(`.test[data-test="${elim.id}"]`);
      const target = elim.eliminates[0];
      await page.click(`button[data-elim="${target}"]`);
      await page.check(`input[name="elim-${target}"][value="${elim.id}"]`);
      await page.click(`button[data-confirm-elim="${target}"]`);
      await page.waitForSelector(`.hypo__item[data-hypo="${target}"].is-eliminated`);
    }
    await page.check(`input[name=cause][value="${correct}"]`);
    await page.check(`input[name=cite][value="${support.id}"]`);
    await page.click('#diag-submit');
    await page.waitForSelector('#diag-done');
    return c.id;
  };
  await page.waitForSelector('#level-start'); await page.click('#level-start'); await dismissTour(page); await dismissTour(page);
  const l3case = await solveCase();
  await page.click('#diag-done');
  await page.waitForSelector('.debrief'); await page.click('.debrief a.btn--primary');
  step('ด่าน 3 (' + l3case + ')');

  /* ด่าน 4 */
  await page.waitForSelector('#level-start'); await page.click('#level-start'); await dismissTour(page); await dismissTour(page);
  await page.waitForSelector('#l4-submit');
  await page.click('.room-opt[data-room="ventilated"]');
  await page.click('#l4-table-toggle');
  for (const [mat, prop, temp] of [['ABS', 'heat_resistance', 250], ['TPU', 'flexibility', 220], ['PLA', 'cost', 210]]) {
    await page.click(`.mat-card[data-mat="${mat}"]`);
    await page.locator('#l4-temp').fill(String(temp));
    await page.check(`input[name=justify][value="${prop}"]`);
    await page.click('#l4-submit');
    await page.waitForSelector('#l4-next'); await page.click('#l4-next');
  }
  await page.waitForSelector('.debrief'); await page.click('.debrief a.btn--primary');
  step('ด่าน 4');

  /* ด่าน 5 */
  await page.waitForSelector('#level-start'); await page.click('#level-start'); await dismissTour(page); await dismissTour(page);
  await page.waitForSelector('.edp-steps');
  for (const r of ['load', 'fit', 'no_tools', 'bump', 'time']) await page.check(`label[data-req="${r}"] input`);
  await page.click('#l5-step1-ok');
  for (const cd of ['table_edge', 'cable_weight', 'material_table', 'existing']) await page.click(`.dcard[data-card="${cd}"]`);
  await page.fill('#l5-measure', '25'); await page.click('#l5-step2-ok');
  await page.click('.sketch[data-sketch="clamp_holder"]'); await page.click('.mat-pill[data-material="PLA"]');
  await page.check('input[name=design-reason][value="strong_enough"]'); await page.click('#l5-step3-ok');
  await page.click('#l5-run-test'); await page.waitForSelector('.test-card'); await page.click('#l5-step4-ok');
  await page.click('#l5-iterate');
  await page.click('.mat-pill[data-material="PETG"]'); await page.locator('#l5-nozzle_temp').fill('240'); await page.locator('#l5-layer_height').fill('0.28'); await page.locator('#l5-speed').fill('80');
  await page.click('#l5-step3-ok'); await page.click('#l5-run-test'); await page.waitForSelector('.test-card'); await page.click('#l5-step4-ok');
  await page.check('input[name=change-reason][value="bump"]');
  for (const s of ['problem', 'solution', 'ev-2']) await page.check(`input[name=stmt][value="${s}"]`);
  await page.click('#l5-present');
  await page.waitForSelector('.debrief'); await page.click('.debrief a.btn--primary');
  step('ด่าน 5');

  /* ด่าน 6 */
  await page.waitForSelector('#level-start'); await page.click('#level-start'); await dismissTour(page); await dismissTour(page);
  await page.click('#l6-to-impact');
  for (const s of impact.statements) { await page.click(`.stmt-chip[data-stmt="${s.id}"]`); await page.click(`.impact-bin[data-dim="${s.dimension}"]`); }
  await page.click('#l6-to-decision');
  await page.click('.option[data-option="queue"]');
  await page.check('input[name=arg][value="own_avg"]'); await page.check('input[name=arg][value="own_energy"]');
  await page.click('#l6-submit');
  await page.waitForSelector('.debrief');
  await shot('live-l6');
  await page.click('.debrief a[href="#/map"]');
  await page.waitForSelector('.level-grid');
  assert((await page.locator('.level-card.is-done').count()) === 6, 'ต้องผ่านครบ 6 ด่าน');
  await shot('live-map-done');
  step('ด่าน 6 — ครบ 6 ด่าน');

  /* โหมดสำรวจ */
  await page.click('.mode-card[href="#/explore"]');
  await page.waitForSelector('.part-list .part-chip');
  for (const l of ['control', 'heat', 'motion']) await page.click(`.layer-btn[data-layer="${l}"]`);
  for (const p of parts.parts) await page.click(`.part-list .part-chip[data-part="${p.id}"]`);
  await page.click('.part-list .part-chip[data-part="thermistor"]');
  const probe = parts.parts.find((p) => p.id === 'thermistor').probe;
  await page.click(`.probe__choice[data-choice="${probe.answer}"]`);
  await page.waitForSelector('.probe__choice.is-right');
  const box = await page.locator('.viewport canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await shot('live-explore');
  await page.click('a[href="#/map"]');
  await page.waitForSelector('.level-grid');
  step('โหมดสำรวจ');

  /* โมดูลซ่อม 2 เคส */
  await page.click('.mode-card[href="#/repair"]');
  await page.waitForSelector('.diag');
  await dismissTour(page);
  const r1 = await solveCase();
  await page.click('#diag-done'); await page.waitForSelector('#repair-next'); await page.click('#repair-next');
  const r2 = await solveCase();
  await page.click('#diag-done'); await page.waitForSelector('#repair-next');
  assert(r1 !== r2, 'เคสซ่อมต้องไม่ซ้ำ');
  await shot('live-repair');
  step(`โมดูลซ่อม (${r1}, ${r2})`);

  /* ส่งออกไฟล์ฝั่งนักเรียน */
  await page.goto(BASE + '#/data', { waitUntil: 'networkidle' });
  await page.waitForSelector('.table tbody tr');
  const [dlJson] = await Promise.all([page.waitForEvent('download'), page.click('text=ส่งออก JSON')]);
  const jsonPath = `${OUT}/live-student-export.json`;
  copyFileSync(await dlJson.path(), jsonPath);
  const exported = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const [dlCsv] = await Promise.all([page.waitForEvent('download'), page.click('text=ส่งออก CSV')]);
  const csvPath = `${OUT}/live-student-export.csv`;
  copyFileSync(await dlCsv.path(), csvPath);
  const events = await getEvents(page);
  const completes = events.filter((e) => e.eventType === 'level_complete').map((e) => e.levelId);
  assert(['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].every((l) => completes.includes(l)), 'level_complete ครบ 6 ด่าน');
  assert(events.filter((e) => e.levelId === 'repair' && e.eventType === 'case_complete').length === 2, 'โมดูลซ่อม 2 เคส');
  // event 'export' ของการกดส่งออกเองถูกบันทึกหลังสร้างไฟล์ จึงต่างกันได้ไม่เกิน 2 รายการ
  assert(exported.events.length >= events.length - 2 && exported.events.length <= events.length, `ไฟล์ export ต้องมี event ครบ (${exported.events.length}/${events.length})`);
  step(`ส่งออก ${exported.events.length} events`);

  /* หน้าครู: เปิดใน context ใหม่ (เสมือนเครื่องครู ไม่มีข้อมูลในเบราว์เซอร์) แล้วนำเข้าไฟล์ */
  const teacherCtx = await routedContext(page.context().browser());
  const tp = await teacherCtx.newPage();
  tp.on('pageerror', (e) => errors.push('teacher pageerror: ' + e.message));
  tp.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_CONNECTION_RESET/.test(m.text())) errors.push('teacher console: ' + m.text()); });
  tp.on('response', (r) => { if (r.status() >= 400 && !/fonts\.g/.test(r.url())) failed.push(`teacher ${r.status()} ${r.url()}`); });
  await tp.goto(BASE + 'teacher/', { waitUntil: 'networkidle' });
  await tp.waitForSelector('#teacher-pass');
  assert(await tp.isVisible('#teacher-fallback-warning'), 'ต้องมีคำเตือนรหัสสำรอง');
  await tp.fill('#teacher-pass', TEACHER_PASS);
  await tp.click('button[type=submit]');
  await tp.waitForSelector('.kpis');
  assert(await tp.isVisible('text=ยังไม่มีข้อมูล'), 'context ใหม่ต้องยังไม่มีข้อมูล');
  await tp.setInputFiles('#src-file', jsonPath);
  await tp.waitForSelector(`tr[data-code="${CODE}"]`);
  const row = await tp.locator(`tr[data-code="${CODE}"]`).textContent();
  assert((row.match(/✓|check/g) ?? []).length >= 0, 'มีแถวของรหัส');
  const done6 = await tp.locator(`tr[data-code="${CODE}"] .dot-ok`).count();
  assert(done6 === 6, `ตารางรายบุคคลต้องแสดงผ่าน 6 ด่าน (ได้ ${done6})`);
  // นำเข้า CSV ซ้ำต้องไม่เพิ่ม event ซ้ำ
  const before = await tp.locator('.section-sub, .muted.small').first().textContent();
  await tp.setInputFiles('#src-file', csvPath);
  await tp.waitForTimeout(300);
  const after = await tp.locator('.section-sub, .muted.small').first().textContent();
  assert(before.match(/[\d,]+ event/)?.[0] === after.match(/[\d,]+ event/)?.[0], `นำเข้า CSV ซ้ำต้องไม่เพิ่ม event: ${before} → ${after}`);
  await tp.screenshot({ path: `${OUT}/live-teacher.png` });
  await teacherCtx.close();
  step('หน้าครู นำเข้าไฟล์สำเร็จ');
} finally {
  report('live-full', errors, failed, fontIssues);
  await close();
}
