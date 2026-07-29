-- 대장을 고치는 길을 기록 안으로 들인다
--
-- 배경
--  대장(IP)은 "기록이 쌓인 결과"라는 전제로 수정 UI 를 두지 않았다. 그런데 그
--  전제가 성립하지 않았다.
--   * 이름·보유자는 진행 기록에 칸이 없다. 기록으로 표현할 수 없으니 고칠 길도 없다.
--   * 번호는 coalesce 로 "비어 있을 때만" 채웠다. 한 번 잘못 들어간 값은 어떤
--     기록으로도 덮이지 않는다.
--  그래서 정합성 감지는 문제를 가리키는데 앱은 고칠 방법을 주지 않는 상태였다.
--
-- 이번 변경
--  값을 고치는 일도 **기록 한 줄로** 남게 한다. 화면에서 고치면 진행 기록이
--  생기고, 대장은 여전히 그 기록의 결과로만 바뀐다. 손으로 대장을 찌르는 경로는
--  만들지 않는다 — 그러면 "무엇이 언제 왜 바뀌었나"가 사라진다.

-- ---------------------------------------------------------------------------
-- 1. 기록에 이름·보유자 칸을 연다
-- ---------------------------------------------------------------------------

alter table ip.progress_entries
  add column if not exists name   text,   -- 상표 이름 / 특허 명칭
  add column if not exists holder text;   -- 보유자 / 출원인

-- 값 정정으로 생긴 기록임을 구분한다. 사람이 화면에서 고쳤다는 뜻이다.
alter table ip.progress_entries
  drop constraint if exists progress_entries_source_check;

alter table ip.progress_entries
  add constraint progress_entries_source_check
  check (source in ('manual', 'mail', 'excel', 'edit'));

-- ---------------------------------------------------------------------------
-- 2. 최신 기록이 이긴다
-- ---------------------------------------------------------------------------

/*
 * 바뀐 규칙
 *  * 대장보다 **새 기록**이면 그 기록이 적어 온 값이 기존 값을 덮는다.
 *    (적지 않은 칸은 그대로 둔다 — 기록마다 모든 칸을 채우지는 않기 때문이다.)
 *  * 대장보다 **옛 기록**이면 빈 칸만 채운다. 뒤늦게 넣은 과거 기록이 현재를
 *    되돌리면 안 된다.
 *
 * 이 규칙이라야 "기록이 곧 진실"이 성립한다. 예전 coalesce 는 첫 기록이 영원히
 * 이겨서, 같은 기록을 다시 재생해도 결과가 달라졌다.
 */
create or replace function ip.apply_progress_entry()
returns trigger
language plpgsql
security definer
set search_path = ip, pg_catalog
as $$
declare
  newer boolean;
begin
  if new.entity_kind = 'trademark' then
    select coalesce(t.ref_date, '1900-01-01'::date) <= new.occurred_on
      into newer from ip.trademarks t where t.id = new.entity_id;
    if not found then return new; end if;

    update ip.trademarks set
      status        = case when newer then new.stage else status end,
      ref_date      = case when newer then new.occurred_on else ref_date end,
      name          = case when newer then coalesce(new.name, name) else name end,
      holder        = case when newer then coalesce(new.holder, holder) else coalesce(holder, new.holder) end,
      app_no        = case when newer then coalesce(new.app_no, app_no) else coalesce(app_no, new.app_no) end,
      reg_no        = case when newer then coalesce(new.reg_no, reg_no) else coalesce(reg_no, new.reg_no) end,
      probability   = coalesce(new.probability, probability),
      filed_on      = case when new.stage = '출원' then coalesce(filed_on, new.occurred_on) else filed_on end,
      registered_on = case when new.stage = '등록' then coalesce(registered_on, new.occurred_on) else registered_on end
    where id = new.entity_id;
  else
    select coalesce(p.ref_date, '1900-01-01'::date) <= new.occurred_on
      into newer from ip.patents p where p.id = new.entity_id;
    if not found then return new; end if;

    update ip.patents set
      status        = case when newer then new.stage else status end,
      ref_date      = case when newer then new.occurred_on else ref_date end,
      title         = case when newer then coalesce(new.name, title) else title end,
      applicant     = case when newer then coalesce(new.holder, applicant) else coalesce(applicant, new.holder) end,
      app_no        = case when newer then coalesce(new.app_no, app_no) else coalesce(app_no, new.app_no) end,
      reg_no        = case when newer then coalesce(new.reg_no, reg_no) else coalesce(reg_no, new.reg_no) end,
      filed_on      = case when new.stage = '출원' then coalesce(filed_on, new.occurred_on) else filed_on end,
      registered_on = case when new.stage = '등록' then coalesce(registered_on, new.occurred_on) else registered_on end
    where id = new.entity_id;
  end if;

  return new;
end;
$$;

-- MCP 서버도 이름·보유자를 정정할 수 있어야 한다(insert 권한은 이미 있다).
