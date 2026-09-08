/**
 * api/events.ts — รับ event จาก client (คิวออฟไลน์ส่งเป็นชุด) แล้วเขียนลง Supabase ด้วย service role
 * POST { events: GameEvent[] } (≤ 200 รายการ) → { received, inserted }
 * ตรวจ schema ตามข้อ 7 ของ CLAUDE.md · participant_code ต้องเป็น ANON-xxx เท่านั้น
 */
import { CORS, json, sbRequest, supabaseEnv } from './_supabase.js';

interface GameEvent {
  eventId: string;
  participantCode: string;
  sessionId: string;
  timepoint: string;
  levelId: string | null;
  eventType: string;
  construct: string | null;
  payload: Record<string, unknown>;
  clientTs: string;
}

const TIMEPOINTS = new Set(['O1', 'X', 'O2', 'O3', 'O4']);
const CONSTRUCTS = new Set(['architecture', 'operation', 'maintenance', 'problem_solving', 'safety']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^ANON-\d{3}$/;

function valid(e: unknown): e is GameEvent {
  if (!e || typeof e !== 'object') return false;
  const x = e as Record<string, unknown>;
  return (
    typeof x['eventId'] === 'string' && UUID_RE.test(x['eventId']) &&
    typeof x['participantCode'] === 'string' && CODE_RE.test(x['participantCode']) &&
    typeof x['sessionId'] === 'string' && UUID_RE.test(x['sessionId']) &&
    typeof x['timepoint'] === 'string' && TIMEPOINTS.has(x['timepoint']) &&
    (x['levelId'] === null || typeof x['levelId'] === 'string') &&
    typeof x['eventType'] === 'string' && x['eventType'].length <= 64 &&
    (x['construct'] === null || (typeof x['construct'] === 'string' && CONSTRUCTS.has(x['construct']))) &&
    typeof x['payload'] === 'object' && x['payload'] !== null &&
    typeof x['clientTs'] === 'string' && !Number.isNaN(Date.parse(x['clientTs']))
  );
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, CORS);
  const env = supabaseEnv();
  if (!env) return json({ error: 'not_configured', message: 'ยังไม่ตั้ง SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 503, CORS);

  let body: { events?: unknown[] };
  try {
    body = (await request.json()) as { events?: unknown[] };
  } catch {
    return json({ error: 'bad_json' }, 400, CORS);
  }
  const list = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
  const events = list.filter(valid);
  if (events.length === 0) return json({ received: list.length, inserted: 0 }, 200, CORS);

  // 1) participants (upsert เงียบ ๆ)
  const codes = [...new Set(events.map((e) => e.participantCode))];
  await sbRequest(env, 'participants', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: codes.map((c) => ({ participant_code: c })) });

  // 2) sessions
  const sessions = new Map<string, GameEvent>();
  for (const e of events) if (!sessions.has(e.sessionId)) sessions.set(e.sessionId, e);
  await sbRequest(env, 'sessions', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: [...sessions.values()].map((e) => ({
      session_id: e.sessionId,
      participant_code: e.participantCode,
      timepoint: e.timepoint,
      started_at: e.clientTs,
      user_agent: typeof e.payload['userAgent'] === 'string' ? e.payload['userAgent'] : null,
    })),
  });

  // 3) events (ข้ามซ้ำด้วย event_id)
  const rows = events.map((e) => ({
    event_id: e.eventId,
    participant_code: e.participantCode,
    session_id: e.sessionId,
    timepoint: e.timepoint,
    level_id: e.levelId,
    event_type: e.eventType,
    construct: e.construct,
    payload: e.payload,
    client_ts: e.clientTs,
  }));
  const res = await sbRequest(env, 'events', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: rows });
  if (!res.ok) return json({ error: 'supabase_error', status: res.status, detail: await res.text() }, 502, CORS);

  // 4) mentor_logs จาก hint_shown (เฟส 1 ทุกคำใบ้มาจาก rule)
  const mentorRows = events
    .filter((e) => e.eventType === 'hint_shown' || e.eventType === 'mentor_explain')
    .map((e) => ({
      event_id: e.eventId,
      participant_code: e.participantCode,
      level_id: e.levelId,
      request: { trigger: e.payload['trigger'], requestedBy: e.payload['requestedBy'] ?? null, eventType: e.eventType },
      response: { hintLevel: e.payload['hintLevel'] ?? null },
      mode: e.eventType === 'hint_shown' ? 'feed_forward' : 'feed_back',
      hint_level: typeof e.payload['hintLevel'] === 'number' ? e.payload['hintLevel'] : null,
      mentor_source: typeof e.payload['mentorSource'] === 'string' ? e.payload['mentorSource'] : 'rule',
      fallback_used: e.payload['mentorSource'] === 'rule_fallback',
      latency_ms: 0,
    }));
  if (mentorRows.length) await sbRequest(env, 'mentor_logs', { method: 'POST', prefer: 'return=minimal', body: mentorRows });

  return json({ received: list.length, inserted: events.length }, 200, CORS);
}
