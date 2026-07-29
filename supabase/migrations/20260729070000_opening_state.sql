-- 개시 스냅샷 — 우리가 이어받은 상태를 못 박는다
--
-- 왜 필요한가
--  대장은 "기록이 쌓인 결과"인데, 지금 24건은 전부 엑셀에서 직접 들어왔고 그것을
--  낳은 기록이 없다. 그래서 대장을 처음부터 다시 계산할 수 없었다.
--
-- 왜 합성 기록이 아니라 스냅샷인가
--  없는 기록을 지어내면 "그날 이런 일이 있었다"는 **세상에 대한 주장**이 된다.
--  구분 라벨은 시간이 지나면 흐려지고, 나중에 이력을 읽는 사람은 그것을 사건으로
--  믿는다. 게다가 상표 한 건은 날짜가 아예 없어 날짜를 지어내야 한다.
--
--  스냅샷은 다르다. "우리가 이 날 이 상태를 이어받았다"는 **우리 기록에 대한
--  사실**이라 구성상 참이다. 날짜를 지어낼 일도 없다 — 이어받은 날 하나면 된다.
--
-- 무엇이 달라지는가
--    대장 = 개시 스냅샷(불변) + 진행 기록을 순서대로 적용
--  스냅샷을 얼려 두므로 순환이 끊긴다. 나중 기록이 값을 덮어써도 인수 원본은
--  남아 있어, ip.rebuild_ledger() 로 언제든 처음부터 다시 계산할 수 있다.
--
-- 지금이 적기다
--  진행 기록이 아직 0건이라 대장이 순수한 인수 상태다. 기록이 쌓인 뒤에는
--  무엇이 원본이었는지 되짚을 수 없다.

create table ip.opening_state (
  entity_kind   text not null check (entity_kind in ('trademark', 'patent')),
  entity_id     text not null,

  -- 이어받은 시점의 값. 대장과 같은 모양이되 여기서는 절대 바뀌지 않는다.
  stage         text not null,
  ref_date      date,
  name          text not null,          -- 상표 이름 / 특허 명칭
  holder        text,                   -- 보유자 / 출원인
  app_no        text,
  reg_no        text,
  filed_on      date,
  registered_on date,
  probability   int,
  name_ko       text not null default '',
  classes       text[] not null default '{}',
  goods         text,
  note          text not null default '',

  -- 우리가 이어받은 날. **사건이 일어난 날이 아니다.**
  taken_over_on date not null default current_date,
  -- 어디서 이어받았는지. 되짚을 수 있어야 추적이 완결된다.
  source_note   text not null default '',

  primary key (entity_kind, entity_id)
);

alter table ip.opening_state enable row level security;

-- 읽기만 연다. 고치는 경로를 주지 않는 것이 곧 「불변」이다.
create policy opening_state_read on ip.opening_state
  for select using (
    exists (select 1 from ip.members m where m.user_id = auth.uid())
  );

grant select on ip.opening_state to authenticated;
grant select on ip.opening_state to service_role;

-- ---------------------------------------------------------------------------
-- 지금 대장을 그대로 얼린다
-- ---------------------------------------------------------------------------

insert into ip.opening_state (
  entity_kind, entity_id, stage, ref_date, name, holder, app_no, reg_no,
  filed_on, registered_on, probability, name_ko, classes, goods, note,
  taken_over_on, source_note
)
select
  'trademark', t.id, t.status, t.ref_date, t.name, t.holder, t.app_no, t.reg_no,
  t.filed_on, t.registered_on, t.probability, t.name_ko, t.classes, t.goods, t.note,
  date '2026-07-29',
  'NAS 「특허 및 상표권_260728_정우창.xlsx」 인수분'
from ip.trademarks t
on conflict (entity_kind, entity_id) do nothing;

