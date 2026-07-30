-- 진행 기록 — 사용자가 채우는 유일한 양식
--
-- 배경
--  지금까지 입력 경로가 넷이었다: 상표 편집 / 특허 편집 / 커뮤니케이션 / 액션.
--  실제로 사람이 아는 것은 하나뿐이다 — "언제 · 어느 건이 · 어디까지 갔고 · 이제 누구 차례인가".
--  대장의 번호·날짜·단계는 이 기록이 쌓인 결과이지 따로 입력하는 값이 아니다.
--
-- 설계 메모
--  * 단계(stage)는 상표/특허를 하나의 파이프라인으로 합친다. 화면에서만 탭으로 나눈다.
--  * 단계마다 "추가로 물어봐야 하는 칸"이 다르다. 그 목록을 ip.status_options 에 두어
--    단계를 추가할 때 마이그레이션 없이 행 하나만 넣으면 되게 한다(기존 설계 유지).
--  * 대장(ip.trademarks / ip.patents)은 남긴다. 엑셀 인수분은 기록이 없기 때문에
--    기록에서 전량 재계산하는 방식으로는 대장이 비어 버린다. 기록을 저장할 때
--    대장을 함께 갱신하는 쪽이 맞다 (ip.apply_progress_entry).
--  * 실제 업무 데이터는 이 파일에 넣지 않는다. 공개 저장소다.

-- ---------------------------------------------------------------------------
-- 1. 단계 룩업 확장 — status_options 가 곧 파이프라인 정의가 된다
-- ---------------------------------------------------------------------------

alter table ip.status_options
  add column if not exists wants_app_no      boolean not null default false,
  add column if not exists wants_reg_no      boolean not null default false,
  add column if not exists wants_probability boolean not null default false,
  add column if not exists wants_due         boolean not null default false,
  -- 기록 양식의 단계 목록에 띄울지. 과거 값 호환용으로 남겨둔 항목은 false.
  add column if not exists selectable        boolean not null default true;

-- 통합 파이프라인. 상표에만 있는 단계(출원공고)도 특허 쪽에 같이 넣어 두면
-- 나중에 특허 공고를 다루게 될 때 마이그레이션이 필요 없다.
insert into ip.status_options
  (kind, value, sort_order, tone, is_open,
   wants_app_no, wants_reg_no, wants_probability, wants_due)
values
  ('trademark', '아이디어',     10,  'violet',  true,  false, false, false, false),
  ('trademark', '검토요청',     20,  'sky',     true,  false, false, false, false),
  ('trademark', '검토의견',     30,  'amber',   true,  false, false, true,  false),
  ('trademark', '출원준비',     40,  'indigo',  true,  false, false, false, false),
  ('trademark', '출원',         50,  'indigo',  true,  true,  false, false, false),
  ('trademark', '출원공고',     60,  'sky',     true,  false, false, false, false),
  ('trademark', '의견제출통지', 70,  'red',     true,  false, false, false, true),
  ('trademark', '보정서제출',   80,  'amber',   true,  false, false, false, false),
  ('trademark', '심사중',       90,  'amber',   true,  false, false, false, false),
  ('trademark', '등록',         100, 'emerald', false, false, true,  false, false),
  ('trademark', '거절확정',     110, 'red',     false, false, false, false, false),
  ('trademark', '포기·중단',    120, 'muted',   false, false, false, false, false),

  ('patent',    '아이디어',     10,  'violet',  true,  false, false, false, false),
  ('patent',    '검토요청',     20,  'sky',     true,  false, false, false, false),
  ('patent',    '검토의견',     30,  'amber',   true,  false, false, true,  false),
  ('patent',    '출원준비',     40,  'indigo',  true,  false, false, false, false),
  ('patent',    '출원',         50,  'indigo',  true,  true,  false, false, false),
  ('patent',    '출원공고',     60,  'sky',     true,  false, false, false, false),
  ('patent',    '의견제출통지', 70,  'red',     true,  false, false, false, true),
  ('patent',    '보정서제출',   80,  'amber',   true,  false, false, false, false),
  ('patent',    '심사중',       90,  'amber',   true,  false, false, false, false),
  ('patent',    '등록',         100, 'emerald', false, false, true,  false, false),
  ('patent',    '거절확정',     110, 'red',     false, false, false, false, false),
  ('patent',    '포기·중단',    120, 'muted',   false, false, false, false, false)
on conflict (kind, value) do update set
  sort_order        = excluded.sort_order,
  tone              = excluded.tone,
  is_open           = excluded.is_open,
  wants_app_no      = excluded.wants_app_no,
  wants_reg_no      = excluded.wants_reg_no,
  wants_probability = excluded.wants_probability,
  wants_due         = excluded.wants_due,
  selectable        = true;

-- 기존 값을 통합 파이프라인으로 옮긴다. FK 가 걸려 있으므로 대장을 먼저 고친다.
update ip.trademarks set status = case status
  when '등록완료' then '등록'
  when '검토중'   then '검토의견'
  when '거절결정' then '거절확정'
  when '중단'     then '포기·중단'
  else status end
where status in ('등록완료', '검토중', '거절결정', '중단');

-- 특허의 '출원'·'출원준비'·'등록'은 이름이 그대로라 옮길 것이 없다.

delete from ip.status_options
 where (kind, value) in (
   ('trademark', '등록완료'), ('trademark', '검토중'),
   ('trademark', '거절결정'), ('trademark', '중단')
 );

