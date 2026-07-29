-- 개인 설정 — 사람마다 다른 화면 취향을 담는다
--
-- 처음 담는 것은 「단계 정렬 순서」다. 다른 열은 오름차순·내림차순이면 뜻이
-- 분명하지만, 단계는 글자순으로 세워 봐야 쓸모가 없다(검토의견 → 등록 → 출원…).
-- 파이프라인 순서가 기본이되, 사람마다 먼저 보고 싶은 단계가 달라 각자 바꾸게 한다.
--
-- 기기가 아니라 계정에 붙인다. 회사 PC 와 노트북에서 같은 순서로 보여야 한다
-- (localStorage 로 두면 기기마다 따로 논다).

create table ip.member_prefs (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- { "trademark": ["등록", "출원", …], "patent": [ … ] }
  -- 여기 없는 단계는 status_options.sort_order 를 따라 뒤에 붙는다.
  stage_order jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table ip.member_prefs enable row level security;

-- 남의 취향을 볼 이유가 없다. 본인 것만 읽고 쓴다.
create policy member_prefs_self on ip.member_prefs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on ip.member_prefs to authenticated;
