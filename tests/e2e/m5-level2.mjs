import { launch, startSession, assert, report, getEvents, BASE } from './lib.mjs';

const { page, errors, shot, close } = await launch();
try {
  await startSession(page, 'ANON-005');
  await page.goto(BASE + '#/map?free=1', { waitUntil: 'networkidle' });
  await page.click('.level-card[href="#/level/l2"]');
  await page.click('#level-start');
  await page.waitForSelector('#l2-priority-ok');
  // เลื่อน "เวลา" ขึ้นเป็นอันดับ 1
  await page.click('.priority__item[data-id="time"] button[aria-label="เลื่อนขึ้น"]');
  await shot('m5-l2-priority');
  await page.click('#l2-priority-ok');
  await page.waitForSelector('#l2-run');
  const set = async (key, v) => { await page.locator(`#l2-${key}`).fill(String(v)); };
  const run = async () => { await page.click('#l2-run'); await page.waitForTimeout(120); };
  await run(); // รอบ 1 ค่าตั้งต้น
  // เปลี่ยน 2 ตัวพร้อมกัน 2 รอบติด → trigger multi_var_twice
  await set('infill', 40); await set('speed', 80); await run();
  await set('layer_height', 0.28); await set('nozzle_temp', 220); await run();
  await page.waitForTimeout(200);
  assert((await page.locator('.mentor__msg--feed_forward').count()) >= 1, 'ต้องมีคำใบ้จากระบบ');
  await shot('m5-l2-lab');
  // เปลี่ยนทีละตัวจนผ่าน (0.2, 30, 90, 220)
  await set('layer_height', 0.2); await run();
  await set('infill', 30); await run();
  await set('speed', 90); await run();
  await page.waitForSelector('#l2-finish', { timeout: 5000 });
  await shot('m5-l2-pass');
  await page.click('#l2-finish');
  await page.waitForSelector('.debrief');
  await shot('m5-l2-debrief');
  const events = await getEvents(page);
  const done = events.find((e) => e.eventType === 'level_complete' && e.levelId === 'l2');
  assert(done, 'ต้องมี level_complete');
  const ev = done.payload.evidence;
  console.log('evidence:', JSON.stringify({ ...ev, trials: undefined }));
  assert(JSON.stringify(ev.variables_changed_per_trial) === '[0,2,2,1,1,1]', 'นับตัวแปรที่เปลี่ยนต่อรอบต้องถูก: ' + JSON.stringify(ev.variables_changed_per_trial));
  assert(ev.converged === true && ev.trials_count === 6, 'ต้อง converged ใน 6 รอบ');
  assert(ev.constraint_priority_order[0] === 'time', 'ลำดับความสำคัญต้องบันทึกถูก');
  const trialEv = events.filter((e) => e.eventType === 'trial_run');
  assert(trialEv.length === 6 && trialEv[1].payload.changedCount === 2, 'trial_run ต้องบันทึก changedCount');
  assert(events.some((e) => e.eventType === 'hint_shown' && e.payload.trigger === 'multi_var_twice'), 'ต้องแสดงคำใบ้ trigger multi_var_twice');
  const debriefText = await page.locator('.debrief__sec--feed_back').textContent();
  assert(debriefText.includes('6 รอบ'), 'debrief ต้องเติมค่าจริง');
} finally {
  report('m5-level2', errors);
  await close();
}
