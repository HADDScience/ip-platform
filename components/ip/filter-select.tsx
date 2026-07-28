"use client"

import { useMemo } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export const ALL = "__ALL__"

/**
 * "전체" 옵션이 항상 맨 위에 붙는 단일 선택 필터.
 * Base UI Select 는 items 를 주면 트리거에 라벨을 그려준다.
 */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel = "전체",
  className,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  allLabel?: string
  className?: string
}) {
  const items = useMemo(() => {
    const map: Record<string, string> = { [ALL]: allLabel }
    for (const option of options) map[option] = option
    return map
  }, [options, allLabel])

  return (
    <label className={cn("flex items-center gap-1.5", className)}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => onChange(String(next ?? ALL))}
      >
        <SelectTrigger size="sm" className="min-w-[104px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
