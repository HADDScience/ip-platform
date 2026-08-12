"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatusBadge, StaleDays } from "@/components/ip/status-badge"
import { CorrectionForm } from "@/components/ip/record-detail"
import { MailThread, useMailFor } from "@/components/ip/mail-thread"
import { useData } from "@/components/ip/data-provider"
import { useAuth } from "@/components/ip/auth-gate"
import { useToday } from "@/hooks/use-today"
import { setTurnAndDue } from "@/lib/db"
import { daysBetween, formatDate } from "@/lib/date"
import { NEXT_TURNS, NEXT_TURN_LABEL } from "@/lib/types"
import type { NextTurn, Patent, ProgressEntry, Trademark } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * 밀린 업무 하나를 여는 자리.
 *
 * 「이거 왜 우리 차례지?」에 답하려면 두 가지가 한 화면에 있어야 한다 — 무슨
 * 메일이 오갔는지(왼쪽)와 이 건의 값이 지금 어떤지(오른쪽). 둘을 오가느라
 * 화면을 옮겨 다니면 확인하다 잊는다.
 *
 * 오른쪽에서 고치는 것은 두 갈래다. 차례·기한은 이 기록의 것이라 그 자리에서
 * 바꾸고, 이름·번호 같은 사실은 값 정정으로 새 기록 한 줄을 남긴다.
 */
