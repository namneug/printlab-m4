import hintsData from '../data/hints.json';
import type { HintLevel, MentorContext, MentorMessage, MentorMode, MentorProvider } from './index';

interface DebriefTemplate {
  feed_up: string;
  feed_back: string;
  feed_forward: string;
}

interface LevelHints {
  triggers: Record<string, string[]>;
  errors?: Record<string, string>;
  debrief: DebriefTemplate;
}

interface HintsFile {
  levels: Record<string, LevelHints>;
  safety: Record<string, string>;
  generic: { no_hint: string; max_level: string };
}

const HINTS = hintsData as unknown as HintsFile;

/** เติมค่า {key} ในเทมเพลตด้วย vars */
export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = vars[k];
    return v === undefined ? m : String(v);
  });
}

export function safetyMessage(key: string): string | undefined {
  return HINTS.safety[key];
}

/**
 * พี่เลี้ยงแบบมีกฎ — อ่านข้อความที่เขียนไว้ล่วงหน้าจาก hints.json ทั้งหมด
 * ทำงานในเบราว์เซอร์ล้วน ไม่ต้องใช้เครือข่าย
 */
export class RuleMentor implements MentorProvider {
  async hint(ctx: MentorContext): Promise<MentorMessage | null> {
    const level = HINTS.levels[ctx.levelId];
    const list = level?.triggers[ctx.trigger];
    if (!list || list.length === 0) return null;
    const idx = Math.min(ctx.hintLevel, list.length) - 1;
    const text = list[idx];
    if (!text) return null;
    return {
      mode: 'feed_forward',
      text: fill(text, ctx.vars),
      hintLevel: (idx + 1) as HintLevel,
      trigger: ctx.trigger,
      source: 'rule',
      revealsAnswer: false,
    };
  }

  async explainError(ctx: MentorContext): Promise<MentorMessage> {
    const level = HINTS.levels[ctx.levelId];
    const text = level?.errors?.[ctx.trigger] ?? HINTS.generic.no_hint;
    return {
      mode: 'feed_back',
      text: fill(text, ctx.vars),
      trigger: ctx.trigger,
      source: 'rule',
      revealsAnswer: false,
    };
  }

  async debrief(ctx: MentorContext): Promise<MentorMessage> {
    const level = HINTS.levels[ctx.levelId];
    const t: DebriefTemplate = level?.debrief ?? {
      feed_up: 'เป้าหมายของด่านนี้คือ {objective}',
      feed_back: 'คุณใช้เวลา {time} และขอคำใบ้ {hints} ครั้ง',
      feed_forward: 'ด่านต่อไปลองสังเกตว่าสิ่งที่เรียนรู้จากด่านนี้นำไปใช้ตรงไหนได้บ้าง',
    };
    const modes: MentorMode[] = ['feed_up', 'feed_back', 'feed_forward'];
    const titles: Record<MentorMode, string> = {
      feed_up: 'เป้าหมายของด่านนี้',
      feed_back: 'สิ่งที่คุณทำจริง',
      feed_forward: 'ด่านต่อไปควรทำอะไรต่างออกไป',
    };
    const sections = modes.map((mode) => ({ mode, title: titles[mode], text: fill(t[mode], ctx.vars) }));
    return {
      mode: 'feed_back',
      text: sections.map((s) => s.text).join(' '),
      sections,
      trigger: 'debrief',
      source: 'rule',
      revealsAnswer: false,
    };
  }
}
