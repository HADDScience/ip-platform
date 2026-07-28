"use client"

import { createClient } from "@supabase/supabase-js"

/**
 * Supabase 브라우저 클라이언트.
 *
 * 세션은 기본적으로 localStorage 의 `sb-<project-ref>-auth-token` 에 저장된다.
 * hub 와 ip-platform 은 같은 오리진(haddscience.github.io)이고 같은 프로젝트를 쓰므로
 * 저장 키가 동일해 세션이 자동으로 공유된다 — 허브에서 로그인하면 여기도 로그인 상태다.
 *
 * anon 키는 브라우저에 노출되는 것이 전제인 공개 키다. 실제 방어는 RLS 가 한다.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다."
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
  // 업무 테이블은 전부 ip 스키마에 있다 (public 은 omnis 용으로 비워둔다).
  db: { schema: "ip" },
})

/** 로그인 후 돌아올 주소. basePath 를 포함해야 한다. */
export function redirectTo(): string {
  if (typeof window === "undefined") return ""
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`
}
