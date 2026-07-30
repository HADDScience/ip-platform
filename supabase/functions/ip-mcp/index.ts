/**
 * HADD IP — 원격 MCP 서버 (Streamable HTTP)
 *
 * 무엇을 위한 것인가
 *  메일에서 값을 뽑아 진행 기록으로 옮기는 일은 규칙으로 짜맞추는 것보다 LLM 이
 *  훨씬 잘한다. 그래서 파싱을 화면에 더 넣는 대신, 기록을 읽고 쓰는 도구를 열어
 *  각자 쓰는 AI 도구에 붙이게 한다.
 *
 * 왜 HTTP 인가
 *  stdio 로 만들면 CLI 에서만 쓸 수 있다. HTTP 로 두면 claude.ai·ChatGPT 의
 *  커스텀 커넥터로 같은 서버를 그대로 붙일 수 있다 — 브라우저에서 LLM 을 쓰는
 *  사람에게 같은 기능을 주는 길이 이것뿐이다.
 *
 * 인증
 *  `Authorization: Bearer hadd_…` 개인 토큰. Supabase 세션 토큰은 한 시간이면
 *  만료돼 커넥터 설정에 박아둘 수 없어서 따로 발급한다(ip.mcp_tokens).
 *  토큰은 신원만 알려주고, 무엇을 할 수 있는지는 ip.members 의 역할이 정한다.
 *
 * 권한
 *  service_role 로 DB 에 붙으므로 RLS 를 지나간다. 그래서 이 파일이 곧 권한
 *  경계다. 쓰기 도구는 반드시 역할을 먼저 확인한다.
 */

import { createClient } from "jsr:@supabase/supabase-js@2"

const PROTOCOL_VERSION = "2025-06-18"
const SERVER_INFO = { name: "hadd-ip", version: "1.0.0" }

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "ip" }, auth: { persistSession: false } }
)

interface Caller {
  userId: string
  email: string
  displayName: string | null
  role: "owner" | "editor" | "viewer"
}

/** 문자열의 sha256(hex). 토큰 원문은 어디에도 저장하지 않는다. */
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  )
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * 오늘(KST).
 *
 * 서버는 UTC 로 돈다. 그대로 쓰면 한국 시간 아침 9시 전에 남긴 정정이 어제로
 * 적힌다 — 지식재산권 목록의 날짜는 전부 KST 이므로 여기서 맞춰 준다.
 */
function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** URL-safe 난수. 토큰·코드·client_id 에 두루 쓴다. */
function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * 토큰 원문 → 사람.
 *
 * 두 갈래를 모두 받는다.
 *  * `hadd_…` 개인 토큰 — CLI 는 커맨드 한 줄이 간단하다.
 *  * OAuth 액세스 토큰 — ChatGPT 처럼 정적 토큰을 못 보내는 클라이언트용.
 */
async function resolveCaller(request: Request): Promise<Caller | null> {
  const header = request.headers.get("authorization") ?? ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null

  const hash = await sha256(token)
  const rpc = token.startsWith("hadd_")
    ? "resolve_mcp_token"
    : "resolve_oauth_token"

  const { data, error } = await db.rpc(rpc, { p_hash: hash })
  if (error || !data || data.length === 0) return null

  const row = data[0] as {
    user_id: string
    email: string
    display_name: string | null
    role: Caller["role"]
  }
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  }
}

// ---------------------------------------------------------------------------
// 사용 지침
//
// 왜 이런 장치가 필요한가
//  도구 설명을 길게 적어도 모델은 읽는 정도가 천차만별이다. 실제로 인용된 원본을
//  새 메일로 착각해 없던 사실(등록가능성·권고사항)을 기록한 일이 있었다. 그리고
//  한번 들어간 요약은 다음 조회에서 사실로 되돌아온다 — 기록이 세탁된다.
//
// 그래서 「읽지 않으면 쓸 수 없게」 만든다
//  쓰기 도구는 `guide` 확인 코드를 받는다. 그 코드는 read_guide 를 부르지 않으면
//  알 수 없고, 빠뜨리면 지침 전문을 담은 오류가 돌아온다. 어느 쪽이든 지침은
//  반드시 모델의 눈을 한 번 지나간다. 읽기 도구는 막지 않는다 — 읽는 것은 아무
//  것도 망치지 않고, 막으면 성가시기만 하다.
//
// 코드는 왜 손으로 적나
//  지침을 고칠 때마다 사람이 바꾸도록 둔다. 자동으로 만들면 지침이 바뀐 줄
//  모르고 옛 코드를 계속 쓰게 되고, 날짜로 만들면 대화 도중에 코드가 바뀐다.
// ---------------------------------------------------------------------------

/**
 * 지침의 **규칙**이 바뀌면 이 값도 함께 바꾼다. 그러면 옛 코드는 통하지 않고,
 * 부르는 쪽은 바뀐 지침을 다시 읽게 된다. 말을 다듬은 정도로는 바꾸지 않는다 —
 * 알아야 할 것이 그대로인데 코드를 흔들면 멀쩡한 호출만 막힌다.
 */
const GUIDE_ACK = "guide-2026-07-30-r1"

