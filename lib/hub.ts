"use client"

/**
 * 로그인 화면은 허브(`/hub`) 하나로 통일한다.
 *
 * 이 앱에는 자체 로그인 화면을 두지 않는다. 로그아웃 상태로 들어오면 허브의
 * 로그인 화면으로 보내고, 돌아올 자리를 `?next=` 로 함께 넘긴다. 허브는 로그인이
 * 끝나면 그 경로로 되돌려보낸다.
 *
 * 성립 근거는 **같은 오리진**이다. 허브와 이 앱은 둘 다 haddscience.github.io 에
 * 있고 같은 Supabase 프로젝트를 쓰므로 세션이 localStorage 의
 * `sb-<project-ref>-auth-token` 하나를 공유한다. 그래서 허브에서 로그인한 결과가
 * 토큰을 따로 넘기지 않아도 이 앱에 그대로 보인다. 오리진이 달라지면 이 전제가
 * 깨져 로그인해도 여기서는 여전히 로그아웃으로 보이고 왕복만 반복하게 된다.
 */

/** 허브의 basePath. 허브 저장소의 next.config.ts 와 같아야 한다. */
const HUB_BASE_PATH = "/hub"

/** 허브에 한 번 다녀왔는지 표시하는 키. 무한 왕복을 막는 데만 쓴다. */
const TRIED_KEY = "hadd.hub-login-tried"

/**
 * 허브 로그인 화면 주소. 허브를 쓸 수 없는 환경이면 null.
 *
 * 로컬 개발에서는 같은 오리진의 `/hub` 가 존재하지 않는다(404). 허브를 따로
 * 띄우더라도 포트가 다르면 오리진이 달라 세션이 공유되지 않는다. 그래서
 * localhost 에서는 허브로 보내지 않고 개발용 로그인 버튼으로 폴백한다.
 */
export function hubUrl(): string | null {
  if (typeof window === "undefined") return null
  const { origin, hostname } = window.location
  if (hostname === "localhost" || hostname === "127.0.0.1") return null
  return `${origin}${HUB_BASE_PATH}`
}

/** 로그인 뒤 돌아올 현재 위치. 오리진을 뺀 경로만 넘긴다. */
function currentPath(): string {
  const { pathname, search, hash } = window.location
  return `${pathname}${search}${hash}`
}

/** 허브 로그인 화면으로 이동한다. 히스토리에 남기지 않아 뒤로가기가 꼬이지 않는다. */
export function goToHubLogin(): void {
  const hub = hubUrl()
  if (!hub) return
  window.location.replace(`${hub}/?next=${encodeURIComponent(currentPath())}`)
}

/**
 * 허브에 다녀왔는데도 세션이 없으면 다시 보내지 않는다.
 * 그대로 두면 허브와 이 앱 사이를 무한히 오간다.
 */
export function hasTriedHubLogin(): boolean {
  try {
    return window.sessionStorage.getItem(TRIED_KEY) === "1"
  } catch {
    // 시크릿 모드 등 sessionStorage 가 막힌 환경. 왕복 방지를 포기하는 대신
    // 허브로 보내는 것 자체는 막지 않는다.
    return false
  }
}

export function markHubLoginTried(): void {
  try {
    window.sessionStorage.setItem(TRIED_KEY, "1")
  } catch {
    /* 무시 — 위 주석 참고 */
  }
}

export function clearHubLoginTried(): void {
  try {
    window.sessionStorage.removeItem(TRIED_KEY)
  } catch {
    /* 무시 */
  }
}
