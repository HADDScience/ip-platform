-- 조직/대리인 정보.
--
-- 변리사 개인 연락처가 포함되므로 공개 저장소의 코드가 아니라 DB 에 둔다.
-- 한 행만 쓰는 설정 테이블이라 id 를 고정한다.

create table ip.org_meta (
  id         int primary key default 1 check (id = 1),
  org        text not null,
  owner_name text not null,
  firm       jsonb not null default '{}'::jsonb,
  note       text not null default '',
  updated_at timestamptz not null default now()
);

alter table ip.org_meta enable row level security;

create policy org_meta_read on ip.org_meta
  for select using (ip.is_member());

create policy org_meta_write on ip.org_meta
  for update using (ip.can_write()) with check (ip.can_write());

grant select on ip.org_meta to authenticated;
grant update on ip.org_meta to authenticated;
