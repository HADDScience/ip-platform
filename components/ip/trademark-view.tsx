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
import {
  trademarkClassOptions,
  trademarkHolderOptions,
} from "@/lib/data"
import { nextId, remove, saveTrademark } from "@/lib/db"
import type { Trademark } from "@/lib/types"
import { daysBetween, formatDate } from "@/lib/date"
import { exportView, TRADEMARK_COLUMNS } from "@/lib/excel"

type SortKey = "id" | "name" | "status" | "date" | "days" | "probability"

const empty = (id: string): Trademark => ({
  id,
  name: "",
  nameKo: "",
  classes: [],
  goods: null,
  regNo: null,
  date: null,
  holder: "허채정",
  status: "검토중",
  probability: null,
  note: "",
})

export function TrademarkView() {
  const today = useToday()
  const { trademarks, statusOptions, refresh } = useData()
  const { canWrite } = useAuth()

  const urlStatus = useQueryParam("status", ALL)
  const [statusOverride, setStatus] = useState<string | null>(null)
  const status = statusOverride ?? urlStatus

  const [query, setQuery] = useState("")
  const [cls, setCls] = useState(ALL)
  const [holder, setHolder] = useState(ALL)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [editing, setEditing] = useState<{
    value: Trademark
    isNew: boolean
  } | null>(null)

  const statusValues = useMemo(
    () =>
      statusOptions
        .filter((s) => s.kind === "trademark")
        .map((s) => s.value),
    [statusOptions]
  )
  const classOptions = useMemo(
    () => trademarkClassOptions(trademarks),
    [trademarks]
  )
  const holderOptions = useMemo(
    () => trademarkHolderOptions(trademarks),
    [trademarks]
  )

  const fields: Field<Trademark>[] = useMemo(
    () => [
      { kind: "text", key: "id", label: "ID", required: true, mono: true, width: "half" },
      { kind: "select", key: "status", label: "상태", options: statusValues, width: "half" },
      { kind: "text", key: "name", label: "상표명", required: true, width: "half" },
      { kind: "text", key: "nameKo", label: "한글명", width: "half" },
      { kind: "chips", key: "classes", label: "상품류", placeholder: "제05류 입력 후 Enter" },
      { kind: "textarea", key: "goods", label: "지정상품", rows: 2 },
      { kind: "text", key: "regNo", label: "등록/출원번호", mono: true, width: "half" },
      { kind: "text", key: "holder", label: "출원인", width: "half" },
      { kind: "date", key: "date", label: "기준일", width: "half" },
      { kind: "number", key: "probability", label: "등록가능성", min: 0, max: 100, suffix: "%", width: "half" },
      { kind: "textarea", key: "note", label: "비고", rows: 6, placeholder: "확인이 필요한 사항은 ※ 로 시작하면 정합성 경고에 모입니다" },
    ],
    [statusValues]
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = trademarks.filter((t) => {
      if (status !== ALL && t.status !== status) return false
      if (cls !== ALL && !t.classes.includes(cls)) return false
      if (holder !== ALL && t.holder !== holder) return false
      if (!q) return true
      return [t.id, t.name, t.nameKo, t.goods ?? "", t.regNo ?? "", t.note, t.classes.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q)
    })

    const value = (t: Trademark): string | number | null => {
      switch (sortKey) {
        case "id": return t.id
        case "name": return t.name
        case "status": return t.status
        case "date": return t.date
        case "days": return daysBetween(t.date, today)
        case "probability": return t.probability
      }
    }

    return [...filtered].sort((a, b) => compareValues(value(a), value(b), sortDir))
  }, [trademarks, query, status, cls, holder, sortKey, sortDir, today])

  function onSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "date" || key === "days" ? "desc" : "asc")
    }
  }

  const filtersOn = query !== "" || status !== ALL || cls !== ALL || holder !== ALL

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="상표"
        description={`총 ${trademarks.length}건 · 행을 클릭하면 수정할 수 있습니다.`}
        action={
          <>
            <ExportViewButton
              count={rows.length}
              onExport={() => exportView("상표", "상표", rows, TRADEMARK_COLUMNS, today)}
            />
            {canWrite ? (
              <Button
                size="sm"
                onClick={() =>
                  setEditing({
                    value: empty(nextId("TM", trademarks.map((t) => t.id))),
                    isNew: true,
                  })
                }
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                상표 추가
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상표명·지정상품·비고 검색"
          className="h-7 w-56 text-xs"
          aria-label="상표 검색"
        />
        <FilterSelect label="상태" value={status} options={statusValues} onChange={setStatus} />
        <FilterSelect label="류" value={cls} options={classOptions} onChange={setCls} />
        <FilterSelect label="담당(출원인)" value={holder} options={holderOptions} onChange={setHolder} />
        {filtersOn ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setQuery("")
              setStatus(ALL)
              setCls(ALL)
              setHolder(ALL)
            }}
          >
            필터 초기화
          </Button>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {rows.length} / {trademarks.length}건
        </span>
      </div>

      <div className="ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <SortHeader label="ID" sortKey="id" active={sortKey} dir={sortDir} onSort={onSort} className="w-16" />
              <SortHeader label="상표명" sortKey="name" active={sortKey} dir={sortDir} onSort={onSort} />
              <TableHead>상품류</TableHead>
              <SortHeader label="상태" sortKey="status" active={sortKey} dir={sortDir} onSort={onSort} className="w-24" />
              <SortHeader label="등록가능성" sortKey="probability" active={sortKey} dir={sortDir} onSort={onSort} className="w-28" />
              <TableHead>등록/출원번호</TableHead>
              <SortHeader label="기준일" sortKey="date" active={sortKey} dir={sortDir} onSort={onSort} className="w-28" />
              <SortHeader label="경과일" sortKey="days" active={sortKey} dir={sortDir} onSort={onSort} className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow
                key={t.id}
                tabIndex={0}
                role="button"
                onClick={() => setEditing({ value: t, isNew: false })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setEditing({ value: t, isNew: false })
                  }
                }}
                className="cursor-pointer"
              >
                <TableCell className="font-mono text-[10px] text-muted-foreground">{t.id}</TableCell>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.nameKo}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{t.classes.join(", ")}</TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell className="tabular-nums">
                  {t.probability === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1 w-10 bg-muted">
                        <span className="block h-full bg-primary/70" style={{ width: `${t.probability}%` }} />
                      </span>
                      {t.probability}%
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{t.regNo ?? "—"}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{formatDate(t.date)}</TableCell>
                <TableCell><StaleDays days={daysBetween(t.date, today)} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  조건에 맞는 상표가 없습니다.
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
          title={editing.isNew ? "상표 추가" : `${editing.value.name} 수정`}
          description={editing.isNew ? undefined : editing.value.id}
          fields={fields}
          value={editing.value}
          isNew={editing.isNew}
          canWrite={canWrite}
          onSave={async (next) => {
            await saveTrademark(next, editing.isNew)
            await refresh()
          }}
          onDelete={async () => {
            await remove("trademarks", editing.value.id)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}