const GUIDE = [
  "HADD IP 사용 지침 — 쓰기 전에 반드시 한 번 읽는다",
  "",
  "■ 1. 기록이 원본이다",
  "상표·특허의 단계·번호·날짜를 직접 고치는 도구는 없다. 무슨 일이 있었는지를 기록하면 지식재산권 목록이 그 결과로 바뀐다. 그래서 목록은 언제든 기록에서 다시 계산된다 — 기록이 틀리면 목록도 틀린다.",
  "",
  "■ 2. 인용된 원본은 근거가 아니다 (가장 자주 틀리는 곳)",
  "회신 메일에는 우리가 보낸 원본이 「--------- 원본 메일 ---------」·「보낸사람:」 아래에 함께 실려 온다.",
  "그 아래는 이미 지난 일이거나 **우리가 쓴 글**이다. 구분선 위, 새로 온 몇 줄만 이 기록의 근거다.",
  "아래에서 등록가능성·지정상품·권고사항을 끌어올려 상대가 말한 것처럼 적으면 없던 사실이 만들어진다.",
  "새로 온 부분이 인사와 「검토하고 답변드리겠습니다」뿐이라면, 기록할 사실도 그것뿐이다.",
  "",
  "■ 3. 지어내지 않는다",
  "상대가 말하지 않은 것은 비운다. 모르는 칸은 비운다 — 그럴듯한 값을 채우는 것보다 비어 있는 것이 낫다.",
  "숫자(등록가능성·번호)는 이 메일에서 새로 말한 것만 넣는다. 지난 검토의견의 숫자를 옮기면 그 메일이 그 말을 한 것처럼 남는다.",
  "",
  "■ 4. 근거 원문을 남긴다",
  "메일이 근거라면 raw 에 새로 온 부분을 그대로 붙인다. 요약만 남기면 「정말 그렇게 적혀 있었나」를 사람이 확인할 길이 없고, 잘못된 요약이 그대로 사실이 된다.",
  "",
  "■ 5. 차례(nextTurn)는 방향과 다르다",
  "상대가 답을 예고했으면(「답변드리겠습니다」·「검토 후 연락드리겠습니다」) firm.",
  "상대가 우리에게 물었으면(「진행하시겠습니까」·「회신 부탁드립니다」) us.",
  "받은 메일이라는 이유로 us 를 고르지 않는다. 이 값이 「밀린 IP 업무」를 만든다 — 틀리면 사람이 엉뚱한 일을 한다.",
  "",
  "■ 6. 진행과 정정을 구분한다",
  "일이 진행된 것(출원했다·회신이 왔다)은 add_progress. 여태 잘못 적혀 있던 값(오타·엉뚱한 번호·틀린 단계)은 correct_ip.",
  "정정은 「원래부터 이랬다」는 뜻이라 마지막 진행일을 움직이지 않는다.",
  "",
  "■ 7. 쓰기 전에 본다",
  "list_stages 로 쓸 수 있는 단계를 확인하고, get_ip 로 같은 일이 이미 적혀 있지 않은지 본다. 날짜는 KST 이며 일이 일어난 날을 적는다(오늘이 아니다).",
  "새 건을 만들기 전에는 list_ip 로 같은 건을 찾아본다 — 이름만 다르게 적힌 같은 건을 둘로 만들면 합치기 어렵다.",
  "",
  "■ 8. 쓴 뒤에 확인한다",
  "응답의 목록_반영을 읽는다. 지난 날짜로 기록하면 단계가 그대로인 것이 정상이다 — 지난 일로 현재를 되돌리지 않기 때문이다. 실패로 보고 다시 쓰면 중복 기록만 쌓인다.",
  "기록_id 가 돌아왔으면 저장된 것이다.",
  "",
  `■ 확인 코드: ${GUIDE_ACK}`,
  "쓰기 도구(add_progress · correct_ip · create_ip)의 guide 인자에 이 값을 그대로 넣는다.",
].join("\n")

/** 클라이언트가 시스템 프롬프트에 실어주는 자리. 짧게 길만 알려준다. */
const INSTRUCTIONS = [
  "HADD SCIENCE 지식재산권 기록 서버입니다.",
  "기록을 남기거나 고치기 전에 read_guide 를 한 번 부르세요. 쓰기 도구는 거기서 받은 확인 코드를 요구합니다.",
  "특히 회신 메일을 옮길 때는 인용된 원본(구분선 아래)이 아니라 새로 온 부분만 근거로 삼아야 합니다.",
].join("\n")

/** 쓰기 도구가 공통으로 받는 칸. 지침을 지나오지 않으면 채울 수 없다. */
const GUIDE_ARG = {
  guide: {
    type: "string",
    description:
      "read_guide 가 알려준 확인 코드. 이 값이 없으면 기록되지 않는다 — 지침을 한 번은 읽고 쓰게 하려는 장치다.",
  },
} as const

