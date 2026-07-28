"use client"

import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ALL, FilterSelect } from "@/components/ip/filter-select"
import { PageHeader } from "@/components/ip/page-header"
import { ExportViewButton } from "@/components/ip/export-button"
import { PriorityBadge, StaleDays } from "@/components/ip/status-badge"
import { RecordEditor, type Field } from "@/components/ip/record-editor"
import { useData } from "@/components/ip/data-provider"
import { useAuth } from "@/components/ip/auth-gate"
import { useToday } from "@/hooks/use-today"
import { sortedActions } from "@/lib/data"
import { nextId, remove, saveAction, setActionState } from "@/lib/db"
import {
  ACTION_STATE_LABEL,
  PRIORITIES,
  TARGETS,
  type ActionItem,
  type ActionState,
  type Priority,
} from "@/lib/types"
import { daysBetween, formatDate } from "@/lib/date"
import { ACTION_COLUMNS, exportView } from "@/lib/excel"
import { cn } from "@/lib/utils"

const COLUMN_TONE: Record<Priority, string> = {
  높음: "ring-red-500/25",
  보통: "ring-amber-500/25",
  낮음: "ring-foreground/10",
}

const STATE_FILTERS = ["미결", "완료", "보류/취소"] as const
const LABEL_TO_STATE: Record<string, ActionState> = {
  미결: "open",
  완료: "done",
  "보류/취소": "dropped",
}

const empty = (id: string): ActionItem => ({
  id,
  target: "상표",
  subject: "",
  requestedAt: null,
  requester: null,
  todo: "",
  owner: "정우창",
  priority: "보통",
  note: "",
  state: "open",
  resolution: null,
  resolvedAt: null,
})

