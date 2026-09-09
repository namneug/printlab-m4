import { launch, startSession, assert, report, getEvents } from './lib.mjs';

const { page, errors, shot, close } = await launch();
try {
  await startSession(page, 'ANON-003');
  await page.click('.level-card:not(.is-locked)');
  await page.waitForSelector('#level-start');
  await page.click('#level-start');
  await page.waitForSelector('.level-body .empty, .level-body .l1');
  await page.click('.btn--hint');
  await page.waitForTimeout(300);
  const events = await getEvents(page);
  const types = events.map((e) => e.eventType);
  console.log('event types:', [...new Set(types)].join(', '));
  for (const t of ['session_start', 'map_view', 'level_intro_view', 'level_start', 'hint_request']) assert(types.includes(t), `ต้องมี event ${t}`);
  const ev = events.find((e) => e.eventType === 'level_start');
  for (const k of ['eventId', 'participantCode', 'sessionId', 'timepoint', 'levelId', 'eventType', 'construct', 'payload', 'clientTs']) assert(k in ev, `schema ต้องมี ${k}`);
  assert(ev.participantCode === 'ANON-003' && ev.timepoint === 'X' && ev.levelId === 'l1', 'ค่าใน event ต้องถูก');
  await page.goto((process.env.BASE_URL ?? 'http://localhost:4173/printlab-m4/') + '#/data', { waitUntil: 'networkidle' });
  await page.waitForSelector('.table tbody tr');
  await shot('m3-data');
  // ปุ่มส่งออกต้องสร้างไฟล์ดาวน์โหลด
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=ส่งออก CSV')]);
  const path = await dl.path();
  const { readFileSync } = await import('node:fs');
  const csv = readFileSync(path, 'utf8');
  assert(csv.startsWith('﻿eventId,participantCode'), 'CSV header ต้องถูก');
  assert(csv.split('\n').length > 5, 'CSV ต้องมีหลายแถว');
  console.log('csv rows:', csv.split('\n').length - 1);
} finally {
  report('m3-telemetry', errors);
  await close();
}