// ---------------------------------------------------------------------------
// 도구
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "read_guide",
    description:
      "이 서버에 기록을 남기는 방법. **쓰기 전에 반드시 한 번 부른다.** 무엇을 근거로 삼아야 하고 무엇을 지어내면 안 되는지, 차례를 어떻게 판단하는지가 적혀 있다. 마지막에 확인 코드를 알려주는데, 쓰기 도구는 그 코드를 요구한다.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_stages",
    description:
      "진행 단계 목록. 기록을 남기기 전에 먼저 불러 어떤 단계 값을 쓸 수 있는지 확인한다. 단계마다 추가로 채워야 하는 칸(출원번호·등록번호·기한 등)도 함께 알려준다.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["trademark", "patent"],
          description: "상표(trademark) 또는 특허(patent)",
        },
      },
      required: ["kind"],
    },
  },
  {
    name: "list_ip",
    description:
      "보유한 상표·특허 목록. 기록을 남길 대상의 ID(TM-1, PT-3 …)를 찾을 때 쓴다. 이름 일부로 검색할 수 있다.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["trademark", "patent"],
          description: "생략하면 둘 다",
        },
        query: { type: "string", description: "이름·번호에 포함된 말" },
      },
    },
  },
  {
    name: "get_ip",
    description:
      "건 하나의 지금 상태와 진행 이력 전부. 「어디까지 진행됐나」에 답할 때 쓴다. list_ip 로 ID 를 찾은 뒤 부른다. 이력에는 우리가 엑셀에서 이어받은 출발선(opening)도 함께 나오는데, 그것은 사건이 아니라 인수 시점이다.",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "대상 ID. 예: TM-13, PT-07" },
        entityKind: {
          type: "string",
          enum: ["trademark", "patent"],
          description: "생략하면 ID 접두사(TM-/PT-)로 판단한다.",
        },
      },
      required: ["entityId"],
    },
  },
  {
    name: "list_todo",
    description:
      "밀린 업무. 건마다 가장 최근 기록을 보고 우리 차례로 남아 있는 것과 상대 회신을 기다리는 것을 알려준다.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_progress",
    description: [
      "진행 기록을 남긴다. 이 도구 하나로 지식재산권 목록(단계·번호·날짜)까지 함께 갱신된다 — 지식재산권 목록을 따로 고치지 않는다.",
      "메일이 근거라면 받은 메일이든 보낸 메일이든 그 내용을 note 에 옮기고 direction 을 채운 뒤 source 를 'mail' 로 두고, raw 에 근거가 된 원문을 그대로 붙인다.",
      "",
      "【인용된 원본은 근거가 아니다 — 가장 자주 틀리는 곳】",
      "회신 메일에는 우리가 보낸 원본이 「--------- 원본 메일 ---------」 아래에 함께 실려 온다. 그 아래는 이미 기록된 과거이거나 우리가 쓴 글이다.",
      "**구분선 위, 새로 온 몇 줄만 이 기록의 근거다.** 아래에서 등록가능성·지정상품·권고사항을 끌어올려 상대가 말한 것처럼 적으면 없던 사실을 만든다.",
      "새로 온 부분이 인사와 「검토하고 답변드리겠습니다」뿐이라면, 기록할 사실도 그것뿐이다.",
      "",
      "【지금 누구 차례인지】",
      "상대가 회신을 예고했으면(「답변드리겠습니다」·「검토 후 연락드리겠습니다」) nextTurn='firm' 이다. 상대가 우리에게 물었으면(「진행하시겠습니까」·「회신 부탁드립니다」) 'us' 다.",
      "받은 메일이라는 이유로 'us' 를 고르지 않는다 — 방향과 차례는 다른 것이다.",
      "",
      "결과로 기록_id 와 지식재산권 목록의 이전·이후 상태를 돌려주므로 정말 반영됐는지 그 자리에서 확인할 수 있다 — 기록_id 가 있으면 저장된 것이니 같은 내용을 다시 쓰지 않는다.",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "일자 YYYY-MM-DD (KST)" },
        entityKind: { type: "string", enum: ["trademark", "patent"] },
        entityId: { type: "string", description: "대상 ID. 예: TM-1, PT-3" },
        stage: {
          type: "string",
          description: "단계. list_stages 가 알려준 값 중 하나여야 한다.",
        },
        direction: {
          type: "string",
          enum: ["수신", "송신"],
          description:
            "메일을 주고받은 기록이면 방향. 받은 메일이면 '수신', 보낸 메일이면 '송신'. 구두·회의·내부 결정이면 비운다. 이 칸을 채웠다면 source 는 반드시 'mail' 이다.",
        },
        counterpart: { type: "string", description: "상대. 예: 특허법인 이름" },
        nextTurn: {
          type: "string",
          enum: ["us", "firm", "none"],
          description:
            "지금 누구 차례인지. us=회신 필요, firm=상대 회신 대기, none=대기 없음. 상대가 답을 예고했으면 'firm', 상대가 우리에게 물었으면 'us'. 받은 메일이라는 이유로 'us' 를 고르지 않는다.",
        },
        dueOn: { type: "string", description: "기한 YYYY-MM-DD" },
        appNo: { type: "string", description: "출원번호" },
        regNo: { type: "string", description: "등록번호" },
        probability: {
          type: "number",
          description:
            "등록가능성 %. **이 메일에서 상대가 새로 말한 숫자만** 넣는다. 인용된 원본이나 지난 검토의견에 있던 숫자를 여기 옮기면 그 메일이 그 말을 한 것처럼 남는다.",
        },
        note: {
          type: "string",
          description:
            "무슨 일이 있었는지. 새로 온 부분에 적힌 것만 쓴다. 상대가 말하지 않은 권고·제안을 채우지 않는다.",
        },
        raw: {
          type: "string",
          description:
            "근거가 된 원문 그대로. 메일이면 새로 온 부분(인용된 원본 제외)을 붙인다. 나중에 「정말 그렇게 적혀 있었나」를 사람이 확인하는 유일한 길이므로, source 가 'mail' 이면 반드시 채운다.",
        },
        source: {
          type: "string",
          enum: ["manual", "mail"],
          description:
            "이 근거가 어디서 왔는지. 사용자가 메일 본문을 붙여넣었거나 '이렇게 보냈어'·'이런 답이 왔어' 처럼 주고받은 메일을 옮기는 것이면 방향과 무관하게 'mail'. 구두·회의·내부 결정처럼 메일이 아닌 것만 'manual'. 생략하면 'manual' 이지만, direction 을 채웠다면 서버가 'mail' 로 바로잡는다.",
        },
        ...GUIDE_ARG,
      },
      required: [
        "date",
        "entityKind",
        "entityId",
        "stage",
        "nextTurn",
        "guide",
      ],
    },
  },
  {
    name: "correct_ip",
    description:
      "이름·보유자·출원번호·등록번호·단계를 고친다. 지식재산권 목록을 직접 찌르지 않고 「값 정정」 기록 한 줄로 남기므로 무엇이 언제 왜 바뀌었는지 이력에 남는다. 일이 진행된 것(출원했다·등록됐다)은 이 도구가 아니라 add_progress 로 남긴다 — 정정은 「원래부터 이랬다」는 뜻이라 마지막 진행일을 움직이지 않는다. 값을 비우려면 빈 문자열을 넘긴다.",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "대상 ID. 예: TM-13, PT-07" },
        entityKind: {
          type: "string",
          enum: ["trademark", "patent"],
          description: "생략하면 ID 접두사(TM-/PT-)로 판단한다.",
        },
        name: { type: "string", description: "상표 이름 · 특허 명칭" },
        holder: { type: "string", description: "보유자 · 출원인" },
        appNo: { type: "string", description: "출원번호" },
        regNo: { type: "string", description: "등록번호" },
        stage: {
          type: "string",
          description:
            "단계. 「엑셀 인수 당시 단계가 실제와 달랐다」처럼 지금까지 잘못 적혀 있던 경우에만 쓴다.",
        },
        reason: {
          type: "string",
          description: "왜 고치는지. 이력에 그대로 남으므로 근거를 적는다.",
        },
        ...GUIDE_ARG,
      },
      required: ["entityId", "reason", "guide"],
    },
  },
  {
    name: "create_ip",
    description:
      "지식재산권 목록에 없는 건을 새로 만든다. 아이디어 단계의 상표처럼 아직 아무 일도 일어나지 않은 것을 자리부터 잡을 때 쓴다. 먼저 list_ip 로 같은 건이 이미 있는지 확인한다 — 이름만 다르게 적힌 같은 건을 둘로 만들면 나중에 합치기 어렵다. 만든 뒤 진행이 있었다면 add_progress 로 이어 적는다.",
    inputSchema: {
      type: "object",
      properties: {
        entityKind: { type: "string", enum: ["trademark", "patent"] },
        name: { type: "string", description: "상표 이름 · 특허 명칭" },
        stage: {
          type: "string",
          description:
            "시작 단계. list_stages 가 알려준 값 중 하나여야 한다. 보통 '아이디어'.",
        },
        note: { type: "string", description: "비고. 없으면 비운다." },
        ...GUIDE_ARG,
      },
      required: ["entityKind", "name", "stage", "guide"],
    },
  },
] as const

