-- HADD SCIENCE 지식재산권 스키마
--
-- 설계 메모
--  * omnis(Prisma) 가 나중에 같은 Postgres 로 합쳐질 것을 전제로 `public` 이 아닌
--    전용 `ip` 스키마에 둔다. Prisma 기본 스키마(public)와 이름이 겹치지 않는다.
--  * 상태값은 CHECK 로 박지 않고 ip.status_options 룩업 테이블로 관리한다.
--    상태를 추가할 때 마이그레이션 없이 행 하나만 넣으면 되고, UI 색/정렬도 여기서 온다.
--  * 모든 테이블 RLS 기본 차단. ip.members 에 있는 로그인 사용자만 읽고 쓴다.
--  * 실제 업무 기록이라 수정·삭제 이력을 ip.audit_log 에 남긴다(되돌리기 근거).

create schema if not exists ip;

-- ---------------------------------------------------------------------------
-- 접근 제어
-- ---------------------------------------------------------------------------

-- 가입 전에 미리 등록해 두는 허용 이메일. 여기 없는 계정은 로그인해도 멤버가 안 된다.
create table ip.allowed_emails (
  email       text primary key,
  role        text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  note        text,
  created_at  timestamptz not null default now()
);

-- 실제 접근 권한을 가진 사용자. auth.users 와 1:1.
create table ip.members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  display_name text,
  role         text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at   timestamptz not null default now()
);

-- RLS 정책에서 쓰는 헬퍼. security definer 라 RLS 재귀를 피한다.
create or replace function ip.is_member()
returns boolean
language sql
stable
security definer
set search_path = ip, pg_catalog
as $$
  select exists (select 1 from ip.members m where m.user_id = auth.uid());
$$;

create or replace function ip.can_write()
returns boolean
language sql
stable
security definer
set search_path = ip, pg_catalog
as $$
  select exists (
    select 1 from ip.members m
    where m.user_id = auth.uid() and m.role in ('owner', 'editor')
  );
$$;

-- 소셜 로그인으로 계정이 생기면 허용목록에 있는 경우에만 멤버로 승격한다.
create or replace function ip.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  allowed ip.allowed_emails%rowtype;
begin
  select * into allowed from ip.allowed_emails a
  where lower(a.email) = lower(new.email);

  if found then
    insert into ip.members (user_id, email, display_name, role)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
      allowed.role
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function ip.handle_new_user();

-- ---------------------------------------------------------------------------
-- 상태 룩업 (상표/특허 공용)
-- ---------------------------------------------------------------------------

create table ip.status_options (
  kind       text not null check (kind in ('trademark', 'patent')),
  value      text not null,
  sort_order int  not null,
  -- UI 배지 색. components/ip/status-badge.tsx 의 톤 이름과 맞춘다.
  tone       text not null default 'neutral',
  -- 이 상태를 "진행 중(팔로우업 대상)" 으로 볼지. 정체 일수 계산에 쓴다.
  is_open    boolean not null default true,
  primary key (kind, value)
);

insert into ip.status_options (kind, value, sort_order, tone, is_open) values
  ('trademark', '등록완료', 1, 'emerald', false),
  ('trademark', '출원준비', 2, 'indigo',  true),
  ('trademark', '검토중',   3, 'amber',   true),
  ('trademark', '거절결정', 4, 'red',     true),
  ('trademark', '중단',     5, 'muted',   false),
  ('trademark', '아이디어', 6, 'violet',  false),
  ('patent',    '등록',     1, 'emerald', false),
  ('patent',    '출원',     2, 'sky',     false),
  ('patent',    '출원준비', 3, 'indigo',  true);

-- ---------------------------------------------------------------------------
-- 상표
-- ---------------------------------------------------------------------------

create table ip.trademarks (
  id          text primary key,                    -- 기존 대장 ID 유지 (TM-04 …)
  name        text not null,
  name_ko     text not null default '',
  classes     text[] not null default '{}',        -- 제01류 …
  goods       text,                                -- 지정상품
  reg_no      text,                                -- 등록 또는 출원번호
  ref_date    date,                                -- 등록일 또는 최종 진행일 (KST)
  holder      text,
  status      text not null,
  probability int check (probability between 0 and 100),
  note        text not null default '',
  kind        text generated always as ('trademark') stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  foreign key (kind, status) references ip.status_options (kind, value)
);

