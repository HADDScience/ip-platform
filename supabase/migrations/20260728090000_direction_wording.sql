-- 진행 기록의 방향 표기를 「송신 / 수신」으로 맞춘다.
--
-- 「발신」은 기존 커뮤니케이션 로그에서 온 말인데, 화면에서 쓰는 말과 어긋나면
-- 엑셀로 내보냈을 때 두 표기가 섞인다. 새 입력 경로인 progress_entries 만 바꾸고
-- 레거시인 ip.communications 는 건드리지 않는다.

alter table ip.progress_entries
  drop constraint if exists progress_entries_direction_check;

update ip.progress_entries set direction = '송신' where direction = '발신';

alter table ip.progress_entries
  add constraint progress_entries_direction_check
  check (direction in ('송신', '수신'));
