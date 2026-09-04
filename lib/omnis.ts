"use client"

/**
 * Omnis 를 발급자로 삼는 로그인과, Omnis API 를 부르는 통로.
 *
 * 예전에는 Supabase 가 인증과 데이터베이스를 겸했다. 사내 로그인을 Omnis 자체계정
 * 하나로 모으면서 그 구조가 무너졌다 — RLS 가 전부 `auth.uid()` 를 보고 있어서,
 * Supabase Auth 를 떼면 아무도 자기 자료를 읽지 못한다. Supabase 의 서드파티
 * 인증은 Clerk·Firebase·Auth0·Cognito·WorkOS 로 한정돼 Omnis 를 끼워 넣을 수도
 * 없었다. 그래서 자료를 Omnis 쪽 DB 로 옮기고, 이 앱은 Omnis API 를 부른다.
 *
 * 이 앱은 정적 배포라 비밀키를 들 수 없고 다른 오리진이라 쿠키도 못 쓴다.
 * 그래서 SSO 세션 토큰을 localStorage 에 두고 Authorization 헤더로 보낸다.
 *
 * 로그인 화면으로는 허브가 아니라 **Omnis 로 바로 간다.** 예전에 허브를 거친 것은
 * 허브만이 Supabase 세션을 가진 오리진이었기 때문인데, 이제 로그인 화면은 Omnis
 * 하나이므로 중간에 한 번 더 들를 이유가 없다.
 */

const OMNIS_ORIGIN = process.env.NEXT_PUBLIC_OMNIS_URL ?? "https://omnis-hadd.vercel.app"

/** Omnis 의 앱 화이트리스트(lib/sso.ts)에 등록된 id. 토큰의 audience 이기도 하다. */
const APP_ID = process.env.NEXT_PUBLIC_SSO_APP_ID ?? "ip-platform"

/** next.config.ts 의 basePath 와 같아야 한다. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

/**
 * 세션 저장 키에 앱 id 를 넣는다.
 *
 * 허브와 이 앱은 같은 오리진이라 localStorage 를 통째로 나눠 쓴다. 그런데 Omnis 가
 * 주는 토큰은 audience 가 앱별로 다르다 — 허브 토큰은 여기서 검증에 실패한다.
 * 한 칸에 같이 넣으면 서로 덮어써서 둘 다 로그인이 풀린다.
 */
const STORAGE_KEY = `hadd.sso.session.${APP_ID}`

export interface OmnisUser {
  id: string
  name: string
  email: string | null
  role: string
}

export interface OmnisSession {
  token: string
  /** epoch ms */
  expiresAt: number
  user: OmnisUser
}

// ─── 로그인 ─────────────────────────────────────────────────────────

/**
 * 이 탭에서 로그인 왕복을 이미 한 번 시도했는가.
 *
 * 세션이 없을 때 화면은 사용자를 곧바로 발급자로 보낸다 — 이미 로그인돼 있으면
 * 그 왕복이 눈에 보이지 않기 때문이다. 그런데 왕복이 표 없이 돌아오는 경우가 있다
 * (쿠키 차단, 저장 실패, 발급자 쪽 거절). 그때 표시를 남기지 않으면 브라우저가
 * 발급자와 무한히 오간다. 그래서 나갈 때 표시하고, 표를 받아 세션을 만들면 지운다.
 *
 * 탭 단위(sessionStorage)인 것이 요점이다. Omnis 사이드바에서 새 탭으로 열면
 * 그 탭은 처음이므로 자동 진입이 다시 한 번 시도된다.
 */
const ATTEMPT_KEY = `hadd.sso.attempt.${APP_ID}`

export function hasTriedSignIn(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.sessionStorage.getItem(ATTEMPT_KEY) === "1"
  } catch {
    // sessionStorage 를 못 읽으면 자동 진입을 포기한다. 무한 왕복보다 낫다.
    return true
  }
}

export function markSignInAttempt(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, "1")
  } catch {
    /* 못 쓰면 hasTriedSignIn 이 true 를 돌려주므로 자동 진입이 멈춘다 */
  }
}

export function clearSignInAttempt(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(ATTEMPT_KEY)
  } catch {
    /* 다음 탭에서 풀린다 */
  }
}

/**
 * 발급자의 로그인 화면으로 보낸다. 돌아올 자리는 이 앱 안쪽 경로만 넘긴다.
 *
 * 나가기 전에 시도를 표시한다 — 돌아왔는데 표가 없으면 자동 진입을 멈추고
 * 화면을 보여주기 위해서다.
 */
export function startSignIn(returnPath?: string): void {
  if (typeof window === "undefined") return
  markSignInAttempt()
  const path = returnPath ?? `${BASE_PATH}${window.location.pathname.replace(BASE_PATH, "") || "/"}`
  const url = new URL("/sso/authorize", OMNIS_ORIGIN)
  url.searchParams.set("app", APP_ID)
  url.searchParams.set("next", path)
  window.location.assign(url.toString())
}