-- ---------------------------------------------------------------------------
-- 2. 대장 날짜 분리
--
-- 엑셀 특허 시트는 출원날짜와 등록날짜가 별도 열인데 한 칸(ref_date)에 담겨 있었다.
-- 그 탓에 등록 건은 출원일이, 미등록 건은 등록일이 사라졌다.
-- ref_date 는 "마지막 진행일"로 의미를 바꾼다 — 정체 일수 계산의 근거.
-- ---------------------------------------------------------------------------

alter table ip.trademarks
  add column if not exists app_no        text,
  add column if not exists filed_on      date,
  add column if not exists registered_on date;

alter table ip.patents
  add column if not exists filed_on      date,
  add column if not exists registered_on date;

comment on column ip.trademarks.ref_date is '마지막 진행일 (정체 일수 계산용)';
comment on column ip.patents.ref_date    is '마지막 진행일 (정체 일수 계산용)';

-- ---------------------------------------------------------------------------
-- 3. 진행 기록
-- ---------------------------------------------------------------------------

create table ip.progress_entries (
  id          uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  entity_kind text not null check (entity_kind in ('trademark', 'patent')),
  entity_id   text not null,
  stage       text not null,
  -- 메일로 주고받은 기록이면 방향, 내부 결정이면 null
  direction   text check (direction in ('발신', '수신')),
  counterpart text not null default '',            -- 대리인 / 대표 …
  -- 지금 누구 차례인지. 미결 액션을 따로 등록하지 않기 위한 장치.
  next_turn   text not null default 'none' check (next_turn in ('us', 'firm', 'none')),
  due_on      date,
  -- 단계에 따라 채워지는 값
  app_no      text,
  reg_no      text,
  probability int check (probability between 0 and 100),
  note        text not null default '',
  -- 이 기록이 어디서 왔는지. mail 은 실험적 기능이므로 구분해서 남긴다.
  source      text not null default 'manual' check (source in ('manual', 'mail', 'excel')),
  raw         text,                                -- 메일 원문 조각 (source = mail)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  foreign key (entity_kind, stage) references ip.status_options (kind, value)
);

create index progress_entries_entity_idx
  on ip.progress_entries (entity_kind, entity_id, occurred_on desc);
create index progress_entries_date_idx on ip.progress_entries (occurred_on desc);
create index progress_entries_turn_idx on ip.progress_entries (next_turn)
  where next_turn <> 'none';

create trigger progress_entries_touch before update on ip.progress_entries
  for each row execute function ip.touch_row();
create trigger progress_entries_audit
  after insert or update or delete on ip.progress_entries
  for each row execute function ip.write_audit();

-- ---------------------------------------------------------------------------
-- 4. 기록 → 대장 반영
--
-- 과거 날짜의 기록을 나중에 넣는 일이 흔하다(인수 이전 이력 복원).
-- 단계와 마지막 진행일은 "더 최신 기록일 때만" 덮어쓰고,
-- 번호처럼 사실에 해당하는 값은 비어 있을 때만 채운다.
-- ---------------------------------------------------------------------------

create or replace function ip.apply_progress_entry()
returns trigger
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  newer boolean;
begin
  if new.entity_kind = 'trademark' then
    select coalesce(t.ref_date, '1900-01-01'::date) <= new.occurred_on
      into newer from ip.trademarks t where t.id = new.entity_id;
    if not found then return new; end if;

    update ip.trademarks set
      status        = case when newer then new.stage else status end,
      ref_date      = case when newer then new.occurred_on else ref_date end,
      app_no        = coalesce(app_no, new.app_no),
      reg_no        = coalesce(reg_no, new.reg_no),
      probability   = coalesce(new.probability, probability),
      filed_on      = case when new.stage = '출원' then coalesce(filed_on, new.occurred_on) else filed_on end,
      registered_on = case when new.stage = '등록' then coalesce(registered_on, new.occurred_on) else registered_on end
    where id = new.entity_id;
  else
    select coalesce(p.ref_date, '1900-01-01'::date) <= new.occurred_on
      into newer from ip.patents p where p.id = new.entity_id;
    if not found then return new; end if;

    update ip.patents set
      status        = case when newer then new.stage else status end,
      ref_date      = case when newer then new.occurred_on else ref_date end,
      app_no        = coalesce(app_no, new.app_no),
      reg_no        = coalesce(reg_no, new.reg_no),
      filed_on      = case when new.stage = '출원' then coalesce(filed_on, new.occurred_on) else filed_on end,
      registered_on = case when new.stage = '등록' then coalesce(registered_on, new.occurred_on) else registered_on end
    where id = new.entity_id;
  end if;

  return new;
end;
$$;

create trigger progress_entries_apply
  after insert or update on ip.progress_entries
  for each row execute function ip.apply_progress_entry();

-- ---------------------------------------------------------------------------
-- 5. RLS · 권한
-- ---------------------------------------------------------------------------

alter table ip.progress_entries enable row level security;

create policy progress_entries_read on ip.progress_entries
  for select using (ip.is_member());
create policy progress_entries_insert on ip.progress_entries
  for insert with check (ip.can_write());
create policy progress_entries_update on ip.progress_entries
  for update using (ip.can_write()) with check (ip.can_write());
create policy progress_entries_delete on ip.progress_entries
  for delete using (ip.can_write());

grant select, insert, update, delete on ip.progress_entries to authenticated;
grant select on ip.status_options to authenticated;
