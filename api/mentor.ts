/**
 * api/mentor.ts — เฟสที่ 2 เท่านั้น (ยังไม่เปิดใช้)
 * Vercel serverless function รับ MentorRequest แล้วเรียก Anthropic API ด้วย ANTHROPIC_API_KEY ฝั่งเซิร์ฟเวอร์
 * Guardrail ที่ต้องมีเมื่อเปิดใช้: ส่ง game state ทุกครั้ง · ตอบเป็น JSON {mode,text,revealsAnswer:false} · rate limit ต่อ participantCode ต่อชั่วโมง
 * ตอนนี้ตอบ 501 เพื่อให้ client ตกกลับไปใช้ RuleMentor โดยอัตโนมัติ
 */
export default async function handler(_request: Request): Promise<Response> {
  return new Response(JSON.stringify({ error: 'mentor_llm_not_enabled', message: 'เฟสที่ 2 ยังไม่เปิดใช้ ใช้ RuleMentor ในเบราว์เซอร์' }), {
    status: 501,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