/** 쓰기 도구 이름. 지침을 지나왔는지 여기서 한 번에 본다. */
const WRITE_TOOLS = new Set(["add_progress", "correct_ip", "create_ip"])

type ToolResult = { text: string } | { error: string }

async function runTool(
  name: string,
  args: Record<string, unknown>,
  caller: Caller
): Promise<ToolResult> {
  if (name === "read_guide") return { text: GUIDE }

  // 지침을 지나오지 않은 쓰기는 받지 않는다. 막기만 하면 부르는 쪽이 무엇을
  // 해야 할지 모르니, 오류에 지침 전문을 실어 보낸다 — read_guide 를 건너뛰었더라도
  // 이 오류를 읽는 순간 지침은 모델의 눈을 지나간다. 그다음 재시도는 옳게 온다.
  if (WRITE_TOOLS.has(name) && args.guide !== GUIDE_ACK) {
    return {
      error: [
        args.guide
          ? `확인 코드가 맞지 않습니다(받은 값: ${String(args.guide)}). 지침이 바뀌었을 수 있습니다.`
          : "쓰기 전에 사용 지침을 한 번 읽어야 합니다.",
        "아래 지침을 읽고, 마지막의 확인 코드를 guide 인자에 넣어 같은 호출을 다시 보내세요.",
        "지침에 비추어 넘기려던 값이 잘못됐다면 고쳐서 보내세요 — 특히 근거(인용된 원본인지 새로 온 부분인지)와 차례(us·firm)를 다시 보세요.",
        "",
        "─".repeat(20),
        GUIDE,
      ].join("\n"),
    }
  }

  if (name === "list_stages") {
    const { data, error } = await db
      .from("status_options")
      .select(
        "value, sort_order, is_open, wants_app_no, wants_reg_no, wants_probability, wants_due"
      )
      .eq("kind", args.kind)
      .eq("selectable", true)
      .order("sort_order")
    if (error) return { error: error.message }
    return { text: JSON.stringify(data, null, 2) }
  }

  if (name === "list_ip") {
    const kind = args.kind as string | undefined
    const query = ((args.query as string) ?? "").trim()
    const out: unknown[] = []

    if (kind !== "patent") {
      let q = db
        .from("trademarks")
        .select("id, name, status, app_no, reg_no, ref_date, holder")
      if (query)
        q = q.or(
          `name.ilike.%${query}%,app_no.ilike.%${query}%,reg_no.ilike.%${query}%`
        )
      const { data, error } = await q.order("id")
      if (error) return { error: error.message }
      out.push(...(data ?? []).map((r) => ({ kind: "trademark", ...r })))
    }
    if (kind !== "trademark") {
      let q = db
        .from("patents")
        .select("id, title, status, app_no, reg_no, ref_date, applicant")
      if (query)
        q = q.or(
          `title.ilike.%${query}%,app_no.ilike.%${query}%,reg_no.ilike.%${query}%`
        )
      const { data, error } = await q.order("id")
      if (error) return { error: error.message }
      out.push(...(data ?? []).map((r) => ({ kind: "patent", ...r })))
    }
    return { text: JSON.stringify(out, null, 2) }
  }

  if (name === "get_ip") {
    const id = String(args.entityId ?? "").trim()
    // ID 접두사가 곧 부류다. 굳이 물어보지 않아도 되게 한다.
    const kind =
      (args.entityKind as string | undefined) ??
      (id.toUpperCase().startsWith("PT") ? "patent" : "trademark")

    const table = kind === "trademark" ? "trademarks" : "patents"
    const columns =
      kind === "trademark"
        ? "id, name, name_ko, classes, goods, status, app_no, reg_no, ref_date, filed_on, registered_on, holder, probability, note"
        : "id, title, status, app_no, reg_no, ref_date, filed_on, registered_on, applicant, note"

    const { data: row, error: rowError } = await db
      .from(table)
      .select(columns)
      .eq("id", id)
      .maybeSingle()
    if (rowError) return { error: rowError.message }
    if (!row) {
      return {
        error: `${id} 는 지식재산권 목록에 없습니다. list_ip 로 ID 를 먼저 확인하세요.`,
      }
    }

    const { data: opening, error: openError } = await db
      .from("opening_state")
      .select("stage, ref_date, taken_over_on, source_note")
      .eq("entity_kind", kind)
      .eq("entity_id", id)
      .maybeSingle()
    if (openError) return { error: openError.message }

    const { data: history, error: histError } = await db
      .from("progress_entries")
      .select(
        // raw(근거 원문)를 함께 준다. 요약만 돌려주면 「그렇게 적혀 있었나」를
        // 되짚을 수 없고, 지어낸 요약이 그대로 사실로 굳는다.
        "occurred_on, stage, direction, counterpart, next_turn, due_on, app_no, reg_no, name, holder, probability, note, source, raw"
      )
      .eq("entity_kind", kind)
      .eq("entity_id", id)
      .order("occurred_on", { ascending: false })
    if (histError) return { error: histError.message }

    return {
      text: JSON.stringify(
        {
          현재: row,
          진행_이력: history ?? [],
          // 기록이 없으면 왜 없는지가 답의 일부다. 지어낸 일이 아니라 인수분이다.
          출발선: opening
            ? {
                ...opening,
                설명: "우리가 이 상태를 이어받은 시점입니다. 그날 무슨 일이 있었다는 뜻이 아닙니다.",
              }
            : null,
        },
        null,
        2
      ),
    }
  }

  if (name === "list_todo") {
    const { data, error } = await db
      .from("progress_entries")
      .select(
        "id, occurred_on, entity_kind, entity_id, stage, next_turn, due_on, counterpart, note, source"
      )
      .order("occurred_on", { ascending: false })
    if (error) return { error: error.message }

    // 건마다 가장 최근 기록만 본다. 옛 기록의 「회신 필요」는 이미 지나간 상태다.
    // 값 정정(source='edit')은 누구 차례인지에 대해 아무 말도 하지 않으므로 건너뛴다.
    const latest = new Map<string, (typeof data)[number]>()
    for (const row of data ?? []) {
      if (row.source === "edit") continue
      const key = `${row.entity_kind}:${row.entity_id}`
      if (!latest.has(key)) latest.set(key, row)
    }
    const rows = [...latest.values()]
    return {
      text: JSON.stringify(
        {
          회신_필요: rows.filter((r) => r.next_turn === "us"),
          상대_회신_대기: rows.filter((r) => r.next_turn === "firm"),
        },
        null,
        2
      ),
    }
  }

  if (name === "add_progress") {
    // service_role 로 붙어 RLS 를 지나가므로, 쓰기 권한은 여기서 직접 본다.
    if (caller.role === "viewer") {
      return { error: "읽기 전용 권한입니다. 기록을 남길 수 없습니다." }
    }

    const kind = args.entityKind as string
    const table = kind === "trademark" ? "trademarks" : "patents"
    // 쓰기 전 지식재산권 목록을 떠 둔다. 쓴 뒤와 견줘야 "정말 바뀌었나"를 부르는 쪽이 볼 수
    // 있다. 진행 기록은 들어갔는데 지식재산권 목록은 안 움직이는 경우가 실제로 있다.
    const LEDGER = "status, ref_date, app_no, reg_no"
    const { data: found, error: findError } = await db
      .from(table)
      .select(LEDGER)
      .eq("id", args.entityId)
      .maybeSingle()
    if (findError) return { error: findError.message }
    if (!found) {
      return {
        error: `${args.entityId} 는 지식재산권 목록에 없습니다. list_ip 로 ID 를 먼저 확인하세요.`,
      }
    }

    const { data: stage, error: stageError } = await db
      .from("status_options")
      .select("value")
      .eq("kind", kind)
      .eq("value", args.stage)
      .maybeSingle()
    if (stageError) return { error: stageError.message }
    if (!stage) {
      return {
        error: `'${args.stage}' 는 쓸 수 없는 단계입니다. list_stages 를 먼저 부르세요.`,
      }
    }

    // 나중에 되짚을 때 근거의 출처가 보여야 한다. 메일을 옮긴 것과 구두로 들은
    // 것은 무게가 다르다. 방향이 채워졌는데 'manual' 이라 말한 경우는 DB 가
    // 'mail' 로 바로잡는다 — 같은 판단이 웹 양식에도 걸려야 해서 여기가 아니라
    // 한 곳(트리거)에 둔다. 그 결과는 아래 저장된_값 에 그대로 실려 돌아간다.
    const source = args.source === "mail" ? "mail" : "manual"

    const { data: written, error } = await db
      .from("progress_entries")
      .insert({
        occurred_on: args.date,
        entity_kind: kind,
        entity_id: args.entityId,
        stage: args.stage,
        direction: args.direction ?? null,
        counterpart: (args.counterpart as string) ?? "",
        next_turn: args.nextTurn,
        due_on: args.dueOn ?? null,
        app_no: args.appNo ?? null,
        reg_no: args.regNo ?? null,
        probability: args.probability ?? null,
        note: (args.note as string) ?? "",
        source,
        // 근거 원문. 요약만 남기면 「정말 그렇게 적혀 있었나」를 아무도 확인할 수
        // 없다 — 지어낸 요약이 한번 들어오면 그 뒤로는 그것이 사실이 된다.
        raw: (args.raw as string) ?? null,
      })
      .select("id, occurred_on, stage, direction, next_turn, source")
      .single()
    if (error) return { error: error.message }

    // 쓴 뒤의 지식재산권 목록. 트리거가 움직였는지는 여기서만 알 수 있다.
    const { data: after, error: afterError } = await db
      .from(table)
      .select(LEDGER)
      .eq("id", args.entityId)
      .maybeSingle()
    if (afterError) return { error: afterError.message }

    const before = found as Record<string, unknown>
    const now = (after ?? {}) as Record<string, unknown>
    const changed = Object.keys(now).filter(
      (k) => String(now[k] ?? "") !== String(before[k] ?? "")
    )

    // 지식재산권 목록이 안 움직이는 정상적인 경우가 하나 있다: 더 최근 기록이 이미 있을 때.
    // 지난 일을 뒤늦게 채우는 것이라 단계를 되돌리면 안 된다. 이걸 말해주지
    // 않으면 부르는 쪽은 "실패했다"고 보고 같은 걸 계속 다시 쓴다.
    const stageMoved = now.status === args.stage
    const olderThanLedger =
      typeof before.ref_date === "string" && String(args.date) < before.ref_date

    return {
      text: JSON.stringify(
        {
          기록됨: true,
          기록_id: written?.id ?? null,
          저장된_값: written,
          지식재산권_목록: { 이전: before, 이후: now, 바뀐_칸: changed },
          목록_반영: stageMoved
            ? "단계가 이 기록대로 바뀌었습니다."
            : olderThanLedger
              ? `단계는 그대로입니다. 더 최근 기록(${before.ref_date})이 있어 지난 일로 되돌리지 않습니다 — 정상이며 다시 시도할 필요가 없습니다. 지금 상태를 바꾸려면 오늘 날짜로 기록하세요.`
              : "단계가 바뀌지 않았습니다. 예상과 다르면 get_ip 로 확인하세요.",
          확인_방법:
            "기록_id 가 있으면 저장된 것입니다. 같은 내용을 다시 쓰면 중복 기록이 생깁니다 — 실패로 보이더라도 먼저 get_ip 로 확인하세요.",
          // 근거가 없으면 요약이 곧 사실이 되어버린다. 조용히 넘기지 않는다.
          ...(source === "mail" && !args.raw
            ? {
                주의: "메일 기록인데 raw(근거 원문)가 비어 있습니다. 나중에 사람이 확인할 길이 없습니다 — 새로 온 부분을 raw 에 담아 다시 기록하거나, 이 기록을 지우고 다시 남기세요.",
              }
            : {}),
          기록자: caller.displayName ?? caller.email,
        },
        null,
        2
      ),
    }
  }

  if (name === "correct_ip") {
    if (caller.role === "viewer") {
      return { error: "읽기 전용 권한입니다. 값을 고칠 수 없습니다." }
    }

    const id = String(args.entityId ?? "").trim()
    const kind =
      (args.entityKind as string | undefined) ??
      (id.toUpperCase().startsWith("PT") ? "patent" : "trademark")
    const table = kind === "trademark" ? "trademarks" : "patents"
    const NAME_COL = kind === "trademark" ? "name" : "title"
    const HOLDER_COL = kind === "trademark" ? "holder" : "applicant"
    const LEDGER = `${NAME_COL}, ${HOLDER_COL}, status, ref_date, app_no, reg_no`

    const { data: found, error: findError } = await db
      .from(table)
      .select(LEDGER)
      .eq("id", id)
      .maybeSingle()
    if (findError) return { error: findError.message }
    if (!found) {
      return {
        error: `${id} 는 지식재산권 목록에 없습니다. list_ip 로 ID 를 먼저 확인하세요.`,
      }
    }
    const before = found as Record<string, unknown>

    // 안 넘긴 칸은 손대지 않고, 빈 문자열은 「비운다」는 뜻이다. 둘을 구분하지
    // 않으면 이름 하나 고치려다 나머지를 통째로 지운다.
    const patch = (key: string) =>
      args[key] === undefined ? null : String(args[key])
    const touched = ["name", "holder", "appNo", "regNo", "stage"].filter(
      (k) => args[k] !== undefined
    )
    if (touched.length === 0) {
      return {
        error:
          "고칠 값이 하나도 없습니다. name·holder·appNo·regNo·stage 중 하나 이상을 넘기세요.",
      }
    }

    // 단계는 정정으로만 바꾼다. 정의에 없는 단계면 지식재산권 목록이 유령 값을 갖는다.
    if (args.stage !== undefined) {
      const { data: stage, error: stageError } = await db
        .from("status_options")
        .select("value")
        .eq("kind", kind)
        .eq("value", args.stage)
        .maybeSingle()
      if (stageError) return { error: stageError.message }
      if (!stage) {
        return {
          error: `'${args.stage}' 는 쓸 수 없는 단계입니다. list_stages 를 먼저 부르세요.`,
        }
      }
    }

    const today = todayKst()
    const reason = String(args.reason ?? "").trim()

    const { data: written, error } = await db
      .from("progress_entries")
      .insert({
        occurred_on: today,
        entity_kind: kind,
        entity_id: id,
        // 단계를 안 고치면 지금 단계를 그대로 다시 적는다. 무해하다.
        stage: args.stage ?? before.status,
        direction: null,
        counterpart: "",
        next_turn: "none",
        due_on: null,
        app_no: patch("appNo"),
        reg_no: patch("regNo"),
        probability: null,
        name: patch("name"),
        holder: patch("holder"),
        note: reason || `값 정정 (${touched.join(", ")})`,
        // 정정은 일이 진행된 것이 아니다. 이 표시가 마지막 진행일을 지켜준다.
        source: "edit",
        raw: null,
      })
      .select("id, occurred_on, stage, source")
      .single()
    if (error) return { error: error.message }

    const { data: after, error: afterError } = await db
      .from(table)
      .select(LEDGER)
      .eq("id", id)
      .maybeSingle()
    if (afterError) return { error: afterError.message }

    const now = (after ?? {}) as Record<string, unknown>
    const changed = Object.keys(now).filter(
      (k) => String(now[k] ?? "") !== String(before[k] ?? "")
    )

    return {
      text: JSON.stringify(
        {
          고쳤음: changed.length > 0,
          기록_id: written?.id ?? null,
          지식재산권_목록: { 이전: before, 이후: now, 바뀐_칸: changed },
          설명:
            changed.length > 0
              ? "지식재산권 목록이 바뀌었고 「값 정정」 기록 한 줄이 이력에 남았습니다. 마지막 진행일은 움직이지 않았습니다."
              : "기록은 남았지만 지식재산권 목록은 그대로입니다 — 넘긴 값이 지금 값과 같거나, 더 최근 기록이 그 칸을 이미 채우고 있습니다. get_ip 로 확인하세요.",
          기록자: caller.displayName ?? caller.email,
        },
        null,
        2
      ),
    }
  }

  if (name === "create_ip") {
    if (caller.role === "viewer") {
      return { error: "읽기 전용 권한입니다. 건을 만들 수 없습니다." }
    }

    const kind = args.entityKind as string
    const name_ = String(args.name ?? "").trim()

    // 같은 건을 둘로 만들면 나중에 합치기 어렵다. 부르는 쪽이 확인하도록
    // 시켜두었지만, 이름이 완전히 같은 것만은 여기서도 막는다.
    const table = kind === "trademark" ? "trademarks" : "patents"
    const column = kind === "trademark" ? "name" : "title"
    const { data: dup, error: dupError } = await db
      .from(table)
      .select(`id, ${column}`)
      .ilike(column, name_)
    if (dupError) return { error: dupError.message }
    if (dup && dup.length > 0) {
      return {
        error: `이미 같은 이름의 건이 있습니다: ${dup
          .map((d: Record<string, unknown>) => d.id)
          .join(", ")}. 새로 만들지 말고 그 건에 기록하세요.`,
      }
    }

    const { data: newId, error } = await db.rpc("create_case", {
      p_kind: kind,
      p_name: name_,
      p_stage: args.stage,
      p_note: (args.note as string) ?? "",
    })
    if (error) return { error: error.message }

    return {
      text: JSON.stringify(
        {
          만들었음: true,
          id: newId,
          이름: name_,
          단계: args.stage,
          설명: "지식재산권 목록에 자리를 잡았고, 되짚을 수 있도록 출발선도 함께 적었습니다. 이 건에 진행이 있으면 add_progress 로 이어 적으세요.",
          만든이: caller.displayName ?? caller.email,
        },
        null,
        2
      ),
    }
  }

  return { error: `모르는 도구입니다: ${name}` }
}

