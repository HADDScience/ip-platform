"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useData } from "@/components/ip/data-provider"
import { useToday } from "@/hooks/use-today"
import { saveProgress } from "@/lib/db"
import { NEXT_TURN_LABEL, NEXT_TURNS } from "@/lib/types"
import type { NextTurn, ProgressEntry, Stage } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * 진행 기록 — 사용자가 채우는 유일한 양식.
 *
 * 대장의 번호·날짜·단계는 이 기록이 쌓인 결과이지 따로 입력하는 값이 아니다.
 * 그래서 상표 편집·특허 편집·커뮤니케이션·액션 네 개의 입력창이 여기 하나로 합쳐진다.
 *
 * 화면을 작게 유지하는 장치는 "단계에 따라 필요한 칸만 뜬다"이다.
 * 어느 칸이 필요한지는 ip.status_options 의 wants_* 열에서 오므로,
 * 단계를 추가할 때 이 파일을 고칠 필요가 없다.
 */

function blank(date: string): ProgressEntry {
  return {
    id: "",
    date,
    entityKind: "trademark",
    entityId: "",
    stage: "",
    direction: null,
    counterpart: "",
    nextTurn: "none",
    dueOn: null,
    appNo: null,
    regNo: null,
    probability: null,
    note: "",
    source: "manual",
    raw: null,
  }
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function ProgressForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: ProgressEntry
  onSaved: () => void
  onCancel?: () => void
}) {
  const today = useToday()
  const { trademarks, patents, stages, refresh } = useData()
  const [draft, setDraft] = useState<ProgressEntry>(initial ?? blank(today))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (p: Partial<ProgressEntry>) =>
    setDraft((d) => ({ ...d, ...p }))

  const isNew = !draft.id

  // 건 목록 — 상표와 특허를 한 드롭다운에 둔다. 사용자는 종류를 먼저 고르지 않는다.
  const cases = useMemo(
    () => [
      ...trademarks.map((t) => ({
        key: `trademark:${t.id}`,
        kind: "trademark" as const,
        id: t.id,
        label: `상표 · ${t.name}`,
      })),
      ...patents.map((p) => ({
        key: `patent:${p.id}`,
        kind: "patent" as const,
        id: p.id,
        label: `특허 · ${p.title.slice(0, 40)}${p.title.length > 40 ? "…" : ""}`,
      })),
    ],
    [trademarks, patents]
  )

  const caseItems = useMemo(
    () => Object.fromEntries(cases.map((c) => [c.key, c.label])),
    [cases]
  )

  const stageList = useMemo(
    () =>
      stages
        .filter((s) => s.kind === draft.entityKind && s.selectable)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [stages, draft.entityKind]
  )

  const stageItems = useMemo(
    () => Object.fromEntries(stageList.map((s) => [s.value, s.value])),
    [stageList]
  )

  const stage: Stage | undefined = stageList.find((s) => s.value === draft.stage)

  const dirItems = { 수신: "받음", 발신: "보냄", __none: "메일 아님" }
  const turnItems = Object.fromEntries(
    NEXT_TURNS.map((t) => [t, NEXT_TURN_LABEL[t]])
  ) as Record<NextTurn, string>

  async function save() {
    if (!draft.entityId) {
      setError("어느 건인지 골라 주세요.")
      return
    }
    if (!draft.stage) {
      setError("단계를 골라 주세요.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveProgress(draft, isNew)
      await refresh()
      setDraft(blank(today))
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault()
          void save()
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <Field label="날짜" className="sm:w-36">
          <Input
            type="date"
            value={draft.date}
            onChange={(e) => patch({ date: e.target.value })}
            className="h-8 text-xs"
          />
        </Field>

        <Field label="건">
          <Select
            items={caseItems}
            value={draft.entityId ? `${draft.entityKind}:${draft.entityId}` : ""}
            onValueChange={(v) => {
              const [kind, id] = String(v).split(":")
              patch({
                entityKind: kind as ProgressEntry["entityKind"],
                entityId: id,
                // 종류가 바뀌면 단계 목록이 달라진다
                stage: "",
              })
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="상표 또는 특허 고르기" />
            </SelectTrigger>
            <SelectContent>
              {cases.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="단계">
          <Select
            items={stageItems}
            value={draft.stage}
            onValueChange={(v) => patch({ stage: String(v) })}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="어디까지 갔나" />
            </SelectTrigger>
            <SelectContent>
              {stageList.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="주고받음">
          <Select
            items={dirItems}
            value={draft.direction ?? "__none"}
            onValueChange={(v) =>
              patch({
                direction:
                  v === "__none" ? null : (String(v) as ProgressEntry["direction"]),
              })
            }
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="수신">받음</SelectItem>
              <SelectItem value="발신">보냄</SelectItem>
              <SelectItem value="__none">메일 아님</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="상대">
          <Input
            value={draft.counterpart}
            onChange={(e) => patch({ counterpart: e.target.value })}
            placeholder="대리인 / 대표"
            className="h-8 text-xs"
          />
        </Field>
      </div>

      {/* 단계가 요구하는 칸만 나타난다 */}
      {stage && (stage.wantsAppNo || stage.wantsRegNo || stage.wantsProbability) ? (
        <div className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
          {stage.wantsAppNo ? (
            <Field
              label="출원번호"
              hint="10-YYYY-NNNNNNN(특허) / 40-YYYY-NNNNNNN(상표). 사건번호도 됩니다."
            >
              <Input
                value={draft.appNo ?? ""}
                onChange={(e) => patch({ appNo: e.target.value || null })}
                placeholder="40-0000-0000000"
                className="h-8 font-mono text-xs"
              />
            </Field>
          ) : null}

          {stage.wantsRegNo ? (
            <Field label="등록번호">
              <Input
                value={draft.regNo ?? ""}
                onChange={(e) => patch({ regNo: e.target.value || null })}
                placeholder="40-0000000"
                className="h-8 font-mono text-xs"
              />
            </Field>
          ) : null}

          {stage.wantsProbability ? (
            <Field label="등록가능성 (%)">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.probability ?? ""}
                onChange={(e) =>
                  patch({
                    probability:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="45"
                className="h-8 text-xs"
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="다음 차례"
          hint="「우리 차례」로 두면 내 차례 화면에 뜹니다. 별도 등록은 필요 없습니다."
        >
          <Select
            items={turnItems}
            value={draft.nextTurn}
            onValueChange={(v) => patch({ nextTurn: String(v) as NextTurn })}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NEXT_TURNS.map((t) => (
                <SelectItem key={t} value={t}>
                  {NEXT_TURN_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {draft.nextTurn !== "none" || stage?.wantsDue ? (
          <Field label="기한" hint={stage?.wantsDue ? "의견제출 마감일" : undefined}>
            <Input
              type="date"
              value={draft.dueOn ?? ""}
              onChange={(e) => patch({ dueOn: e.target.value || null })}
              className="h-8 text-xs"
            />
          </Field>
        ) : null}
      </div>

      <Field label="메모">
        <Textarea
          value={draft.note}
          rows={2}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder="무슨 일이 있었는지 한 줄"
          className="text-xs"
        />
      </Field>

      {error ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "저장 중…" : isNew ? "기록하기" : "수정하기"}
        </Button>
        {onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            취소
          </Button>
        ) : null}
        <span className="ml-auto text-[10px] text-muted-foreground">⌘+Enter</span>
      </div>
    </div>
  )
}

/** 단계 배지 — 목록에서 재사용 */
export function StageDot({ tone, className }: { tone: string; className?: string }) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-500",
    indigo: "bg-indigo-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    violet: "bg-violet-500",
    muted: "bg-muted-foreground/50",
    neutral: "bg-muted-foreground/50",
  }
  return (
    <span
      className={cn("inline-block size-1.5 shrink-0 rounded-full", map[tone] ?? map.neutral, className)}
      aria-hidden
    />
  )
}
