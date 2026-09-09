import { readFileSync } from 'node:fs';
import { dismissTour, launch, startSession, assert, report, getEvents, BASE } from './lib.mjs';

const parts = JSON.parse(readFileSync(new URL('../../src/data/parts.json', import.meta.url), 'utf8'));
const { page, errors, shot, close } = await launch();
try {
  await startSession(page, 'ANON-008');
  await page.goto(BASE + '#/explore', { waitUntil: 'networkidle' });
  await page.waitForSelector('.part-list .part-chip');
  // เปิดชั้นการไหลทั้ง 3
  for (const l of ['control', 'heat', 'motion']) await page.click(`.layer-btn[data-layer="${l}"]`);
  await page.waitForTimeout(400);
  await shot('m7-explore-layers');
  // แตะครบ 18 ชิ้นจากรายการ
  for (const p of parts.parts) await page.click(`.part-list .part-chip[data-part="${p.id}"]`);
  assert((await page.locator('.levelbar .mono').textContent()) === '18/18', 'ต้องสำรวจครบ 18 ชิ้น');
  // ตอบคำถามชวนคิดที่เทอร์มิสเตอร์: ผิดก่อน แล้วถูก
  await page.click('.part-list .part-chip[data-part="thermistor"]');
  const probe = parts.parts.find((p) => p.id === 'thermistor').probe;
  const wrong = (probe.answer + 1) % probe.choices.length;
  await page.click(`.probe__choice[data-choice="${wrong}"]`);
  await page.click(`.probe__choice[data-choice="${probe.answer}"]`);
  await page.waitForSelector('.probe__choice.is-right');
  // คลิกลิงก์ชิ้นที่เชื่อมต่อ
  await page.click('button[data-connect="mainboard"]');
  await shot('m7-explore-part');
  // แตะในโมเดล 3 มิติ (กลางจอ) — ต้องไม่ error
  const box = await page.locator('.viewport canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);
  await page.goto(BASE + '#/map', { waitUntil: 'networkidle' });
  const events = await getEvents(page);
  const ex = events.filter((e) => e.levelId === 'explore');
  assert(ex.filter((e) => e.eventType === 'part_explored').length >= 19, 'ต้องมี part_explored ครบ');
  assert(ex.filter((e) => e.eventType === 'layer_toggle').length === 3, 'ต้องมี layer_toggle 3 ครั้ง');
  assert(ex.some((e) => e.eventType === 'probe_wrong') && ex.some((e) => e.eventType === 'probe_answer'), 'ต้องบันทึกคำตอบคำถามชวนคิด');
  const closeEv = ex.find((e) => e.eventType === 'explore_close');
  assert(closeEv && closeEv.payload.parts_explored === 18 && closeEv.payload.probe_questions_answered === 1, 'สรุปตอนปิดต้องถูก: ' + JSON.stringify(closeEv?.payload));
  console.log('explore summary:', JSON.stringify(closeEv.payload));
} finally {
  report('m7-explore', errors);
  await close();
}