// ---------------------------------------------------------------------------
// JSON-RPC
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

// ---------------------------------------------------------------------------
// OAuth — ChatGPT 처럼 정적 토큰을 못 보내는 클라이언트를 위해
// ---------------------------------------------------------------------------

/**
 * 이 함수의 공개 주소. 발급자(issuer)이자 보호 자원(resource) 식별자다.
 *
 * `.well-known` 을 호스트 루트에 둘 수 없어서(Supabase 가 쓰는 자리다) 함수
 * 경로 아래에 둔다. 규격은 401 의 `WWW-Authenticate` 에 적힌 주소를 클라이언트가
 * 그대로 쓰도록 정하고 있으므로, 그 헤더로 여기를 가리켜 준다.
 */
const BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ip-mcp`

/** 승인 화면. 허브 로그인 세션이 살아 있는 웹앱 쪽에서 띄운다. */
const APPROVE_PAGE = "https://haddscience.github.io/ip-platform/authorize/"

const ACCESS_TTL_SEC = 60 * 60 * 8

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...extra },
  })
}

/** RFC 9728 — 이 자원이 어느 인가 서버를 믿는지 */
function protectedResourceMetadata() {
  return json({
    resource: BASE,
    authorization_servers: [BASE],
    bearer_methods_supported: ["header"],
  })
}

/** RFC 8414 — 인가 서버가 무엇을 할 수 있는지 */
function authorizationServerMetadata() {
  return json({
    issuer: BASE,
    authorization_endpoint: `${BASE}/authorize`,
    token_endpoint: `${BASE}/token`,
    registration_endpoint: `${BASE}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // 공개 클라이언트만 받는다. 비밀을 나눠 가질 상대가 아니다.
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp"],
  })
}

