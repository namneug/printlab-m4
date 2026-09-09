import { dismissTour, launch, startSession, assert, report } from './lib.mjs';

const { page, errors, shot, close } = await launch();
try {
  await page.goto((process.env.BASE_URL ?? 'http://localhost:4173/printlab-m4/') + '#/', { waitUntil: 'networkidle' });
  await shot('m2-start');
  // รหัสผิดต้องไม่ผ่าน
  await page.fill('#code', 'ABC');
  await page.click('button[type=submit]');
  assert(await page.isVisible('.error'), 'ควรแสดง error เมื่อรหัสผิด');
  await startSession(page, 'ANON-007');
  await shot('m2-map');
  assert((await page.locator('.level-card').count()) === 6, 'ต้องมีการ์ด 6 ด่าน');
  assert((await page.locator('.level-card.is-locked').count()) === 5, 'ด่าน 2–6 ต้องล็อก');
  await page.click('.level-card:not(.is-locked)');
  await page.waitForSelector('#level-start');
  await shot('m2-intro');
  await page.click('#level-start'); await dismissTour(page);
  await page.waitForSelector('.level-body .empty, .level-body .l1', { timeout: 5000 });
  await page.click('.btn--hint');
  await page.waitForSelector('.mentor__msg');
  await shot('m2-level');
  // รีโหลดแล้ว session ต้องยังอยู่
  await page.goto((process.env.BASE_URL ?? 'http://localhost:4173/printlab-m4/') + '#/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.resume');
  console.log('session restored after reload');
} finally {
  report('m2-shell', errors);
  await close();
}
