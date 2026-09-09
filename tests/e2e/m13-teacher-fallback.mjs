/** แดชบอร์ดครูเมื่อ build โดยไม่ตั้ง VITE_TEACHER_PASSWORD: ต้องเข้าได้ด้วยรหัสสำรองและมีคำเตือน */
import { launch, assert, report, BASE } from './lib.mjs';
const { page, errors, close } = await launch();
try {
  await page.goto(BASE + 'teacher/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#teacher-pass');
  assert(await page.isVisible('#teacher-fallback-warning'), 'ต้องมีคำเตือนว่ายังไม่ได้ตั้งรหัสจริง');
  await page.fill('#teacher-pass', 'wrong');
  await page.click('button[type=submit]');
  assert(await page.isVisible('.error'), 'รหัสผิดต้องถูกปฏิเสธ');
  await page.fill('#teacher-pass', 'printlab-teacher');
  await page.click('button[type=submit]');
  await page.waitForSelector('.kpis');
  assert(await page.isVisible('#teacher-fallback-warning'), 'ในแดชบอร์ดต้องยังมีคำเตือน');
  console.log('teacher fallback OK');
} finally {
  report('m13-teacher-fallback', errors);
  await close();
}