/** RFC 7591 — 클라이언트가 스스로 등록한다 */
async function registerClient(request: Request): Promise<Response> {
  let body: { client_name?: string; redirect_uris?: string[] }
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid_client_metadata" }, 400)
  }

  const uris = body.redirect_uris ?? []
  if (uris.length === 0) {
    return json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris 가 필요합니다.",
      },
      400
    )
  }

  const clientId = `mcp_${randomToken(16)}`
  const { error } = await db.from("oauth_clients").insert({
    client_id: clientId,
    client_name: body.client_name ?? "",
    redirect_uris: uris,
  })
  if (error)
    return json(
      { error: "server_error", error_description: error.message },
      500
    )

  return json(
    {
      client_id: clientId,
      client_name: body.client_name ?? "",
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201
  )
}

/** 사용자를 승인 화면으로 보낸다. 로그인 여부는 그 화면이 판단한다. */
async function authorize(url: URL): Promise<Response> {
  const clientId = url.searchParams.get("client_id") ?? ""
  const redirectUri = url.searchParams.get("redirect_uri") ?? ""
  const challenge = url.searchParams.get("code_challenge") ?? ""
  const method = url.searchParams.get("code_challenge_method") ?? ""
  const state = url.searchParams.get("state")

  const { data: client } = await db
    .from("oauth_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle()

  // 클라이언트나 redirect_uri 가 수상하면 그쪽으로 되돌려 보내지 않는다.
  // 공격자가 지정한 주소로 오류를 흘리면 그것이 곧 통로가 된다.
  if (!client)
    return new Response("알 수 없는 client_id 입니다.", { status: 400 })
  if (!(client.redirect_uris as string[]).includes(redirectUri)) {
    return new Response("등록되지 않은 redirect_uri 입니다.", { status: 400 })
  }
  if (method !== "S256" || !challenge) {
    return new Response("PKCE(S256)가 필요합니다.", { status: 400 })
  }

  const { data: req, error } = await db
    .from("oauth_requests")
    .insert({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      resource: url.searchParams.get("resource"),
      scope: url.searchParams.get("scope") ?? "",
    })
    .select("id")
    .single()
  if (error) return new Response(error.message, { status: 500 })

  return Response.redirect(`${APPROVE_PAGE}?req=${req.id}`, 302)
}

/**
 * 승인 화면이 부른다. 사람 확인은 그 사람의 Supabase 세션으로 한다 —
 * 우리가 로그인 화면을 새로 만들지 않아도 되는 이유다.
 */
async function approve(request: Request): Promise<Response> {
  const jwt = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    ""
  )
  const { data: userData } = await db.auth.getUser(jwt)
  const user = userData?.user
  if (!user) return json({ error: "로그인이 필요합니다." }, 401)

  const { data: member } = await db
    .from("members")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!member) return json({ error: "승인된 멤버가 아닙니다." }, 403)

  let body: { req?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: "잘못된 요청입니다." }, 400)
  }

  const { data: req } = await db
    .from("oauth_requests")
    .select("*")
    .eq("id", body.req ?? "")
    .maybeSingle()
  if (!req) return json({ error: "만료되었거나 없는 요청입니다." }, 400)
  if (new Date(req.expires_at as string) < new Date()) {
    return json(
      { error: "요청이 만료되었습니다. 처음부터 다시 시도하세요." },
      400
    )
  }

  const code = randomToken(32)
  const { error } = await db.from("oauth_codes").insert({
    code_hash: await sha256(code),
    client_id: req.client_id,
    user_id: user.id,
    redirect_uri: req.redirect_uri,
    code_challenge: req.code_challenge,
    resource: req.resource,
  })
  if (error) return json({ error: error.message }, 500)

  await db.from("oauth_requests").delete().eq("id", req.id)

  const target = new URL(req.redirect_uri as string)
  target.searchParams.set("code", code)
  if (req.state) target.searchParams.set("state", req.state as string)
  return json({ redirect: target.toString() })
}

