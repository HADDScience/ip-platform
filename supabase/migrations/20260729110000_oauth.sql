-- MCP OAuth — ChatGPT 처럼 정적 토큰을 못 보내는 클라이언트를 위해
--
-- 왜 필요한가
--  ChatGPT 의 커스텀 플러그인은 인증을 OAuth / 인증 없음 / 혼합 셋 중에서만
--  고를 수 있고, **정적 API 키나 커스텀 헤더를 보낼 수 없다.** 그래서 개인
--  토큰(ip.mcp_tokens)만으로는 ChatGPT 에 붙일 방법이 없다.
--
-- 무엇을 만드나
--  MCP 규격이 요구하는 최소한의 인가 서버다.
--    * 동적 클라이언트 등록(RFC 7591) — 클라이언트가 스스로 등록한다
--    * 인가 코드 + PKCE(S256)
--    * 만료되는 액세스 토큰 + 갱신 토큰
--  사용자 확인은 우리가 이미 가진 것을 쓴다 — 허브 로그인 세션. 인가 화면은
--  웹앱(/authorize)이 띄우고, 승인은 그 사람의 Supabase 세션으로 증명한다.
--
-- 개인 토큰은 남긴다
--  CLI 는 커맨드 한 줄이 훨씬 간단하다. 서버는 두 가지를 모두 받는다.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 클라이언트 — 스스로 등록한다(DCR)
-- ---------------------------------------------------------------------------

create table ip.oauth_clients (
  client_id     text primary key,
  client_name   text not null default '',
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 인가 요청 — 승인 화면이 뜨는 동안 잠깐 머무는 자리
-- ---------------------------------------------------------------------------

create table ip.oauth_requests (
  id             uuid primary key default gen_random_uuid(),
  client_id      text not null references ip.oauth_clients (client_id) on delete cascade,
  redirect_uri   text not null,
  state          text,
  -- PKCE. 평문 verifier 는 받지 않는다(S256 만 허용).
  code_challenge text not null,
  resource       text,
  scope          text not null default '',
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '10 minutes'
);

-- ---------------------------------------------------------------------------
-- 인가 코드 — 한 번만 쓰인다
-- ---------------------------------------------------------------------------

create table ip.oauth_codes (
  code_hash      text primary key,
  client_id      text not null references ip.oauth_clients (client_id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  resource       text,
  expires_at     timestamptz not null default now() + interval '5 minutes',
  used_at        timestamptz
);

-- ---------------------------------------------------------------------------
-- 발급된 토큰 — 원문은 저장하지 않는다
-- ---------------------------------------------------------------------------

create table ip.oauth_tokens (
  id            uuid primary key default gen_random_uuid(),
  access_hash   text not null unique,
  refresh_hash  text unique,
  client_id     text not null references ip.oauth_clients (client_id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index oauth_tokens_user_idx on ip.oauth_tokens (user_id);

-- 이 표들은 Edge Function(service_role)만 만진다. 브라우저에는 열지 않는다.
alter table ip.oauth_clients  enable row level security;
alter table ip.oauth_requests enable row level security;
alter table ip.oauth_codes    enable row level security;
alter table ip.oauth_tokens   enable row level security;

grant select, insert, update, delete on ip.oauth_clients  to service_role;
grant select, insert, update, delete on ip.oauth_requests to service_role;
grant select, insert, update, delete on ip.oauth_codes    to service_role;
grant select, insert, update, delete on ip.oauth_tokens   to service_role;

-- 본인이 어떤 도구에 권한을 줬는지는 볼 수 있어야 끊을 수도 있다.
create policy oauth_tokens_read_self on ip.oauth_tokens
  for select using (user_id = auth.uid());
grant select on ip.oauth_tokens to authenticated;

-- ---------------------------------------------------------------------------
-- 조회 — 액세스 토큰 해시로 사람과 역할을 찾는다
-- ---------------------------------------------------------------------------

create or replace function ip.resolve_oauth_token(p_hash text)
returns table (user_id uuid, email text, display_name text, role text)
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
begin
  update ip.oauth_tokens t
     set last_used_at = now()
   where t.access_hash = p_hash
     and t.revoked_at is null
     and t.expires_at > now();

  return query
    select m.user_id, m.email, m.display_name, m.role
      from ip.oauth_tokens t
      join ip.members m on m.user_id = t.user_id
     where t.access_hash = p_hash
       and t.revoked_at is null
       and t.expires_at > now();
end;
$$;

revoke all on function ip.resolve_oauth_token(text) from public;
revoke all on function ip.resolve_oauth_token(text) from authenticated;
grant execute on function ip.resolve_oauth_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- 청소 — 만료된 부스러기를 남겨 둘 이유가 없다
-- ---------------------------------------------------------------------------

create or replace function ip.sweep_oauth()
returns void
language sql
security definer
set search_path = ip, pg_catalog
as $$
  delete from ip.oauth_requests where expires_at < now();
  delete from ip.oauth_codes where expires_at < now() - interval '1 day';
$$;

revoke all on function ip.sweep_oauth() from public;
grant execute on function ip.sweep_oauth() to service_role;
