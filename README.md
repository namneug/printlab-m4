# PRINTLAB

เกมสถานการณ์จำลอง 3 มิติ สอนการวิเคราะห์ระบบ การใช้งาน และการซ่อมบำรุงเครื่องพิมพ์ 3 มิติ (Creality Ender 3 V3 KE) สำหรับนักเรียนชั้นมัธยมศึกษาปีที่ 4 รายวิชาการออกแบบและเทคโนโลยี หน่วยการเรียนรู้วิศวกรรม โรงเรียนสาธิตมหาวิทยาลัยราชภัฏสกลนคร

เกมเป็นเครื่องมือวิจัย: ทุกการกระทำถูกบันทึกเป็น event ที่ผูกกับ construct (สถาปัตยกรรม การใช้งาน การซ่อมบำรุง การแก้ปัญหา ความปลอดภัย) ด้วยรหัสนิรนาม และมีพี่เลี้ยงแบบมีกฎ (Rule-based Adaptive Mentor) ที่ให้คำใบ้จางลงตามด่าน

บรีฟฉบับเต็มอยู่ใน [CLAUDE.md](CLAUDE.md)

## ด่านและโหมด

| ด่าน | ชื่อ | สิ่งที่วัด (evidence) |
| --- | --- | --- |
| 1 | ถอดรหัสระบบ — จัด 18 ชิ้นเข้า 5 ระบบย่อย ต่อผัง input→process→output→feedback และวงจร thermistor→board→heater | grouping_accuracy, feedback_loop_identified, time_on_task, hint_used |
| 2 | ห้องปฏิบัติการพารามิเตอร์ — 4 ตัวแปร 4 ผลลัพธ์ ผ่านเงื่อนไข 3 ข้อพร้อมกัน | variables_changed_per_trial, trials_count, converged, constraint_priority_order |
| 3 | วินิจฉัยเชิงสาเหตุ — 6 เคส สมมติฐาน 4 ข้อ ทดสอบภายใต้งบเวลา สรุปต้องอ้างหลักฐาน | tests_used, time_spent, guess_without_evidence, hypotheses_eliminated, correct_cause |
| 4 | เลือกวัสดุและความปลอดภัย — PLA/PETG/ABS/TPU 3 โจทย์ เหตุผลจากตาราง เหตุการณ์ความปลอดภัย | material_choice_correct, justification_from_property_table, safety_violations |
| 5 | ภารกิจออกแบบเต็มวงจร — EDP 5 ขั้นบังคับลำดับ วนรอบ 2 rubric 5 องค์ประกอบจากพฤติกรรม | edp_rubric, iterations, changed_after_test |
| 6 | ผลกระทบและความยั่งยืน — ตัวเลขของผู้เล่นเอง ผลกระทบ 4 ด้าน นโยบายอ้างตัวเลขตนเอง | used_own_data_in_argument, impact_dimensions_covered |
| โหมดสำรวจ | แตะ 18 ชิ้น ชั้นการไหล 3 ชั้น คำถามชวนคิด | parts_explored, layers_toggled, probe_questions_answered |
| โมดูลซ่อม | สุ่มเคสจากคลัง ฝึกไม่จำกัด ใช้กลไกเดียวกับด่าน 3 | เหมือนด่าน 3 (levelId = repair) |

ทุกด่านมี: หน้าอธิบายแนวคิดก่อนเข้า (นิยาม + ตัวอย่างในชีวิตจริง) · เงื่อนไขสำเร็จตรวจอัตโนมัติ · ล้มเหลวแล้วกู้คืนได้ (ไม่มีตกรอบ) · debrief 3 ส่วน (feed up / feed back / feed forward) เติมค่าจริงของผู้เล่น

## เทคโนโลยี

