"use client"

import { useCallback, useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/date"
import {
  issueMcpToken,
  listMcpTokens,
  revokeMcpToken,
  type McpToken,
} from "@/lib/db"

/**
 * MCP 개인 토큰 발급·폐기.
 *
 * 토큰은 사람이 아니라 "도구 한 대"에 대응한다. 노트북과 회사 PC 에 각각 발급해
 * 두면, 한 대를 잃어버렸을 때 그것만 끄면 된다.
 *
 * 원문은 발급 순간 딱 한 번만 보여준다. DB 에는 해시만 남기기 때문에 다시 보여줄
 * 방법이 없다 — 그래서 화면에서도 그 사실을 분명히 적는다.
 */
export function McpTokenPanel({
  onToken,
}: {
  /** 방금 발급한 원문. 설치 커맨드에 끼워 넣을 수 있게 위로 올린다. */
  onToken: (token: string | null) => void
}) {
  const [tokens, setTokens] = useState<McpToken[] | null>(null)
  const [name, setName] = useState("")
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 목록 새로고침은 이 값을 올려 걸어 준다. 효과 본문에서 곧바로 setState 하지
  // 않아야 렌더가 연쇄되지 않는다.
  const [round, setRound] = useState(0)
  const reload = useCallback(() => setRound((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    listMcpTokens()
      .then((rows) => {
        if (!cancelled) setTokens(rows)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [round])

  async function issue() {
    setBusy(true)
    setError(null)
    try {
      const raw = await issueMcpToken(name)
      setFresh(raw)
      onToken(raw)
      setName("")
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    setBusy(true)
    setError(null)
    try {
      await revokeMcpToken(id)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function copyFresh() {
    if (!fresh) return
    try {
      await navigator.clipboard.writeText(fresh)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // 클립보드가 막힌 환경. 값은 화면에 그대로 보이니 손으로 복사한다.
    }
  }

  return (
    <div className="border-b border-border/60 px-4 pb-3">
      {fresh ? (
        <div className="bg-amber-500/10 p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-3.5" />
            이 값은 지금만 보입니다. 창을 닫으면 다시 볼 수 없습니다.
          </div>
          <div className="mt-1.5 flex items-stretch gap-1">
            <code className="min-w-0 flex-1 overflow-x-auto bg-background px-2 py-1.5 text-[10.5px] whitespace-nowrap">
              {fresh}
            </code>
            <button
              type="button"
              onClick={() => void copyFresh()}
              className="flex shrink-0 items-center gap-1 px-2 text-[10.5px] font-medium text-muted-foreground ring-1 ring-foreground/15 transition-colors hover:text-foreground"
            >
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">
            아래 탭의 커맨드에는 이 토큰이 이미 들어가 있습니다.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="어디에 쓸 토큰인가요 (예: 회사 노트북)"
            className="h-7 min-w-0 flex-1 text-[11px]"
          />
          <Button size="xs" disabled={busy} onClick={() => void issue()}>
            {busy ? "발급 중…" : "토큰 발급"}
          </Button>
        </div>
      )}

      {error ? (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {tokens && tokens.length > 0 ? (
        <div className="mt-2 flex flex-col divide-y divide-border/60">
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-x-2 py-1.5 text-[11px]"
            >
              <span className="font-medium">{t.name}</span>
              <code className="text-[10.5px] text-muted-foreground">
                {t.prefix}…
              </code>
              <span className="text-muted-foreground">
                {t.lastUsedAt
                  ? `마지막 사용 ${formatDate(t.lastUsedAt.slice(0, 10))}`
                  : "아직 쓰이지 않음"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void revoke(t.id)}
                className="ml-auto shrink-0 px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-red-600 dark:hover:text-red-400"
              >
                폐기
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {tokens && tokens.length === 0 && !fresh ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          아직 발급한 토큰이 없습니다. 토큰이 있어야 AI 도구가 우리 기록을 읽고 쓸
          수 있습니다.
        </p>
      ) : null}
    </div>
  )
}
