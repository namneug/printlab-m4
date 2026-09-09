/** ด่าน 3 — วินิจฉัยเชิงสาเหตุ: ใช้กลไกร่วมจาก modes/diagnosis.ts กับเคสที่กำหนดจากรหัสผู้เล่น */
import { el } from '../ui/dom';
import { caseForParticipant, runDiagnosis, DIAGNOSIS_TOUR } from '../modes/diagnosis';
import type { LevelContext, LevelModule } from './context';

export const level: LevelModule = {
  mount(ctx: LevelContext) {
    const root = el('div', { class: 'l3' });
    ctx.root.appendChild(root);
    const c = caseForParticipant(ctx.session.participantCode, 'base');
    ctx.defineTour(DIAGNOSIS_TOUR);
    const stop = runDiagnosis(root, c, { track: ctx.track, mentor: ctx.mentor, setStatus: ctx.setStatus, guide: ctx.guide }, (o) => {
      ctx.complete(
        { ...o },
        {
          case_title: o.case_title,
          tests_used: o.tests_used,
          time_spent: o.time_spent,
          budget: o.time_budget,
          eliminated: o.hypotheses_eliminated,
          guesses: o.guess_without_evidence,
          wrong_submits: o.wrong_submits,
        },
      );
    });
    return () => {
      stop();
      root.remove();
    };
  },
};
