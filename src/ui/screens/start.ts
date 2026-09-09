import { el, append } from '../dom';
import { icon } from '../icons';
import { navigate, type Screen } from '../router';
import { TIMEPOINTS, getSession, isValidParticipant, startSession, endSession, ROSTER_SIZE, type Timepoint } from '../../game/session';
import { track } from '../../telemetry/events';
import { helpLink } from '../helpLink';

export const startScreen: Screen = (root) => {
  const existing = getSession();

  const page = el('div', { class: 'screen screen--start' });
  const card = el('section', { class: 'card card--start', 'aria-labelledby': 'start-title' });

  const brand = el('div', { class: 'brand brand--lg' }, icon('printer'), el('span', { class: 'brand__name', text: 'PRINTLAB' }));
  const title = el('h1', { id: 'start-title', class: 'title', text: 'เกมสถานการณ์จำลองเครื่องพิมพ์ 3 มิติ' });
  const lead = el('p', { class: 'lead' },
    'วิเคราะห์ระบบ ทดลองภายใต้เงื่อนไข วินิจฉัยจากหลักฐาน และออกแบบชิ้นงานจริง ผ่านเครื่องพิมพ์ 3 มิติ Creality Ender 3 V3 KE ในห้องแล็บจำลอง');

  const ethics = el('div', { class: 'notice' },
    icon('shield'),
    el('div', {},
      el('strong', { text: 'ข้อมูลที่เก็บ' }),
      el('p', { text: 'ระบบบันทึกเฉพาะการกระทำในเกม (เช่น เวลาต่อด่าน จำนวนครั้งที่ลอง การขอคำใบ้) ด้วยรหัสนิรนามที่ครูแจก ไม่เก็บชื่อ เลขประจำตัว หรือข้อมูลระบุตัวตนใด ๆ คุณถอนตัวได้ทุกเมื่อโดยไม่มีผลต่อผลการเรียน' }),
    ),
  );

  const helpBtn = helpLink('อ่านคู่มือก่อนเริ่ม', 'btn btn--cyan');
  helpBtn.id = 'start-help';
  append(card, brand, title, lead, el('div', { class: 'row' }, helpBtn), ethics);

  if (existing) {
    const resume = el('div', { class: 'resume' },
      el('p', {}, 'กำลังเล่นในชื่อ ', el('strong', { class: 'mono', text: existing.participantCode }), ` · ${TIMEPOINTS.find((t) => t.id === existing.timepoint)?.label ?? existing.timepoint}`),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn--primary', type: 'button' }, icon('play'), 'เล่นต่อ'),
        el('button', { class: 'btn btn--ghost', type: 'button' }, 'เปลี่ยนรหัส'),
      ),
    );
    const [btnResume, btnChange] = resume.querySelectorAll('button');
    btnResume?.addEventListener('click', () => navigate('/map'));
    btnChange?.addEventListener('click', async () => {
      track('session_end', { reason: 'change_code' });
      await endSession();
      navigate('/', true);
      location.reload();
    });
    append(card, resume);
  } else {
    const form = el('form', { class: 'form', novalidate: true });
    const codeInput = el('input', {
      class: 'input mono',
      id: 'code',
      name: 'code',
      type: 'text',
      placeholder: 'ANON-001',
      autocomplete: 'off',
      spellcheck: 'false',
      maxlength: 8,
      'aria-describedby': 'code-help',
    }) as HTMLInputElement;
    const codeHelp = el('p', { id: 'code-help', class: 'help', text: `รหัสที่ครูแจกให้ รูปแบบ ANON-001 ถึง ANON-${String(ROSTER_SIZE).padStart(3, '0')}` });
    const codeError = el('p', { class: 'error', role: 'alert', hidden: true });

    const tpSelect = el('select', { class: 'input', id: 'timepoint', name: 'timepoint' }) as HTMLSelectElement;
    for (const tp of TIMEPOINTS) {
      const opt = el('option', { value: tp.id, text: tp.label });
      if (tp.id === 'X') opt.selected = true;
      tpSelect.appendChild(opt);
    }

    const consent = el('input', { type: 'checkbox', id: 'consent', class: 'checkbox' }) as HTMLInputElement;
    const consentLabel = el('label', { for: 'consent', class: 'check' }, consent, el('span', { text: 'ฉันเข้าใจว่าการเล่นนี้บันทึกด้วยรหัสนิรนาม และถอนตัวได้ทุกเมื่อ' }));

    const submit = el('button', { class: 'btn btn--primary btn--lg', type: 'submit' }, icon('play'), 'เริ่มภารกิจ');

    append(form,
      el('div', { class: 'field' }, el('label', { for: 'code', class: 'label', text: 'รหัสผู้เข้าร่วม' }), codeInput, codeHelp, codeError),
      el('div', { class: 'field' }, el('label', { for: 'timepoint', class: 'label', text: 'ช่วงการเก็บข้อมูล' }), tpSelect),
      el('div', { class: 'field' }, consentLabel),
      submit,
    );

    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase();
      codeError.hidden = true;
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = codeInput.value.trim().toUpperCase();
      if (!isValidParticipant(code)) {
        codeError.textContent = 'รหัสไม่ถูกต้อง ตรวจรูปแบบ ANON-ตามด้วยเลข 3 หลัก ตามที่ครูแจก';
        codeError.hidden = false;
        codeInput.focus();
        return;
      }
      if (!consent.checked) {
        codeError.textContent = 'โปรดติ๊กยืนยันว่าเข้าใจเรื่องการเก็บข้อมูลก่อนเริ่ม';
        codeError.hidden = false;
        consent.focus();
        return;
      }
      submit.disabled = true;
      await startSession(code, tpSelect.value as Timepoint);
      track('session_start', { userAgent: navigator.userAgent.slice(0, 80), viewport: [innerWidth, innerHeight] });
      navigate('/map');
    });

    append(card, form);
  }

  append(page, card, el('p', { class: 'foot', text: 'โรงเรียนสาธิตมหาวิทยาลัยราชภัฏสกลนคร · รายวิชาการออกแบบและเทคโนโลยี ม.4' }));
  root.appendChild(page);
  (page.querySelector('input, button') as HTMLElement | null)?.focus();
};
