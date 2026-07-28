"use client"

import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ip/page-header"
import { StatusBadge } from "@/components/ip/status-badge"
import { ExportViewButton } from "@/components/ip/export-button"
import { useData } from "@/components/ip/data-provider"
import { useToday } from "@/hooks/use-today"
import { useQueryParam } from "@/hooks/use-search-string"
import { detect, issuesById } from "@/lib/detect"
import { exportAll } from "@/lib/excel"
import { formatDate } from "@/lib/date"
import { cn } from "@/lib/utils"

/**
 * 대장 — 엑셀에 있던 열만 보여준다.
 *
 * 등록가능성·지정상품·비고·진행 이력은 행을 펼쳤을 때만 나온다.
 * 여기서 값을 직접 고치지 않는다. 값은 「기록하기」에서 들어온다.
 */

const dash = (v: string | null | undefined) => (v && v !== "" ? v : "—")

function IssueChip({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
      <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-3.5" />
      <span className="tabular-nums">{count}</span>
    </span>
  )
}

export function RegisterView() {
  const today = useToday()
  const { trademarks, patents, progress } = useData()
  // 대시보드에서 넘어올 때의 초기 탭만 쿼리로 받는다. 이후 전환은 화면 안에서만.
  const initialTab = useQueryParam("kind", "trademark")
  const [tab, setTab] = useState(initialTab)
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<string | null>(null)

  const issues = useMemo(
    () => detect(trademarks, patents, today),
    [trademarks, patents, today]
  )
  const byId = useMemo(() => issuesById(issues), [issues])

  const historyOf = useMemo(() => {
    const map = new Map<string, typeof progress>()
    for (const e of progress) {
      const k = `${e.entityKind}:${e.entityId}`
      map.set(k, [...(map.get(k) ?? []), e])
    }
    return map
  }, [progress])

  const isPatent = tab === "patent"
  const needle = q.trim().toLowerCase()

  const tms = trademarks.filter(
    (t) =>
      !needle ||
      `${t.name} ${t.nameKo} ${t.appNo ?? ""} ${t.regNo ?? ""}`
        .toLowerCase()
        .includes(needle)
  )
  const pts = patents.filter(
    (p) =>
      !needle ||
      `${p.title} ${p.appNo ?? ""} ${p.regNo ?? ""}`.toLowerCase().includes(needle)
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="대장"
        description="기존 엑셀과 같은 항목입니다. 값은 「기록하기」에서 들어옵니다."
        action={
          <ExportViewButton
            label="엑셀로 내려받기"
            count={trademarks.length + patents.length}
            onExport={() => exportAll({ trademarks, patents, progress }, today)}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex ring-1 ring-foreground/10">
          {(
            [
              ["trademark", `상표 ${trademarks.length}`],
              ["patent", `특허 ${patents.length}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                tab === k
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름·번호로 찾기"
          className="h-8 max-w-56 text-xs"
        />

        {issues.length > 0 ? (
          <Badge className="ml-auto bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            확인 필요 {issues.length}건
          </Badge>
        ) : null}
      </div>

      <div className="overflow-x-auto ring-1 ring-foreground/10">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground">
            {isPatent ? (
              <tr>
                <th className="px-3 py-2 text-left font-medium">명칭</th>
                <th className="px-3 py-2 text-left font-medium">출원번호</th>
                <th className="px-3 py-2 text-left font-medium">출원일</th>
                <th className="px-3 py-2 text-left font-medium">등록번호</th>
                <th className="px-3 py-2 text-left font-medium">등록일</th>
                <th className="px-3 py-2 text-left font-medium">출원인</th>
                <th className="px-3 py-2 text-left font-medium">단계</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            ) : (
              <tr>
                <th className="px-3 py-2 text-left font-medium">이름</th>
                <th className="px-3 py-2 text-left font-medium">등록/출원번호</th>
                <th className="px-3 py-2 text-left font-medium">날짜</th>
                <th className="px-3 py-2 text-left font-medium">보유자</th>
                <th className="px-3 py-2 text-left font-medium">단계</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            )}
          </thead>

          <tbody className="divide-y divide-border/60">
            {(isPatent ? pts : tms).map((row) => {
              const key = `${isPatent ? "patent" : "trademark"}:${row.id}`
              const mine = byId.get(row.id) ?? []
              const expanded = open === key
              const history = historyOf.get(key) ?? []

              return (
                <>
                  <tr
                    key={key}
                    onClick={() => setOpen(expanded ? null : key)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/40",
                      expanded && "bg-muted/40"
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium">
                        {isPatent
                          ? (row as (typeof pts)[number]).title
                          : (row as (typeof tms)[number]).name}
                      </span>
                      {!isPatent && (row as (typeof tms)[number]).nameKo ? (
                        <span className="ml-1.5 text-muted-foreground">
                          {(row as (typeof tms)[number]).nameKo}
                        </span>
                      ) : null}
                    </td>

                    {isPatent ? (
                      <>
                        <td className="px-3 py-2 font-mono text-[11px]">
                          {dash(row.appNo)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {row.filedOn ? formatDate(row.filedOn) : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px]">
                          {dash(row.regNo)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {row.registeredOn ? formatDate(row.registeredOn) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {dash((row as (typeof pts)[number]).applicant)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-mono text-[11px]">
                          {dash(row.regNo ?? row.appNo)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {row.registeredOn || row.filedOn || row.date
                            ? formatDate(
                                (row.registeredOn ?? row.filedOn ?? row.date) as string
                              )
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {dash((row as (typeof tms)[number]).holder)}
                        </td>
                      </>
                    )}

                    <td className="px-3 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {mine.length > 0 ? <IssueChip count={mine.length} /> : null}
                    </td>
                  </tr>

                  {expanded ? (
                    <tr key={`${key}-detail`} className="bg-muted/20">
                      <td colSpan={isPatent ? 8 : 6} className="px-3 py-3">
                        <div className="flex flex-col gap-3">
                          {mine.length > 0 ? (
                            <div className="flex flex-col gap-1.5">
                              {mine.map((i) => (
                                <div
                                  key={i.key}
                                  className={cn(
                                    "flex flex-wrap items-baseline gap-x-2 border-l-2 pl-2",
                                    i.level === "error"
                                      ? "border-red-500"
                                      : "border-amber-500"
                                  )}
                                >
                                  <span className="font-medium">{i.title}</span>
                                  <span className="text-muted-foreground">
                                    {i.detail}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                            {!isPatent ? (
                              <>
                                <Row
                                  label="지정상품"
                                  value={(row as (typeof tms)[number]).goods}
                                />
                                <Row
                                  label="류"
                                  value={
                                    (row as (typeof tms)[number]).classes.join(", ") ||
                                    null
                                  }
                                />
                                <Row
                                  label="등록가능성"
                                  value={
                                    (row as (typeof tms)[number]).probability === null
                                      ? null
                                      : `${(row as (typeof tms)[number]).probability}%`
                                  }
                                />
                              </>
                            ) : null}
                            <Row
                              label="마지막 진행"
                              value={row.date ? formatDate(row.date) : null}
                            />
                            <Row label="비고" value={row.note || null} />
                          </dl>

                          <div>
                            <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                              진행 이력 {history.length}건
                            </div>
                            {history.length === 0 ? (
                              <p className="text-muted-foreground">
                                기록이 없습니다.
                              </p>
                            ) : (
                              <ul className="flex flex-col gap-1">
                                {history.map((h) => (
                                  <li key={h.id} className="flex flex-wrap gap-x-2">
                                    <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                                      {formatDate(h.date)}
                                    </span>
                                    <StatusBadge status={h.stage} />
                                    <span className="text-muted-foreground">
                                      {h.note || h.counterpart}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  )
}