-- ---------------------------------------------------------------------------
-- 특허
-- ---------------------------------------------------------------------------

create table ip.patents (
  id         text primary key,                     -- PT-01 …
  title      text not null,
  app_no     text,                                 -- 출원번호 또는 사건번호
  reg_no     text,
  ref_date   date,
  applicant  text not null default '',
  status     text not null,
  note       text not null default '',
  kind       text generated always as ('patent') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  foreign key (kind, status) references ip.status_options (kind, value)
);

-- 같은 출원번호가 둘 이상 걸리면 정합성 화면에서 잡아낸다 (PT-03 / PT-07 건).
create index patents_app_no_idx on ip.patents (app_no) where app_no is not null;

-- ---------------------------------------------------------------------------
-- 커뮤니케이션 로그
-- ---------------------------------------------------------------------------

create table ip.communications (
  id               uuid primary key default gen_random_uuid(),
  occurred_on      date not null,
  direction        text not null check (direction in ('발신', '수신')),
  from_name        text not null,
  to_name          text not null,
  target           text not null check (target in ('상표', '특허', '관리')),
  subject          text not null,
  body             text not null default '',
  attachments      text[] not null default '{}',
  follow_up        text not null default '',
  is_open          boolean not null default false,  -- 후속 조치 미완결
  -- Gmail 원문으로 바로 이동하기 위한 식별자. 앱에서 딥링크로 연결한다.
  gmail_thread_id  text,
  gmail_message_id text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null
);

create index communications_occurred_on_idx on ip.communications (occurred_on desc);
create index communications_open_idx on ip.communications (is_open) where is_open;
create unique index communications_gmail_message_idx
  on ip.communications (gmail_message_id) where gmail_message_id is not null;

-- 메일 ↔ 상표/특허 연결. 지금까지는 본문 문자열 매칭으로 추정했지만 명시적으로 건다.
create table ip.communication_links (
  communication_id uuid not null references ip.communications (id) on delete cascade,
  entity_kind      text not null check (entity_kind in ('trademark', 'patent')),
  entity_id        text not null,
  primary key (communication_id, entity_kind, entity_id)
);

create index communication_links_entity_idx
  on ip.communication_links (entity_kind, entity_id);

-- ---------------------------------------------------------------------------
-- 미결 액션
-- ---------------------------------------------------------------------------

create table ip.actions (
  id           text primary key,                   -- A-1 …
  target       text not null check (target in ('상표', '특허', '관리')),
  subject      text not null,
  requested_at date,
  requester    text,
  todo         text not null,
  owner_name   text not null default '',
  priority     text not null check (priority in ('높음', '보통', '낮음')),
  note         text not null default '',
  -- 기존 대장에는 완료 개념이 없었다. 팔로우업 도구로 쓰려면 반드시 필요하다.
  state        text not null default 'open' check (state in ('open', 'done', 'dropped')),
  resolution   text,
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);

create index actions_state_idx on ip.actions (state);

-- ---------------------------------------------------------------------------
-- 정합성 경고
--
-- 지금까지는 note 의 「※」 를 매번 파싱해서 보여줬다. 해결 상태를 남기려면
-- 실체가 있어야 하므로 테이블로 승격한다. note 파싱분은 이관 시 seed 로 들어간다.
-- ---------------------------------------------------------------------------

create table ip.integrity_flags (
  id          uuid primary key default gen_random_uuid(),
  entity_kind text not null check (entity_kind in ('trademark', 'patent', 'action', 'general')),
  entity_id   text,
  message     text not null,
  -- note: 비고의 ※ 에서 추출 / detector: 중복 출원번호 등 자동 감지 / manual: 직접 등록
  source      text not null default 'note' check (source in ('note', 'detector', 'manual')),
  state       text not null default 'open' check (state in ('open', 'resolved', 'dismissed')),
  resolution  text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index integrity_flags_state_idx on ip.integrity_flags (state);

-- ---------------------------------------------------------------------------
-- 감사 로그 (수정·삭제 이력, 되돌리기 근거)
-- ---------------------------------------------------------------------------

create table ip.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       uuid references auth.users (id) on delete set null,
  actor_email text,
  op          text not null check (op in ('insert', 'update', 'delete')),
  entity      text not null,
  entity_id   text not null,
  before      jsonb,
  after       jsonb
);

