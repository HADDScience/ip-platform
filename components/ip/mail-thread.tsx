"use client"

import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { StatusBadge } from "@/components/ip/status-badge"
import { useData } from "@/components/ip/data-provider"
import { formatDate } from "@/lib/date"
import { cn } from "@/lib/utils"
import type { Communication, ProgressEntry } from "@/lib/types"

/**
 * 이 건으로 주고받은 메일.
 *
 * 메일은 두 곳에 흩어져 있다 — 진행 기록(`source='mail'`, 옮겨 적은 요약 + 근거
 * 원문)과 옛 커뮤니케이션 기록(「메일로 입력」이 만든 제목·본문·첨부). 어느 쪽에
 * 있든 사람에게는 같은 「그때 온 메일」이라 한 줄기로 합쳐 보여준다.
 *
 * 요약만 보이면 「정말 그렇게 적혀 있었나」를 확인할 수 없어 결국 메일함을 열게
 * 된다. 그래서 이 화면은 원문을 접지 않고 그대로 편다 — 여기 온 이유가 원문이다.
 */

export interface MailItem {
  key: string
  date: string
  /** 수신 = 상대가 보낸 것 · 송신 = 우리가 보낸 것. 방향을 모르면 null */
  direction: "수신" | "송신" | null
  counterpart: string
  subject: string | null
  /** 옮겨 적은 요약. 진행 기록의 메모다. */
  summary: string
  /** 메일 원문. 진행 기록의 근거 원문이거나 커뮤니케이션 본문이다. */
  body: string | null
  attachments: string[]
  threadId: string | null
  /** 이 메일과 함께 기록된 단계. 커뮤니케이션에는 없다. */
  stage: string | null
  /** 같은 날 기록끼리 순서를 가르는 값 */
  at: string
}

/** 커뮤니케이션의 「발신」은 우리가 보낸 것이다. 진행 기록의 말로 옮긴다. */
function fromCommunication(c: Communication): MailItem {
  const received = c.dir === "수신"
  return {
    key: `comm:${c.id}`,
    date: c.date,
    direction: received ? "수신" : "송신",
    counterpart: (received ? c.from : c.to) || "",
    subject: c.subject || null,
    summary: c.followUp || "",
    body: c.body || null,
    attachments: c.attachments,
    threadId: c.threadId,
    stage: null,
    at: c.date,
  }
}

function fromProgress(e: ProgressEntry): MailItem {
  return {
    key: `prog:${e.id}`,
    date: e.date,
    direction: e.direction,
    counterpart: e.counterpart,
    subject: null,
    summary: e.note,
    body: e.raw,
    attachments: [],
    threadId: null,
    stage: e.stage,
    at: e.createdAt || e.date,
  }
}

/**
 * 이 건의 메일을 최신 순으로.
 *
 * 진행 기록 쪽은 방향이 적혀 있으면 메일로 친다 — `direction` 은 정의상 메일에만
 * 있는 칸이고, 출처가 'manual' 로 남은 옛 기록도 서버가 같은 잣대로 고쳐 왔다.
 */
export function collectMail(
  kind: "trademark" | "patent",
  id: string,
  progress: ProgressEntry[],
  communications: Communication[]
): MailItem[] {
  const mails: MailItem[] = []

  for (const e of progress) {
    if (e.entityKind !== kind || e.entityId !== id) continue
    if (e.direction === null && e.source !== "mail") continue
    mails.push(fromProgress(e))
  }

  for (const c of communications) {
    if (!c.links.some((l) => l.kind === kind && l.id === id)) continue
    mails.push(fromCommunication(c))
  }

  return mails.sort(
    (a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)
  )
}

export function useMailFor(
  kind: "trademark" | "patent",
  id: string
): MailItem[] {
  const { progress, communications } = useData()
  return useMemo(
    () => collectMail(kind, id, progress, communications),
    [kind, id, progress, communications]
  )
}

const gmailUrl = (threadId: string) =>
  `https://mail.google.com/mail/u/0/#all/${threadId}`

export function MailThread({
  items,
  className,
}: {
  items: MailItem[]
  className?: string
}) {
  if (items.length === 0) {
    return (
      <p className={cn("py-6 text-center text-muted-foreground", className)}>
        이 건으로 주고받은 메일 기록이 아직 없습니다.
        <br />
        <span className="text-[11px]">
          메일을 옮겨 적을 때 방향(수신·송신)을 채우면 여기에 모입니다.
        </span>
      </p>
    )
  }

  return (
    <ul className={cn("flex flex-col divide-y divide-border/60", className)}>
      {items.map((m) => (
        <li key={m.key} className="flex flex-col gap-1.5 py-3 first:pt-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground tabular-nums">
              {formatDate(m.date)}
            </span>
            {m.direction ? (
              <Badge
                className={cn(
                  m.direction === "수신"
                    ? "bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {m.direction}
              </Badge>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              {m.direction === "수신"
                ? `${m.counterpart || "상대"} → 우리`
                : m.direction === "송신"
                  ? `우리 → ${m.counterpart || "상대"}`
                  : m.counterpart}
            </span>
            {m.stage ? (
              <StatusBadge status={m.stage} className="ml-auto" />
            ) : null}
          </div>

          {m.subject ? (
            <p className="font-medium text-foreground">{m.subject}</p>
          ) : null}

          {m.summary ? (
            <p className="whitespace-pre-wrap text-foreground">{m.summary}</p>
          ) : null}

          {m.body ? (
            <p className="border-l-2 border-border/60 bg-muted/40 py-1.5 pl-2 text-[11px]/relaxed whitespace-pre-wrap text-muted-foreground">
              {m.body}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              원문이 남아 있지 않은 기록입니다.
            </p>
          )}

          {m.attachments.length > 0 || m.threadId ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {m.attachments.map((a) => (
                <Badge
                  key={a}
                  variant="outline"
                  className="max-w-full truncate"
                >
                  {a}
                </Badge>
              ))}
              {m.threadId ? (
                <a
                  href={gmailUrl(m.threadId)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline"
                >
                  Gmail 에서 원문 열기
                </a>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * IP 목록에서 펼친 줄에 놓는 버튼. 메일은 길어서 표 한가운데 펼치면 아래 건들이
 * 화면 밖으로 밀려난다 — 읽는 자리를 따로 연다.
 */
export function MailDialog({
  kind,
  id,
  title,
}: {
  kind: "trademark" | "patent"
  id: string
  title: string
}) {
  const items = useMailFor(kind, id)

  return (
    <Dialog>
      <DialogTrigger
        onClick={(e) => e.stopPropagation()}
        disabled={items.length === 0}
        render={<Button size="xs" variant="outline" />}
      >
        {items.length === 0
          ? "주고받은 메일 없음"
          : `메일 내용 확인하기 · ${items.length}건`}
      </DialogTrigger>
      <DialogContent
        onClick={(e) => e.stopPropagation()}
        className="max-w-[46rem]"
      >
        <DialogHeader className="pr-10">
          <DialogTitle>주고받은 메일 · {title}</DialogTitle>
          <DialogDescription>
            최신이 위입니다. 모두 {items.length}건. 회색 칸이 메일 원문입니다.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <MailThread items={items} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