export function TaskDialog({
  entryId,
  onClose,
}: {
  /** 열려 있는 기록. null 이면 닫힌 상태다. */
  entryId: string | null
  onClose: () => void
}) {
  const { progress } = useData()

  // 저장하면 데이터가 갈리므로 객체를 붙들지 않고 매번 id 로 다시 찾는다.
  const entry = useMemo(
    () => (entryId ? (progress.find((e) => e.id === entryId) ?? null) : null),
    [progress, entryId]
  )

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-w-[64rem]">
        {entry ? <TaskDetail key={entry.id} entry={entry} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function TaskDetail({ entry }: { entry: ProgressEntry }) {
  const today = useToday()
  const { trademarks, patents, stages, refresh } = useData()
  const { canWrite } = useAuth()

  const kind = entry.entityKind
  const isPatent = kind === "patent"
  const trademark: Trademark | undefined = isPatent
    ? undefined
    : trademarks.find((t) => t.id === entry.entityId)
  const patent: Patent | undefined = isPatent
    ? patents.find((p) => p.id === entry.entityId)
    : undefined

  const name = patent?.title ?? trademark?.name ?? entry.entityId
  const holder = patent?.applicant ?? trademark?.holder ?? null
  const status = patent?.status ?? trademark?.status ?? entry.stage
  const row = patent ?? trademark

  const mails = useMailFor(kind, entry.entityId)

  const pipeline = useMemo(
    () =>
      stages
        .filter((s) => s.kind === kind)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => s.value),
    [stages, kind]
  )

  const [turn, setTurn] = useState<NextTurn>(entry.nextTurn)
  const [due, setDue] = useState(entry.dueOn ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    turn !== entry.nextTurn || (due || null) !== (entry.dueOn ?? null)
  const overdue = entry.dueOn !== null && entry.dueOn < today

  async function saveTurn() {
    setBusy(true)
    setError(null)
    try {
      await setTurnAndDue(entry.id, turn, due || null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader className="pr-10">
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {name}
          <StatusBadge status={status} />
        </DialogTitle>
        <DialogDescription>
          왼쪽은 이 건으로 주고받은 메일, 오른쪽은 지금 값입니다.
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:grid md:grid-cols-2 md:divide-x md:divide-border/60 md:overflow-hidden">
        <section className="min-h-0 px-4 pb-4 md:overflow-y-auto">
          <h3 className="sticky top-0 mb-1.5 bg-popover py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            주고받은 메일 {mails.length}건
          </h3>
          <MailThread items={mails} />
        </section>

        <section className="flex min-h-0 flex-col gap-3 border-t border-border/60 px-4 pt-3 pb-4 md:overflow-y-auto md:border-t-0 md:pt-0">
          <div>
            <h3 className="sticky top-0 mb-1.5 bg-popover py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              이 업무
            </h3>
            <dl className="flex flex-col gap-1">
              <Row label="기록일" value={formatDate(entry.date)}>
                <span className="ml-1.5 text-[11px]">
                  <StaleDays days={daysBetween(entry.date, today)} />
                </span>
              </Row>
              <Row label="다음 차례" value={NEXT_TURN_LABEL[entry.nextTurn]} />
              <Row
                label="기한"
                value={entry.dueOn ? formatDate(entry.dueOn) : "—"}
              >
                {overdue ? (
                  <Badge className="ml-1.5 bg-red-500/12 text-red-700 dark:bg-red-400/15 dark:text-red-300">
                    지남
                  </Badge>
                ) : null}
              </Row>
              <Row label="상대" value={entry.counterpart || "—"} />
              <Row label="메모" value={entry.note || "—"} />
            </dl>
          </div>

          {canWrite ? (
            <div className="flex flex-col gap-2 border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">
                차례와 기한은 이 기록의 값이라 그 자리에서 바뀝니다. 무슨 일이
                있었는지는 「기록하기」에 새 기록으로 남기세요.
              </p>

              <div>
                <span className="mb-1 block text-[10.5px] text-muted-foreground">
                  다음 차례
                </span>
                <div className="flex w-full overflow-hidden ring-1 ring-foreground/15">
                  {NEXT_TURNS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTurn(t)}
                      className={cn(
                        "min-h-7 flex-1 px-2 text-[11px] font-medium transition-colors",
                        turn === t
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      )}
                    >
                      {NEXT_TURN_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-0.5 block text-[10.5px] text-muted-foreground">
                  기한
                </label>
                <Input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="h-7 text-[11px]"
                />
              </div>

              {error ? (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  disabled={busy || !dirty}
                  onClick={() => void saveTurn()}
                >
                  {busy ? "저장 중…" : "차례·기한 저장"}
                </Button>
                {dirty ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setTurn(entry.nextTurn)
                      setDue(entry.dueOn ?? "")
                    }}
                  >
                    되돌리기
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {isPatent ? "특허" : "상표"} 값
            </h3>
            <dl className="flex flex-col gap-1">
              <Row label={isPatent ? "명칭" : "이름"} value={name} />
              {!isPatent && trademark?.nameKo ? (
                <Row label="한글명" value={trademark.nameKo} />
              ) : null}
              <Row
                label={isPatent ? "출원인" : "보유자"}
                value={holder ?? "—"}
              />
              <Row label="출원번호" value={row?.appNo ?? "—"} mono />
              <Row label="등록번호" value={row?.regNo ?? "—"} mono />
              <Row
                label="출원일"
                value={row?.filedOn ? formatDate(row.filedOn) : "—"}
              />
              <Row
                label="등록일"
                value={row?.registeredOn ? formatDate(row.registeredOn) : "—"}
              />
              {!isPatent ? (
                <>
                  <Row
                    label="류"
                    value={trademark?.classes.join(", ") || "—"}
                  />
                  <Row label="지정상품" value={trademark?.goods || "—"} />
                  <Row
                    label="등록가능성"
                    value={
                      trademark?.probability === null ||
                      trademark?.probability === undefined
                        ? "—"
                        : `${trademark.probability}%`
                    }
                  />
                </>
              ) : null}
              <Row
                label="마지막 진행"
                value={row?.date ? formatDate(row.date) : "—"}
              />
              <Row label="비고" value={row?.note || "—"} />
            </dl>
          </div>

          {canWrite ? (
            <CorrectionForm
              inline
              entityKind={kind}
              entityId={entry.entityId}
              stage={status}
              today={today}
              current={{
                name,
                holder,
                appNo: row?.appNo ?? null,
                regNo: row?.regNo ?? null,
              }}
              stageOptions={pipeline}
              onSaved={refresh}
            />
          ) : (
            <p className="text-[11px] text-muted-foreground">
              읽기 전용 계정이라 값을 고칠 수 없습니다.
            </p>
          )}

          <Link
            href={`/register/?kind=${kind}&focus=${entry.entityId}`}
            className="text-[11px] text-primary hover:underline"
          >
            IP 목록에서 이 건 보기
          </Link>
        </section>
      </div>
    </>
  )
}

function Row({
  label,
  value,
  mono,
  children,
}: {
  label: string
  value: string
  mono?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 whitespace-pre-wrap",
          mono && "font-mono text-[11px]",
          value === "—" && "text-muted-foreground"
        )}
      >
        {value}
        {children}
      </dd>
    </div>
  )
}
