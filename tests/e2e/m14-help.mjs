/** คู่มือนักเรียน /help/: 8 ส่วน ค่าจริงจากเกม ลิงก์จากหน้าแรกและแถบบน พิมพ์ได้ อ่านบนมือถือได้ */
import { readFileSync } from 'node:fs';
import { dismissTour, launch, startSession, assert, report, BASE, OUT } from './lib.mjs';

const levels = JSON.parse(readFileSync(new URL('../../src/data/levels.json', import.meta.url), 'utf8')).levels;
const { page, errors, failed, fontIssues, shot, close } = await launch();
try {
  await page.goto(BASE + 'help/', { waitUntil: 'networkidle' });
  assert((await page.locator('.hsec').count()) === 8, 'ต้องมี 8 ส่วน');
  const text = await page.locator('.help-main').textContent();
  for (const s of ['ANON-001', 'ความสูงชั้น 0.12–0.32 มม.', 'ความหนาแน่นภายใน 10–80 %', 'ความเร็วพิมพ์ 30–100 มม./วิ', 'อุณหภูมิหัวฉีด 190–230 °C', '≥ 2 กก.', '≤ 90 นาที', '≤ 25 กรัม', 'ส่งออก JSON', 'เผลอปิดแท็บ']) assert(text.includes(s), 'คู่มือต้องมีข้อความ: ' + s);
  for (const l of levels) assert(text.includes(`ด่าน ${l.number} ${l.hintLevelMax} ครั้ง`), `ต้องแสดงจำนวนคำใบ้ด่าน ${l.number}`);
  assert((await page.locator('.lvl').count()) === 6 && (await page.locator('.rules li').count()) === 4 && (await page.locator('.fix-table tbody tr').count()) === 6, 'การ์ด 6 ใบ กติกา 4 ข้อ ตารางแก้ปัญหา 6 แถว');
  assert(await page.isVisible('.danger-box'), 'ต้องมีกล่องสีแดง');
  await shot('m14-help');
  // มือถือ
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert(sw[0] <= sw[1], 'มือถือต้องไม่มี overflow แนวนอน: ' + sw.join('/'));
  await shot('m14-help-mobile');
  // พิมพ์
  await page.emulateMedia({ media: 'print' });
  const printBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert(printBg === 'rgb(255, 255, 255)', 'พื้นหลังตอนพิมพ์ต้องขาว: ' + printBg);
  assert(!(await page.isVisible('.topbar')), 'แถบบนต้องซ่อนตอนพิมพ์');
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.screenshot({ path: `${OUT}/m14-help-print.png`, fullPage: false });
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1366, height: 768 });
  // ปุ่มบนหน้าแรกและลิงก์ในแถบบน
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  const href = await page.getAttribute('#start-help', 'href');
  const target = await page.getAttribute('#start-help', 'target');
  assert(href.endsWith('/printlab-m4/help/') && target === '_blank', `ปุ่มหน้าแรกต้องชี้ help/ และเปิดแท็บใหม่ (${href}, ${target})`);
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#start-help')]);
  await popup.waitForSelector('.hsec');
  assert(popup.url().endsWith('/printlab-m4/help/'), 'แท็บใหม่ต้องเปิดคู่มือ');
  await popup.close();
  await startSession(page, 'ANON-015');
  for (const path of ['#/map', '#/data', '#/level/l1', '#/explore', '#/repair']) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    const n = await page.locator('.topbar a[href$="help/"], .levelbar a[href$="help/"]').count();
    assert(n >= 1, `แถบบนของ ${path} ต้องมีลิงก์คู่มือ`);
  }
  await page.goto(BASE + 'teacher/', { waitUntil: 'networkidle' });
  await page.fill('#teacher-pass', 'printlab-teacher'); await page.click('button[type=submit]');
  await page.waitForSelector('.kpis');
  assert((await page.locator('.topbar a[href$="help/"]').count()) === 1, 'หน้าครูต้องมีลิงก์คู่มือ');
  console.log('help page OK');
} finally {
  report('m14-help', errors, failed, fontIssues);
  await close();
}