- Vite + TypeScript (strict) + Three.js — UI เป็น DOM + CSS ล้วน ไม่ใช้เฟรมเวิร์ก UI
- โมเดล 3 มิติจาก primitive ทั้งหมด (`src/data/parts.json`) มี `GLTFLoader` เตรียมไว้ใน `src/game/loader.ts` (ตั้ง `VITE_PRINTER_MODEL_URL`)
- ฟอนต์ Bai Jamjuree + IBM Plex Sans Thai (fallback Noto Sans Thai, system-ui) · ไอคอนเป็น inline SVG แบบเส้นทั้งหมด (`src/ui/icons.ts`) ห้ามใช้อิโมจิ
- เล่นได้ออฟไลน์หลังโหลดหน้าแรก (ไม่มี dynamic import ของด่าน) · event เก็บใน IndexedDB แล้วส่งซ้ำเมื่อออนไลน์
- รองรับจอ 1366×768 ขึ้นไป และ responsive ถึงแท็บเล็ต พื้นที่กดบนจอสัมผัส ≥ 44 px

## โครงสร้าง

```
printlab-m4/
├── index.html               หน้าเกม (hash router: #/ #/map #/level/l1 … #/explore #/repair #/data)
├── teacher/index.html       แดชบอร์ดครู → /printlab-m4/teacher/
├── api/                     Vercel serverless functions
│   ├── events.ts            รับ event → Supabase (service role)
│   ├── teacher.ts           ข้อมูลแดชบอร์ด (x-teacher-token)
│   └── mentor.ts            เฟส 2 (LLM) ยังไม่เปิดใช้ ตอบ 501
├── supabase/schema.sql      ตาราง participants sessions events mentor_logs assessments + RLS
├── src/
│   ├── main.ts              จุดเริ่ม router + screens
│   ├── game/                scene.ts printer.ts (โมเดล 18 ชิ้น) viewport.ts flows.ts loader.ts session.ts
│   ├── levels/              l1-system.ts … l6-impact.ts + l2-params.model.ts (สูตรแยกไฟล์)
│   ├── modes/               explore.ts repair.ts diagnosis.ts (กลไกวินิจฉัยร่วม)
│   ├── mentor/              index.ts (MentorProvider) rule.ts (RuleMentor) llm.ts (เฟส 2)
│   ├── telemetry/           schema.ts events.ts queue.ts (IndexedDB) export.ts (CSV/JSON/สรุป)
│   ├── teacher/main.ts      แดชบอร์ดครู
│   ├── ui/                  router, dom, icons, diagram (SVG ลากเส้น), mentorDock, screens/
│   ├── data/                parts.json levels.json hints.json faults.json materials.json mission.json impact.json
│   └── styles/              tokens.css base.css shell.css levels.css teacher.css
└── tests/                   hints-check.mjs api-smoke.mjs e2e/ (Playwright)
```

## ไฟล์ข้อมูลที่ครู/ผู้เชี่ยวชาญแก้ได้โดยไม่แตะโค้ด

| ไฟล์ | ใช้ที่ | แก้อะไรได้ |
| --- | --- | --- |
| `src/data/parts.json` | โมเดล ด่าน 1 โหมดสำรวจ | ชื่อ หน้าที่ ระบบย่อย การเชื่อมต่อ คำถามชวนคิด ชั้นการไหล รูปทรง primitive |
| `src/data/levels.json` | ทุกด่าน | ชื่อ ตัวชี้วัด แนวคิด/ตัวอย่าง เป้าหมาย `hintLevelMax` (จางลง 3→2→1) |
| `src/data/hints.json` | พี่เลี้ยง | คำใบ้ทุก trigger (levelId → trigger → [ระดับ 1, 2, 3]) ข้อความอธิบายข้อผิดพลาด เทมเพลต debrief ข้อความความปลอดภัยคงที่ |
| `src/data/faults.json` | ด่าน 3 โมดูลซ่อม | เพิ่มเคสใหม่ได้ด้วย JSON เท่านั้น (`pools`: base / followup สำหรับ O3–O4) |
| `src/data/materials.json` | ด่าน 4 | สมบัติวัสดุ พิกัดอุณหภูมิ โจทย์และ feedback |
| `src/data/mission.json` | ด่าน 5 | โจทย์ เงื่อนไข การ์ดข้อมูล แบบร่าง (factor) เกณฑ์ทดสอบ |
| `src/data/impact.json` | ด่าน 6 | ค่าคงที่การประมาณ ข้อความผลกระทบ ทางเลือกนโยบาย |
| `src/levels/l2-params.model.ts` | ด่าน 2 และ 5 | สูตรคำนวณพร้อมที่มาของทุกสัมประสิทธิ์ (แบบจำลองอย่างง่าย ไม่ใช่ฟิสิกส์) |

