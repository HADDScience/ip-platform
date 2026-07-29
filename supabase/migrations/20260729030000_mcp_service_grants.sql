-- MCP 서버(Edge Function)가 ip 스키마를 읽고 쓸 수 있게 한다.
--
-- 왜 필요했나
--  ip 스키마는 만들 때 authenticated 에게만 열어 뒀다. 브라우저에서만 붙었기
--  때문이다. Edge Function 은 service_role 로 붙는데 그 역할에는 스키마 USAGE
--  조차 없어서 `permission denied for schema ip` 로 막혔다.
--
-- 얼마나 여는가
--  service_role 은 RLS 를 지나간다. 그래서 "전부 열고 코드에서 조심한다" 대신
--  **MCP 서버가 실제로 쓰는 것만** 연다. 대장(trademarks·patents)은 읽기만
--  준다 — 값 갱신은 진행 기록을 넣을 때 트리거(ip.apply_progress_entry,
--  security definer)가 대신 하므로 쓰기 권한이 필요 없다.

grant usage on schema ip to service_role;

-- 읽기 — 대상 찾기, 단계 확인, 밀린 업무 집계
grant select on ip.trademarks      to service_role;
grant select on ip.patents         to service_role;
grant select on ip.status_options  to service_role;
grant select on ip.members         to service_role;
grant select on ip.progress_entries to service_role;

-- 쓰기 — 진행 기록 추가. 대장 갱신은 트리거가 한다.
grant insert on ip.progress_entries to service_role;

-- 토큰 표는 열지 않는다. 조회는 security definer 함수(ip.resolve_mcp_token)로만
-- 하게 해서, 서버 코드가 해시 목록을 훑을 수 없게 둔다.