/** 승인 화면이 "무엇을 승인하는지" 보여주려고 부른다. */
async function requestInfo(url: URL): Promise<Response> {
  const { data: req } = await db
    .from("oauth_requests")
    .select("id, client_id, expires_at")
    .eq("id", url.searchParams.get("req") ?? "")
    .maybeSingle()
  if (!req) return json({ error: "만료되었거나 없는 요청입니다." }, 404)

  const { data: client } = await db
    .from("oauth_clients")
    .select("client_name")
    .eq("client_id", req.client_id)
    .maybeSingle()

  return json({
    clientName: (client?.client_name as string) || (req.client_id as string),
    expiresAt: req.expires_at,
  })
}

/** 인가 코드·갱신 토큰 → 액세스 토큰 */
async function issueToken(request: Request): Promise<Response> {
  const form = new URLSearchParams(await request.text())
  const grant = form.get("grant_type")

  async function mint(clientId: string, userId: string) {
    const access = randomToken(32)
    const refresh = randomToken(32)
    const { error } = await db.from("oauth_tokens").insert({
      access_hash: await sha256(access),
      refresh_hash: await sha256(refresh),
      client_id: clientId,
      user_id: userId,
      expires_at: new Date(Date.now() + ACCESS_TTL_SEC * 1000).toISOString(),
    })
    if (error)
      return json(
        { error: "server_error", error_description: error.message },
        500
      )
    return json({
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refresh,
      scope: "mcp",
    })
  }

  if (grant === "authorization_code") {
    const code = form.get("code") ?? ""
    const verifier = form.get("code_verifier") ?? ""
    const { data: row } = await db
      .from("oauth_codes")
      .select("*")
      .eq("code_hash", await sha256(code))
      .maybeSingle()

    if (!row || row.used_at) return json({ error: "invalid_grant" }, 400)
    if (new Date(row.expires_at as string) < new Date()) {
      return json(
        { error: "invalid_grant", error_description: "코드가 만료되었습니다." },
        400
      )
    }
    if (form.get("redirect_uri") !== row.redirect_uri) {
      return json(
        {
          error: "invalid_grant",
          error_description: "redirect_uri 가 다릅니다.",
        },
        400
      )
    }

    // PKCE — verifier 의 S256 이 등록된 challenge 와 같아야 한다.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier)
    )
    const computed = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    if (computed !== row.code_challenge) {
      return json(
        {
          error: "invalid_grant",
          error_description: "PKCE 검증에 실패했습니다.",
        },
        400
      )
    }

    // 코드는 한 번만. 재사용은 탈취 신호다.
    await db
      .from("oauth_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", row.code_hash)
    return await mint(row.client_id as string, row.user_id as string)
  }

  if (grant === "refresh_token") {
    const refresh = form.get("refresh_token") ?? ""
    const { data: row } = await db
      .from("oauth_tokens")
      .select("*")
      .eq("refresh_hash", await sha256(refresh))
      .is("revoked_at", null)
      .maybeSingle()
    if (!row) return json({ error: "invalid_grant" }, 400)

    // 갱신할 때마다 옛 토큰은 죽인다(회전).
    await db
      .from("oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", row.id)
    return await mint(row.client_id as string, row.user_id as string)
  }

  return json({ error: "unsupported_grant_type" }, 400)
}

