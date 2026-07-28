"use client"

import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon } from "@hugeicons/core-free-icons"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ALL, FilterSelect } from "@/components/ip/filter-select"
import { PageHeader } from "@/components/ip/page-header"
import { ExportViewButton } from "@/components/ip/export-button"
import { StaleDays, StatusBadge } from "@/components/ip/status-badge"
import { RecordEditor, type Field } from "@/components/ip/record-editor"
import { useData } from "@/components/ip/data-provider"
import { useAuth } from "@/components/ip/auth-gate"
import {
  compareValues,
  SortHeader,
  type SortDir,
} from "@/components/ip/sort-header"
import { useToday } from "@/hooks/use-today"
import { useQueryParam } from "@/hooks/use-search-string"
import { patentApplicantOptions } from "@/lib/data"
import { nextId, remove, savePatent } from "@/lib/db"
import type { Patent } from "@/lib/types"
import { daysBetween, formatDate } from "@/lib/date"
import { exportView, PATENT_COLUMNS } from "@/lib/excel"

type SortKey = "id" | "title" | "status" | "date" | "days"

const empty = (id: string): Patent => ({
  id,
  title: "",
  appNo: null,
  regNo: null,
  date: null,
  applicant: "허채정",
  status: "출원준비",
  note: "",
})

export function PatentView() {
  const today = useToday()
  const { patents, statusOptions, refresh } = useData()
  const { canWrite } = useAuth()

  const urlStatus = useQueryParam("status", ALL)
  const [statusOverride, setStatus] = useState<string | null>(null)
  const status = statusOverride ?? urlStatus

  const [query, setQuery] = useState("")
  const [applicant, setApplicant] = useState(ALL)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [editing, setEditing] = useState<{ value: Patent; isNew: boolean } | null>(null)

  const statusValues = useMemo(
    () => statusOptions.filter((s) => s.kind === "patent").map((s) => s.value),
    [statusOptions]
  )
  const applicantOptions = useMemo(() => patentApplicantOptions(patents), [patents])

  const fields: Field<Patent>[] = useMemo(
    () => [
      { kind: "text", key: "id", label: "ID", required: true, mono: true, width: "half" },
      { kind: "select", key: "status", label: "상태", options: statusValues, width: "half" },
      { kind: "textarea", key: "title", label: "발명의 명칭", rows: 2 },
      { kind: "text", key: "appNo", label: "출원번호 / 사건번호", mono: true, width: "half" },
      { kind: "text", key: "regNo", label: "등록번호", mono: true, width: "half" },
      { kind: "text", key: "applicant", label: "출원인", width: "half" },
      { kind: "date", key: "date", label: "기준일", width: "half" },
      { kind: "textarea", key: "note", label: "비고", rows: 6, placeholder: "확인이 필요한 사항은 ※ 로 시작하면 정합성 경고에 모입니다" },
    ],
    [statusValues]
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = patents.filter((p) => {
      if (status !== ALL && p.status !== status) return false
      if (applicant !== ALL && p.applicant !== applicant) return false
      if (!q) return true
      return [p.id, p.title, p.appNo ?? "", p.regNo ?? "", p.applicant, p.note]
        .join(" ")
        .toLowerCase()
        .includes(q)
    })

    const value = (p: Patent): string | number | null => {
      switch (sortKey) {
        case "id": return p.id
        case "title": return p.title
        case "status": return p.status
        case "date": return p.date
        case "days": return daysBetween(p.date, today)
      }
    }

    return [...filtered].sort((a, b) => compareValues(value(a), value(b), sortDir))
  }, [patents, query, status, applicant, sortKey, sortDir, today])

  function onSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "date" || key === "days" ? "desc" : "asc")
    }
  }

  const filtersOn = query !== "" || status !== ALL || applicant !== ALL

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="특허"
        description={`총 ${patents.length}건 · 행을 클릭하면 수정할 수 있습니다.`}
        action={
          <>
            <ExportViewButton
              count={rows.length}
              onExport={() => exportView("특허", "특허", rows, PATENT_COLUMNS, today)}
            />
            {canWrite ? (
              <Button
                size="sm"
                onClick={() =>
                  setEditing({ value: empty(nextId("PT", patents.map((p) => p.id))), isNew: true })
                }
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                특허 추가
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="명칭·출원번호·비고 검색"
          className="h-7 w-56 text-xs"
          aria-label="특허 검색"
        />
        <FilterSelect label="상태" value={status} options={statusValues} onChange={setStatus} />
        <FilterSelect label="출원인" value={applicant} options={applicantOptions} onChange={setApplicant} />
        {filtersOn ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setQuery("")
              setStatus(ALL)
              setApplicant(ALL)
            }}
          >
            필터 초기화
          </Button>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {rows.length} / {patents.length}건
        </span>
      </div>

      <div className="ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <SortHeader label="ID" sortKey="id" active={sortKey} dir={sortDir} onSort={onSort} className="w-16" />
              <SortHeader label="발명의 명칭" sortKey="title" active={sortKey} dir={sortDir} onSort={onSort} />
              <TableHead>출원번호</TableHead>
              <TableHead>등록번호</TableHead>
              <TableHead>출원인</TableHead>
              <SortHeader label="상태" sortKey="status" active={sortKey} dir={sortDir} onSort={onSort} className="w-24" />
              <SortHeader label="기준일" sortKey="date" active={sortKey} dir={sortDir} onSort={onSort} className="w-28" />
              <SortHeader label="경과일" sortKey="days" active={sortKey} dir={sortDir} onSort={onSort} className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow
                key={p.id}
                tabIndex={0}
                role="button"
                onClick={() => setEditing({ value: p, isNew: false })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setEditing({ value: p, isNew: false })
                  }
                }}
                className="cursor-pointer"
              >
                <TableCell className="font-mono text-[10px] text-muted-foreground">{p.id}</TableCell>
                <TableCell className="max-w-[420px] whitespace-normal">
                  <span className="font-medium">{p.title}</span>
                  {p.note.includes("※") ? (
                    <span className="ml-1.5 text-[10px] text-red-600 dark:text-red-400">※ 확인 필요</span>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{p.appNo ?? "—"}</TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{p.regNo ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.applicant}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{formatDate(p.date)}</TableCell>
                <TableCell><StaleDays days={daysBetween(p.date, today)} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  조건에 맞는 특허가 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {editing ? (
        <RecordEditor
          key={`${editing.value.id}-${editing.isNew}`}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing.isNew ? "특허 추가" : `${editing.value.id} 수정`}
          description={editing.isNew ? undefined : editing.value.title}
          fields={fields}
          value={editing.value}
          isNew={editing.isNew}
          canWrite={canWrite}
          onSave={async (next) => {
            await savePatent(next, editing.isNew)
            await refresh()
          }}
          onDelete={async () => {
            await remove("patents", editing.value.id)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}