export function ActionView() {
  const today = useToday()
  const { actions, refresh } = useData()
  const { canWrite } = useAuth()

  const [query, setQuery] = useState("")
  const [target, setTarget] = useState(ALL)
  const [stateFilter, setStateFilter] = useState<string>("미결")
  const [layout, setLayout] = useState<"board" | "list">("board")
  const [editing, setEditing] = useState<{ value: ActionItem; isNew: boolean } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fields: Field<ActionItem>[] = useMemo(
    () => [
      { kind: "text", key: "id", label: "ID", required: true, mono: true, width: "half" },
      { kind: "select", key: "priority", label: "우선순위", options: PRIORITIES, width: "half" },
      { kind: "select", key: "target", label: "대상", options: TARGETS, width: "half" },
      { kind: "select", key: "state", label: "상태", options: ["open", "done", "dropped"], width: "half" },
      { kind: "text", key: "subject", label: "건명", required: true },
      { kind: "textarea", key: "todo", label: "조치사항", rows: 4 },
      { kind: "date", key: "requestedAt", label: "요청일", width: "half" },
      { kind: "text", key: "requester", label: "요청자", width: "half" },
      { kind: "text", key: "owner", label: "담당", width: "half" },
      { kind: "text", key: "resolution", label: "처리 결과", width: "half" },
      { kind: "textarea", key: "note", label: "비고", rows: 3 },
    ],
    []
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sortedActions(actions).filter((a) => {
      if (target !== ALL && a.target !== target) return false
      if (stateFilter !== ALL && a.state !== LABEL_TO_STATE[stateFilter]) return false
      if (!q) return true
      return [a.id, a.subject, a.todo, a.owner, a.note, a.requester ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    })
  }, [actions, query, target, stateFilter])

  const byPriority = useMemo(() => {
    const map = new Map<Priority, ActionItem[]>(PRIORITIES.map((p) => [p, []]))
    for (const a of rows) map.get(a.priority)?.push(a)
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (daysBetween(b.requestedAt, today) ?? -1) -
          (daysBetween(a.requestedAt, today) ?? -1)
      )
    }
    return map
  }, [rows, today])

  async function complete(a: ActionItem) {
    setBusyId(a.id)
    try {
      await setActionState(a.id, a.state === "open" ? "done" : "open", null)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  function ActionCard({ action }: { action: ActionItem }) {
    const days = daysBetween(action.requestedAt, today)
    return (
      <Card size="sm" className={cn(action.state !== "open" && "opacity-70")}>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[10px] text-muted-foreground">{action.id}</span>
            <Badge variant="secondary">{action.target}</Badge>
            <PriorityBadge priority={action.priority} />
            {action.state !== "open" ? (
              <Badge variant="outline">{ACTION_STATE_LABEL[action.state]}</Badge>
            ) : null}
            <span className="ml-auto text-right text-[11px]">
              <StaleDays days={days} />
            </span>
          </div>

          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => setEditing({ value: action, isNew: false })}
          >
            {action.subject}
          </button>
          <p className="whitespace-pre-wrap text-muted-foreground">{action.todo}</p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <dt>요청일</dt>
            <dd className="tabular-nums">{action.requestedAt ? formatDate(action.requestedAt) : "미상"}</dd>
            <dt>요청자</dt>
            <dd>{action.requester ?? "—"}</dd>
            <dt>담당</dt>
            <dd className="text-foreground">{action.owner}</dd>
          </dl>

          {action.note ? (
            <div className="border-l-2 border-border pl-2 text-[11px] text-muted-foreground">
              {action.note}
            </div>
          ) : null}

          {canWrite ? (
            <div className="flex gap-1.5">
              <Button
                size="xs"
                variant={action.state === "open" ? "default" : "outline"}
                disabled={busyId === action.id}
                onClick={() => void complete(action)}
              >
                <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
                {action.state === "open" ? "완료 처리" : "미결로 되돌리기"}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setEditing({ value: action, isNew: false })}
              >
                수정
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  const openCount = actions.filter((a) => a.state === "open").length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="미결 액션"
        description={`미결 ${openCount}건 / 전체 ${actions.length}건 · 완료 처리하면 목록에서 빠지고 대시보드 수치도 함께 줄어듭니다.`}
        action={
          <>
            <ExportViewButton
              count={rows.length}
              onExport={() => exportView("미결액션", "미결 액션", rows, ACTION_COLUMNS, today)}
            />
            {canWrite ? (
              <Button
                size="sm"
                onClick={() =>
                  setEditing({ value: empty(nextId("A", actions.map((a) => a.id))), isNew: true })
                }
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                액션 추가
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="건명·조치사항 검색"
          className="h-7 w-56 text-xs"
          aria-label="액션 검색"
        />
        <FilterSelect label="대상" value={target} options={TARGETS} onChange={setTarget} />
        <FilterSelect
          label="상태"
          value={stateFilter}
          options={STATE_FILTERS}
          onChange={setStateFilter}
          allLabel="전체"
        />
        <div className="flex items-center gap-1">
          <Button size="xs" variant={layout === "board" ? "default" : "outline"} onClick={() => setLayout("board")}>
            보드
          </Button>
          <Button size="xs" variant={layout === "list" ? "default" : "outline"} onClick={() => setLayout("list")}>
            목록
          </Button>
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {rows.length} / {actions.length}건
        </span>
      </div>

      {layout === "board" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {PRIORITIES.map((priority) => {
            const list = byPriority.get(priority) ?? []
            return (
              <section key={priority} className={cn("flex flex-col gap-3 p-3 ring-1", COLUMN_TONE[priority])}>
                <header className="flex items-center gap-2">
                  <PriorityBadge priority={priority} />
                  <span className="text-[11px] text-muted-foreground tabular-nums">{list.length}건</span>
                </header>
                {list.length === 0 ? (
                  <p className="py-6 text-center text-muted-foreground">해당 없음</p>
                ) : (
                  list.map((a) => <ActionCard key={a.id} action={a} />)
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground ring-1 ring-foreground/10">
              조건에 맞는 액션이 없습니다.
            </div>
          ) : (
            rows.map((a) => <ActionCard key={a.id} action={a} />)
          )}
        </div>
      )}

      {editing ? (
        <RecordEditor
          key={`${editing.value.id}-${editing.isNew}`}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing.isNew ? "액션 추가" : `${editing.value.id} 수정`}
          description={editing.isNew ? undefined : editing.value.subject}
          fields={fields}
          value={editing.value}
          isNew={editing.isNew}
          canWrite={canWrite}
          onSave={async (next) => {
            await saveAction(next, editing.isNew)
            await refresh()
          }}
          onDelete={async () => {
            await remove("actions", editing.value.id)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}
