import { readFileSync } from 'node:fs';
import { dismissTour, launch, startSession, assert, report, getEvents, BASE } from './lib.mjs';

const faults = JSON.parse(readFileSync(new URL('../../src/data/faults.json', import.meta.url), 'utf8'));

async function solveCase(page, opts = {}) {
  // อ่านเคสจากหน้าจอ
  const title = (await page.locator('.diag .panel__head').first().textContent()).replace('อาการ: ', '').trim();
  const c = faults.cases.find((x) => x.title === title);
  assert(c, 'ต้องพบเคสใน faults.json: ' + title);
  const correct = c.hypotheses.find((h) => h.correct).id;
  if (opts.guessFirst) {
    // ส่งโดยไม่มีหลักฐาน → ต้องถูกปฏิเสธ
    await page.check(`input[name=cause][value="${correct}"]`);
    await page.click('#diag-submit');
    await page.waitForTimeout(150);
    assert(await page.isVisible('#diag-submit'), 'ต้องยังส่งไม่ได้เมื่อไม่มีหลักฐาน');
  }
  // ทำการทดสอบที่สนับสนุนสาเหตุจริง + หนึ่งอย่างที่ตัดสมมติฐานอื่นได้ ภายในงบ
  const support = c.tests.find((t) => t.supports.includes(correct));
  await page.click(`.test[data-test="${support.id}"]`);
  const elimTest = c.tests.find((t) => t.id !== support.id && t.eliminates.length && t.time_cost <= c.time_budget - support.time_cost);
  if (elimTest) {
    await page.click(`.test[data-test="${elimTest.id}"]`);
    // ตัดสมมติฐานออกด้วยหลักฐานที่ถูก
    const target = elimTest.eliminates[0];
    await page.click(`button[data-elim="${target}"]`);
    await page.check(`input[name="elim-${target}"][value="${elimTest.id}"]`);
    await page.click(`button[data-confirm-elim="${target}"]`);
    await page.waitForSelector(`.hypo__item[data-hypo="${target}"].is-eliminated`);
    if (opts.wrongElim) {
      // ตัดผิด: ใช้หลักฐาน support ตัดข้อที่มันไม่ได้ตัด
      const other = c.hypotheses.find((h) => h.id !== target && h.id !== correct && !support.eliminates.includes(h.id));
      if (other) {
        await page.click(`button[data-elim="${other.id}"]`);
        await page.check(`input[name="elim-${other.id}"][value="${support.id}"]`);
        await page.click(`button[data-confirm-elim="${other.id}"]`);
        await page.waitForTimeout(150);
      }
    }
  }
  if (opts.wrongCause) {
    const wrong = c.hypotheses.find((h) => !h.correct && !(elimTest && elimTest.eliminates.includes(h.id)));
    await page.check(`input[name=cause][value="${wrong.id}"]`);
    await page.check(`input[name=cite][value="${support.id}"]`);
    await page.click('#diag-submit');
    await page.waitForTimeout(150);
    assert(await page.isVisible('#diag-submit'), 'สาเหตุผิดต้องไม่จบเคส');
  }
  await page.check(`input[name=cause][value="${correct}"]`);
  await page.check(`input[name=cite][value="${support.id}"]`);
  await page.click('#diag-submit');
  await page.waitForSelector('#diag-done');
  return c;
}

const { page, errors, shot, close } = await launch();
try {
  await startSession(page, 'ANON-006');
  await page.goto(BASE + '#/map?free=1', { waitUntil: 'networkidle' });
  await page.click('.level-card[href="#/level/l3"]');
  await page.click('#level-start'); await dismissTour(page);
  await page.waitForSelector('.diag');
  await shot('m6-l3-case');
  const c = await solveCase(page, { guessFirst: true, wrongCause: true, wrongElim: true });
  await shot('m6-l3-solved');
  await page.click('#diag-done');
  await page.waitForSelector('.debrief');
  await shot('m6-l3-debrief');
  const events = await getEvents(page);
  const done = events.find((e) => e.eventType === 'level_complete' && e.levelId === 'l3');
  assert(done, 'ต้องมี level_complete');
  const ev = done.payload.evidence;
  console.log('evidence:', JSON.stringify(ev));
  assert(ev.case_id === c.id && ev.correct_cause === true, 'เคสและผลต้องถูก');
  assert(ev.guess_without_evidence === 1 && ev.wrong_submits === 1 && ev.wrong_eliminations >= 0, 'ตัวนับข้อผิดพลาดต้องถูก');
  assert(ev.hypotheses_eliminated >= 1 && ev.tests_used === 2, 'ต้องบันทึกการทดสอบและการตัดสมมติฐาน');
  assert(events.some((e) => e.eventType === 'submit_without_evidence'), 'ต้องมี event submit_without_evidence');
  const dbg = await page.locator('.debrief__sec--feed_back').textContent();
  assert(dbg.includes(c.title), 'debrief ต้องระบุชื่อเคส');

  // โมดูลซ่อม: เล่น 2 เคสติดกัน
  await page.goto(BASE + '#/repair', { waitUntil: 'networkidle' });
  await page.waitForSelector('.diag');
  await dismissTour(page);
  await shot('m6-repair');
  const r1 = await solveCase(page);
  await page.click('#diag-done');
  await page.waitForSelector('#repair-next');
  await page.click('#repair-next');
  await page.waitForSelector('.diag');
  const r2 = await solveCase(page);
  assert(r1.id !== r2.id, 'เคสถัดไปต้องไม่ซ้ำเคสก่อน');
  await page.click('#diag-done');
  await page.waitForSelector('#repair-next');
  const ev2 = await getEvents(page);
  assert(ev2.filter((e) => e.levelId === 'repair' && e.eventType === 'case_complete').length === 2, 'โมดูลซ่อมต้องบันทึก case_complete 2 ครั้ง');
  console.log('repair cases:', r1.id, r2.id);
} finally {
  report('m6-level3', errors);
  await close();
}
