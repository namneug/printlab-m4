/**
 * เฟสที่ 2 — LlmMentor (ยังไม่เปิดใช้ ไม่มี API key)
 * เมื่อพร้อม: ตั้ง VITE_MENTOR_PROVIDER=llm และ deploy api/mentor.ts พร้อม ANTHROPIC_API_KEY ฝั่งเซิร์ฟเวอร์เท่านั้น
 * สัญญาการเรียกตามข้อ 6ก ของ CLAUDE.md · ถ้า API ล้มเหลวให้ตกกลับมาที่ RuleMentor และ log mentorSource: "rule_fallback"
 * จุดวิกฤตด้านความปลอดภัยยังใช้ข้อความคงที่จาก hints.json เสมอ (ไม่ผ่านไฟล์นี้)
 */
import type { HintLevel, MentorContext, MentorMessage, MentorMode, MentorProvider } from './index';
import { RuleMentor } from './rule';

export interface MentorRequest {
  participantCode: string;
  levelId: string;
  /** ไม่เกิน 2 KB */
  gameState: Record<string, unknown>;
  requestType: 'hint' | 'explain_error' | 'debrief';
  hintLevel: HintLevel;
}

export interface MentorResponse {
  mode: MentorMode;
  text: string;
  revealsAnswer: false;
}

const ENDPOINT = '/api/mentor';
const TIMEOUT_MS = 6000;

export class LlmMentor implements MentorProvider {
  private fallback = new RuleMentor();
  constructor(private participantCode: string) {}

  private async call(ctx: MentorContext, requestType: MentorRequest['requestType']): Promise<MentorMessage | null> {
    const body: MentorRequest = {
      participantCode: this.participantCode,
      levelId: ctx.levelId,
      gameState: { trigger: ctx.trigger, ...(ctx.gameState ?? {}), vars: ctx.vars ?? {} },
      requestType,
      hintLevel: ctx.hintLevel,
    };
    const json = JSON.stringify(body);
    if (json.length > 2048) body.gameState = { trigger: ctx.trigger };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
      if (!res.ok) return null;
      const data = (await res.json()) as MentorResponse;
      if (typeof data.text !== 'string' || data.revealsAnswer !== false) return null;
      return { mode: data.mode, text: data.text, hintLevel: ctx.hintLevel, trigger: ctx.trigger, source: 'llm', revealsAnswer: false };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async hint(ctx: MentorContext): Promise<MentorMessage | null> {
    const m = await this.call(ctx, 'hint');
    if (m) return m;
    const f = await this.fallback.hint(ctx);
    return f ? { ...f, source: 'rule_fallback' } : null;
  }

  async explainError(ctx: MentorContext): Promise<MentorMessage> {
    const m = await this.call(ctx, 'explain_error');
    if (m) return m;
    return { ...(await this.fallback.explainError(ctx)), source: 'rule_fallback' };
  }

  async debrief(ctx: MentorContext): Promise<MentorMessage> {
    // debrief ต้องมีครบ 3 ส่วน — เฟสนี้ใช้เทมเพลตจาก RuleMentor เสมอ
    return { ...(await this.fallback.debrief(ctx)), source: 'rule_fallback' };
  }
}
