-- 방향이 있으면 메일 기록이다 — 말과 사실이 어긋나면 사실을 따른다
--
-- 무엇이 잘못돼 있었나
--  진행 기록의 `direction`(수신·송신)은 정의상 메일에만 있는 칸이다. 그런데
--  `source` 는 부르는 쪽이 따로 채우게 두어, 방향은 '송신'인데 출처는 'manual'
--  인 기록이 생겼다. 화면에는 「직접 입력」으로 뜨는데 실제로는 메일이 근거인
--  기록이다. 나중에 되짚을 때 근거의 무게를 잘못 읽게 된다.
--
--  MCP 도구 설명이 "메일을 **받았다면** source 를 mail 로" 라고만 적혀 있어
--  보낸 메일을 옮길 때 LLM 이 'manual' 을 골랐다. 설명은 고쳤지만, 말로 시키는
--  규칙은 또 어긋날 수 있고 웹 양식에도 같은 구멍이 있다.
--
-- 그래서 한 곳에서 바로잡는다
--  입력 경로(MCP·웹 양식·스크립트)마다 같은 판단을 되풀이하지 않는다. 방향이
--  채워져 있는데 출처가 'manual' 이면 'mail' 로 고쳐 넣는다. 'excel'·'edit' 는
--  건드리지 않는다 — 그쪽은 방향을 쓰지 않는다.
--
--  CHECK 로 막지 않고 고쳐 넣는 이유는, 막으면 부르는 쪽이 기록을 통째로 잃기
--  때문이다. 기록은 남기고 이름만 바로잡는 편이 낫다.

create or replace function ip.normalize_progress_source()
returns trigger
language plpgsql
as $$
begin
  if new.direction is not null and new.source = 'manual' then
    new.source := 'mail';
  end if;
  return new;
end;
$$;

create trigger progress_entries_normalize_source
  before insert or update on ip.progress_entries
  for each row execute function ip.normalize_progress_source();

-- 이미 들어간 기록도 같은 잣대로 맞춘다. 지어내는 것이 아니라, 방향이 적혀
-- 있다는 사실 자체가 메일 기록이라는 증거다.
update ip.progress_entries
   set source = 'mail'
 where direction is not null
   and source = 'manual';
