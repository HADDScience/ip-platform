-- 처음 온 사람에게 한 번만 안내를 띄우기 위한 표시
--
-- 왜 필요한가
--  화면이 셋이고 각각 하는 일이 다른데, 처음 들어오면 무엇부터 눌러야 할지
--  알 수 없다. 특히 AI 도구 연결(MCP)은 이 도구의 핵심인데 버튼 하나 뒤에
--  숨어 있어, 모르면 끝까지 모른 채로 쓴다.
--
-- 왜 계정에 붙이나
--  localStorage 로 두면 회사 PC 에서 본 안내가 노트북에서 또 뜬다. 기기가
--  아니라 사람이 본 것이므로 계정에 적는다 — 단계 정렬 순서와 같은 이유다.
--
-- 왜 boolean 이 아니라 시각인가
--  나중에 안내를 크게 고쳤을 때 "그 전에 본 사람"과 "고친 뒤에 본 사람"을
--  가를 수 있다. 참·거짓만 남기면 그 판단을 영영 못 한다.

alter table ip.member_prefs
  add column if not exists tutorial_seen_at timestamptz;

comment on column ip.member_prefs.tutorial_seen_at is
  '첫 안내를 닫은 시각. 비어 있으면 아직 보지 않은 사람이다.';
