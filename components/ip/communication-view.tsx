"use client"

import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Attachment01Icon,
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
  LinkSquare02Icon,
  MailOpen01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ALL, FilterSelect } from "@/components/ip/filter-select"
import { PageHeader } from "@/components/ip/page-header"
import { ExportViewButton } from "@/components/ip/export-button"
import { OpenBadge } from "@/components/ip/status-badge"
import { RecordEditor, type Field } from "@/components/ip/record-editor"
import { useData } from "@/components/ip/data-provider"
import { useAuth } from "@/components/ip/auth-gate"
import { useToday } from "@/hooks/use-today"
import { useQueryParam } from "@/hooks/use-search-string"
import {
  communicationPersonOptions,
  gmailLink,
  linkLabels,
  trademarkLabel,
} from "@/lib/data"
import { remove, saveCommunication } from "@/lib/db"
import { parseMail } from "@/lib/mail-parse"
import { TARGETS, type Communication, type CommunicationLink } from "@/lib/types"
import { daysBetween, formatDate, formatDays } from "@/lib/date"
import { COMMUNICATION_COLUMNS, exportView } from "@/lib/excel"
import { cn } from "@/lib/utils"

const DIRECTIONS = ["발신", "수신"] as const

const empty = (today: string): Communication => ({
  id: "",
  date: today,
  dir: "수신",
  from: "이주철",
  to: "정우창",
  target: "상표",
  subject: "",
  body: "",
  attachments: [],
  followUp: "",
  open: false,
  threadId: null,
  links: [],
})

