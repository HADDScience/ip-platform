-- 값 정정으로 단계도 고치고, 값을 비울 수도 있게 한다
--
-- 왜 필요했나
--  「등록번호가 있는데 단계가 등록이 아닙니다」 경고를 만나면 고칠 길이 둘이다.
--    * 단계가 틀렸다 → 단계를 등록으로
--    * 번호가 틀렸다 → 번호를 비우거나 고치기
--  그런데 값 정정 폼에는 단계가 없었고, 빈칸은 「안 바꿈」이라 비울 수도 없었다.
--  경고는 무엇을 고치라고 가리키는데 앱은 그 둘 다 막고 있었다.
--
-- 단계는 왜 정정 대상인가
--  "지금 등록됐다"는 진행이지만, "원래부터 등록이었는데 잘못 적혀 있었다"는
--  정정이다. 후자는 시계를 움직이면 안 된다 — 오늘 등록된 것이 아니기 때문이다.
--  그래서 source='edit' 은 단계를 반영하되 ref_date 는 그대로 둔다.
--  (정정 폼은 안 바꿀 때 현재 단계를 그대로 실어 보내므로 그때는 무해하다.)
--
-- 비우기는 어떻게 표현하나
--  기록의 칸이 null 이면 「안 바꿈」이라는 뜻이라 비우기를 표현할 수 없다.
--  빈 문자열('')을 「비움」으로 약속한다. null=안 바꿈 / ''=비움 / 값=그 값.

create or replace function ip.apply_progress_entry()
returns trigger
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  newer boolean;
  -- 값 정정은 시계를 움직이지 않는다. 단계는 반영하되 날짜는 그대로 둔다.
  moves boolean := new.source <> 'edit';
begin
  if new.entity_kind = 'trademark' then
    select coalesce(t.ref_date, '1900-01-01'::date) <= new.occurred_on
      into newer from ip.trademarks t where t.id = new.entity_id;
    if not found then return new; end if;

    update ip.trademarks set
      status        = case when newer then new.stage else status end,
      ref_date      = case when newer and moves then new.occurred_on else ref_date end,
      name          = case when newer then coalesce(nullif(new.name, ''), name) else name end,
      holder        = case
                        when not newer then coalesce(holder, nullif(new.holder, ''))
                        when new.holder is null then holder
                        when new.holder = '' then null
                        else new.holder
                      end,
      app_no        = case
                        when not newer then coalesce(app_no, nullif(new.app_no, ''))
                        when new.app_no is null then app_no
                        when new.app_no = '' then null
                        else new.app_no
                      end,
      reg_no        = case
                        when not newer then coalesce(reg_no, nullif(new.reg_no, ''))
                        when new.reg_no is null then reg_no
                        when new.reg_no = '' then null
                        else new.reg_no
                      end,
      probability   = coalesce(new.probability, probability),
      filed_on      = case when moves and new.stage = '출원' then coalesce(filed_on, new.occurred_on) else filed_on end,
      registered_on = case when moves and new.stage = '등록' then coalesce(registered_on, new.occurred_on) else registered_on end
    where id = new.entity_id;
  else
    select coalesce(p.ref_date, '1900-01-01'::date) <= new.occurred_on
      into newer from ip.patents p where p.id = new.entity_id;
    if not found then return new; end if;

    update ip.patents set
      status        = case when newer then new.stage else status end,
      ref_date      = case when newer and moves then new.occurred_on else ref_date end,
      title         = case when newer then coalesce(nullif(new.name, ''), title) else title end,
      -- applicant 는 not null 이라 비우면 빈 문자열이 된다.
      applicant     = case
                        when not newer then coalesce(nullif(applicant, ''), new.holder, applicant)
                        when new.holder is null then applicant
                        else new.holder
                      end,
      app_no        = case
                        when not newer then coalesce(app_no, nullif(new.app_no, ''))
                        when new.app_no is null then app_no
                        when new.app_no = '' then null
                        else new.app_no
                      end,
      reg_no        = case
                        when not newer then coalesce(reg_no, nullif(new.reg_no, ''))
                        when new.reg_no is null then reg_no
                        when new.reg_no = '' then null
                        else new.reg_no
                      end,
      filed_on      = case when moves and new.stage = '출원' then coalesce(filed_on, new.occurred_on) else filed_on end,
      registered_on = case when moves and new.stage = '등록' then coalesce(registered_on, new.occurred_on) else registered_on end
    where id = new.entity_id;
  end if;

  return new;
end;
$$;

-- 전량 재계산도 같은 규칙을 따라야 한다. 둘이 어긋나면 재계산이 대장을 바꿔버린다.
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
      v_moves := e.source <> 'edit';
      v_newer := coalesce(v_ref, date '1900-01-01') <= e.occurred_on;

      if v_newer then
        v_stage := e.stage;
        if v_moves then
          v_ref := e.occurred_on;
        end if;
        v_name := coalesce(nullif(e.name, ''), v_name);
        v_holder := case when e.holder is null then v_holder
                         when e.holder = '' then null
                         else e.holder end;
        v_app := case when e.app_no is null then v_app
                      when e.app_no = '' then null
                      else e.app_no end;
        v_reg := case when e.reg_no is null then v_reg
                      when e.reg_no = '' then null
                      else e.reg_no end;
      else
        -- 뒤늦게 넣은 과거 기록은 빈 칸만 채운다. 현재를 되돌리면 안 된다.
        v_holder := coalesce(v_holder, nullif(e.holder, ''));
        v_app := coalesce(v_app, nullif(e.app_no, ''));
        v_reg := coalesce(v_reg, nullif(e.reg_no, ''));
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
