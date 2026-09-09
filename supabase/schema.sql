-- PRINTLAB — โครงตาราง Supabase (ยกโครงเดียวกับ engineering-design-snru-young)
-- รันใน SQL editor ของโปรเจกต์ Supabase · เขียนได้เฉพาะผ่าน service role ในฟังก์ชันฝั่งเซิร์ฟเวอร์ (api/events.ts)
-- ห้ามเก็บชื่อจริงหรือข้อมูลระบุตัวตน ใช้ participant_code (ANON-001..) เท่านั้น

create table if not exists participants (
  participant_code text primary key check (participant_code ~ '^ANON-[0-9]{3}$'),
  class_label      text,
  created_at       timestamptz not null default now()
);

create table if not exists sessions (
  session_id       uuid primary key,
  participant_code text not null references participants(participant_code),
  timepoint        text not null check (timepoint in ('O1','X','O2','O3','O4')),
  started_at       timestamptz not null,
  ended_at         timestamptz,
  user_agent       text
);

create table if not exists events (
  event_id         uuid primary key,
  participant_code text not null references participants(participant_code),
  session_id       uuid not null references sessions(session_id),
  timepoint        text not null check (timepoint in ('O1','X','O2','O3','O4')),
  level_id         text,
  event_type       text not null,
  construct        text check (construct in ('architecture','operation','maintenance','problem_solving','safety')),
  payload          jsonb not null default '{}'::jsonb,
  client_ts        timestamptz not null,
  received_at      timestamptz not null default now()
);
create index if not exists events_participant_idx on events(participant_code, client_ts);
create index if not exists events_type_idx on events(event_type);
create index if not exists events_level_idx on events(level_id);

create table if not exists mentor_logs (
  id               bigint generated always as identity primary key,
  event_id         uuid references events(event_id),
  participant_code text not null references participants(participant_code),
  level_id         text,
  request          jsonb not null,
  response         jsonb not null,
  mode             text,
  hint_level       int,
  mentor_source    text not null default 'rule',
  fallback_used    boolean not null default false,
  latency_ms       int not null default 0,
  created_at       timestamptz not null default now()
);

create table if not exists assessments (
  id               bigint generated always as identity primary key,
  participant_code text not null references participants(participant_code),
  timepoint        text not null check (timepoint in ('O1','O2','O3','O4')),
  score            numeric not null,
  max_score        numeric,
  recorded_at      timestamptz not null default now(),
  unique (participant_code, timepoint)
);

-- RLS: ปิดการเข้าถึงด้วย anon key ทั้งหมด (service role ข้าม RLS โดยธรรมชาติ)
alter table participants enable row level security;
alter table sessions     enable row level security;
alter table events       enable row level security;
alter table mentor_logs  enable row level security;
alter table assessments  enable row level security;
-- ไม่สร้าง policy ให้ anon/authenticated → อ่าน/เขียนตรงไม่ได้

-- มุมมองสรุปรายคนสำหรับแดชบอร์ด (เรียกผ่าน api/teacher.ts)
create or replace view participant_summary as
select
  p.participant_code,
  count(distinct s.session_id)                                            as sessions,
  count(e.event_id)                                                       as events,
  count(distinct e.level_id) filter (where e.event_type = 'level_complete') as levels_completed,
  count(e.event_id) filter (where e.event_type = 'hint_shown')            as hints,
  count(e.event_id) filter (where e.event_type = 'safety_violation')      as safety_violations,
  max(e.client_ts)                                                        as last_seen
from participants p
left join sessions s on s.participant_code = p.participant_code
left join events e on e.participant_code = p.participant_code
group by p.participant_code;