create index audit_log_entity_idx on ip.audit_log (entity, entity_id, at desc);
create index audit_log_at_idx on ip.audit_log (at desc);

create or replace function ip.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function ip.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  actor_mail text;
  rec_id     text;
begin
  select m.email into actor_mail from ip.members m where m.user_id = auth.uid();

  if tg_op = 'DELETE' then
    rec_id := (to_jsonb(old) ->> 'id');
    insert into ip.audit_log (actor, actor_email, op, entity, entity_id, before, after)
    values (auth.uid(), actor_mail, 'delete', tg_table_name, rec_id, to_jsonb(old), null);
    return old;
  end if;

  rec_id := (to_jsonb(new) ->> 'id');
  insert into ip.audit_log (actor, actor_email, op, entity, entity_id, before, after)
  values (
    auth.uid(),
    actor_mail,
    lower(tg_op),
    tg_table_name,
    rec_id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['trademarks', 'patents', 'communications', 'actions'] loop
    execute format(
      'create trigger %I_touch before update on ip.%I
         for each row execute function ip.touch_row()', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on ip.%I
         for each row execute function ip.write_audit()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — 기본 전면 차단, 멤버만 읽기, editor 이상만 쓰기
-- ---------------------------------------------------------------------------

alter table ip.allowed_emails     enable row level security;
alter table ip.members            enable row level security;
alter table ip.status_options     enable row level security;
alter table ip.trademarks         enable row level security;
alter table ip.patents            enable row level security;
alter table ip.communications     enable row level security;
alter table ip.communication_links enable row level security;
alter table ip.actions            enable row level security;
alter table ip.integrity_flags    enable row level security;
alter table ip.audit_log          enable row level security;

-- 멤버는 자기 정보와 상태 목록을 읽을 수 있다.
create policy members_read on ip.members
  for select using (user_id = auth.uid() or ip.is_member());

create policy status_options_read on ip.status_options
  for select using (ip.is_member());

-- 업무 데이터: 읽기는 멤버, 쓰기는 editor 이상.
do $$
declare
  t text;
begin
  foreach t in array array[
    'trademarks', 'patents', 'communications', 'communication_links',
    'actions', 'integrity_flags'
  ] loop
    execute format(
      'create policy %I_read on ip.%I for select using (ip.is_member())', t, t);
    execute format(
      'create policy %I_insert on ip.%I for insert with check (ip.can_write())', t, t);
    execute format(
      'create policy %I_update on ip.%I for update using (ip.can_write()) with check (ip.can_write())', t, t);
    execute format(
      'create policy %I_delete on ip.%I for delete using (ip.can_write())', t, t);
  end loop;
end;
$$;

-- 감사 로그는 읽기 전용(트리거가 security definer 로 쓴다).
create policy audit_log_read on ip.audit_log
  for select using (ip.is_member());

-- allowed_emails 는 owner 만 관리한다.
create policy allowed_emails_owner on ip.allowed_emails
  for all
  using (exists (select 1 from ip.members m where m.user_id = auth.uid() and m.role = 'owner'))
  with check (exists (select 1 from ip.members m where m.user_id = auth.uid() and m.role = 'owner'));

-- ---------------------------------------------------------------------------
-- PostgREST 노출
-- ---------------------------------------------------------------------------

grant usage on schema ip to anon, authenticated;
grant select on all tables in schema ip to authenticated;
grant insert, update, delete on
  ip.trademarks, ip.patents, ip.communications, ip.communication_links,
  ip.actions, ip.integrity_flags, ip.allowed_emails
  to authenticated;
grant usage, select on all sequences in schema ip to authenticated;

-- anon 은 아무것도 못 읽는다. RLS 로도 막히지만 권한 자체를 주지 않는다.
revoke all on all tables in schema ip from anon;
