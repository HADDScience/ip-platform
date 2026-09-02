<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# HADD IP 팔로우업 — 작업 규약

- **데이터는 Supabase(`ip` 스키마)에만 있다.** 저장소에 업무 데이터를 커밋하지 않는다.
  공개 저장소이므로 실제 상표명·검토의견 등이 파일로 들어가면 그대로 공개된다.
- GitHub Pages 정적 배포다. 서버 액션·동적 라우트 핸들러·ISR·`next/image` 최적화는 쓸 수 없다.
  데이터는 전부 브라우저에서 Supabase 로 조회한다.
- `useSearchParams` 를 쓰면 정적 프리렌더에서 트리가 빠진다. 쿼리 파라미터는
  `hooks/use-search-string.ts` 의 `useQueryParam` 을 쓴다.
- 오늘 날짜는 `hooks/use-today.ts` 의 `useToday()` 로만 얻는다(하이드레이션 불일치 방지).
- 로그인 화면은 허브에만 둔다. 여기서는 `lib/hub.ts` 로 `/hub/?next=` 에 보내기만 한다.
  `auth-gate.tsx` 의 소셜 버튼은 localhost 폴백이므로 배포 흐름의 기준으로 삼지 않는다.
- 상태값을 늘릴 때는 `ip.status_options` 에 행을 넣고 `status-badge.tsx` 에 톤을 추가한다.
  코드의 상수 배열을 고치는 것이 아니다.
- **지식재산권 목록 = 개시 스냅샷(`ip.opening_state`) + 진행 기록.** 지식재산권 목록(`trademarks`·`patents`)을
  직접 UPDATE 하지 않는다. 값을 바꾸려면 진행 기록을 넣고 트리거가 반영하게 한다
  (값 정정은 `source='edit'` — 값만 바꾸고 단계·마지막 진행일은 건드리지 않는다).
  `ip.opening_state` 는 인수 원본이라 절대 고치지 않는다. 규칙을 바꿨거나 목록이
  기록과 어긋났으면 `select ip.rebuild_ledger()` 로 전량 재계산한다.
- 폼은 `components/ip/record-editor.tsx` 의 필드 서술로 만든다. 엔티티마다 폼을 새로 짜지 않는다.
- 엑셀 내보내기는 NAS 「특허 및 상표권」 워크북의 양식을 따른다. `lib/xlsx/parts.ts` 의
  styles/theme 은 그 워크북에서 뽑은 것이라 손으로 고치지 않는다. `lib/excel.ts` 의 `style`·
  `dxf` 숫자는 그 안의 인덱스를 가리키므로 열을 넣고 뺄 때 함께 맞춰야 한다.
- 커밋 전에 `pnpm lint`(경고 포함 0)와 `pnpm build` 가 통과해야 한다.

## 데이터·인증 이전 문서

이 앱의 데이터(`ip` 스키마)와 로그인은 Supabase 에서 Omnis 로 옮기는 중이다.
구조·도메인 규칙·함정은 **Omnis 저장소**(`~/omnis-deploy`)의 `mydocs/` 에 있다.

| 문서 | 무엇 |
|---|---|
| `mydocs/tech/ip-schema.md` | ip 스키마와 그 안의 도메인 규칙 (출원일·등록일 계산) |
| `mydocs/troubleshootings/supabase-limits.md` | 왜 옮기는가 |
| `mydocs/troubleshootings/migration-traps.md` | 이미 밟은 함정 |

**주의:** 웹앱(`lib/db.ts`)과 MCP 서버(`supabase/functions/ip-mcp`)는 같은 데이터를
쓴다. 한쪽만 Omnis 로 넘기면 두 사본이 갈라지고, 둘 다 정상 동작하는 것처럼 보인다.
반드시 같이 넘긴다.

`ip.apply_progress_entry` 와 `ip.rebuild_ledger` 는 법정 기한이 걸린 날짜를 정한다.
TypeScript 로 옮겨 적지 않는다.
