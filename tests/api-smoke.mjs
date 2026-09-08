/**
 * ทดสอบ api/events.ts และ api/teacher.ts กับ Supabase จำลอง (HTTP server ในเครื่อง) — ไม่ต้องมีบัญชี Supabase
 * รัน: node tests/api-smoke.mjs  (คอมไพล์ api/ ด้วย tsc ไปที่ tmp ก่อน)
 */
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'printlab-api-'));
execSync(`npx tsc -p api/tsconfig.json --noEmit false --outDir ${out}`, { stdio: 'inherit' });

const store = { participants: [], sessions: [], events: [], mentor_logs: [], assessments: [], participant_summary: [] };
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const table = u.pathname.replace('/rest/v1/', '');
    if (req.headers.authorization !== 'Bearer service-key') { res.writeHead(401); res.end('unauthorized'); return; }
    if (req.method === 'POST') {
      const rows = JSON.parse(body);
      const key = table === 'events' ? 'event_id' : table === 'sessions' ? 'session_id' : table === 'participants' ? 'participant_code' : null;
      for (const r of rows) {
        if (key && store[table].some((x) => x[key] === r[key])) continue;
        store[table].push(r);
      }
      res.writeHead(201); res.end('');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(store[table] ?? []));
  });
});
await new Promise((r) => server.listen(0, r));
process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.TEACHER_TOKEN = 'teach';

const events = (await import(pathToFileURL(join(out, 'events.js')).href)).default;
const teacher = (await import(pathToFileURL(join(out, 'teacher.js')).href)).default;

const ev = (over = {}) => ({
  eventId: crypto.randomUUID(), participantCode: 'ANON-001', sessionId: '11111111-1111-4111-8111-111111111111', timepoint: 'X',
  levelId: 'l1', eventType: 'level_start', construct: 'architecture', payload: { userAgent: 'test' }, clientTs: new Date().toISOString(), ...over,
});
const dup = ev({ eventType: 'hint_shown', payload: { trigger: 'general', hintLevel: 1, mentorSource: 'rule', requestedBy: 'player' } });
const bad = ev({ participantCode: 'สมชาย' }); // ต้องถูกปฏิเสธ: ไม่ใช่รหัสนิรนาม
const res = await events(new Request('http://x/api/events', { method: 'POST', body: JSON.stringify({ events: [ev(), dup, dup, bad] }) }));
const data = await res.json();
console.log('events response', res.status, data);
if (res.status !== 200 || data.inserted !== 3) throw new Error('inserted ต้องเป็น 3 (นับก่อนตัดซ้ำ) และปฏิเสธรหัสไม่ถูกต้อง');
if (store.events.length !== 2) throw new Error('ตาราง events ต้องมี 2 แถว (ตัดซ้ำด้วย event_id)');
if (store.participants.length !== 1 || store.sessions.length !== 1) throw new Error('participants/sessions ต้องถูก upsert');
if (store.mentor_logs.length !== 2 || store.mentor_logs[0].mentor_source !== 'rule') throw new Error('mentor_logs ต้องมาจาก hint_shown');
if (store.events.some((e) => e.participant_code === 'สมชาย')) throw new Error('ห้ามรับข้อมูลระบุตัวตน');

const unauth = await teacher(new Request('http://x/api/teacher'));
if (unauth.status !== 401) throw new Error('teacher ต้องปฏิเสธเมื่อไม่มี token');
const ok = await teacher(new Request('http://x/api/teacher', { headers: { 'x-teacher-token': 'teach' } }));
const t = await ok.json();
if (ok.status !== 200 || t.events.length !== 2 || t.events[0].eventId === undefined) throw new Error('teacher ต้องคืน events แบบ camelCase');
const notConf = await events(new Request('http://x/api/events', { method: 'OPTIONS' }));
if (notConf.status !== 204) throw new Error('OPTIONS ต้องตอบ 204');
console.log('api smoke OK — events 2 rows, mentor_logs 2, teacher endpoint auth OK');
server.close();
