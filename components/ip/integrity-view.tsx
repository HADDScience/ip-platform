"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ip/page-header"
import { PriorityBadge, StatusBadge } from "@/components/ip/status-badge"
import { useData } from "@/components/ip/data-provider"
import { useAuth } from "@/components/ip/auth-gate"
import { addFlag, setFlagState } from "@/lib/db"
import { trademarkLabel } from "@/lib/data"
import {
  FLAG_STATE_LABEL,
  type FlagState,
  type IntegrityFlagRow,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const STATE_TONE: Record<FlagState, string> = {
  open: "bg-red-500/12 text-red-700 dark:bg-red-400/15 dark:text-red-300",
  resolved:
    "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  dismissed: "bg-muted text-muted-foreground",
}

export function IntegrityView() {
  const { flags, trademarks, patents, actions, refresh } = useData()
  const { canWrite } = useAuth()
  const [showResolved, setShowResolved] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [resolutionDraft, setResolutionDraft] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [newMessage, setNewMessage] = useState("")

  const visible = useMemo(
    () => flags.filter((f) => (showResolved ? true : f.state === "open")),
    [flags, showResolved]
  )
  const openCount = flags.filter((f) => f.state === "open").length

  /** 같은 출원번호를 공유하는 특허 (PT-03 / PT-07 같은 중복 의심) */
  const duplicates = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const p of patents) {
      if (!p.appNo) continue
      map.set(p.appNo, [...(map.get(p.appNo) ?? []), p.id])
    }
    return [...map.entries()].filter(([, ids]) => ids.length > 1)
  }, [patents])

  const relatedActions = actions.filter(
    (a) =>
      a.state === "open" &&
      (a.subject.includes("정합성") || a.subject.includes("동기화"))
  )

  function labelFor(f: IntegrityFlagRow): string {
    if (!f.entityId) return "전체"
    if (f.entityKind === "trademark") {
      const t = trademarks.find((x) => x.id === f.entityId)
      return t ? trademarkLabel(t) : f.entityId
    }
    if (f.entityKind === "patent") {
      const p = patents.find((x) => x.id === f.entityId)
      return p ? p.title : f.entityId
    }
    return f.entityId
  }

  function statusFor(f: IntegrityFlagRow): string | null {
    if (f.entityKind === "trademark")
      return trademarks.find((x) => x.id === f.entityId)?.status ?? null
    if (f.entityKind === "patent")
      return patents.find((x) => x.id === f.entityId)?.status ?? null
    return null
  }

  async function resolve(f: IntegrityFlagRow, state: FlagState) {
    setBusy(f.id)
    try {
      await setFlagState(f.id, state, resolutionDraft[f.id]?.trim() || null)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="정합성 경고"
        description="사실관계를 확인해야 하는 항목입니다. 처리하면 해결 내용과 함께 기록으로 남습니다."
        action={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowResolved((v) => !v)}>
              {showResolved ? "미해결만 보기" : "해결된 항목도 보기"}
            </Button>
            {canWrite ? (
              <Button size="sm" onClick={() => setAdding((v) => !v)}>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                항목 추가
              </Button>
            ) : null}
          </>
        }
      />

      <Card className={openCount > 0 ? "ring-red-500/25" : "ring-emerald-500/25"}>
        <CardContent className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className={cn(
              "size-4 shrink-0",
              openCount > 0
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400"
            )}
          />
          <span className="font-medium">
            {openCount > 0
              ? `확인 필요 ${openCount}건`
              : "확인이 필요한 항목이 없습니다"}
          </span>
          <span className="text-muted-foreground">
            전체 {flags.length}건 중 해결{" "}
            {flags.filter((f) => f.state === "resolved").length} · 해당 없음{" "}
            {flags.filter((f) => f.state === "dismissed").length}
          </span>
        </CardContent>
      </Card>

      {adding ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="확인이 필요한 내용을 적어주세요"
              className="h-8 flex-1 text-xs"
            />
            <Button
              size="sm"
              disabled={!newMessage.trim()}
              onClick={async () => {
                await addFlag("general", null, newMessage.trim())
                setNewMessage("")
                setAdding(false)
                await refresh()
              }}
            >
              추가
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              취소
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        {visible.length === 0 ? (
          <div className="py-14 text-center text-muted-foreground ring-1 ring-foreground/10">
            표시할 항목이 없습니다.
          </div>
        ) : null}

        {visible.map((f) => {
          const status = statusFor(f)
          return (
            <Card key={f.id} className={cn(f.state !== "open" && "opacity-75")}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {f.entityKind === "trademark"
                      ? "상표"
                      : f.entityKind === "patent"
                        ? "특허"
                        : f.entityKind === "action"
                          ? "액션"
                          : "일반"}
                  </Badge>
                  {f.entityId ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {f.entityId}
                    </span>
                  ) : null}
                  <span className="font-medium">{labelFor(f)}</span>
                  <Badge className={cn("ml-auto font-medium", STATE_TONE[f.state])}>
                    {FLAG_STATE_LABEL[f.state]}
                  </Badge>
                  {status ? <StatusBadge status={status} /> : null}
                </div>

                <p className="whitespace-pre-wrap text-muted-foreground">
                  ※ {f.message}
                </p>

                {f.resolution ? (
                  <div className="border-l-2 border-emerald-500/40 pl-2 text-[11px] text-muted-foreground">
                    처리: {f.resolution}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {f.entityKind === "trademark" || f.entityKind === "patent" ? (
                    <Link
                      href={f.entityKind === "trademark" ? "/trademarks" : "/patents"}
                      className="text-primary hover:underline"
                    >
                      해당 건 열기 →
                    </Link>
                  ) : null}

                  {canWrite && f.state === "open" ? (
                    <>
                      <Input
                        value={resolutionDraft[f.id] ?? ""}
                        onChange={(e) =>
                          setResolutionDraft((d) => ({ ...d, [f.id]: e.target.value }))
                        }
                        placeholder="어떻게 확인/정정했는지"
                        className="h-7 w-64 text-xs"
                      />
                      <Button
                        size="xs"
                        disabled={busy === f.id}
                        onClick={() => void resolve(f, "resolved")}
                      >
                        해결 처리
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={busy === f.id}
                        onClick={() => void resolve(f, "dismissed")}
                      >
                        해당 없음
                      </Button>
                    </>
                  ) : null}

                  {canWrite && f.state !== "open" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy === f.id}
                      onClick={() => void resolve(f, "open")}
                    >
                      다시 확인 필요로
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {duplicates.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>출원번호 중복 감지</CardTitle>
            <CardDescription>
              동일한 출원번호가 둘 이상의 건에 기재돼 있습니다. 통합 여부를 확정해야 합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {duplicates.map(([appNo, ids]) => (
              <div key={appNo} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{appNo}</span>
                <span className="text-muted-foreground">→</span>
                {ids.map((id) => (
                  <Badge key={id} variant="outline">{id}</Badge>
                ))}
                <span className="text-muted-foreground">
                  {ids
                    .map((id) => patents.find((p) => p.id === id)?.status)
                    .filter(Boolean)
                    .join(" / ")}
                </span>
                <Link href="/patents" className="text-primary hover:underline">
                  정리하기 →
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {relatedActions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>연결된 미결 액션</CardTitle>
            <CardDescription>위 확인 사항을 처리하는 액션 항목입니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/60">
            {relatedActions.map((a) => (
              <div key={a.id} className="flex gap-3 py-2.5 first:pt-0">
                <PriorityBadge priority={a.priority} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{a.id}</span>
                    <span className="font-medium">{a.subject}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{a.todo}</p>
                </div>
              </div>
            ))}
            <Link href="/actions" className="pt-2.5 text-primary hover:underline">
              미결 액션 전체 보기 →
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
