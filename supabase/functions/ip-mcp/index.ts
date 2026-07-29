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

/** 토큰 원문 → 사람. 원문은 저장돼 있지 않으므로 해시로 찾는다. */
async function resolveCaller(request: Request): Promise<Caller | null> {
  const header = request.headers.get("authorization") ?? ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  if (!token.startsWith("hadd_")) return null

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  )
  const hash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  const { data, error } = await db.rpc("resolve_mcp_token", { p_hash: hash })
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
// 도구
// ---------------------------------------------------------------------------

const TOOLS = [
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
    name: "list_todo",
    description:
      "밀린 업무. 건마다 가장 최근 기록을 보고 우리 차례로 남아 있는 것과 상대 회신을 기다리는 것을 알려준다.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_progress",
    description:
      "진행 기록을 남긴다. 이 도구 하나로 대장(단계·번호·날짜)까지 함께 갱신된다 — 대장을 따로 고치지 않는다. 메일을 받았다면 그 내용을 note 에 옮기고 direction 을 '수신'으로 둔다.",
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
          description: "메일을 주고받은 기록이면 방향. 내부 결정이면 비운다.",
        },
        counterpart: { type: "string", description: "상대. 예: 특허법인 이름" },
        nextTurn: {
          type: "string",
          enum: ["us", "firm", "none"],
          description:
            "공이 누구에게 있는지. us=회신 필요, firm=상대 회신 대기, none=대기 없음",
        },
        dueOn: { type: "string", description: "기한 YYYY-MM-DD" },
        appNo: { type: "string", description: "출원번호" },
        regNo: { type: "string", description: "등록번호" },
        probability: { type: "number", description: "등록가능성 %" },
        note: { type: "string", description: "메모. 메일 본문 요약을 넣는다." },
      },
      required: ["date", "entityKind", "entityId", "stage", "nextTurn"],
    },
  },
] as const

type ToolResult = { text: string } | { error: string }

async function runTool(
  name: string,
  args: Record<string, unknown>,
  caller: Caller
): Promise<ToolResult> {
  if (name === "list_stages") {
    const { data, error } = await db
      .from("status_options")
      .select("value, sort_order, is_open, wants_app_no, wants_reg_no, wants_probability, wants_due")
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
      let q = db.from("trademarks").select("id, name, status, app_no, reg_no, ref_date, holder")
      if (query) q = q.or(`name.ilike.%${query}%,app_no.ilike.%${query}%,reg_no.ilike.%${query}%`)
      const { data, error } = await q.order("id")
      if (error) return { error: error.message }
      out.push(...(data ?? []).map((r) => ({ kind: "trademark", ...r })))
    }
    if (kind !== "trademark") {
      let q = db.from("patents").select("id, title, status, app_no, reg_no, ref_date, applicant")
      if (query) q = q.or(`title.ilike.%${query}%,app_no.ilike.%${query}%,reg_no.ilike.%${query}%`)
      const { data, error } = await q.order("id")
      if (error) return { error: error.message }
      out.push(...(data ?? []).map((r) => ({ kind: "patent", ...r })))
    }
    return { text: JSON.stringify(out, null, 2) }
  }

  if (name === "list_todo") {
    const { data, error } = await db
      .from("progress_entries")
      .select("id, occurred_on, entity_kind, entity_id, stage, next_turn, due_on, counterpart, note")
      .order("occurred_on", { ascending: false })
    if (error) return { error: error.message }

    // 건마다 가장 최근 기록만 본다. 옛 기록의 「우리 차례」는 이미 지나간 상태다.
    const latest = new Map<string, (typeof data)[number]>()
    for (const row of data ?? []) {
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
    const { data: found, error: findError } = await db
      .from(table)
      .select("id")
      .eq("id", args.entityId)
      .maybeSingle()
    if (findError) return { error: findError.message }
    if (!found) {
      return {
        error: `${args.entityId} 는 대장에 없습니다. list_ip 로 ID 를 먼저 확인하세요.`,
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

    const { error } = await db.from("progress_entries").insert({
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
      // 사람이 화면에서 넣은 것과 구분한다. 나중에 되짚을 때 출처가 보여야 한다.
      source: "mail",
      raw: null,
    })
    if (error) return { error: error.message }

    return {
      text: `기록했습니다. ${args.entityId} · ${args.stage} · ${args.date} (${caller.displayName ?? caller.email})`,
    }
  }

  return { error: `모르는 도구입니다: ${name}` }
}

// ---------------------------------------------------------------------------
// JSON-RPC
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

function reply(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "content-type": "application/json", ...CORS },
  })
}

function fail(id: unknown, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    headers: { "content-type": "application/json", ...CORS },
  })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS })
  }

  // 커넥터가 살아 있는지 볼 때 GET 을 던지는 클라이언트가 있다.
  if (request.method === "GET") {
    return new Response(JSON.stringify({ ...SERVER_INFO, transport: "streamable-http" }), {
      headers: { "content-type": "application/json", ...CORS },
    })
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS })
  }

  let message: { id?: unknown; method?: string; params?: Record<string, unknown> }
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
          "www-authenticate": 'Bearer realm="hadd-ip"',
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
