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

export async function launch() {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|ERR_CONNECTION_RESET/.test(m.text())) errors.push('console: ' + m.text());
  });
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const close = () => browser.close();
  return { browser, page, errors, shot, close };
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

export function report(name, errors) {
  if (errors.length) {
    console.log(`[${name}] console/page errors:`);
    for (const e of errors) console.log('  ' + e);
    process.exitCode = 1;
  } else {
    console.log(`[${name}] OK — no console errors`);
  }
}
