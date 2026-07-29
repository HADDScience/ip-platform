-- MCP 개인 토큰 — AI 도구가 우리 서버를 부를 때 쓰는 열쇠
--
-- 배경
--  진행 기록을 AI 도구(Claude Code·ChatGPT 등)에서 바로 넣게 하려고 원격 MCP
--  서버를 둔다. 그 서버는 "누가 부르는가"를 알아야 하는데, Supabase 세션 토큰은
--  한 시간이면 만료돼 커넥터 설정에 박아둘 수 없다. 그래서 사람이 직접 발급하고
--  직접 폐기하는 장기 토큰을 따로 둔다.
--
-- 설계 메모
--  * 원문은 저장하지 않는다. sha256 해시만 남기고, 원문은 발급 순간 딱 한 번
--    보여준다. DB 가 새더라도 토큰 자체는 새지 않아야 한다.
--  * 토큰은 사람이 아니라 "도구 한 대"에 대응한다. 노트북과 회사 PC 에 각각
--    발급해 두고, 한 대를 잃어버리면 그것만 폐기하면 된다.
--  * 권한은 토큰에 붙이지 않는다. 토큰은 신원만 알려주고, 무엇을 할 수 있는지는
--    ip.members 의 역할이 정한다. 역할을 내리면 토큰도 같이 힘을 잃는다.
--  * 삭제하지 않고 revoked_at 을 찍는다. 언제 발급했고 언제 껐는지가 남아야 한다.

create extension if not exists pgcrypto with schema extensions;

create table ip.mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- 어느 도구에 붙였는지 본인이 적는 메모. 폐기할 때 이것만 보고 고른다.
  name         text not null default '',
  -- 원문의 sha256(hex). 원문은 어디에도 두지 않는다.
  token_hash   text not null unique,
  -- 목록에서 서로 구분할 앞자리. 원문의 일부지만 이것만으로는 쓸 수 없다.
  prefix       text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index mcp_tokens_user_idx on ip.mcp_tokens (user_id);

alter table ip.mcp_tokens enable row level security;

-- 본인 토큰만 본다. 해시가 들어 있으므로 남의 행은 보여줄 이유가 없다.
create policy mcp_tokens_read_self on ip.mcp_tokens
  for select using (user_id = auth.uid());

grant select on ip.mcp_tokens to authenticated;

-- ---------------------------------------------------------------------------
-- 발급 — 원문은 이 함수의 반환값으로만 존재한다
-- ---------------------------------------------------------------------------

create or replace function ip.issue_mcp_token(p_name text)
returns text
language plpgsql
security definer
set search_path = ip, extensions, pg_catalog
as $$
declare
  v_raw text;
begin
  -- 멤버가 아니면 발급하지 않는다. 승인 대기 중인 사람도 여기서 막힌다.
  if not exists (select 1 from ip.members where user_id = auth.uid()) then
    raise exception '멤버가 아닙니다.';
  end if;

  -- 한 사람이 무한정 만들지 못하게 막는다. 도구 몇 대면 충분하다.
  if (select count(*) from ip.mcp_tokens
       where user_id = auth.uid() and revoked_at is null) >= 10 then
    raise exception '살아 있는 토큰이 너무 많습니다. 쓰지 않는 것을 먼저 폐기하세요.';
  end if;

  -- `hadd_` 접두사는 어디서 발급된 값인지 눈으로 알아보게 한다.
  v_raw := 'hadd_' || encode(gen_random_bytes(24), 'hex');

  insert into ip.mcp_tokens (user_id, name, token_hash, prefix)
  values (
    auth.uid(),
    coalesce(nullif(btrim(p_name), ''), '이름 없음'),
    encode(digest(v_raw, 'sha256'), 'hex'),
    left(v_raw, 13)
  );

  return v_raw;
end;
$$;

revoke all on function ip.issue_mcp_token(text) from public;
grant execute on function ip.issue_mcp_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 폐기 — 지우지 않고 끈다
-- ---------------------------------------------------------------------------

create or replace function ip.revoke_mcp_token(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
begin
  update ip.mcp_tokens
     set revoked_at = now()
   where id = p_id
     and user_id = auth.uid()
     and revoked_at is null;

  if not found then
    raise exception '토큰을 찾을 수 없습니다.';
  end if;
end;
$$;

revoke all on function ip.revoke_mcp_token(uuid) from public;
grant execute on function ip.revoke_mcp_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 조회 — MCP 서버(Edge Function)가 service_role 로만 부른다
-- ---------------------------------------------------------------------------

-- 토큰 원문의 해시로 사람과 역할을 찾고, 마지막 사용 시각을 찍는다.
-- authenticated 에게는 주지 않는다. 남의 토큰을 대입해 볼 수 있게 되기 때문이다.
create or replace function ip.resolve_mcp_token(p_hash text)
returns table (user_id uuid, email text, display_name text, role text)
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
begin
  update ip.mcp_tokens t
     set last_used_at = now()
   where t.token_hash = p_hash
     and t.revoked_at is null;

  return query
    select m.user_id, m.email, m.display_name, m.role
      from ip.mcp_tokens t
      join ip.members m on m.user_id = t.user_id
     where t.token_hash = p_hash
       and t.revoked_at is null;
end;
$$;

revoke all on function ip.resolve_mcp_token(text) from public;
revoke all on function ip.resolve_mcp_token(text) from authenticated;
grant execute on function ip.resolve_mcp_token(text) to service_role;
