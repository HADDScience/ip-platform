"use client"

import { useState } from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

/**
 * 항목 하나를 추가·수정·삭제하는 공용 편집기.
 *
 * 상표/특허/커뮤니케이션/액션이 필드만 다르고 동작은 같아서 서술형 정의로 통일했다.
 * 입력 편의가 이 서비스의 핵심이라 Cmd+Enter 저장, 자동 포커스, 취소 확인을 넣었다.
 */

export type Field<T> =
  | { kind: "text"; key: keyof T; label: string; required?: boolean; placeholder?: string; mono?: boolean; width?: "half" }
  | { kind: "textarea"; key: keyof T; label: string; rows?: number; placeholder?: string }
  | { kind: "date"; key: keyof T; label: string; width?: "half" }
  | { kind: "number"; key: keyof T; label: string; min?: number; max?: number; suffix?: string; width?: "half" }
  | { kind: "select"; key: keyof T; label: string; options: readonly string[]; width?: "half" }
  | { kind: "chips"; key: keyof T; label: string; placeholder?: string }
  | { kind: "boolean"; key: keyof T; label: string; hint?: string }

interface Props<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  fields: Field<T>[]
  value: T
  isNew: boolean
  canWrite: boolean
  onSave: (next: T) => Promise<void>
  onDelete?: () => Promise<void>
  /**
   * 폼 위에 끼워 넣을 보조 UI (예: 메일 붙여넣기).
   * 현재 초안과 부분 갱신 함수를 받아 폼을 직접 채울 수 있다.
   */
  children?: (draft: T, patch: (p: Partial<T>) => void) => React.ReactNode
}

export function RecordEditor<T>({
  open,
  onOpenChange,
  title,
  description,
  fields,
  value,
  isNew,
  canWrite,
  onSave,
  onDelete,
  children,
}: Props<T>) {
  // 초안은 이 컴포넌트가 소유한다. 다른 레코드를 열 때는 부모가 key 를 바꿔 remount 시킨다.
  const [draft, setDraft] = useState<T>(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (key: keyof T, v: unknown) =>
    setDraft((d) => ({ ...d, [key]: v }) as T)

  const patch = (p: Partial<T>) => setDraft((d) => ({ ...d, ...p }))

  async function save() {
    const missing = fields.find(
      (f) =>
        f.kind === "text" &&
        f.required &&
        !String(draft[f.key] ?? "").trim()
    )
    if (missing) {
      setError(`${missing.label} 은(는) 필수입니다.`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    if (!onDelete) return
    setSaving(true)
    setError(null)
    try {
      await onDelete()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col overflow-y-auto sm:max-w-xl"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault()
            if (canWrite) void save()
          }
        }}
      >
        <SheetHeader className="border-b pb-3">
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 p-4">
          {children?.(draft, patch)}

          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            {fields.map((field) => {
              const half = "width" in field && field.width === "half"
              return (
                <div
                  key={String(field.key)}
                  className={cn(half ? "col-span-1" : "col-span-2")}
                >
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    {field.label}
                    {"required" in field && field.required ? (
                      <span className="ml-0.5 text-red-500">*</span>
                    ) : null}
                  </label>
                  <FieldInput
                    field={field}
                    value={draft[field.key]}
                    disabled={!canWrite}
                    onChange={(v) => set(field.key, v)}
                  />
                </div>
              )
            })}
          </div>

          {error ? (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex items-center gap-2 border-t bg-popover p-4">
          {canWrite ? (
            <>
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? "저장 중…" : isNew ? "추가" : "저장"}
              </Button>
              <span className="text-[10px] text-muted-foreground">⌘+Enter</span>
              {onDelete && !isNew ? (
                confirmDelete ? (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-red-600 dark:text-red-400">
                      삭제할까요?
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setConfirmDelete(false)}
                    >
                      취소
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => void doDelete()}
                      disabled={saving}
                      className="bg-red-600 text-white hover:bg-red-600/85"
                    >
                      삭제
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    onClick={() => setConfirmDelete(true)}
                  >
                    삭제
                  </Button>
                )
              ) : null}
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              읽기 전용 권한입니다.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function FieldInput<T>({
  field,
  value,
  disabled,
  onChange,
}: {
  field: Field<T>
  value: unknown
  disabled: boolean
  onChange: (v: unknown) => void
}) {
  switch (field.kind) {
    case "text":
      return (
        <Input
          value={String(value ?? "")}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value || null)}
          className={cn("h-8 text-xs", field.mono && "font-mono")}
        />
      )

    case "textarea":
      return (
        <Textarea
          value={String(value ?? "")}
          disabled={disabled}
          rows={field.rows ?? 4}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs"
        />
      )

    case "date":
      return (
        <Input
          type="date"
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-8 text-xs tabular-nums"
        />
      )

    case "number":
      return (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={field.min}
            max={field.max}
            value={value === null || value === undefined ? "" : String(value)}
            disabled={disabled}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            className="h-8 text-xs tabular-nums"
          />
          {field.suffix ? (
            <span className="text-[11px] text-muted-foreground">
              {field.suffix}
            </span>
          ) : null}
        </div>
      )

    case "select":
      return (
        <Select
          items={Object.fromEntries(field.options.map((o) => [o, o]))}
          value={String(value ?? field.options[0] ?? "")}
          onValueChange={(v) => onChange(String(v))}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case "chips":
      return (
        <ChipsInput
          values={Array.isArray(value) ? (value as string[]) : []}
          disabled={disabled}
          placeholder={field.placeholder}
          onChange={onChange}
        />
      )

    case "boolean":
      return (
        <label className="flex items-center gap-2">
          <Checkbox
            checked={Boolean(value)}
            disabled={disabled}
            onCheckedChange={(c) => onChange(Boolean(c))}
          />
          {field.hint ? (
            <span className="text-[11px] text-muted-foreground">
              {field.hint}
            </span>
          ) : null}
        </label>
      )
  }
}

/** 쉼표 또는 Enter 로 항목을 추가하는 태그 입력 */
function ChipsInput({
  values,
  disabled,
  placeholder,
  onChange,
}: {
  values: string[]
  disabled: boolean
  placeholder?: string
  onChange: (v: string[]) => void
}) {
  const [text, setText] = useState("")

  function commit() {
    const parts = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length > 0) onChange([...values, ...parts])
    setText("")
  }

  return (
    <div>
      {values.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 text-[11px]"
            >
              {v}
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`${v} 삭제`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onChange(values.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      <Input
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? "입력 후 Enter (쉼표로 여러 개)"}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            commit()
          }
        }}
        className="h-8 text-xs"
      />
    </div>
  )
}
