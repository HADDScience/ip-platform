"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/ip/auth-gate"
import { useQueryParam } from "@/hooks/use-search-string"
import { supabase } from "@/lib/supabase"

/**
 * AI 도구 접근 승인.
 *
 * ChatGPT 처럼 정적 토큰을 못 보내는 클라이언트는 OAuth 로 붙는다. 그 흐름의
 * "사람 확인" 자리가 이 화면이다.
 *
 * 로그인 화면을 새로 만들지 않는다 — 여기까지 왔다는 것은 이미 허브 세션으로
 * 통과했다는 뜻이고(AuthGate), 승인은 그 세션의 토큰으로 증명한다. 서버는 그
 * 토큰으로 사람을 확인하고 인가 코드를 내준다.
 */

const MCP_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/ip-mcp`

export function AuthorizeView() {
  const { member } = useAuth()
  const reqId = useQueryParam("req", "")

  const [clientName, setClientName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    const url = reqId
      ? `${MCP_BASE}/request?req=${encodeURIComponent(reqId)}`
      : null

    if (!url) {
      // 효과 본문에서 곧바로 setState 하지 않는다(렌더 연쇄 방지).
      Promise.resolve().then(() => {
        if (!cancelled) {
          setError("요청 정보가 없습니다. 도구에서 다시 연결을 시작해 주세요.")
        }
      })
      return () => {
        cancelled = true
      }
    }

    fetch(url)
      .then((r) => r.json())
      .then((d: { clientName?: string; error?: string }) => {
        if (cancelled) return
        if (d.error) setError(d.error)
        else setClientName(d.clientName ?? "알 수 없는 도구")
      })
      .catch(() => {
        if (!cancelled) setError("요청을 확인하지 못했습니다.")
      })
    return () => {
      cancelled = true
    }
  }, [reqId])

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const jwt = data.session?.access_token
      if (!jwt) {
        setError("세션이 만료되었습니다. 새로고침한 뒤 다시 시도해 주세요.")
        return
      }

      const res = await fetch(`${MCP_BASE}/approve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ req: reqId }),
      })
      const body = (await res.json()) as { redirect?: string; error?: string }
      if (!res.ok || !body.redirect) {
        setError(body.error ?? "승인하지 못했습니다.")
        return
      }
      setDone(true)
      // 도구로 되돌려보낸다. 여기서부터는 도구가 토큰을 받아 간다.
      window.location.replace(body.redirect)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-1 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          HADD SCIENCE
        </div>
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          AI 도구 접근 승인
        </h1>

        {error ? (
          <p className="mt-3 text-xs/relaxed text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : done ? (
          <p className="mt-3 text-xs/relaxed text-muted-foreground">
            승인했습니다. 도구로 돌아가는 중…
          </p>
        ) : clientName === null ? (
          <p className="mt-3 text-xs/relaxed text-muted-foreground">확인 중…</p>
        ) : (
          <>
            <p className="mt-3 text-xs/relaxed text-muted-foreground">
              <b className="text-foreground">{clientName}</b> 이(가) 지식재산권
              기록에 접근하려 합니다. 승인하면 그 도구는{" "}
              <b className="text-foreground">
                {member.displayName ?? member.email}
              </b>{" "}
              님의 권한으로 IP 목록과 진행 기록을 읽고 씁니다.
            </p>
            <p className="mt-2 text-[11px]/relaxed text-muted-foreground">
              시작한 적 없는 요청이라면 승인하지 마세요. 승인 뒤에도 「AI 도구
              설치하기」에서 언제든 끊을 수 있습니다.
            </p>

            <div className="mt-4 flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void approve()}>
                {busy ? "승인 중…" : "승인"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => window.close()}
              >
                취소
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
