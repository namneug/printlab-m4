/**
 * ทดสอบคิวส่ง event แบบทนเน็ตหลุด — ต้อง build ด้วย VITE_EVENTS_ENDPOINT=http://localhost:4174/api/events ก่อน
 * สคริปต์นี้เปิด endpoint จำลองเองที่พอร์ต 4174
 */
import { createServer } from 'node:http';
import { launch, startSession, assert, report, BASE } from './lib.mjs';

let received = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const { events } = JSON.parse(body);
    received.push(...events);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ received: events.length, inserted: events.length }));
  });
});
await new Promise((r) => server.listen(4174, r));

const { page, errors, close } = await launch();
const pending = () => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('printlab-m4');
  req.onsuccess = () => { const tx = req.result.transaction('events', 'readonly'); const a = tx.objectStore('events').index('sent').getAll(0); a.onsuccess = () => resolve(a.result.length); };
}));
try {
  await startSession(page, 'ANON-013');
  await page.waitForTimeout(800);
  assert(received.some((e) => e.eventType === 'session_start'), 'เซิร์ฟเวอร์ต้องได้รับ session_start');
  assert((await pending()) === 0, 'หลังส่งสำเร็จต้องไม่มี event ค้าง');
  const before = received.length;
  // ตัดเน็ต → event ต้องค้างในคิว
  await page.context().setOffline(true);
  await page.click('.level-card[href="#/level/l1"]');
  await page.waitForSelector('#level-start');
  await page.click('#level-start');
  await page.waitForSelector('.l1-tray .part-chip');
  await page.waitForTimeout(500);
  const queued = await pending();
  assert(queued >= 2 && received.length === before, `ออฟไลน์ต้องค้างในคิว (ค้าง ${queued})`);
  // กลับมาออนไลน์ → ส่งซ้ำอัตโนมัติ
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1500);
  assert((await pending()) === 0, 'กลับมาออนไลน์แล้วต้องส่งจนหมด');
  assert(received.length >= before + queued, 'เซิร์ฟเวอร์ต้องได้รับ event ที่ค้าง');
  const ids = new Set(received.map((e) => e.eventId));
  assert(ids.size === received.length, 'ต้องไม่ส่งซ้ำ');
  console.log(`queue OK — received ${received.length} events, replayed ${queued} after reconnect`);
} finally {
  report('m11-queue', errors);
  await close();
  server.close();
}