/**
 * 주소의 `#sso=` 를 꺼내면서 주소창에서 지운다. 세션을 확인하기 전에 부른다.
 *
 * 지우지 않으면 새로고침·북마크·화면 공유에 1회용 표가 그대로 남는다.
 */
export function takeGrantFromHash(): string | null {
  if (typeof window === "undefined") return null
  const hash = window.location.hash
  if (!hash.startsWith("#")) return null

  const params = new URLSearchParams(hash.slice(1))
  const grant = params.get("sso")
  if (!grant) return null

  params.delete("sso")
  const rest = params.toString()
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`
  )
  return grant
}

export class OmnisError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

function messageFor(code: string): string {
  switch (code) {
    case "grant_already_used":
      return "이미 사용된 로그인 링크입니다. 다시 로그인해 주세요."
    case "invalid_grant":
      return "로그인 링크가 만료되었습니다. 다시 로그인해 주세요."
    case "account_inactive":
      return "이 계정은 비활성 상태입니다. 관리자에게 문의해 주세요."
    case "not_a_member":
      return "지식재산권 자료에 접근할 수 있는 계정이 아닙니다. 담당자에게 권한을 요청하세요."
    case "read_only":
      return "읽기 전용 권한입니다."
    case "origin_not_allowed":
    case "unknown_app":
      return "이 주소는 인증 서버에 등록돼 있지 않습니다. 관리자에게 알려주세요."
    default:
      return "요청을 처리하지 못했습니다. 다시 시도해 주세요."
  }
}

/** 1회용 표를 8시간짜리 세션으로 바꾼다. */
export async function redeemGrant(grant: string): Promise<OmnisSession> {
  const res = await fetch(`${OMNIS_ORIGIN}/api/sso/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: grant, app: APP_ID }),
  }).catch(() => null)

  if (!res) throw new OmnisError("network", "인증 서버에 연결하지 못했습니다.")
  const body = (await res.json().catch(() => null)) as
    | { token?: string; expiresAt?: number; user?: OmnisUser; error?: string }
    | null

  if (!res.ok || !body?.token || !body.user || !body.expiresAt) {
    const code = body?.error ?? "unknown"
    throw new OmnisError(code, messageFor(code))
  }
  return { token: body.token, expiresAt: body.expiresAt, user: body.user }
}

// ─── 저장 ───────────────────────────────────────────────────────────

export function readSession(): OmnisSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OmnisSession>
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      !parsed.user?.id
    ) {
      return null
    }
    return parsed as OmnisSession
  } catch {
    return null
  }
}

export function storeSession(session: OmnisSession): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* 시크릿 모드 등 — 이번 방문은 쓸 수 있고 새로고침하면 다시 로그인한다 */
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 지울 수 없으면 만료를 기다린다 */
  }
}

// ─── API 통로 ───────────────────────────────────────────────────────

/**
 * Omnis 지식재산권 API 한 번.
 *
 * 401/403 이면 세션을 지우고 로그인으로 돌려보낸다. 자료를 못 읽는 채로 화면만
 * 그리면 사용자는 "비어 있다"고 읽는다 — 비어 있는 것과 못 읽는 것은 다르다.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const session = readSession()
  if (!session) throw new OmnisError("no_session", "로그인이 필요합니다.")

  const res = await fetch(`${OMNIS_ORIGIN}/api/ip${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.token}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }).catch(() => null)

  if (!res) throw new OmnisError("network", "인증 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.")

  if (res.status === 401) {
    clearSession()
    throw new OmnisError("unauthorized", "로그인이 만료되었습니다. 다시 로그인해 주세요.")
  }

  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok) {
    const code = body?.error ?? "unknown"
    throw new OmnisError(code, messageFor(code))
  }
  return body as T
}

/**
 * MCP 서버 주소. 「AI 연결하기」 안내가 이 값을 그대로 보여준다.
 *
 * 화면이 주소를 따로 조립하지 않게 여기서 낸다 — 예전에 그렇게 뒀다가,
 * Supabase 를 걷어내며 환경변수 하나가 사라지자 안내문이 조용히 반쪽짜리
 * 경로(`/functions/v1/ip-mcp`)를 보여줬다. 사람은 화면에 적힌 것을 그대로
 * 복사하므로, 틀린 주소를 보여주는 것은 주소가 없는 것보다 나쁘다.
 */
export function omnisMcpUrl(): string {
  return `${OMNIS_ORIGIN}/api/ip-mcp`
}

/** 계정 설정 — 비밀번호·소셜 연결은 저기서 관리한다. */
export function omnisSettingsUrl(): string {
  return `${OMNIS_ORIGIN}/settings`
}
