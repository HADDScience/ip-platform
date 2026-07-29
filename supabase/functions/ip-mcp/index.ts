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
      return { error: `${id} 는 대장에 없습니다. list_ip 로 ID 를 먼저 확인하세요.` }
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
        "occurred_on, stage, direction, counterpart, next_turn, due_on, app_no, reg_no, name, holder, probability, note, source"
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
                설명:
                  "우리가 이 상태를 이어받은 시점입니다. 그날 무슨 일이 있었다는 뜻이 아닙니다.",
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
      .select("id, occurred_on, entity_kind, entity_id, stage, next_turn, due_on, counterpart, note, source")
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
      { error: "invalid_redirect_uri", error_description: "redirect_uris 가 필요합니다." },
      400
    )
  }

  const clientId = `mcp_${randomToken(16)}`
  const { error } = await db.from("oauth_clients").insert({
    client_id: clientId,
    client_name: body.client_name ?? "",
    redirect_uris: uris,
  })
  if (error) return json({ error: "server_error", error_description: error.message }, 500)

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
  if (!client) return new Response("알 수 없는 client_id 입니다.", { status: 400 })
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
  const jwt = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
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
    return json({ error: "요청이 만료되었습니다. 처음부터 다시 시도하세요." }, 400)
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
    if (error) return json({ error: "server_error", error_description: error.message }, 500)
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
      return json({ error: "invalid_grant", error_description: "코드가 만료되었습니다." }, 400)
    }
    if (form.get("redirect_uri") !== row.redirect_uri) {
      return json({ error: "invalid_grant", error_description: "redirect_uri 가 다릅니다." }, 400)
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
      return json({ error: "invalid_grant", error_description: "PKCE 검증에 실패했습니다." }, 400)
    }

    // 코드는 한 번만. 재사용은 탈취 신호다.
    await db.from("oauth_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", row.code_hash)
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
    await db.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", row.id)
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
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    headers: { "content-type": "application/json", ...CORS },
  })
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
