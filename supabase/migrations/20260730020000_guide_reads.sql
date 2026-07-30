-- 지침을 보여준 적이 있는지 기억한다
--
-- 왜 필요한가
--  쓰기 도구에 `guide` 확인 코드를 요구하게 만들었더니, ChatGPT 가 이렇게 답했다.
--    「현재 도구 인터페이스에는 guide 인자를 전달할 수 있는 항목이 없어,
--      이 대화에서는 기록을 완료할 수 없는 상태입니다.」
--
--  커넥터가 들고 있는 도구 스키마는 처음 붙일 때 받아 둔 것이다. 서버를 새로
--  올려도 그 사본은 바뀌지 않고, 클라이언트는 사본에 없는 인자를 보내지 못한다.
--  즉 게이트에 걸린 뒤 빠져나올 길이 없었다 — 사람이 커넥터를 다시 붙이지 않는
--  한. 막는 장치가 일을 못 하게 만드는 장치가 되어 버렸다.
--
-- 그래서 새 인자에 기대지 않는다
--  「보여준 적 있는지」를 서버가 기억한다. 첫 쓰기 시도는 거절하면서 지침 전문을
--  돌려주고, 그 사실을 여기 적는다. 같은 호출을 다시 보내면 그때는 저장된다.
--  새 인자도, 새 도구도 필요 없으니 오래된 사본을 들고 있는 클라이언트도 빠져
--  나올 수 있다.
--
--  느슨해 보이지만 목적은 그대로 달성된다 — 지침은 반드시 모델의 눈을 한 번
--  지나간다. 두 번째 호출이 오는 시점에 지침은 이미 그 대화 안에 있다.
--
-- 왜 확인 코드를 함께 적나
--  지침의 규칙이 바뀌면(GUIDE_ACK 이 바뀌면) 옛 기록은 쓸모없다. 값이 다르면
--  다시 보여준다. 「한 번 읽었으니 영원히 통과」가 되지 않게 하는 장치다.

create table ip.mcp_guide_reads (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  -- 마지막으로 보여준 지침의 확인 코드
  ack      text not null,
  shown_at timestamptz not null default now()
);

-- Edge Function(service_role)만 만진다. 브라우저에 열 이유가 없다.
alter table ip.mcp_guide_reads enable row level security;
grant select, insert, update on ip.mcp_guide_reads to service_role;
