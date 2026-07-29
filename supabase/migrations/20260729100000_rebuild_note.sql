-- 재계산이 대장의 비고도 개시 스냅샷에서 가져오게 한다
--
-- 왜
--  ip.rebuild_ledger() 가 note 를 건드리지 않아, 대장의 비고만 파생 모델 밖에
--  홀로 남아 있었다. 엑셀에서 들어온 값이 그대로 굳어 스냅샷을 고쳐도 반영되지
--  않았고, PT-03 을 PT-07 로 합친 뒤에도 「※ 순번 3과 동일 건」이 남았다.
--
-- 어디서 오는가
--  비고는 진행 기록이 바꾸는 값이 아니다(기록의 메모는 그 기록의 것이지 대장의
--  것이 아니다). 그러니 개시 스냅샷이 유일한 출처다. 트리거는 그대로 두고
--  재계산만 스냅샷의 note 를 실어 나른다.

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
        registered_on = v_registered, probability = v_prob,
        note = o.note
      where ip.trademarks.id = o.entity_id;
    else
      update ip.patents set
        status = v_stage, ref_date = v_ref, title = v_name,
        applicant = coalesce(v_holder, ''),
        app_no = v_app, reg_no = v_reg, filed_on = v_filed,
        registered_on = v_registered,
        note = o.note
      where ip.patents.id = o.entity_id;
    end if;

    kind := o.entity_kind;
    id := o.entity_id;
    return next;
  end loop;
end;
$$;