รัน `npm test` หลังแก้ hints.json เพื่อตรวจว่า trigger ครบ ระดับไม่เกิน hintLevelMax และไม่เกิน 3 ประโยค

## ติดตั้งและรัน

ต้องมี Node.js 20 ขึ้นไป

```bash
npm install
npm run dev          # http://localhost:5173/printlab-m4/
npm run build        # typecheck (src + api) แล้ว build ลง dist/
npm run preview      # เปิดดู dist/ ที่ http://localhost:4173/printlab-m4/
npm test             # ตรวจ hints.json + ทดสอบ api/ กับ Supabase จำลอง
npm run test:e2e     # e2e ทั้งหมด (ต้องเปิด preview ไว้ และมี playwright ใน NODE_PATH)
```

เปิดทุกด่านพร้อมกันเพื่อทดสอบ: `#/map?free=1`

### ตัวแปรสภาพแวดล้อม

คัดลอก `.env.example` เป็น `.env` (ห้าม commit)

| ตัวแปร | ฝั่ง | ความหมาย |
| --- | --- | --- |
| `VITE_EVENTS_ENDPOINT` | client | URL รับ event (Vercel: `https://<app>.vercel.app/api/events`) เว้นว่าง = เก็บในเครื่องและส่งออกเป็นไฟล์ |
| `VITE_ROSTER_SIZE` | client | จำนวนรหัส ANON-001..0NN (ค่าเริ่มต้น 50) |
| `VITE_TEACHER_PASSWORD` | client | รหัสผ่านแดชบอร์ดครู ไม่ตั้ง = ใช้รหัสสำรองในโค้ด (`FALLBACK_PASSWORD` ใน `src/teacher/main.ts`) และขึ้นคำเตือนบนหน้าจอ |
| `VITE_TEACHER_API` | client | URL ของ `api/teacher` สำหรับดึงข้อมูลจากเซิร์ฟเวอร์ |
| `VITE_MENTOR_PROVIDER` | client | `rule` (เฟส 1 ค่าเริ่มต้น) หรือ `llm` (เฟส 2) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server | ใช้ใน `api/events.ts` และ `api/teacher.ts` เท่านั้น |
| `TEACHER_TOKEN` | server | token ของ `api/teacher.ts` |
| `ANTHROPIC_API_KEY` | server | เฟส 2 เท่านั้น ห้ามอยู่ฝั่ง client |

## ข้อมูลวิจัย

- รหัสผู้เข้าร่วม `ANON-001` ถึง `ANON-0NN` ครูแจก ไม่เก็บชื่อ เลขประจำตัว อีเมล หรือ IP
- Event schema (ข้อ 7 ของบรีฟ): `eventId participantCode sessionId timepoint levelId eventType construct payload clientTs`
- ทุก event เข้า IndexedDB ก่อน แล้วส่งไป `VITE_EVENTS_ENDPOINT` เป็นชุดเมื่อออนไลน์ (ไม่ซ้ำด้วย eventId)
- ส่งออกได้จากหน้า `#/data` (นักเรียน) และแดชบอร์ดครู: CSV (BOM เปิด Excel ได้) / JSON / สรุปรายคน แยกตาม timepoint และ construct
- คำใบ้ทุกครั้ง log `trigger hintLevel mentorSource shownAt requestedBy` (event `hint_shown`)

## Deploy

### GitHub Pages (เกม + แดชบอร์ด แบบไม่มี backend)

`vite.config.ts` ตั้ง `base: '/printlab-m4/'` ไว้แล้ว มี workflow `.github/workflows/deploy.yml` deploy อัตโนมัติเมื่อ push ขึ้น `main`

1. Settings → Pages → Source เลือก **GitHub Actions**
2. Settings → Secrets and variables → Actions: เพิ่ม secret `TEACHER_PASSWORD` (และ variable `ROSTER_SIZE` ถ้าไม่ใช่ 50)
3. push ขึ้น `main` → เปิด `https://<owner>.github.io/printlab-m4/` และแดชบอร์ดที่ `…/printlab-m4/teacher/`