export function CommunicationView() {
  const today = useToday()
  const { communications, trademarks, patents, refresh } = useData()
  const { canWrite } = useAuth()

  const urlTarget = useQueryParam("target", ALL)
  const urlOpenOnly = useQueryParam("open", "") === "1"
  const [targetOverride, setTarget] = useState<string | null>(null)
  const [openOnlyOverride, setOpenOnly] = useState<boolean | null>(null)
  const target = targetOverride ?? urlTarget
  const openOnly = openOnlyOverride ?? urlOpenOnly

  const [query, setQuery] = useState("")
  const [dir, setDir] = useState(ALL)
  const [person, setPerson] = useState(ALL)
  const [newestFirst, setNewestFirst] = useState(true)
  const [editing, setEditing] = useState<{ value: Communication; isNew: boolean } | null>(null)

  const personOptions = useMemo(
    () => communicationPersonOptions(communications),
    [communications]
  )

  const fields: Field<Communication>[] = useMemo(
    () => [
      { kind: "date", key: "date", label: "일자", width: "half" },
      { kind: "select", key: "dir", label: "구분", options: DIRECTIONS, width: "half" },
      { kind: "text", key: "from", label: "발신", width: "half" },
      { kind: "text", key: "to", label: "수신", width: "half" },
      { kind: "select", key: "target", label: "대상", options: TARGETS, width: "half" },
      { kind: "text", key: "threadId", label: "Gmail 스레드 ID", mono: true, width: "half" },
      { kind: "text", key: "subject", label: "제목", required: true },
      { kind: "textarea", key: "body", label: "내용", rows: 8 },
      { kind: "chips", key: "attachments", label: "첨부 파일명" },
      { kind: "text", key: "followUp", label: "후속 조치" },
      { kind: "boolean", key: "open", label: "미결 여부", hint: "후속 조치가 남아 있으면 체크" },
    ],
    []
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = communications.filter((c) => {
      if (target !== ALL && c.target !== target) return false
      if (dir !== ALL && c.dir !== dir) return false
      if (person !== ALL && c.from !== person && c.to !== person) return false
      if (openOnly && !c.open) return false
      if (!q) return true
      return [c.subject, c.body, c.followUp, c.from, c.to, c.attachments.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q)
    })

    return [...filtered].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date)
      return newestFirst ? -cmp : cmp
    })
  }, [communications, query, target, dir, person, openOnly, newestFirst])

  const filtersOn =
    query !== "" || target !== ALL || dir !== ALL || person !== ALL || openOnly
  const openCount = rows.filter((c) => c.open).length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="커뮤니케이션 로그"
        description={`총 ${communications.length}건 · 메일을 복사해 붙여넣으면 항목이 자동으로 채워집니다.`}
        action={
          <>
            <ExportViewButton
              count={rows.length}
              onExport={() =>
                exportView("커뮤니케이션", "커뮤니케이션 로그", rows, COMMUNICATION_COLUMNS, today)
              }
            />
            {canWrite ? (
              <Button size="sm" onClick={() => setEditing({ value: empty(today), isNew: true })}>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                기록 추가
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목·내용·첨부 검색"
          className="h-7 w-56 text-xs"
          aria-label="커뮤니케이션 검색"
        />
        <FilterSelect label="대상" value={target} options={TARGETS} onChange={setTarget} />
        <FilterSelect label="구분" value={dir} options={DIRECTIONS} onChange={setDir} />
        <FilterSelect label="관계자" value={person} options={personOptions} onChange={setPerson} />
        <Button size="xs" variant={openOnly ? "default" : "outline"} onClick={() => setOpenOnly(!openOnly)}>
          미결만
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setNewestFirst((v) => !v)}>
          {newestFirst ? "최신순 ↓" : "오래된순 ↑"}
        </Button>
        {filtersOn ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setQuery("")
              setTarget(ALL)
              setDir(ALL)
              setPerson(ALL)
              setOpenOnly(false)
            }}
          >
            필터 초기화
          </Button>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {rows.length} / {communications.length}건 · 미결 {openCount}건
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground ring-1 ring-foreground/10">
          조건에 맞는 기록이 없습니다.
        </div>
      ) : (
        <ol className="relative flex flex-col border-l border-border pl-0">
          {rows.map((c) => {
            const link = gmailLink(c.threadId)
            const related = linkLabels(c, trademarks, patents)
            return (
              <li key={c.id} className="relative pb-5 pl-6">
                <span
                  className={cn(
                    "absolute top-1.5 -left-[5px] flex size-2.5 items-center justify-center rounded-full ring-2 ring-background",
                    c.open ? "bg-red-500" : c.dir === "발신" ? "bg-primary" : "bg-muted-foreground/50"
                  )}
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">{formatDate(c.date)}</span>
                  <span className="tabular-nums">{formatDays(daysBetween(c.date, today))}</span>
                  <Badge variant="outline" className={cn("gap-1", c.dir === "발신" ? "text-primary" : "text-muted-foreground")}>
                    <HugeiconsIcon icon={c.dir === "발신" ? ArrowUpRight01Icon : ArrowDownLeft01Icon} strokeWidth={2} />
                    {c.dir}
                  </Badge>
                  <Badge variant="secondary">{c.target}</Badge>
                  <span>{c.from} → {c.to}</span>
                  {c.open ? <OpenBadge /> : null}
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} className="size-3" />
                      Gmail 원문
                    </a>
                  ) : null}
                  {canWrite ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => setEditing({ value: c, isNew: false })}
                    >
                      수정
                    </button>
                  ) : null}
                </div>

                <h3 className="mt-1 font-medium">{c.subject}</h3>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.body}</p>

                {related.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {related.map((r) => (
                      <Badge key={`${r.kind}-${r.id}`} variant="outline" className="max-w-[280px] truncate">
                        {r.kind === "trademark" ? "상표" : "특허"} · {r.label}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {c.attachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {c.attachments.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} className="size-3" />
                        {a}
                      </span>
                    ))}
                  </div>
                ) : null}

                {c.followUp ? (
                  <div className="mt-2 border-l-2 border-border pl-2 text-[11px] text-muted-foreground">
                    후속: {c.followUp}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}

      {editing ? (
        <RecordEditor
          key={`${editing.value.id}-${editing.isNew}`}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing.isNew ? "커뮤니케이션 기록 추가" : "기록 수정"}
          description={editing.isNew ? "메일을 붙여넣으면 아래 항목이 자동으로 채워집니다." : editing.value.subject}
          fields={fields}
          value={editing.value}
          isNew={editing.isNew}
          canWrite={canWrite}
          onSave={async (next) => {
            await saveCommunication(next, editing.isNew)
            await refresh()
          }}
          onDelete={
            editing.isNew
              ? undefined
              : async () => {
                  await remove("communications", editing.value.id)
                  await refresh()
                }
          }
        >
          {(draft, patch) => (
            <>
              <MailPaste onParsed={patch} />
              <LinkPicker
                links={draft.links}
                trademarks={trademarks.map((t) => ({ id: t.id, label: trademarkLabel(t) }))}
                patents={patents.map((p) => ({ id: p.id, label: p.title }))}
                disabled={!canWrite}
                onChange={(links) => patch({ links })}
              />
            </>
          )}
        </RecordEditor>
      ) : null}
    </div>
  )
}

