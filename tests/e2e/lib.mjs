/**
 * ตัวช่วยทดสอบแบบ end-to-end ด้วย Chromium headless (Playwright)
 * รัน: NODE_PATH=<ที่ติดตั้ง playwright> node tests/e2e/<ไฟล์>.mjs
 * ใช้ preview server ที่ BASE_URL (ค่าเริ่มต้น http://localhost:4173/printlab-m4/)
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const BASE = process.env.BASE_URL ?? 'http://localhost:4173/printlab-m4/';
export const OUT = process.env.SHOT_DIR ?? 'tests/e2e/shots';
mkdirSync(OUT, { recursive: true });

/**
 * เปิด Chromium headless — ถ้ามี HTTPS_PROXY (เช่น sandbox ที่ต้องออกเน็ตผ่าน proxy) จะตั้ง proxy ให้และยอมรับใบรับรองของ proxy
 * errors  = console.error + pageerror ของทุกหน้า (ไม่รวมฟอนต์ภายนอกที่โหลดไม่ได้ในสภาพแวดล้อมทดสอบ)
 * failed  = request ที่ล้มเหลวหรือได้สถานะ ≥ 400 (ไว้ตรวจ 404 จาก base path ผิด)
 * fontIssues = ปัญหาโหลดฟอนต์ภายนอก แยกรายงานต่างหาก
 */
export async function launch() {
  // ไม่ตั้ง proxy ให้ Chromium โดยตรง — กรณีต้องออกเน็ตผ่าน proxy ใช้ routedContext() ให้ Node ดึงแทน
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const context = await routedContext(browser);
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  const fontIssues = [];
  const isFont = (s) => /fonts\.googleapis|fonts\.gstatic/.test(s);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const loc = m.location()?.url ?? '';
    if (isFont(text) || isFont(loc) || /ERR_CONNECTION_RESET|ERR_INTERNET_DISCONNECTED/.test(text)) { fontIssues.push(text); return; }
    errors.push('console: ' + text + (loc ? ` @ ${loc}` : ''));
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (isFont(u)) fontIssues.push(`requestfailed ${u}`);
    else failed.push(`requestfailed ${u} (${r.failure()?.errorText ?? ''})`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) {
      const u = r.url();
      if (isFont(u)) fontIssues.push(`${r.status()} ${u}`);
      else failed.push(`${r.status()} ${u}`);
    }
  });
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const close = () => browser.close();
  return { browser, context, page, errors, failed, fontIssues, shot, close };
}

/**
 * สร้าง context ใหม่ — ถ้าต้องออกเน็ตผ่าน proxy (BASE เป็น https และมี HTTPS_PROXY) ให้ Node เป็นคนดึงทุก request แทนเบราว์เซอร์
 * เพราะ Chromium ต่อ TLS ผ่าน proxy แบบนี้ไม่ได้ ส่วน page.on('response') ยังเห็นสถานะจริงของทุก request
 */
export async function routedContext(browser) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const viaNode = Boolean(proxy) && BASE.startsWith('https://');
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, ignoreHTTPSErrors: viaNode });
  if (viaNode) {
    await context.route('**/*', async (route) => {
      try {
        const res = await context.request.fetch(route.request(), { maxRedirects: 5, timeout: 30000 });
        await route.fulfill({ response: res });
      } catch {
        await route.abort('failed');
      }
    });
  }
  return context;
}

export async function startSession(page, code = 'ANON-001') {
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.fill('#code', code);
  await page.check('#consent');
  await page.click('button[type=submit]');
  await page.waitForSelector('.level-grid');
}

export function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

export async function getEvents(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('printlab-m4');
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('events')) { resolve([]); return; }
      const tx = db.transaction('events', 'readonly');
      const all = tx.objectStore('events').getAll();
      all.onsuccess = () => resolve(all.result.sort((a, b) => a.clientTs.localeCompare(b.clientTs)));
      all.onerror = () => resolve([]);
    };
    req.onerror = () => resolve([]);
  }));
}

export function report(name, errors, failed = [], fontIssues = []) {
  if (fontIssues.length) console.log(`[${name}] หมายเหตุ: ฟอนต์ภายนอกโหลดไม่ได้ในสภาพแวดล้อมนี้ ${fontIssues.length} รายการ (fallback ทำงาน)`);
  if (errors.length || failed.length) {
    console.log(`[${name}] console/page errors: ${errors.length}, failed/4xx requests: ${failed.length}`);
    for (const e of errors) console.log('  ' + e);
    for (const f of failed) console.log('  ' + f);
    process.exitCode = 1;
  } else {
    console.log(`[${name}] OK — no console errors, no failed requests`);
  }
}
