"use client"

import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/date"
import { currentMcpToken, reissueMcpToken, type McpToken } from "@/lib/db"

/**
 * MCP 토큰 — 한 사람에 하나.
 *
 * 여러 개를 두지 않는 이유: 토큰은 권한을 담지 않아 어느 것이든 그 사람의 역할
 * 그대로다. 하나가 새면 전부 샌 것과 같아서 나눠 둘 실익이 없다. 그래서 발급·폐기
 * 대신 **재발급** 하나만 둔다 — 새로 받으면 쓰던 것이 즉시 죽는다.
 *
 * 값을 따로 보여주지 않는 이유: 발급 직후에는 아래 탭의 커맨드에 실제 토큰이
 * 그대로 들어간다. 같은 값을 두 군데 늘어놓을 이유가 없다.
 */
export function McpTokenPanel({
  onToken,
}: {
  /** 방금 발급한 원문. 설치 커맨드에 끼워 넣을 수 있게 위로 올린다. */
  onToken: (token: string | null) => void
}) {
  const [token, setToken] = useState<McpToken | null | undefined>(undefined)
  const [fresh, setFresh] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let cancelled = false
    currentMcpToken()
      .then((t) => {
        if (!cancelled) setToken(t)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [round])

  async function reissue() {
    setBusy(true)
    setError(null)
    try {
      onToken(await reissueMcpToken())
      setFresh(true)
      setRound((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-border/60 px-4 pb-3">
      {fresh ? (
        <div className="flex items-start gap-1.5 bg-amber-500/10 p-2.5 text-[11px]/relaxed text-amber-700 dark:text-amber-300">
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span>
            새 토큰이 아래 커맨드에 들어가 있습니다.{" "}
            <b>이 창을 닫으면 다시 볼 수 없습니다</b> — 지금 복사해 두세요. 쓰던
            토큰은 방금 죽었으니 붙여 두었던 도구도 다시 설정해야 합니다.
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] text-muted-foreground">
            {token === undefined
              ? "확인 중…"
              : token === null
                ? "토큰이 없습니다. 발급해야 AI 도구가 우리 기록을 읽고 쓸 수 있습니다."
                : `발급됨 · ${token.prefix}… · ${
                    token.lastUsedAt
                      ? `마지막 사용 ${formatDate(token.lastUsedAt.slice(0, 10))}`
                      : "아직 쓰이지 않음"
                  }`}
          </span>
          <Button
            size="xs"
            variant={token ? "outline" : "default"}
            disabled={busy || token === undefined}
            className="ml-auto"
            onClick={() => void reissue()}
          >
            {busy ? "발급 중…" : token ? "재발급" : "토큰 발급"}
          </Button>
        </div>
      )}

      {error ? (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
