"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ip/status-badge"
import { formatDate } from "@/lib/date"
import { correctRecord, type Correction } from "@/lib/db"
import { NEXT_TURN_LABEL, type ProgressEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * 값 정정 — 대장을 직접 찌르지 않는다.
 *
 * 고치면 진행 기록 한 줄이 생기고, 대장은 그 기록의 결과로 바뀐다. 그래서
 * 무엇이 언제 왜 바뀌었는지가 이력에 남는다. 단계는 건드리지 않는다 — 정정은
 * 일이 진행된 것이 아니기 때문이다.
 */
export function CorrectionForm({
  entityKind,
  entityId,
  stage,
  today,
  current,
  onSaved,
}: {
  entityKind: "trademark" | "patent"
  entityId: string
  stage: string
  today: string
  current: {
    name: string
    holder: string | null
    appNo: string | null
    regNo: string | null
  }
  onSaved: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Correction>({})
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameLabel = entityKind === "trademark" ? "이름" : "명칭"
  const holderLabel = entityKind === "trademark" ? "보유자" : "출원인"

  if (!open) {
    return (
      <Button
        size="xs"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        값 고치기
      </Button>
    )
  }

  const fields: { key: keyof Correction; label: string; now: string | null }[] =
    [
      { key: "name", label: nameLabel, now: current.name },
      { key: "holder", label: holderLabel, now: current.holder },
      { key: "appNo", label: "출원번호", now: current.appNo },
      { key: "regNo", label: "등록번호", now: current.regNo },
    ]

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col gap-2 border border-border/60 p-2.5"
    >
      <p className="text-[11px] text-muted-foreground">
        고친 내용은 <b>진행 기록 한 줄</b>로 남습니다. 비워 두면 바뀌지
        않습니다.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="mb-0.5 block text-[10.5px] text-muted-foreground">
              {f.label}
            </label>
            <Input
              value={draft[f.key] ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [f.key]: e.target.value }))
              }
              placeholder={f.now ?? "(비어 있음)"}
              className="h-7 text-[11px]"
            />
          </div>
        ))}
      </div>

      <div>
        <label className="mb-0.5 block text-[10.5px] text-muted-foreground">
          왜 고치는지
        </label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 오타 정정"
          className="h-7 text-[11px]"
        />
      </div>

      {error ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="flex gap-1.5">
        <Button
          size="xs"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await correctRecord(
                entityKind,
                entityId,
                stage,
                today,
                draft,
                reason
              )
              await onSaved()
              setOpen(false)
              setDraft({})
              setReason("")
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? "저장 중…" : "저장"}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          취소
        </Button>
      </div>
    </div>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "직접 입력",
  mail: "메일",
  excel: "엑셀 인수",
  edit: "값 정정",
}

/**
 * 진행 이력 — 기록 한 줄에 담긴 것을 전부 보여준다.
 *
 * 요약만 보이면 "무슨 일이 있었는지"를 알 수 없어 결국 DB 를 열어보게 된다.
 * 값이 바뀐 칸은 무엇이 무엇으로 바뀌었는지까지 적는다.
 */
export function ProgressHistory({ entries }: { entries: ProgressEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
        진행 이력 {sorted.length}건
      </div>

      {sorted.length === 0 ? (
        <p className="text-muted-foreground">
          기록이 없습니다. 이 건의 값은 엑셀에서 옮겨온 것이라 그것을 낳은
          기록이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {sorted.map((h) => (
            <li key={h.id} className="flex flex-col gap-1 py-2 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-20 shrink-0 text-muted-foreground tabular-nums">
                  {formatDate(h.date)}
                </span>
                <StatusBadge status={h.stage} />
                {h.direction ? (
                  <Badge className="bg-muted text-muted-foreground">
                    {h.direction}
                  </Badge>
                ) : null}
                {h.counterpart ? (
                  <span className="text-muted-foreground">{h.counterpart}</span>
                ) : null}
                <Badge
                  className={cn(
                    "ml-auto",
                    h.source === "edit"
                      ? "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {SOURCE_LABEL[h.source] ?? h.source}
                </Badge>
              </div>

              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pl-20 text-[11px] text-muted-foreground">
                {h.nextTurn !== "none" ? (
                  <span>다음 차례 · {NEXT_TURN_LABEL[h.nextTurn]}</span>
                ) : null}
                {h.dueOn ? <span>기한 · {formatDate(h.dueOn)}</span> : null}
                {h.name ? <span>이름 → {h.name}</span> : null}
                {h.holder ? <span>보유자 → {h.holder}</span> : null}
                {h.appNo ? <span>출원번호 → {h.appNo}</span> : null}
                {h.regNo ? <span>등록번호 → {h.regNo}</span> : null}
                {h.probability !== null ? (
                  <span>등록가능성 · {h.probability}%</span>
                ) : null}
              </div>

              {h.note ? (
                <p className="pl-20 whitespace-pre-wrap text-foreground">
                  {h.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
