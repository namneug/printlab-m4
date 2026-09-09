/**
 * ตรวจคลังคำใบ้ hints.json ให้ตรงกับข้อ 6 ของ CLAUDE.md
 * - ทุก trigger ที่บรีฟกำหนดต้องมี
 * - จำนวนระดับของแต่ละ trigger ต้องไม่เกิน hintLevelMax ของด่าน (และไม่ว่าง)
 * - ทุกข้อความไม่เกิน 3 ประโยค (นับจากช่องว่างคั่นประโยคภาษาไทย/เครื่องหมายจบประโยค) และไม่มีคำเฉลยตรง ๆ
 * - debrief ต้องมีครบ 3 ส่วน feed_up / feed_back / feed_forward
 * - safety ต้องมีข้อความคงที่สำหรับ over_temp และ abs_closed_room
 */
import { readFileSync } from 'node:fs';

const hints = JSON.parse(readFileSync(new URL('../src/data/hints.json', import.meta.url), 'utf8'));
const levels = JSON.parse(readFileSync(new URL('../src/data/levels.json', import.meta.url), 'utf8')).levels;

const REQUIRED = {
  l1: ['same_part_wrong_twice', 'feedback_loop_idle'],
  l2: ['multi_var_twice', 'time_not_met_after_4', 'tradeoff'],
  l3: ['submit_no_evidence', 'half_budget_no_elimination', 'test_repeat'],
  l4: ['table_not_opened'],
  l5: ['edp_skip', 'no_change_round2'],
  l6: ['no_own_data'],
};
const problems = [];
const sentences = (t) => t.split(/(?<=[.!?])\s+|\s{2,}/).filter(Boolean).length;

for (const lv of levels) {
  const h = hints.levels[lv.id];
  if (!h) { problems.push(`${lv.id}: ไม่มีคำใบ้`); continue; }
  for (const t of REQUIRED[lv.id] ?? []) if (!h.triggers[t]) problems.push(`${lv.id}: ขาด trigger ${t}`);
  for (const [t, arr] of Object.entries(h.triggers)) {
    if (!Array.isArray(arr) || arr.length === 0) problems.push(`${lv.id}/${t}: ว่าง`);
    if (arr.length > lv.hintLevelMax) problems.push(`${lv.id}/${t}: มี ${arr.length} ระดับ เกิน hintLevelMax ${lv.hintLevelMax}`);
    for (const [i, text] of arr.entries()) {
      if (sentences(text) > 3) problems.push(`${lv.id}/${t}[${i}]: เกิน 3 ประโยค`);
      if (/คำตอบคือ|เฉลย/.test(text)) problems.push(`${lv.id}/${t}[${i}]: มีคำเฉลย`);
    }
  }
  for (const k of ['feed_up', 'feed_back', 'feed_forward']) if (!h.debrief?.[k]) problems.push(`${lv.id}: debrief ขาด ${k}`);
}
for (const k of ['over_temp', 'abs_closed_room']) if (!hints.safety[k]) problems.push(`safety ขาด ${k}`);

if (problems.length) {
  console.error('hints.json มีปัญหา:');
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
const total = Object.values(hints.levels).reduce((a, l) => a + Object.values(l.triggers).reduce((b, arr) => b + arr.length, 0), 0);
console.log(`hints.json OK — ${Object.keys(hints.levels).length} ด่าน, ${total} ข้อความคำใบ้, safety ${Object.keys(hints.safety).length} ข้อความ`);