insert into ip.opening_state (
  entity_kind, entity_id, stage, ref_date, name, holder, app_no, reg_no,
  filed_on, registered_on, note, taken_over_on, source_note
)
select
  'patent', p.id, p.status, p.ref_date, p.title, p.applicant, p.app_no, p.reg_no,
  p.filed_on, p.registered_on, p.note,
  date '2026-07-29',
  'NAS 「특허 및 상표권_260728_정우창.xlsx」 인수분'
from ip.patents p
on conflict (entity_kind, entity_id) do nothing;

-- ---------------------------------------------------------------------------
-- 다시 계산하기
-- ---------------------------------------------------------------------------

/*
 * 스냅샷에서 출발해 기록을 날짜순으로 얹어 대장을 다시 만든다.
 * 트리거(ip.apply_progress_entry)와 같은 규칙을 쓰되, 이쪽은 전량 재계산이다.
 *
 * 쓰임새
 *   * 트리거가 잘못 반영한 것을 바로잡을 때
 *   * 규칙을 바꾼 뒤 과거분에 소급할 때
 *   * "지금 대장이 기록과 맞나"를 확인할 때
 */
create or replace function ip.rebuild_ledger()
returns table (kind text, id text)
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  o record;
  e record;
  v_stage text;
  v_ref date;
  v_name text;
  v_holder text;
  v_app text;
  v_reg text;
  v_filed date;
  v_registered date;
  v_prob int;
  v_moves boolean;
  v_newer boolean;
begin
  for o in select * from ip.opening_state loop
    v_stage := o.stage;
    v_ref := o.ref_date;
    v_name := o.name;
    v_holder := o.holder;
    v_app := o.app_no;
    v_reg := o.reg_no;
    v_filed := o.filed_on;
    v_registered := o.registered_on;
    v_prob := o.probability;

    for e in
      select * from ip.progress_entries pe
       where pe.entity_kind = o.entity_kind
         and pe.entity_id = o.entity_id
       order by pe.occurred_on, pe.created_at
    loop
      -- 값 정정은 시계를 움직이지 않는다.
      v_moves := e.source <> 'edit';
      v_newer := coalesce(v_ref, date '1900-01-01') <= e.occurred_on;

      if v_newer then
        if v_moves then
          v_stage := e.stage;
          v_ref := e.occurred_on;
        end if;
        v_name := coalesce(e.name, v_name);
        v_holder := coalesce(e.holder, v_holder);
        v_app := coalesce(e.app_no, v_app);
        v_reg := coalesce(e.reg_no, v_reg);
      else
        -- 뒤늦게 넣은 과거 기록은 빈 칸만 채운다. 현재를 되돌리면 안 된다.
        v_holder := coalesce(v_holder, e.holder);
        v_app := coalesce(v_app, e.app_no);
        v_reg := coalesce(v_reg, e.reg_no);
      end if;

      v_prob := coalesce(e.probability, v_prob);

      if v_moves and e.stage = '출원' then
        v_filed := coalesce(v_filed, e.occurred_on);
      end if;
      if v_moves and e.stage = '등록' then
        v_registered := coalesce(v_registered, e.occurred_on);
      end if;
    end loop;

    if o.entity_kind = 'trademark' then
      update ip.trademarks set
        status = v_stage, ref_date = v_ref, name = v_name, holder = v_holder,
        app_no = v_app, reg_no = v_reg, filed_on = v_filed,
        registered_on = v_registered, probability = v_prob
      where ip.trademarks.id = o.entity_id;
    else
      update ip.patents set
        status = v_stage, ref_date = v_ref, title = v_name,
        -- applicant 는 not null 이다.
        applicant = coalesce(v_holder, ''),
        app_no = v_app, reg_no = v_reg, filed_on = v_filed,
        registered_on = v_registered
      where ip.patents.id = o.entity_id;
    end if;

    kind := o.entity_kind;
    id := o.entity_id;
    return next;
  end loop;
end;
$$;

revoke all on function ip.rebuild_ledger() from public;
revoke all on function ip.rebuild_ledger() from authenticated;
grant execute on function ip.rebuild_ledger() to service_role;