/** 메일 원문을 붙여넣어 폼을 채우는 보조 입력 */
function MailPaste({ onParsed }: { onParsed: (patch: Partial<Communication>) => void }) {
  const [text, setText] = useState("")
  const [done, setDone] = useState<string | null>(null)

  function apply() {
    if (!text.trim()) return
    const p = parseMail(text)
    const patch: Partial<Communication> = {}
    if (p.date) patch.date = p.date
    if (p.from) patch.from = p.from
    if (p.to) patch.to = p.to
    if (p.subject) patch.subject = p.subject
    if (p.body) patch.body = p.body
    if (p.attachments.length > 0) patch.attachments = p.attachments

    onParsed(patch)
    const filled = Object.keys(patch).length
    setDone(`${filled}개 항목을 채웠습니다. 아래에서 확인 후 저장하세요.`)
    setText("")
  }

  return (
    <div className="border border-dashed border-border p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <HugeiconsIcon icon={MailOpen01Icon} strokeWidth={2} className="size-3.5" />
        메일 붙여넣기 (Gmail · 네이버웍스 모두 가능)
      </div>
      <Textarea
        value={text}
        rows={4}
        placeholder="메일 본문을 그대로 복사해 붙여넣으세요. 일자·발신·수신·제목·본문·첨부를 자동으로 뽑아냅니다."
        onChange={(e) => setText(e.target.value)}
        className="text-xs"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="xs" variant="outline" onClick={apply} disabled={!text.trim()}>
          자동 채우기
        </Button>
        {done ? <span className="text-[11px] text-muted-foreground">{done}</span> : null}
      </div>
    </div>
  )
}

/** 이 기록과 연결된 상표/특허 선택 */
function LinkPicker({
  links,
  trademarks,
  patents,
  disabled,
  onChange,
}: {
  links: CommunicationLink[]
  trademarks: { id: string; label: string }[]
  patents: { id: string; label: string }[]
  disabled: boolean
  onChange: (links: CommunicationLink[]) => void
}) {
  const has = (kind: CommunicationLink["kind"], id: string) =>
    links.some((l) => l.kind === kind && l.id === id)

  function toggle(kind: CommunicationLink["kind"], id: string) {
    onChange(
      has(kind, id)
        ? links.filter((l) => !(l.kind === kind && l.id === id))
        : [...links, { kind, id }]
    )
  }

  return (
    <div className="flex flex-col gap-2 border border-dashed border-border p-3">
      <div className="text-[11px] font-medium text-muted-foreground">
        연결된 건 {links.length > 0 ? `(${links.length})` : ""}
      </div>
      <LinkGroup
        title="상표"
        items={trademarks}
        disabled={disabled}
        isOn={(id) => has("trademark", id)}
        onToggle={(id) => toggle("trademark", id)}
      />
      <LinkGroup
        title="특허"
        items={patents}
        disabled={disabled}
        isOn={(id) => has("patent", id)}
        onToggle={(id) => toggle("patent", id)}
      />
    </div>
  )
}

function LinkGroup({
  title,
  items,
  disabled,
  isOn,
  onToggle,
}: {
  title: string
  items: { id: string; label: string }[]
  disabled: boolean
  isOn: (id: string) => boolean
  onToggle: (id: string) => void
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(item.id)}
            title={item.label}
            className={cn(
              "max-w-[200px] truncate px-1.5 py-0.5 text-[11px] ring-1 transition-colors",
              isOn(item.id)
                ? "bg-primary/12 text-primary ring-primary/30"
                : "text-muted-foreground ring-border hover:bg-muted"
            )}
          >
            {item.id} {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
