import { readFileSync } from 'node:fs';
import { launch, startSession, assert, report, getEvents, BASE } from './lib.mjs';

const impact = JSON.parse(readFileSync(new URL('../../src/data/impact.json', import.meta.url), 'utf8'));
const { page, errors, shot, close } = await launch();
try {
  await startSession(page, 'ANON-010');
  // เล่นด่าน 2 แบบเร็วเพื่อให้ด่าน 6 มีข้อมูล
  await page.goto(BASE + '#/map?free=1', { waitUntil: 'networkidle' });
  await page.click('.level-card[href="#/level/l2"]');
  await page.click('#level-start');
  await page.click('#l2-priority-ok');
  await page.click('#l2-run');
  await page.locator('#l2-infill').fill('30'); await page.click('#l2-run');
  await page.locator('#l2-speed').fill('90'); await page.click('#l2-run');
  await page.locator('#l2-nozzle_temp').fill('220'); await page.click('#l2-run');
  await page.waitForSelector('#l2-finish');
  await page.click('#l2-finish');
  await page.waitForSelector('.debrief');

  /* ---------- ด่าน 5 ---------- */
  await page.goto(BASE + '#/map?free=1', { waitUntil: 'networkidle' });
  await page.click('.level-card[href="#/level/l5"]');
  await page.click('#level-start');
  await page.waitForSelector('.edp-steps');
  // พยายามข้ามไปขั้น 4 → ต้องถูกบล็อก
  await page.click('.edp-step[data-step="4"]');
  await page.waitForTimeout(150);
  assert(await page.isVisible('#l5-step1-ok'), 'ข้ามขั้นต้องถูกบล็อก');
  // ขั้น 1: เลือกน้อยไปก่อน
  await page.check('label[data-req="load"] input');
  await page.click('#l5-step1-ok');
  await page.waitForTimeout(100);
  assert(await page.isVisible('#l5-step1-ok'), 'เงื่อนไขน้อยไปต้องไม่ผ่าน');
  for (const r of ['fit', 'no_tools', 'bump', 'time']) await page.check(`label[data-req="${r}"] input`);
  await page.click('#l5-step1-ok');
  // ขั้น 2
  await page.waitForSelector('#l5-step2-ok');
  for (const c of ['table_edge', 'cable_weight', 'material_table', 'existing']) await page.click(`.dcard[data-card="${c}"]`);
  await page.fill('#l5-measure', '25');
  await page.click('#l5-step2-ok');
  // ขั้น 3 รอบ 1: แบบ B + PLA ค่าเริ่มต้น
  await page.waitForSelector('#l5-step3-ok');
  await page.click('.sketch[data-sketch="clamp_holder"]');
  await page.click('.mat-pill[data-material="PLA"]');
  await page.check('input[name=design-reason][value="strong_enough"]');
  await page.click('#l5-step3-ok');
  // ขั้น 4
  await page.waitForSelector('#l5-run-test');
  await page.click('#l5-run-test');
  await page.waitForSelector('.test-card');
  await shot('m9-l5-test1');
  const failed1 = await page.locator('.test-card.is-fail').count();
  assert(failed1 >= 1, 'รอบแรกควรมีการทดสอบไม่ผ่าน (PLA เปราะ / เวลาเกิน)');
  await page.click('#l5-step4-ok');
  // ขั้น 5: ต้องบังคับรอบ 2
  await page.waitForSelector('#l5-iterate');
  assert(!(await page.isVisible('#l5-present')), 'รอบแรกต้องยังนำเสนอไม่ได้');
  await page.click('#l5-iterate');
  await page.waitForSelector('#l5-step3-ok');
  // รอบ 2: ไม่เปลี่ยน → บล็อก
  await page.click('#l5-step3-ok');
  await page.waitForTimeout(150);
  assert(await page.isVisible('#l5-step3-ok'), 'ไม่เปลี่ยนอะไรต้องถูกบล็อก');
  // เปลี่ยนเป็น PETG 240°C ชั้น 0.28 speed 80
  await page.click('.mat-pill[data-material="PETG"]');
  await page.locator('#l5-nozzle_temp').fill('240');
  await page.locator('#l5-layer_height').fill('0.28');
  await page.locator('#l5-speed').fill('80');
  await page.click('#l5-step3-ok');
  await page.waitForSelector('#l5-run-test');
  await page.click('#l5-run-test');
  await page.waitForSelector('.test-card');
  await shot('m9-l5-test2');
  await page.click('#l5-step4-ok');
  await page.waitForSelector('#l5-present');
  // เหตุผลไม่ตรงก่อน → เตือน แล้วเลือกให้ตรง
  await page.check('input[name=change-reason][value="whim"]');
  await page.click('#l5-present');
  await page.waitForTimeout(100);
  await page.check('input[name=change-reason][value="bump"]');
  await page.check('input[name=stmt][value="problem"]');
  await page.check('input[name=stmt][value="solution"]');
  await page.check('input[name=stmt][value="ev-2"]');
  await page.click('#l5-present');
  await page.waitForSelector('.debrief');
  await shot('m9-l5-debrief');
  let events = await getEvents(page);
  const l5 = events.find((e) => e.eventType === 'level_complete' && e.levelId === 'l5').payload.evidence;
  console.log('l5 rubric:', JSON.stringify(l5.edp_rubric), 'iterations', l5.iterations, 'changed', l5.changed_after_test, 'skips', l5.skip_attempts);
  assert(l5.iterations === 2 && l5.changed_after_test === true && l5.skip_attempts === 1, 'evidence ด่าน 5 ต้องถูก');
  assert(l5.edp_rubric.improve >= 3 && l5.rounds.length === 2, 'rubric ต้องคิดจากพฤติกรรม');
  assert(events.some((e) => e.eventType === 'edp_skip_blocked') && events.some((e) => e.eventType === 'no_change_round2'), 'ต้องมี event บล็อกข้ามขั้นและไม่เปลี่ยนรอบ 2');

  /* ---------- ด่าน 6 ---------- */
  await page.goto(BASE + '#/map?free=1', { waitUntil: 'networkidle' });
  await page.click('.level-card[href="#/level/l6"]');
  await page.click('#level-start');
  await page.waitForSelector('#l6-to-impact');
  await shot('m9-l6-numbers');
  const txt = await page.locator('.numbers').textContent();
  assert(!txt.includes('0 ชิ้น'), 'ตัวเลขของฉันต้องดึงจากด่าน 2/5 ได้ (ไม่ใช่ 0)');
  await page.click('#l6-to-impact');
  await page.waitForSelector('.stmt-chip');
  // จัดผิด 1 ครั้ง แล้วจัดถูกทั้งหมด
  const s1 = impact.statements[0];
  const wrongDim = impact.dimensions.find((d) => d.id !== s1.dimension).id;
  await page.click(`.stmt-chip[data-stmt="${s1.id}"]`);
  await page.click(`.impact-bin[data-dim="${wrongDim}"]`);
  for (const s of impact.statements) {
    await page.click(`.stmt-chip[data-stmt="${s.id}"]`);
    await page.click(`.impact-bin[data-dim="${s.dimension}"]`);
  }
  await page.waitForSelector('#l6-to-decision');
  await shot('m9-l6-impact');
  await page.click('#l6-to-decision');
  await page.waitForSelector('#l6-submit');
  await page.click('.option[data-option="queue"]');
  // อ้างแต่คำกล่าวทั่วไป → ถูกบล็อก
  await page.check('input[name=arg][value="g1"]');
  await page.click('#l6-submit');
  await page.waitForTimeout(100);
  assert(await page.isVisible('#l6-submit'), 'ไม่มีตัวเลขของตัวเองต้องถูกบล็อก');
  await page.check('input[name=arg][value="own_avg"]');
  await page.check('input[name=arg][value="own_fail"]');
  await page.click('#l6-submit');
  await page.waitForSelector('.debrief');
  await shot('m9-l6-debrief');
  events = await getEvents(page);
  const l6 = events.find((e) => e.eventType === 'level_complete' && e.levelId === 'l6').payload.evidence;
  console.log('l6 evidence:', JSON.stringify({ ...l6, argument_chips: undefined }));
  assert(l6.impact_dimensions_covered === 4 && l6.own_data_count === 2 && l6.used_own_data_in_argument === true && l6.impact_wrong_assignments === 1, 'evidence ด่าน 6 ต้องถูก');
  assert(events.some((e) => e.eventType === 'argument_no_own_data'), 'ต้องมี event argument_no_own_data');
  assert((await page.locator('.debrief a.btn--primary').textContent()).includes('จบภารกิจ'), 'ด่านสุดท้ายต้องแสดงจบภารกิจ');
} finally {
  report('m9-level5-6', errors);
  await close();
}
