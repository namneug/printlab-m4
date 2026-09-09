/** แถบนำทาง + ตัวนับขั้น + ทัวร์ครั้งแรก + ปุ่มหลักที่ disabled พร้อมเหตุผล + log tutorial_* แยกจาก hint */
import { launch, startSession, assert, report, getEvents, BASE } from './lib.mjs';

const { page, errors, failed, fontIssues, shot, close } = await launch();
try {
  await startSession(page, 'ANON-016');
  await page.goto(BASE + '#/map?free=1', { waitUntil: 'networkidle' });
  const expectSteps = { l1: 3, l2: 3, l3: 3, l4: 3, l5: 5, l6: 3 };
  for (const [id, n] of Object.entries(expectSteps)) {
    await page.goto(BASE + `#/level/${id}`, { waitUntil: 'networkidle' });
    await page.click('#level-start');
    // ทัวร์ต้องขึ้นเองครั้งแรก
    await page.waitForSelector('.tour__pop', { timeout: 5000 });
    const total = Number((await page.locator('.tour__count').textContent()).split('/')[1]);
    assert(total >= 3 && total <= 6, `${id}: ทัวร์ต้องมี 3–6 จุด (ได้ ${total})`);
    if (id === 'l1') {
      // เดินทัวร์ครบ
      while (await page.locator('#tour-next').count()) { await page.click('#tour-next'); await page.waitForTimeout(60); }
    } else {
      await page.click('#tour-skip');
    }
    await page.waitForSelector('.tour', { state: 'detached' });
    // แถบนำทาง
    assert(await page.isVisible('#guide'), `${id}: ต้องมีแถบนำทาง`);
    assert((await page.locator('.guide__step').count()) === n, `${id}: ตัวนับขั้นต้องมี ${n} ขั้น`);
    assert((await page.locator('.guide__step.is-current').count()) === 1, `${id}: ต้องมีขั้นปัจจุบัน 1 ขั้น`);
    const text = await page.locator('#guide-text').textContent();
    assert(text.length > 10, `${id}: ต้องมีประโยคสั่งทำ`);
    assert(await page.isVisible('#guide-primary'), `${id}: ปุ่มหลักต้องมองเห็นตั้งแต่ต้น`);
    const disabled = await page.locator('#guide-primary').isDisabled();
    if (disabled) assert((await page.locator('#guide-reason').textContent()).length > 0, `${id}: ปุ่ม disabled ต้องบอกว่ายังขาดอะไร`);
    await shot(`m15-guide-${id}`);
    // เข้าใหม่ ทัวร์ต้องไม่ขึ้นซ้ำ แต่ปุ่ม ? เปิดได้
    await page.goto(BASE + '#/map', { waitUntil: 'networkidle' });
    await page.goto(BASE + `#/level/${id}`, { waitUntil: 'networkidle' });
    await page.click('#level-start');
    await page.waitForSelector('#guide');
    await page.waitForTimeout(400);
    assert((await page.locator('.tour').count()) === 0, `${id}: ทัวร์ต้องไม่ขึ้นซ้ำครั้งที่สอง`);
    await page.click('#tour-replay');
    await page.waitForSelector('.tour__pop');
    await page.click('#tour-skip');
    await page.waitForSelector('.tour', { state: 'detached' });
  }
  // ด่าน 1: ปุ่มหลักต้อง disabled พร้อมเหตุผลตอนเริ่ม และประโยคเปลี่ยนเมื่อเลือกป้าย
  await page.goto(BASE + '#/level/l1', { waitUntil: 'networkidle' });
  await page.click('#level-start');
  await page.waitForSelector('.l1-tray .part-chip');
  assert(await page.locator('#guide-primary').isDisabled(), 'ด่าน 1 ปุ่มหลักต้อง disabled ตอนเริ่ม');
  assert((await page.locator('#guide-reason').textContent()).includes('18'), 'เหตุผลต้องบอกจำนวนที่เหลือ');
  const before = await page.locator('#guide-text').textContent();
  await page.click('.l1-tray .part-chip >> nth=0');
  const after = await page.locator('#guide-text').textContent();
  assert(before !== after && after.includes('คลิกกล่อง'), 'ประโยคสั่งทำต้องเปลี่ยนตามสถานะ');
  assert((await page.locator('#guide-progress').textContent()).startsWith('0/18'), 'ตัวนับความคืบหน้าต้องเป็น 0/18');

  // โมดูลซ่อม: ทัวร์ครั้งแรก + แถบนำทาง
  await page.goto(BASE + '#/repair', { waitUntil: 'networkidle' });
  await page.waitForSelector('.tour__pop');
  await page.click('#tour-skip');
  await page.waitForSelector('.tour', { state: 'detached' });
  assert(await page.isVisible('#guide') && (await page.locator('.guide__step').count()) === 3, 'โมดูลซ่อมต้องมีแถบนำทาง 3 ขั้น');

  // event
  const events = await getEvents(page);
  const tut = events.filter((e) => e.eventType.startsWith('tutorial_'));
  const shown = tut.filter((e) => e.eventType === 'tutorial_shown');
  assert(shown.length === 6 + 6 + 1, `tutorial_shown ต้องมี 13 ครั้ง (อัตโนมัติ 7 + กด ? 6) ได้ ${shown.length}`);
  assert(shown.filter((e) => e.payload.requestedBy === 'auto').length === 7 && shown.filter((e) => e.payload.requestedBy === 'player').length === 6, 'requestedBy ต้องถูก');
  assert(tut.some((e) => e.eventType === 'tutorial_completed' && e.levelId === 'l1'), 'ต้องมี tutorial_completed ด่าน 1');
  assert(tut.filter((e) => e.eventType === 'tutorial_skipped').length === 12, 'tutorial_skipped ต้องมี 12');
  assert(tut.filter((e) => e.eventType === 'tutorial_step').length >= 13, 'ต้องมี tutorial_step');
  assert(!events.some((e) => e.eventType === 'hint_request' || e.eventType === 'hint_shown'), 'ทัวร์ต้องไม่สร้าง event คำใบ้');
  for (const e of tut) assert(!('hintLevel' in e.payload) && !('trigger' in e.payload), 'payload ทัวร์ต้องไม่ปนกับฟิลด์คำใบ้');
  console.log(`guide+tour OK — tutorial events ${tut.length}`);
} finally {
  report('m15-guide-tour', errors, failed, fontIssues);
  await close();
}
