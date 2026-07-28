-- 접근 요청·승인 흐름
--
-- 이메일 허용목록 매칭을 접근 통제의 유일한 수단으로 쓸 수 없다.
-- 회사 업무 메일이 네이버웍스(@haddscience.com)라 Google·카카오 계정 이메일과 다르고,
-- 카카오는 비즈니스 인증 전까지 이메일을 아예 주지 않는다.
--
-- 그래서 신원(소셜 계정)과 권한(승인)을 분리한다.
-- 로그인은 누구나 되지만, owner 가 승인해야 데이터에 접근할 수 있다.

create table ip.access_requests (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  provider       text,          -- google | kakao
  provider_email text,          -- 소셜 계정 이메일 (카카오는 없을 수 있음)
  display_name   text not null, -- 본인이 입력한 이름
  work_email     text,          -- 네이버웍스 업무 이메일
  message        text not null default '',
  state          text not null default 'pending'
                 check (state in ('pending', 'approved', 'rejected')),
  requested_at   timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references auth.users (id) on delete set null
);

create index access_requests_state_idx on ip.access_requests (state);

alter table ip.access_requests enable row level security;

-- 본인 요청은 본인이 넣고 읽는다.
create policy access_requests_insert_self on ip.access_requests
  for insert with check (user_id = auth.uid());

create policy access_requests_read_self on ip.access_requests
  for select using (user_id = auth.uid());

-- 재신청(거절된 뒤 다시)도 본인이 할 수 있다.
create policy access_requests_update_self on ip.access_requests
  for update
  using (user_id = auth.uid() and state <> 'approved')
  with check (user_id = auth.uid());

-- owner 는 전체를 보고 처리한다.
create policy access_requests_owner_all on ip.access_requests
  for all
  using (exists (
    select 1 from ip.members m where m.user_id = auth.uid() and m.role = 'owner'
  ))
  with check (exists (
    select 1 from ip.members m where m.user_id = auth.uid() and m.role = 'owner'
  ));

grant select, insert, update on ip.access_requests to authenticated;

-- owner 가 멤버 목록을 관리할 수 있게 한다 (기존 정책은 읽기만 있었다).
create policy members_owner_write on ip.members
  for all
  using (exists (
    select 1 from ip.members m where m.user_id = auth.uid() and m.role = 'owner'
  ))
  with check (exists (
    select 1 from ip.members m where m.user_id = auth.uid() and m.role = 'owner'
  ));

grant insert, update, delete on ip.members to authenticated;

-- ---------------------------------------------------------------------------
-- 승인 / 거절
--
-- auth.users 를 읽어야 해서 security definer 로 둔다.
-- 함수 안에서 호출자가 owner 인지 직접 확인한다.
-- ---------------------------------------------------------------------------

create or replace function ip.approve_access_request(target uuid, member_role text default 'editor')
returns void
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  req ip.access_requests%rowtype;
begin
  if not exists (
    select 1 from ip.members m where m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception '승인 권한이 없습니다.';
  end if;

  if member_role not in ('owner', 'editor', 'viewer') then
    raise exception '알 수 없는 역할입니다: %', member_role;
  end if;

  select * into req from ip.access_requests where user_id = target;
  if not found then
    raise exception '요청을 찾을 수 없습니다.';
  end if;

  insert into ip.members (user_id, email, display_name, role)
  values (
    req.user_id,
    -- 소셜 이메일이 없으면(카카오) 업무 이메일을 식별자로 쓴다.
    coalesce(nullif(req.provider_email, ''), req.work_email, req.user_id::text),
    req.display_name,
    member_role
  )
  on conflict (user_id) do update
    set role = excluded.role,
        display_name = excluded.display_name;

  update ip.access_requests
     set state = 'approved', decided_at = now(), decided_by = auth.uid()
   where user_id = target;
end;
$$;

create or replace function ip.reject_access_request(target uuid)
returns void
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
begin
  if not exists (
    select 1 from ip.members m where m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception '거절 권한이 없습니다.';
  end if;

  update ip.access_requests
     set state = 'rejected', decided_at = now(), decided_by = auth.uid()
   where user_id = target;

  delete from ip.members where user_id = target;
end;
$$;

grant execute on function ip.approve_access_request(uuid, text) to authenticated;
grant execute on function ip.reject_access_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 허용목록 정리
--
-- 네이버웍스 주소는 소셜 로그인으로 도달할 수 없어 매칭되지 않는다.
-- 승인 흐름이 생겼으므로 허용목록은 "이미 아는 계정 자동 통과" 용도로만 남긴다.
-- ---------------------------------------------------------------------------

delete from ip.allowed_emails where email like '%@haddscience.com';

comment on table ip.allowed_emails is
  '소셜 계정 이메일이 여기 있으면 첫 로그인에 자동으로 멤버가 된다. 그 외에는 접근 요청 → owner 승인.';
