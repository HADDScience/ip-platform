-- 토큰은 하나면 된다 — 발급/폐기 대신 재발급 하나로
--
-- 왜 여러 개를 접는가
--  "도구 한 대에 하나씩 두면 한 대를 잃었을 때 그것만 끈다"는 생각이었는데,
--  지금 구조에서는 근거가 약하다.
--   * 토큰은 권한을 담지 않는다. 어느 토큰이든 그 사람의 역할 그대로다.
--     하나가 새면 전부 샌 것과 같다.
--   * 어디서 썼는지 안 남아서, 나눠 둬도 "어느 기기가 샜는지" 알 수 없다.
--   * 사내 규모에서는 기기를 잃는 일보다 토큰을 잊어 다시 받는 일이 훨씬 잦다.
--
--  그래서 "살아 있는 토큰은 최대 하나"로 두고, 새로 받으면 옛것이 즉시 죽는다.
--  이름을 붙일 이유도 함께 사라진다.

create or replace function ip.reissue_mcp_token()
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

  -- 쓰던 것은 즉시 죽인다. 지우지 않고 껐다는 기록을 남긴다.
  update ip.mcp_tokens
     set revoked_at = now()
   where user_id = auth.uid()
     and revoked_at is null;

  -- `hadd_` 접두사는 어디서 발급된 값인지 눈으로 알아보게 한다.
  v_raw := 'hadd_' || encode(gen_random_bytes(24), 'hex');

  insert into ip.mcp_tokens (user_id, name, token_hash, prefix)
  values (
    auth.uid(),
    '',
    encode(digest(v_raw, 'sha256'), 'hex'),
    left(v_raw, 13)
  );

  return v_raw;
end;
$$;

revoke all on function ip.reissue_mcp_token() from public;
grant execute on function ip.reissue_mcp_token() to authenticated;

-- 갈라져 있던 옛 경로는 걷어낸다. 남겨 두면 어느 쪽이 맞는지 헷갈린다.
drop function if exists ip.issue_mcp_token(text);
drop function if exists ip.revoke_mcp_token(uuid);
