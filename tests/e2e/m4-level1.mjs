import { readFileSync } from 'node:fs';
import { dismissTour, launch, startSession, assert, report, getEvents } from './lib.mjs';

const parts = JSON.parse(readFileSync(new URL('../../src/data/parts.json', import.meta.url), 'utf8'));
const subOf = Object.fromEntries(parts.parts.map((p) => [p.id, p.subsystem]));

const { page, errors, shot, close } = await launch();
try {
  await startSession(page, 'ANON-004');
  await page.click('.level-card:not(.is-locked)');
  await page.click('#level-start'); await dismissTour(page);
  await page.waitForSelector('.l1-tray .part-chip');
  await shot('m4-l1-grouping');

  // วางผิดโดยตั้งใจ 2 ครั้งเพื่อทดสอบ feed back + trigger same_part_wrong_twice
  const firstChip = await page.locator('.l1-tray .part-chip').first().getAttribute('data-part');
  const wrongSub = Object.keys({ structure: 1, motion: 1, extrusion_thermal: 1, control: 1, build_plate: 1 }).find((s) => s !== subOf[firstChip]);
  for (let i = 0; i < 2; i++) {
    await page.click(`.part-chip[data-part="${firstChip}"]`);
    await page.click(`.bin[data-sub="${wrongSub}"]`);
    await page.waitForTimeout(150);
  }
  assert((await page.locator('.mentor__msg--feed_back').count()) >= 1, 'ต้องมีข้อความ feed back เมื่อวางผิด');

  // จัดให้ถูกทั้ง 18 ชิ้น (คลิกเลือก → คลิกกล่อง)
  for (const id of Object.keys(subOf)) {
    await page.click(`.l1-tray .part-chip[data-part="${id}"]`);
    await page.click(`.bin[data-sub="${subOf[id]}"]`);
  }
  await page.waitForSelector('#l1-to-flow');
  await shot('m4-l1-grouped');
  await page.click('#l1-to-flow');
  await page.waitForSelector('.dnode[data-id="input"]');

  // ทดสอบเส้นผิดก่อน แล้วต่อ 4 เส้นที่ถูก
  await page.click('.dnode[data-id="output"]');
  await page.click('.dnode[data-id="input"]');
  await page.waitForTimeout(200);
  for (const [a, b] of [['input', 'process'], ['process', 'output'], ['process', 'feedback'], ['feedback', 'process']]) {
    await page.click(`.dnode[data-id="${a}"]`);
    await page.click(`.dnode[data-id="${b}"]`);
    await page.waitForTimeout(100);
  }
  await shot('m4-l1-flow');
  await page.click('#guide-primary');
  await page.waitForSelector('.dnode[data-id="thermistor"]');
  // เส้นผิดหนึ่งเส้น แล้วต่อวงจรป้อนกลับให้ถูก
  await page.click('.dnode[data-id="touchscreen"]');
  await page.click('.dnode[data-id="hotend_heater"]');
  await page.waitForTimeout(200);
  await shot('m4-l1-loop');
  await page.click('.dnode[data-id="thermistor"]');
  await page.click('.dnode[data-id="mainboard"]');
  await page.click('.dnode[data-id="mainboard"]');
  await page.click('.dnode[data-id="hotend_heater"]');
  await page.click('#guide-primary');
  await page.waitForSelector('.debrief', { timeout: 10000 });
  await shot('m4-l1-debrief');
  assert((await page.locator('.debrief__sec').count()) === 3, 'debrief ต้องมี 3 ส่วน');

  const events = await getEvents(page);
  const done = events.find((e) => e.eventType === 'level_complete' && e.levelId === 'l1');
  assert(done, 'ต้องมี level_complete');
  const ev = done.payload.evidence;
  console.log('evidence:', JSON.stringify(ev));
  for (const k of ['grouping_accuracy', 'feedback_loop_identified', 'time_on_task', 'hint_used']) assert(k in ev, `evidence ต้องมี ${k}`);
  assert(ev.feedback_loop_identified === true, 'ต้องระบุวงจรป้อนกลับได้');
  assert(ev.grouping_wrong_drops === 2 && ev.flow_wrong_links === 1 && ev.feedback_loop_wrong === 1, 'นับข้อผิดพลาดต้องถูก');
  assert(events.some((e) => e.eventType === 'group_drop_wrong'), 'ต้องมี event group_drop_wrong');
  assert(events.some((e) => e.eventType === 'hint_request' && e.payload.requestedBy === 'system'), 'ระบบต้องเสนอคำใบ้เมื่อวางผิดซ้ำ 2 ครั้ง');

  // กลับแผนที่ ด่าน 2 ต้องปลดล็อก
  await page.click('.debrief a[href="#/map"]');
  await page.waitForSelector('.level-grid');
  assert((await page.locator('.level-card.is-locked').count()) === 4, 'ด่าน 2 ต้องปลดล็อกหลังผ่านด่าน 1');
} finally {
  report('m4-level1', errors);
  await close();
}
