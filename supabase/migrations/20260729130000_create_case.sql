-- 새 건 만들기를 한 곳으로
--
-- 왜 필요한가
--  지금까지 새 건은 웹 양식에서만 만들 수 있었고, 그 코드는 대장에 한 줄
--  넣는 것이 전부였다. 두 가지가 빠져 있다.
--
--  1) 출발선(ip.opening_state)이 없다. rebuild_ledger() 는 출발선을 돌며
--     기록을 얹는 방식이라, 출발선 없는 건은 아예 지나친다. 즉 새로 만든
--     건은 대장을 다시 세울 수 없다 — 「기록에서 대장이 나온다」는 약속이
--     그 건에서만 깨진다.
--  2) 만든 사실 자체가 이력에 없다. 언제 왜 생겼는지 남지 않는다.
--
--  MCP 에도 같은 기능을 열어야 하는데, 그러면 같은 구멍이 하나 더 생긴다.
--  그래서 로직을 DB 함수 한 곳에 두고 웹·MCP 가 함께 부르게 한다.
--
-- 출발선을 어떻게 적나
--  인수분의 출발선은 "엑셀에서 넘겨받은 상태"였다. 새로 만드는 건의 출발선은
--  **빈 상태**다 — 아직 아무 일도 없었으므로 단계는 주어진 시작 단계,
--  ref_date 는 비운다. 이러면 뒤따르는 첫 기록이 그대로 첫 사건이 된다.

create or replace function ip.create_case(
  p_kind  text,
  p_name  text,
  p_stage text,
  p_note  text default ''
)
returns text
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  v_prefix text;
  v_id     text;
  v_next   int;
begin
  if p_kind not in ('trademark', 'patent') then
    raise exception '알 수 없는 부류입니다: %', p_kind;
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception '이름이 비어 있습니다.';
  end if;

  -- 단계는 반드시 정의된 것이어야 한다. 대장이 임의의 문자열을 갖게 두면
  -- 배지 색도 정렬 순서도 없는 유령 단계가 생긴다.
  if not exists (
    select 1 from ip.status_options
     where kind = p_kind and value = p_stage
  ) then
    raise exception '% 에 없는 단계입니다: %', p_kind, p_stage;
  end if;

  v_prefix := case when p_kind = 'trademark' then 'TM' else 'PT' end;

  -- 번호는 대장과 출발선 양쪽에서 가장 큰 것 다음. 지운 건이 있어도 번호를
  -- 되쓰지 않는다 — 옛 기록이 가리키던 번호가 다른 건이 되면 안 된다.
  select coalesce(max(n), 0) + 1 into v_next
    from (
      select (regexp_replace(id, '^[A-Z]+-', ''))::int as n
        from ip.trademarks where p_kind = 'trademark'
      union all
      select (regexp_replace(id, '^[A-Z]+-', ''))::int
        from ip.patents where p_kind = 'patent'
      union all
      select (regexp_replace(entity_id, '^[A-Z]+-', ''))::int
        from ip.opening_state where entity_kind = p_kind
    ) s;

  v_id := v_prefix || '-' || lpad(v_next::text, 2, '0');

  if p_kind = 'trademark' then
    insert into ip.trademarks (id, name, status, note)
    values (v_id, btrim(p_name), p_stage, coalesce(p_note, ''));
  else
    insert into ip.patents (id, title, status, note)
    values (v_id, btrim(p_name), p_stage, coalesce(p_note, ''));
  end if;

  insert into ip.opening_state (
    entity_kind, entity_id, stage, ref_date, name, taken_over_on, source_note
  ) values (
    p_kind, v_id, p_stage, null, btrim(p_name), current_date,
    '이 자리에서 새로 만든 건입니다. 넘겨받은 것이 아니라 여기서 시작했습니다'
  );

  return v_id;
end;
$$;

revoke all on function ip.create_case(text, text, text, text) from public;
grant execute on function ip.create_case(text, text, text, text) to authenticated;
grant execute on function ip.create_case(text, text, text, text) to service_role;
