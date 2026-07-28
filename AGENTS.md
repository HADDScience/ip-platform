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
- 상태값을 늘릴 때는 `ip.status_options` 에 행을 넣고 `status-badge.tsx` 에 톤을 추가한다.
  코드의 상수 배열을 고치는 것이 아니다.
- 폼은 `components/ip/record-editor.tsx` 의 필드 서술로 만든다. 엔티티마다 폼을 새로 짜지 않는다.
- 커밋 전에 `pnpm lint`(경고 포함 0)와 `pnpm build` 가 통과해야 한다.
