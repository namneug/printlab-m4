# PRINTLAB

เกมสถานการณ์จำลอง 3 มิติ สอนการใช้งาน การซ่อมบำรุง และสถาปัตยกรรมเครื่องพิมพ์ 3 มิติ สำหรับนักเรียนชั้นมัธยมศึกษาปีที่ 4

## สถานะ

- **M0 — โครงโปรเจกต์** (รอบนี้): Vite + TypeScript + Three.js, ฉากว่างพร้อมกริดพื้น แสง และกล้องที่หมุน/ซูมได้, design tokens, ฟอนต์ไทย
- ยังไม่มีโค้ดของด่าน โหมด พี่เลี้ยง หรือระบบเก็บข้อมูล (โฟลเดอร์เตรียมไว้แล้ว)

## เทคโนโลยี

| ส่วน | เครื่องมือ |
| --- | --- |
| Bundler | Vite |
| ภาษา | TypeScript (strict) |
| 3 มิติ | Three.js (`three` + `three/addons`) |
| UI | DOM + CSS ล้วน ไม่ใช้ React, Vue หรือเฟรมเวิร์ก UI ใด ๆ |
| ฟอนต์ | Bai Jamjuree (หัวข้อ) และ IBM Plex Sans Thai (เนื้อหา) จาก Google Fonts, fallback เป็น Noto Sans Thai, system-ui |
| ไอคอน | inline SVG แบบเส้นทั้งหมด ไม่ใช้อิโมจิ |

ข้อความในเกมทั้งหมดเป็นภาษาไทย

## โครงสร้างโฟลเดอร์

```
printlab-m4/
├── index.html            # หน้าเดียวของเกม โหลดฟอนต์และ src/main.ts
├── api/                  # serverless functions (Vercel) — ยังว่าง
├── public/               # ไฟล์ static (โมเดล, เสียง, รูป) — ยังว่าง
└── src/
    ├── main.ts           # จุดเริ่มต้น: สร้างฉาก 3 มิติ + HUD
    ├── game/             # แกนเกม (ฉาก Three.js, ลูปเรนเดอร์)
    │   └── scene.ts
    ├── levels/           # ด่านต่าง ๆ — ยังว่าง
    ├── modes/            # โหมดการเล่น — ยังว่าง
    ├── mentor/           # ระบบพี่เลี้ยง/คำแนะนำ — ยังว่าง
    ├── telemetry/        # เก็บข้อมูลการเล่น — ยังว่าง
    ├── ui/               # HUD และองค์ประกอบ UI (DOM ล้วน)
    │   ├── hud.ts
    │   └── icons.ts      # ไอคอน inline SVG แบบเส้น
    ├── data/             # ข้อมูลเนื้อหา/ด่าน — ยังว่าง
    └── styles/
        ├── tokens.css    # ตัวแปรสี ฟอนต์ ระยะ (design tokens)
        └── base.css      # สไตล์พื้นฐานและ HUD
```

## การติดตั้งและรัน

ต้องมี Node.js 20 ขึ้นไป

```bash
npm install        # ติดตั้ง dependencies
npm run dev        # รันเซิร์ฟเวอร์พัฒนา ที่ http://localhost:5173
npm run build      # ตรวจ type แล้ว build ลง dist/
npm run preview    # เปิดดูผล build จาก dist/
npm run typecheck  # ตรวจ type อย่างเดียว ไม่ build
```

### การควบคุมกล้อง

- ลากเมาส์ซ้าย: หมุนกล้อง
- ล้อเมาส์: ซูมเข้า/ออก
- ลากเมาส์ขวา: เลื่อนมุมมอง

## กฎของ repo

- **ห้าม commit ไฟล์ build** (`dist/`) ลง repo — `.gitignore` ตัดไว้แล้ว ทุกอย่างต้อง build ได้จาก source
- **ห้ามใช้อิโมจิเป็นไอคอน** — ไอคอนทั้งหมดต้องเป็น inline SVG แบบเส้น (ดู `src/ui/icons.ts`)
- **ห้ามใช้เฟรมเวิร์ก UI** — UI ทั้งหมดเป็น DOM + CSS ล้วน
- **สีต้องอ้างผ่านตัวแปรใน `src/styles/tokens.css`** ไม่ใส่ค่าสีตรง ๆ ในไฟล์อื่น

## Design tokens

ตัวแปรหลักใน `src/styles/tokens.css`

| กลุ่ม | ตัวแปร |
| --- | --- |
| พื้นหลัง | `--bg` `--bg-deep` |
| พาเนล | `--panel` `--panel-2` `--panel-3` |
| เส้นขอบ | `--line` `--line-2` |
| ตัวอักษร | `--tx` `--tx-2` `--tx-mut` `--tx-dim` |
| สีเน้น | `--amber` `--cyan` `--violet` `--green` `--red` |

ฉาก Three.js อ่านค่าสีเหล่านี้จาก CSS ตอนเริ่มต้น จึงใช้โทนเดียวกับ UI โดยอัตโนมัติ

## Deploy ขึ้น Vercel

โปรเจกต์มี `vercel.json` ตั้งค่าไว้แล้ว (framework: vite, build: `npm run build`, output: `dist`)

### วิธีที่ 1: เชื่อมกับ GitHub (แนะนำ)

1. เข้า [vercel.com](https://vercel.com) → **Add New Project** → เลือก repo `printlab-m4`
2. Vercel ตรวจพบ Vite อัตโนมัติ ไม่ต้องแก้ค่าใด ๆ กด **Deploy**
3. หลังจากนั้นทุกครั้งที่ push ขึ้น `main` จะ deploy production ให้เอง และทุก branch/PR จะได้ preview URL แยก

### วิธีที่ 2: ใช้ Vercel CLI

```bash
npm i -g vercel
vercel login
vercel          # deploy แบบ preview
vercel --prod   # deploy ขึ้น production
```

### หมายเหตุ

- โฟลเดอร์ `api/` ใช้สำหรับ serverless functions ของ Vercel ในอนาคต (เช่น รับข้อมูล telemetry) ตอนนี้ยังว่าง
- ไม่ต้อง commit `dist/` — Vercel จะ build จาก source ให้ทุกครั้ง
- ฟอนต์โหลดจาก Google Fonts ต้องมีอินเทอร์เน็ต หากโหลดไม่ได้จะใช้ Noto Sans Thai หรือฟอนต์ระบบแทน
