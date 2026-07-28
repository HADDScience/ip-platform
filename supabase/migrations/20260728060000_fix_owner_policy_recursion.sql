-- members 정책 무한 재귀 수정
--
-- ip.members 에 걸린 정책이 USING 절에서 다시 ip.members 를 조회하면
-- 정책 평가가 자기 자신을 호출해 "infinite recursion detected in policy" 로 실패한다.
-- ip.is_member() 처럼 owner 판정도 security definer 함수로 빼서 RLS 를 우회시킨다.

create or replace function ip.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ip, pg_catalog
as $$
  select exists (
    select 1 from ip.members m
    where m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

grant execute on function ip.is_owner() to authenticated;

-- members --------------------------------------------------------------------
drop policy if exists members_owner_write on ip.members;
drop policy if exists members_read on ip.members;

create policy members_read on ip.members
  for select using (user_id = auth.uid() or ip.is_member());

create policy members_owner_insert on ip.members
  for insert with check (ip.is_owner());

create policy members_owner_update on ip.members
  for update using (ip.is_owner()) with check (ip.is_owner());

create policy members_owner_delete on ip.members
  for delete using (ip.is_owner());

-- access_requests ------------------------------------------------------------
drop policy if exists access_requests_owner_all on ip.access_requests;

create policy access_requests_owner_read on ip.access_requests
  for select using (ip.is_owner());

create policy access_requests_owner_update on ip.access_requests
  for update using (ip.is_owner()) with check (ip.is_owner());

create policy access_requests_owner_delete on ip.access_requests
  for delete using (ip.is_owner());

-- allowed_emails -------------------------------------------------------------
drop policy if exists allowed_emails_owner on ip.allowed_emails;

create policy allowed_emails_owner on ip.allowed_emails
  for all using (ip.is_owner()) with check (ip.is_owner());

-- 승인/거절 함수도 같은 함수를 쓰게 정리한다.
create or replace function ip.approve_access_request(target uuid, member_role text default 'editor')
returns void
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  req ip.access_requests%rowtype;
begin
  if not ip.is_owner() then
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
  if not ip.is_owner() then
    raise exception '거절 권한이 없습니다.';
  end if;

  update ip.access_requests
     set state = 'rejected', decided_at = now(), decided_by = auth.uid()
   where user_id = target;

  delete from ip.members where user_id = target;
end;
$$;