**ทางสำรองถ้า GitHub Actions รันไม่ได้** (เช่น บัญชีติด spending limit) มี branch `gh-pages` ที่เก็บเฉพาะไฟล์ build จาก `main` ให้ตั้ง Settings → Pages → Source = **Deploy from a branch** เลือก `gh-pages` / root แล้วเปิด URL เดิม อัปเดตด้วยคำสั่ง

```bash
npm run build
git worktree add --orphan -b gh-pages /tmp/ghp   # ครั้งแรก (ครั้งต่อไปใช้ git worktree add /tmp/ghp gh-pages)
cp -r dist/. /tmp/ghp/ && touch /tmp/ghp/.nojekyll
git -C /tmp/ghp add -A && git -C /tmp/ghp commit -m "gh-pages: build" && git -C /tmp/ghp push -f origin gh-pages
git worktree remove --force /tmp/ghp
```

branch `gh-pages` มีแต่ผลลัพธ์ build (ไม่ใช่ branch หลัก) source ทั้งหมดอยู่ที่ `main`

บน Pages ไม่มี serverless functions: event จะเก็บในเบราว์เซอร์ของนักเรียนและส่งออกเป็นไฟล์ให้ครูนำเข้าแดชบอร์ด ถ้าต้องการรวมข้อมูลอัตโนมัติให้ deploy API บน Vercel แล้วตั้ง `EVENTS_ENDPOINT` / `TEACHER_API` เป็น repository variables

### Vercel (เกม + API + Supabase)

1. สร้างโปรเจกต์ Supabase แล้วรัน `supabase/schema.sql` ใน SQL editor
2. Vercel → Add New Project → เลือก repo (ตรวจพบ Vite อัตโนมัติ `vercel.json` มีให้แล้ว)
3. ตั้ง Environment Variables: `SUPABASE_URL` `SUPABASE_SERVICE_ROLE_KEY` `TEACHER_TOKEN` `VITE_EVENTS_ENDPOINT=/api/events` `VITE_TEACHER_API=/api/teacher` `VITE_TEACHER_PASSWORD`
4. ถ้าใช้ Vercel เป็นโดเมนหลัก ให้เปลี่ยน `base` ใน `vite.config.ts` เป็น `/`

ห้าม commit `dist/` (ถูก ignore แล้ว) ทุกอย่าง build จาก source

## การทดสอบ

- `tests/hints-check.mjs` — โครงสร้างคลังคำใบ้ตามข้อ 6 ของบรีฟ
- `tests/api-smoke.mjs` — `api/events.ts` และ `api/teacher.ts` กับ Supabase จำลอง (ตรวจ schema ตัดซ้ำ ปฏิเสธข้อมูลระบุตัวตน)
- `tests/e2e/*.mjs` — Chromium headless คลิกเล่นจบจริงทุกด่าน รวมชุดเล่นครบ 6 ด่านแบบตัดเน็ต (`m10-offline-full`) คิวส่งซ้ำ (`m11-queue`) และแดชบอร์ด (`m12-teacher`) ทุกชุดเก็บ console error และต้องเป็นศูนย์

## หมายเหตุสำหรับงานวิจัย

- เฟสนี้พี่เลี้ยงเป็น **rule-based** ทั้งหมด ยังไม่ใช้ Generative AI ชื่อเรื่อง/นิยามศัพท์ในเล่มต้องสอดคล้อง (ดูข้อ 6 ของบรีฟ) โครงเฟส 2 (`src/mentor/llm.ts`, `api/mentor.ts`) เตรียมไว้แล้วแต่ไม่เปิดใช้
- สิ่งที่เป็นดุลยพินิจของผู้ออกแบบและต้องผ่าน IOC ก่อนใช้จริง: โครงด่าน 6 หัวข้อ สูตรใน `l2-params.model.ts` ต้นทุนเวลา/หลักฐานใน `faults.json` เกณฑ์ผ่านของด่าน 4–6 ค่าสมบัติวัสดุใน `materials.json` และค่าคงที่ใน `impact.json`
- ตัวชี้วัด ว 4.1 ม.4/1–ม.4/5 ที่แสดงในเกมมาจาก `levels.json` ต้องเทียบข้อความกับเอกสารหลักสูตรฉบับจริงก่อนอ้างในเล่ม
