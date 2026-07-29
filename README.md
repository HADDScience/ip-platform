# HADD SCIENCE 지식재산권(IP) 팔로우업 플랫폼

HADD SCIENCE 의 상표·특허 진행상황을 **입력하고 팔로우업하는** 내부 도구입니다.
노션을 대체하는 단일 소스로, 모든 데이터는 Supabase 에 저장됩니다.

**배포 URL — <https://haddscience.github.io/ip-platform/>**
로그인 후 이용할 수 있습니다. 툴 런처: <https://haddscience.github.io/hub/>

---

## 로그인과 권한

- **로그인 화면은 허브(`/hub/`) 하나뿐입니다.** 로그아웃 상태로 들어오면 허브 로그인
  화면으로 보내고, 로그인이 끝나면 **보려던 화면으로 그대로 돌아옵니다**
  (`/hub/?next=/ip-platform/...`). 이 앱에는 자체 로그인 화면이 없습니다.
- **Google 또는 카카오** 소셜 로그인만 지원합니다(허브에서).
- 허브와 같은 오리진이라 **한 번 로그인하면 세션이 공유**됩니다. 허브에서 이미
  로그인했다면 이동 없이 바로 통과합니다.
- `ip.allowed_emails` 에 등록된 이메일만 접근할 수 있습니다. 등록되지 않은 계정으로
  로그인하면 "접근 권한이 없습니다" 화면이 나옵니다.
- 역할: `owner`(허용목록 관리 가능) / `editor`(읽기·쓰기) / `viewer`(읽기 전용).

멤버 추가는 SQL 로 합니다.

```sql
insert into ip.allowed_emails (email, role, note)
values ('someone@example.com', 'editor', '설명');
```

## 화면

화면은 셋입니다. 입력 경로가 넷(상표 편집·특허 편집·커뮤니케이션·액션)이던 것을
**진행 기록 하나**로 합친 결과입니다. 사람이 실제로 아는 것은 하나뿐이기 때문입니다 —
"언제 · 어느 건이 · 어디까지 갔고 · 이제 누구 차례인가".

| 화면 | 내용 |
| --- | --- |
| **기록하기** | 진행 기록 양식 하나와 최근 기록. 값은 전부 여기로 들어옵니다 |
| **IP** | 보유한 상표·특허 목록. 값을 여기서 고치지 않습니다 — 기록이 쌓인 결과입니다 |
| **밀린 IP 업무** | 회신 필요 / 상대 회신 대기 / 오래 멈춤 / 확인 필요 |
| **멤버** | 접근 신청 승인과 역할 관리. **관리자(owner)에게만 보이고, 주소로 직접 들어가도 막힙니다** |

날짜는 KST 기준이고, 경과일은 브라우저에서 실제 오늘 기준으로 계산합니다.

## 입력을 빠르게 하는 장치

- **AI 도구(MCP)** — 메일에서 값을 뽑는 일은 규칙보다 LLM 이 잘합니다. 진행 기록을 읽고 쓰는
  **원격 MCP 서버**를 두고, 쓰는 도구에 붙여 씁니다. Claude Code·Codex·Gemini CLI 는 커맨드
  한 줄, claude.ai·ChatGPT 는 커스텀 커넥터에 같은 주소를 넣으면 됩니다. stdio 가 아니라
  HTTP 로 만드는 이유가 이것입니다 — 브라우저에서 LLM 을 쓰는 사람도 같은 기능을 씁니다.
  **서버는 아직 올라가지 않았습니다**(`supabase/functions/ip-mcp`, 예정).
- **메일 붙여넣기**(`/intake`) — MCP 가 올라가기 전까지 쓰는 방법. 메일 본문을 그대로
  붙여넣으면 일자·발신·수신·제목·본문·첨부를 파싱해 양식을 채웁니다. **Gmail 과 네이버웍스
  모두** 동작합니다(OAuth 를 쓰지 않기 때문입니다).
- **⌘/Ctrl + Enter** 로 저장, ID 자동 채번(TM-22, PT-11 …).
- 비고에 `※` 로 시작하는 문장을 쓰면 **확인 필요**에 자동으로 모입니다.

