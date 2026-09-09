/**
 * api/teacher.ts — ข้อมูลสำหรับแดชบอร์ดครู (อ่านอย่างเดียว)
 * GET ?since=ISO → { events, assessments, summary } · ต้องส่ง header x-teacher-token ให้ตรงกับ TEACHER_TOKEN
 * ส่งเฉพาะรหัสนิรนาม ไม่มีข้อมูลระบุตัวตน
 */
import { CORS, json, sbRequest, supabaseEnv } from './_supabase.js';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, CORS);
  const token = process.env['TEACHER_TOKEN'];
  if (!token) return json({ error: 'not_configured', message: 'ยังไม่ตั้ง TEACHER_TOKEN' }, 503, CORS);
  if (request.headers.get('x-teacher-token') !== token) return json({ error: 'unauthorized' }, 401, CORS);
  const env = supabaseEnv();
  if (!env) return json({ error: 'not_configured', message: 'ยังไม่ตั้ง SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 503, CORS);

  const url = new URL(request.url);
  const since = url.searchParams.get('since');
  const q = `select=event_id,participant_code,session_id,timepoint,level_id,event_type,construct,payload,client_ts&order=client_ts.asc&limit=50000${since ? `&client_ts=gte.${encodeURIComponent(since)}` : ''}`;
  const [evRes, asRes, sumRes] = await Promise.all([
    sbRequest(env, 'events', { query: q }),
    sbRequest(env, 'assessments', { query: 'select=participant_code,timepoint,score,max_score' }),
    sbRequest(env, 'participant_summary', { query: 'select=*' }),
  ]);
  if (!evRes.ok) return json({ error: 'supabase_error', detail: await evRes.text() }, 502, CORS);
  const rows = (await evRes.json()) as Record<string, unknown>[];
  const events = rows.map((r) => ({
    eventId: r['event_id'],
    participantCode: r['participant_code'],
    sessionId: r['session_id'],
    timepoint: r['timepoint'],
    levelId: r['level_id'],
    eventType: r['event_type'],
    construct: r['construct'],
    payload: r['payload'],
    clientTs: r['client_ts'],
  }));
  return json({ events, assessments: asRes.ok ? await asRes.json() : [], summary: sumRes.ok ? await sumRes.json() : [] }, 200, CORS);
}
