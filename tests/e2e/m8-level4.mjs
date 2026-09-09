import { launch, startSession, assert, report, getEvents, BASE } from './lib.mjs';

const { page, errors, shot, close } = await launch();
try {
  await startSession(page, 'ANON-009');
  await page.goto(BASE + '#/map?free=1', { waitUntil: 'networkidle' });
  await page.click('.level-card[href="#/level/l4"]');
  await page.click('#level-start');
  await page.waitForSelector('#l4-submit');
  const setTemp = (v) => page.locator('#l4-temp').fill(String(v));
  // โจทย์ 1: เลือกผิด (PLA) ก่อน
  await page.click('.mat-card[data-mat="PLA"]');
  await page.check('input[name=justify][value="cost"]');
  await page.click('#l4-submit');
  await page.waitForTimeout(150);
  assert((await page.locator('.notice--warn').count()) >= 1, 'เลือกผิดต้องมี feedback');
  // ABS ในห้องปิด ที่ 250 → ละเมิดความปลอดภัย (ห้องปิด)
  await page.click('.mat-card[data-mat="ABS"]');
  await setTemp(250);
  await page.click('#l4-submit');
  await page.waitForSelector('[data-violation="abs_closed_room"]');
  assert(await page.isVisible('.mentor__msg--safety'), 'ต้องมีข้อความคงที่ด้านความปลอดภัย');
  await shot('m8-l4-violation');
  await page.click('.room-opt[data-room="ventilated"]');
  await page.click('#l4-table-toggle');
  await page.locator('input[name=justify][value="cost"]').uncheck();
  await page.check('input[name=justify][value="heat_resistance"]');
  await page.click('#l4-submit');
  await page.waitForSelector('#l4-next');
  await shot('m8-l4-task1');
  await page.click('#l4-next');
  // โจทย์ 2: TPU ที่ 250 → เกินพิกัด
  await page.click('.mat-card[data-mat="TPU"]');
  await page.click('#l4-submit');
  await page.waitForSelector('[data-violation="over_temp"]');
  await setTemp(220);
  await page.check('input[name=justify][value="flexibility"]');
  await page.click('#l4-submit');
  await page.waitForSelector('#l4-next');
  await page.click('#l4-next');
  // โจทย์ 3: PLA เหตุผลอ่อนก่อน แล้วแก้
  await page.click('.mat-card[data-mat="PLA"]');
  await page.check('input[name=justify][value="uv"]');
  await page.click('#l4-submit');
  await page.waitForTimeout(150);
  assert(!(await page.isVisible('#l4-next')), 'เหตุผลอ่อนต้องยังไม่ผ่านรอบแรก');
  await page.check('input[name=justify][value="cost"]');
  await page.click('#l4-submit');
  await page.waitForSelector('#l4-next');
  await page.click('#l4-next');
  await page.waitForSelector('.debrief');
  await shot('m8-l4-debrief');
  const events = await getEvents(page);
  const done = events.find((e) => e.eventType === 'level_complete' && e.levelId === 'l4');
  const ev = done.payload.evidence;
  console.log('evidence:', JSON.stringify(ev));
  assert(ev.safety_violations === 2 && ev.safety_violation_types.includes('over_temp') && ev.safety_violation_types.includes('abs_closed_room'), 'ต้องบันทึก safety violation 2 แบบ');
  assert(ev.material_correct_first_count === 2 && ev.justified_count === 3 && ev.table_opens === 1, 'ตัวนับต้องถูก');
  assert(events.filter((e) => e.eventType === 'safety_violation' && e.construct === 'safety').length === 2, 'event safety_violation ต้องมี construct safety');
  assert(events.some((e) => e.eventType === 'safety_message'), 'ต้อง log ข้อความความปลอดภัย');
} finally {
  report('m8-level4', errors);
  await close();
}