## 안전장치

- 모든 추가·수정·삭제는 `ip.audit_log` 에 **before/after 전체 상태**가 남습니다.
  삭제한 항목도 이 기록으로 되돌릴 수 있습니다(`undoDelete`).
- 삭제는 2단계 확인을 거칩니다.
- 비로그인 접근은 RLS 와 테이블 권한 양쪽에서 차단됩니다.

## 엑셀 내보내기

NAS 의 「특허 및 상표권」 워크북과 **같은 양식**으로 나옵니다. 받는 사람이 늘 보던 파일과
그대로 대조할 수 있어야 하기 때문입니다.

- 시트는 둘 — **「특허」**(순번·구분·연구개발 내용·출원번호·출원날짜·등록번호·등록날짜·
  출원인·기타)와 **「상표권」**(순번·구분·이름·등록/출원번호·날짜·보유자 + 오른쪽 범례).
- 파일명 `특허 및 상표권_YYMMDD_<내려받은 사람>.xlsx`
- 글꼴·정렬·표 스타일(`TableStyleLight1`)은 기준 워크북의 `styles.xml`·`theme1.xml` 을
  그대로 싣습니다(`lib/xlsx/parts.ts`). 표에 자동 필터가 걸려 있어 걸러 보는 일은 엑셀이 합니다.

우리 지식재산권 목록의 12단계는 기준 워크북의 굵은 **구분**으로 묶여 나갑니다
(예: 출원·출원공고·심사중·의견제출통지·보정서제출 → 「특허 출원」). 매핑은 `lib/excel.ts` 에 있습니다.

## 로컬 실행

```bash
pnpm install
cp .env.example .env.local   # 값을 채운다
pnpm dev                     # http://localhost:3000/ip-platform
```

`.env.local` 에 필요한 값:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_BASE_PATH=/ip-platform
```

두 값 모두 **공개 값**입니다(브라우저 번들에 포함됩니다). 실제 보안은 RLS 가 담당합니다.
`service_role` 키는 절대 넣지 마세요.

```bash
pnpm build      # 정적 내보내기 → out/
pnpm lint       # 경고·에러 0이어야 함
pnpm typecheck
```

## 데이터베이스

스키마는 `supabase/migrations/` 에 있습니다. `public` 이 아닌 **`ip` 전용 스키마**를 쓰는데,
omnis·CRM 이 같은 Postgres 로 합쳐질 때 충돌하지 않게 하기 위함입니다.

```bash
supabase link --project-ref <ref>
supabase db push
```

주요 테이블: `trademarks` · `patents` · `communications`(+`communication_links`) ·
`actions` · `integrity_flags` · `audit_log` · `status_options` · `members` · `allowed_emails` · `org_meta`

**상태값은 CHECK 제약이 아니라 `status_options` 룩업 테이블**로 관리합니다.
상태를 추가하려면 마이그레이션 없이 행 하나만 넣으면 됩니다.

```sql
insert into ip.status_options (kind, value, sort_order, tone, is_open)
values ('trademark', '이의신청', 7, 'amber', true);
```

색상 톤은 `components/ip/status-badge.tsx` 에 정의돼 있습니다.

## 배포

`main` push → GitHub Actions → 정적 빌드 → GitHub Pages.
Supabase 접속 값은 저장소 **Variables**(secret 아님)로 주입됩니다.

정적 내보내기(`output: "export"`)라 서버 런타임이 없습니다. 데이터는 전부 브라우저에서
Supabase 로 직접 조회합니다.

## 기술 스택

Next.js 16 (App Router, static export) · React 19 · TypeScript(strict) · Tailwind CSS v4 ·
shadcn/ui (Base UI) · Supabase (Postgres + Auth + RLS) · pnpm

엑셀은 라이브러리 없이 `lib/xlsx/` 에서 OOXML 을 직접 씁니다. 기준 워크북의 서식을
그대로 유지해야 하는데, SheetJS 커뮤니티판은 셀 서식과 표를 쓰지 못하기 때문입니다.