function reply(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "content-type": "application/json", ...CORS },
  })
}

function fail(id: unknown, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    {
      headers: { "content-type": "application/json", ...CORS },
    }
  )
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS })
  }

  // ── OAuth 경로 먼저 ────────────────────────────────────────────────────────
  // 함수 이름 뒤에 붙은 부분만 본다. 배포 환경에 따라 앞이 달라질 수 있다.
  const url = new URL(request.url)
  const tail = url.pathname.replace(/^.*\/ip-mcp/, "") || "/"

  if (tail === "/.well-known/oauth-protected-resource") {
    return protectedResourceMetadata()
  }
  if (
    tail === "/.well-known/oauth-authorization-server" ||
    tail === "/.well-known/openid-configuration"
  ) {
    return authorizationServerMetadata()
  }
  if (tail === "/register" && request.method === "POST") {
    return await registerClient(request)
  }
  if (tail === "/authorize" && request.method === "GET") {
    return await authorize(url)
  }
  if (tail === "/request" && request.method === "GET") {
    return await requestInfo(url)
  }
  if (tail === "/approve" && request.method === "POST") {
    return await approve(request)
  }
  if (tail === "/token" && request.method === "POST") {
    return await issueToken(request)
  }

  // 커넥터가 살아 있는지 볼 때 GET 을 던지는 클라이언트가 있다.
  if (request.method === "GET") {
    return new Response(
      JSON.stringify({ ...SERVER_INFO, transport: "streamable-http" }),
      {
        headers: { "content-type": "application/json", ...CORS },
      }
    )
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS })
  }

  let message: {
    id?: unknown
    method?: string
    params?: Record<string, unknown>
  }
  try {
    message = await request.json()
  } catch {
    return fail(null, -32700, "본문을 JSON 으로 읽지 못했습니다.")
  }

  const { id, method, params } = message

  // 알림(notification)은 id 가 없다. 답을 기다리지 않으므로 본문 없이 끝낸다.
  if (id === undefined || id === null) {
    return new Response(null, { status: 202, headers: CORS })
  }

  if (method === "initialize") {
    return reply(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      // 클라이언트가 시스템 프롬프트에 실어주는 자리. 여기까지 읽어주는 도구라면
      // 지침을 미리 알고 오고, 아니어도 쓰기 게이트에서 한 번 더 걸린다.
      instructions: INSTRUCTIONS,
    })
  }

  if (method === "ping") return reply(id, {})

  // 여기부터는 누구인지 알아야 한다.
  const caller = await resolveCaller(request)
  if (!caller) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32001,
          message:
            "토큰이 없거나 폐기되었습니다. IP 플랫폼의 「AI 도구 설치하기」에서 새로 발급하세요.",
        },
      }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
          // OAuth 를 쓰는 클라이언트는 이 헤더를 보고 스스로 등록·인가를 시작한다.
          // `.well-known` 을 호스트 루트에 둘 수 없어서 주소를 명시해 준다.
          "www-authenticate": `Bearer realm="hadd-ip", resource_metadata="${BASE}/.well-known/oauth-protected-resource"`,
          ...CORS,
        },
      }
    )
  }

  if (method === "tools/list") {
    return reply(id, { tools: TOOLS })
  }

  if (method === "tools/call") {
    const name = params?.name as string
    const args = (params?.arguments as Record<string, unknown>) ?? {}
    const result = await runTool(name, args, caller)

    if ("error" in result) {
      // 도구가 실패한 것은 프로토콜 오류가 아니다. isError 로 알려 모델이
      // 스스로 고쳐 다시 부르게 한다.
      return reply(id, {
        content: [{ type: "text", text: result.error }],
        isError: true,
      })
    }
    return reply(id, { content: [{ type: "text", text: result.text }] })
  }

  return fail(id, -32601, `지원하지 않는 메서드입니다: ${method}`)
})
