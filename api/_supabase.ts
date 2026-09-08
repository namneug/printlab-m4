/** ตัวช่วยเรียก Supabase REST ด้วย service role — ใช้เฉพาะฝั่งเซิร์ฟเวอร์ (Vercel functions) ห้าม import จาก client */
export interface SupabaseEnv {
  url: string;
  key: string;
}

export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

export async function sbRequest(env: SupabaseEnv, path: string, init: { method?: string; body?: unknown; prefer?: string; query?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: env.key,
    Authorization: `Bearer ${env.key}`,
    'content-type': 'application/json',
  };
  if (init.prefer) headers['Prefer'] = init.prefer;
  const req: RequestInit = { method: init.method ?? 'GET', headers };
  if (init.body !== undefined) req.body = JSON.stringify(init.body);
  return fetch(`${env.url}/rest/v1/${path}${init.query ? `?${init.query}` : ''}`, req);
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

export const CORS = {
  'access-control-allow-origin': process.env['CORS_ORIGIN'] ?? '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-teacher-token',
};
