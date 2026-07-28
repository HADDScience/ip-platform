"use client"

import { useMemo } from "react"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  PriorityBadge,
  StaleDays,
  StatusBadge,
} from "@/components/ip/status-badge"
import { PageHeader } from "@/components/ip/page-header"
import { useData } from "@/components/ip/data-provider"
import { useToday } from "@/hooks/use-today"
import { countByStatus, sortedActions, staleItems } from "@/lib/data"
import { daysBetween, formatDate, formatDays } from "@/lib/date"
import { cn } from "@/lib/utils"

function Kpi({
  label,
  value,
  unit = "건",
  hint,
  href,
  tone,
}: {
  label: string
  value: number
  unit?: string
  hint: string
  href: string
  tone?: "danger" | "warn"
}) {
  return (
    <Card size="sm" className="transition-colors hover:bg-muted/40">
      <Link href={href} className="block">
        <CardContent className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div
              className={cn(
                "mt-1 font-heading text-2xl font-semibold tabular-nums",
                tone === "danger" && value > 0 && "text-red-600 dark:text-red-400",
                tone === "warn" && value > 0 && "text-amber-600 dark:text-amber-400"
              )}
            >
              {value}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                {unit}
              </span>
            </div>
          </div>
          <div className="text-right text-[11px] leading-tight text-muted-foreground">
            {hint}
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}

function StatusBreakdown({
  title,
  description,
  rows,
  total,
  hrefBase,
}: {
  title: string
  description: string
  rows: { status: string; count: number }[]
  total: number
  hrefBase: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.map((row) => {
          const pct = total === 0 ? 0 : Math.round((row.count / total) * 100)
          return (
            <Link
              key={row.status}
              href={`${hrefBase}?status=${encodeURIComponent(row.status)}`}
              className="group flex items-center gap-3 py-0.5"
            >
              <div className="w-20 shrink-0">
                <StatusBadge status={row.status} />
              </div>
              <div className="h-1.5 flex-1 bg-muted">
                <div
                  className="h-full bg-primary/70 transition-all group-hover:bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-14 shrink-0 text-right tabular-nums">
                <span className="font-medium">{row.count}</span>
                <span className="ml-1 text-[10px] text-muted-foreground">{pct}%</span>
              </div>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function DashboardView() {
  const today = useToday()
  const {
    meta,
    trademarks,
    patents,
    communications,
    actions,
    flags,
    statusOptions,
    openStatuses,
  } = useData()

  const trademarkStatuses = useMemo(
    () => statusOptions.filter((s) => s.kind === "trademark").map((s) => s.value),
    [statusOptions]
  )
  const patentStatuses = useMemo(
    () => statusOptions.filter((s) => s.kind === "patent").map((s) => s.value),
    [statusOptions]
  )

  const stale = useMemo(
    () =>
      staleItems(
        trademarks,
        patents,
        openStatuses("trademark"),
        openStatuses("patent"),
        today
      ),
    [trademarks, patents, openStatuses, today]
  )

  const severe = stale.filter((s) => (s.days ?? 0) >= 90)
  const openActions = actions.filter((a) => a.state === "open")
  const highActions = sortedActions(openActions).filter((a) => a.priority === "높음")
  const openComms = communications.filter((c) => c.open)
  const openFlags = flags.filter((f) => f.state === "open")

  const registered = trademarks.filter((t) => t.status === "등록완료").length
  const patentRegistered = patents.filter((p) => p.status === "등록").length

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="대시보드"
        description={
          <>
            {meta.org} 지식재산권 현황 · 담당 {meta.owner} · 대리인{" "}
            {meta.firm.name} {meta.firm.attorney}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="상표" value={trademarks.length} hint={`등록완료 ${registered}건`} href="/trademarks" />
        <Kpi label="특허" value={patents.length} hint={`등록 ${patentRegistered}건`} href="/patents" />
        <Kpi
          label="미결 액션"
          value={openActions.length}
          hint={`우선순위 높음 ${highActions.length}건`}
          href="/actions"
          tone="danger"
        />
        <Kpi
          label="미결 커뮤니케이션"
          value={openComms.length}
          hint={`전체 로그 ${communications.length}건`}
          href="/communications?open=1"
          tone="warn"
        />
      </div>

      {severe.length > 0 ? (
        <Card className="ring-amber-500/30 dark:ring-amber-400/25">
          <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 text-amber-700 dark:text-amber-300">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4 shrink-0" />
            <span className="font-medium">
              90일 이상 진행이 멈춘 건이 {severe.length}건 있습니다.
            </span>
            <span className="text-muted-foreground">
              가장 오래된 건: {severe[0].label} · {formatDays(severe[0].days ?? null)}
            </span>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusBreakdown
          title="상표 상태별 집계"
          description={`총 ${trademarks.length}건 · 상태를 누르면 해당 목록으로 이동합니다`}
          rows={countByStatus(trademarks, trademarkStatuses)}
          total={trademarks.length}
          hrefBase="/trademarks"
        />
        <StatusBreakdown
          title="특허 상태별 집계"
          description={`총 ${patents.length}건 · 상태를 누르면 해당 목록으로 이동합니다`}
          rows={countByStatus(patents, patentStatuses)}
          total={patents.length}
          hrefBase="/patents"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>지금 해야 할 일 · 우선순위 높음</CardTitle>
            <CardDescription>요청일로부터 경과일이 큰 순서입니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/60">
            {highActions.length === 0 ? (
              <p className="py-4 text-muted-foreground">우선순위 높은 미결 항목이 없습니다.</p>
            ) : (
              [...highActions]
                .sort(
                  (a, b) =>
                    (daysBetween(b.requestedAt, today) ?? -1) -
                    (daysBetween(a.requestedAt, today) ?? -1)
                )
                .map((action) => (
                  <div key={action.id} className="flex gap-3 py-2.5 first:pt-0">
                    <PriorityBadge priority={action.priority} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {action.id}
                        </span>
                        <span className="font-medium">{action.subject}</span>
                        <span className="text-[10px] text-muted-foreground">{action.target}</span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground">{action.todo}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px]">
                      <StaleDays days={daysBetween(action.requestedAt, today)} />
                      <div className="text-muted-foreground">
                        {action.requestedAt ? formatDate(action.requestedAt) : "요청일 미상"}
                      </div>
                    </div>
                  </div>
                ))
            )}
            <Link href="/actions" className="flex items-center gap-1 pt-2.5 text-primary hover:underline">
              미결 액션 전체 보기
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>오래 정체된 건</CardTitle>
            <CardDescription>
              진행 중 건의 마지막 진행일 기준 방치 일수
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/60">
            {stale.slice(0, 8).map((item) => (
              <div key={`${item.kind}-${item.id}`} className="flex items-center gap-3 py-2 first:pt-0">
                <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">
                  {item.id}
                </span>
                <span className="min-w-0 flex-1 truncate" title={item.label}>
                  {item.label}
                </span>
                <StatusBadge status={item.status} />
                <span className="w-16 shrink-0 text-right">
                  <StaleDays days={item.days} />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className={openFlags.length > 0 ? "ring-red-500/25" : undefined}>
        <CardHeader>
          <CardTitle>정합성 경고 · 확인 필요 {openFlags.length}건</CardTitle>
          <CardDescription>사실관계 확인이 필요한 항목입니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border/60">
          {openFlags.length === 0 ? (
            <p className="py-4 text-muted-foreground">확인이 필요한 항목이 없습니다.</p>
          ) : (
            openFlags.slice(0, 3).map((flag) => (
              <div key={flag.id} className="py-2 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {flag.entityKind === "trademark" ? "상표" : flag.entityKind === "patent" ? "특허" : "일반"}{" "}
                    {flag.entityId ?? ""}
                  </span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{flag.message}</p>
              </div>
            ))
          )}
          <Link href="/integrity" className="flex items-center gap-1 pt-2.5 text-primary hover:underline">
            정합성 경고 전체 보기
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5" />
          </Link>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
          <div>
            <span className="text-foreground">대리인</span> {meta.firm.name} ·{" "}
            {meta.firm.attorney} · {meta.firm.email} · {meta.firm.tel} / {meta.firm.mobile}
          </div>
          <div>
            <span className="text-foreground">실무</span> {meta.firm.staff.join(" · ")}
          </div>
          <div className="sm:col-span-2">{meta.note}</div>
        </CardContent>
      </Card>
    </div>
  )
}
