-- 멤버 식별자로 업무 이메일을 우선한다.
--
-- 카카오 동의항목의 「동의 목적」에 "업무 이메일을 입력한 경우 저장하지 않는다"고
-- 고지했으므로, 실제 동작도 그렇게 맞춘다.
-- 소셜 계정 이메일은 업무 이메일이 없을 때의 대체 수단으로만 쓴다.

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
    -- 업무 이메일 우선. 없을 때만 소셜 계정 이메일을 쓴다.
    coalesce(nullif(req.work_email, ''), nullif(req.provider_email, ''), req.user_id::text),
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
