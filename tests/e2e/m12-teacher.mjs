/** แดชบอร์ดครู — ต้อง build ด้วย VITE_TEACHER_PASSWORD=test1234 */
import { writeFileSync } from 'node:fs';
import { dismissTour, launch, startSession, assert, report, BASE } from './lib.mjs';

const { page, errors, shot, close } = await launch();
try {
  // สร้างข้อมูลในเบราว์เซอร์นี้ก่อน (ANON-014 เล่นด่าน 1 ครึ่งทาง)
  await startSession(page, 'ANON-014');
  await page.click('.level-card[href="#/level/l1"]');
  await page.click('#level-start'); await dismissTour(page);
  await page.waitForSelector('.l1-tray .part-chip');
  await page.click('.btn--hint');
  await page.waitForTimeout(300);

  await page.goto(BASE + 'teacher/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#teacher-pass');
  await page.fill('#teacher-pass', 'wrong');
  await page.click('button[type=submit]');
  assert(await page.isVisible('.error'), 'รหัสผิดต้องถูกปฏิเสธ');
  await page.fill('#teacher-pass', 'test1234');
  await page.click('button[type=submit]');
  await page.waitForSelector('.kpis');
  await page.waitForSelector('tr[data-code="ANON-014"]');
  await shot('m12-teacher');
  // attrition: X ต้องมี 1 เข้าร่วม และ O1 ต้อง "รอเก็บ"
  const xCard = await page.locator('.tp-card[data-tp="X"]').textContent();
  assert(xCard.includes('เข้าร่วม1') || /เข้าร่วม\s*1/.test(xCard), 'X ต้องมีผู้เข้าร่วม 1: ' + xCard);
  assert((await page.locator('.tp-card[data-tp="O1"]').textContent()).includes('รอเก็บ'), 'O1 ต้องแสดงรอเก็บ');
  assert((await page.locator('tr[data-score-tp="O1"]').textContent()).includes('รอเก็บ'), 'คะแนน O1 ต้องแสดงรอเก็บ ไม่ใช่ 0');
  // นำเข้าคะแนน
  const csv = 'participant_code,timepoint,score,max_score\nANON-014,O1,12,30\nANON-002,O1,18,30\nANON-002,O2,25,30\n';
  const tmp = '/tmp/claude-0/assess.csv';
  writeFileSync(tmp, csv);
  await page.setInputFiles('#src-assess', tmp);
  await page.waitForTimeout(300);
  const o1 = await page.locator('tr[data-score-tp="O1"]').textContent();
  assert(o1.includes('15.00'), 'คะแนนเฉลี่ย O1 ต้องเป็น 15.00: ' + o1);
  assert((await page.locator('.tp-card[data-tp="O1"]').textContent()).includes('เข้าร่วม2') || /เข้าร่วม\s*2/.test(await page.locator('.tp-card[data-tp="O1"]').textContent()), 'O1 ต้องนับผู้เข้าร่วมจากคะแนน');
  // ส่งออกสรุป
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exp-summary')]);
  const { readFileSync } = await import('node:fs');
  const out = readFileSync(await dl.path(), 'utf8');
  assert(out.includes('ANON-014') && out.split('\n').length >= 51, 'สรุปรายคนต้องมีทุกรหัสในรายชื่อ');
  console.log('teacher dashboard OK');
} finally {
  report('m12-teacher', errors);
  await close();
}
