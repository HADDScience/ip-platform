-- 값 정정은 「진행」이 아니다
--
-- 앞 마이그레이션으로 정정도 진행 기록 한 줄로 남게 했더니, 오타를 고쳤을 뿐인데
-- ref_date(마지막 진행일)가 오늘로 밀렸다. 그러면 정체 일수가 초기화돼
-- 「199일째 진행 없음」이 그날로 0일이 된다. 일이 진행된 것이 아니므로 시계를
-- 건드리면 안 된다.
--
-- source = 'edit' 인 기록은 값만 반영하고 단계·마지막 진행일은 두고 간다.

create or replace function ip.apply_progress_entry()
returns trigger
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  newer boolean;
  -- 값 정정은 시계를 움직이지 않는다.
  moves boolean := new.source <> 'edit';
begin
  if new.entity_kind = 'trademark' then
    select coalesce(t.ref_date, '1900-01-01'::date) <= new.occurred_on
      into newer from ip.trademarks t where t.id = new.entity_id;
    if not found then return new; end if;

    update ip.trademarks set
      status        = case when newer and moves then new.stage else status end,
      ref_date      = case when newer and moves then new.occurred_on else ref_date end,
      name          = case when newer then coalesce(new.name, name) else name end,
      holder        = case when newer then coalesce(new.holder, holder) else coalesce(holder, new.holder) end,
      app_no        = case when newer then coalesce(new.app_no, app_no) else coalesce(app_no, new.app_no) end,
      reg_no        = case when newer then coalesce(new.reg_no, reg_no) else coalesce(reg_no, new.reg_no) end,
      probability   = coalesce(new.probability, probability),
      filed_on      = case when moves and new.stage = '출원' then coalesce(filed_on, new.occurred_on) else filed_on end,
      registered_on = case when moves and new.stage = '등록' then coalesce(registered_on, new.occurred_on) else registered_on end
    where id = new.entity_id;
  else
    select coalesce(p.ref_date, '1900-01-01'::date) <= new.occurred_on
      into newer from ip.patents p where p.id = new.entity_id;
    if not found then return new; end if;

    update ip.patents set
      status        = case when newer and moves then new.stage else status end,
      ref_date      = case when newer and moves then new.occurred_on else ref_date end,
      title         = case when newer then coalesce(new.name, title) else title end,
      applicant     = case when newer then coalesce(new.holder, applicant) else coalesce(applicant, new.holder) end,
      app_no        = case when newer then coalesce(new.app_no, app_no) else coalesce(app_no, new.app_no) end,
      reg_no        = case when newer then coalesce(new.reg_no, reg_no) else coalesce(reg_no, new.reg_no) end,
      filed_on      = case when moves and new.stage = '출원' then coalesce(filed_on, new.occurred_on) else filed_on end,
      registered_on = case when moves and new.stage = '등록' then coalesce(registered_on, new.occurred_on) else registered_on end
    where id = new.entity_id;
  end if;

  return new;
end;
$$;
