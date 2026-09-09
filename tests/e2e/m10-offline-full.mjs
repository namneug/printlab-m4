/** เล่นครบ 6 ด่านต่อเนื่องแบบออฟไลน์ (ตัดเน็ตหลังโหลดหน้าแรก) + ตรวจ log ของพี่เลี้ยง */
import { readFileSync } from 'node:fs';
import { dismissTour, launch, startSession, assert, report, getEvents, BASE } from './lib.mjs';

const parts = JSON.parse(readFileSync(new URL('../../src/data/parts.json', import.meta.url), 'utf8'));
const faults = JSON.parse(readFileSync(new URL('../../src/data/faults.json', import.meta.url), 'utf8'));
const impact = JSON.parse(readFileSync(new URL('../../src/data/impact.json', import.meta.url), 'utf8'));
const subOf = Object.fromEntries(parts.parts.map((p) => [p.id, p.subsystem]));

const { page, errors, shot, close, browser } = await launch();
const t0 = Date.now();
try {
  await startSession(page, 'ANON-012');
  await page.context().setOffline(true);
  console.log('offline: true');

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
  await page.click('.debrief a.btn--primary');

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

  /* ด่าน 3 */
  await page.waitForSelector('#level-start'); await page.click('#level-start'); await dismissTour(page); await dismissTour(page);
  await page.waitForSelector('.diag');
  const title = (await page.locator('.diag .panel__head').first().textContent()).replace('อาการ: ', '').trim();
  const c = faults.cases.find((x) => x.title === title);
  const correct = c.hypotheses.find((h) => h.correct).id;
  const support = c.tests.find((t) => t.supports.includes(correct));
  await page.click(`.test[data-test="${support.id}"]`);
  await page.check(`input[name=cause][value="${correct}"]`);
  await page.check(`input[name=cite][value="${support.id}"]`);
  await page.click('#diag-submit');
  await page.waitForSelector('#diag-done'); await page.click('#diag-done');
  await page.waitForSelector('.debrief'); await page.click('.debrief a.btn--primary');

  /* ด่าน 4 */
  await page.waitForSelector('#level-start'); await page.click('#level-start'); await dismissTour(page); await dismissTour(page);
  await page.waitForSelector('#l4-submit');
  const l4 = [['ABS', 'heat_resistance', 250], ['TPU', 'flexibility', 220], ['PLA', 'cost', 210]];
  await page.click('.room-opt[data-room="ventilated"]');
  for (const [mat, prop, temp] of l4) {
    await page.click(`.mat-card[data-mat="${mat}"]`);
    await page.locator('#l4-temp').fill(String(temp));
    await page.check(`input[name=justify][value="${prop}"]`);
    await page.click('#l4-submit');
    await page.waitForSelector('#l4-next'); await page.click('#l4-next');
  }
  await page.waitForSelector('.debrief'); await page.click('.debrief a.btn--primary');

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

  /* ด่าน 6 */
  await page.waitForSelector('#level-start'); await page.click('#level-start'); await dismissTour(page); await dismissTour(page);
  await page.click('#l6-to-impact');
  for (const s of impact.statements) { await page.click(`.stmt-chip[data-stmt="${s.id}"]`); await page.click(`.impact-bin[data-dim="${s.dimension}"]`); }
  await page.click('#l6-to-decision');
  await page.click('.option[data-option="queue"]');
  await page.check('input[name=arg][value="own_avg"]'); await page.check('input[name=arg][value="own_energy"]');
  await page.click('#l6-submit');
  await page.waitForSelector('.debrief');
  await shot('m10-final-debrief');
  await page.click('.debrief a[href="#/map"]');
  await page.waitForSelector('.level-grid');
  await shot('m10-map-complete');
  assert((await page.locator('.level-card.is-done').count()) === 6, 'ต้องผ่านครบ 6 ด่าน');

  const events = await getEvents(page);
  const completes = events.filter((e) => e.eventType === 'level_complete').map((e) => e.levelId);
  assert(['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].every((l) => completes.includes(l)), 'level_complete ครบ 6 ด่าน');
  const shown = events.filter((e) => e.eventType === 'hint_shown');
  assert(shown.length >= 1, 'ต้องมี hint_shown');
  for (const h of shown) for (const k of ['trigger', 'hintLevel', 'mentorSource', 'shownAt', 'requestedBy']) assert(k in h.payload, `hint_shown ต้อง log ${k}`);
  assert(shown.every((h) => h.payload.mentorSource === 'rule'), 'mentorSource ต้องเป็น rule');
  const debriefs = events.filter((e) => e.eventType === 'debrief_shown');
  assert(debriefs.length === 6, 'debrief ครบ 6 ด่าน');
  console.log(`events: ${events.length}, hints shown: ${shown.length}, elapsed ${Math.round((Date.now() - t0) / 1000)}s`);
} finally {
  report('m10-offline-full', errors);
  await close();
}
