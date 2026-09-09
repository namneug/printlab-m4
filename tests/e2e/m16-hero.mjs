/** ปกเกม 3 มิติหน้าแรก: 1440×900 และ 390×844, console error, หยุด RAF เมื่อซ่อนแท็บ, dispose เมื่อออก, reduced-motion, fallback ไม่มี WebGL */
import { launch, routedContext, assert, report, BASE, OUT } from './lib.mjs';

const { page, errors, failed, fontIssues, close, browser } = await launch();
try {
  await page.setViewportSize({ width: 1440, height: 900 });
  const t0 = Date.now();
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  const loadMs = Date.now() - t0;
  await page.waitForSelector('.hero--webgl canvas');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/m16-hero-1440.png` });
  // ตัวหนังสือในแผงต้องอ่านออก: ตรวจว่า panel ทึบพอ (พื้นหลังของการ์ดไม่โปร่งเกิน)
  const alpha = await page.evaluate(() => getComputedStyle(document.querySelector('.card--start')).backgroundColor);
  assert(alpha && alpha !== 'transparent' && alpha !== 'rgba(0, 0, 0, 0)', 'การ์ดต้องมีพื้นหลัง: ' + alpha);
  const dpr = await page.evaluate(() => Math.min(window.devicePixelRatio, 2));
  const canvasScale = await page.evaluate(() => { const c = document.querySelector('.hero__canvas'); return c.width / c.clientWidth; });
  assert(Math.abs(canvasScale - dpr) < 0.05, `DPR ของ canvas ต้องไม่เกิน 2 (ได้ ${canvasScale})`);
  // หมุนช้า: มุมเปลี่ยนเล็กน้อยใน 2 วินาที (ตรวจว่าภาพเปลี่ยน)
  const a = await page.screenshot({ clip: { x: 800, y: 200, width: 400, height: 400 } });
  await page.waitForTimeout(2000);
  const b = await page.screenshot({ clip: { x: 800, y: 200, width: 400, height: 400 } });
  assert(!a.equals(b), 'ฉากต้องหมุน (ภาพต้องเปลี่ยนใน 2 วิ)');
  // ฟอร์มทำงานเหมือนเดิม
  await page.fill('#code', 'ANON-018');
  await page.selectOption('#timepoint', 'X');
  await page.check('#consent');
  await page.click('button[type=submit]');
  await page.waitForSelector('.level-grid');
  assert((await page.locator('.hero__canvas').count()) === 0, 'ออกจากหน้าแรกแล้ว canvas ต้องถูกทิ้ง');
  // กลับหน้าแรก (โหมดเล่นต่อ) แล้วซ่อนแท็บ → RAF ต้องหยุด
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.hero--webgl canvas');
  await page.waitForSelector('.resume');
  const framesWhileHidden = await page.evaluate(async () => {
    let n = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { n++; return orig(cb); };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 600));
    const count = n;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 300));
    return { hidden: count, resumed: n - count };
  });
  assert(framesWhileHidden.hidden <= 2 && framesWhileHidden.resumed > 0, `RAF ต้องหยุดตอนซ่อนแท็บและกลับมาเมื่อแสดง: ${JSON.stringify(framesWhileHidden)}`);
  // มือถือ
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert(sw[0] <= sw[1], 'มือถือต้องไม่มี overflow แนวนอน: ' + sw.join('/'));
  const op = await page.evaluate(() => getComputedStyle(document.querySelector('.hero__canvas')).opacity);
  assert(Number(op) < 1, 'บนจอแคบโมเดลต้องจาง (opacity < 1): ' + op);
  await page.screenshot({ path: `${OUT}/m16-hero-390.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/m16-hero-390-full.png`, fullPage: true });
  await page.click('text=เปลี่ยนรหัส');
  await page.waitForSelector('#code');
  assert(await page.isVisible('#code') && await page.isVisible('button[type=submit]'), 'ฟอร์มบนมือถือต้องเห็นและใช้ได้');

  // reduced motion → นิ่ง
  const ctx2 = await routedContext(browser);
  const p2 = await ctx2.newPage();
  await p2.emulateMedia({ reducedMotion: 'reduce' });
  await p2.setViewportSize({ width: 1440, height: 900 });
  await p2.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await p2.waitForSelector('.hero--webgl canvas');
  await p2.waitForTimeout(500);
  const s1 = await p2.screenshot({ clip: { x: 800, y: 200, width: 400, height: 400 } });
  await p2.waitForTimeout(1500);
  const s2 = await p2.screenshot({ clip: { x: 800, y: 200, width: 400, height: 400 } });
  assert(s1.equals(s2), 'reduced-motion ต้องนิ่งมุมเดียว');
  await ctx2.close();

  // ไม่มี WebGL → fallback พื้นหลังไล่สี และฟอร์มใช้ได้
  const ctx3 = await routedContext(browser);
  const p3 = await ctx3.newPage();
  const errs3 = [];
  p3.on('pageerror', (e) => errs3.push(e.message));
  await p3.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(String(type)) ? null : orig.call(this, type, ...rest); };
  });
  await p3.setViewportSize({ width: 1440, height: 900 });
  await p3.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await p3.waitForSelector('.hero--fallback');
  assert((await p3.locator('.hero__canvas').count()) === 0, 'fallback ต้องไม่มี canvas');
  await p3.screenshot({ path: `${OUT}/m16-hero-fallback.png` });
  await p3.fill('#code', 'ANON-019'); await p3.check('#consent'); await p3.click('button[type=submit]');
  await p3.waitForSelector('.level-grid');
  assert(errs3.length === 0, 'fallback ต้องไม่มี page error: ' + errs3.join('; '));
  await ctx3.close();
  console.log(`hero OK — load ${loadMs} ms`);
} finally {
  report('m16-hero', errors, failed, fontIssues);
  await close();
}
