"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons"

import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type SortDir = "asc" | "desc"

export function SortHeader<K extends string>({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: K
  active: K
  dir: SortDir
  onSort: (key: K) => void
  className?: string
}) {
  const isActive = active === sortKey
  return (
    <TableHead
      className={cn("p-0", className)}
      aria-sort={
        isActive ? (dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex h-10 w-full items-center gap-1 px-2 text-left font-medium transition-colors hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
        <HugeiconsIcon
          icon={
            isActive
              ? dir === "asc"
                ? ArrowUp01Icon
                : ArrowDown01Icon
              : UnfoldMoreIcon
          }
          strokeWidth={2}
          className={cn("size-3", !isActive && "opacity-40")}
        />
      </button>
    </TableHead>
  )
}

/** 문자열/숫자/널을 안전하게 비교. null 은 항상 뒤로 보낸다. */
export function compareValues(
  a: string | number | null,
  b: string | number | null,
  dir: SortDir
): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  const sign = dir === "asc" ? 1 : -1
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign
  return String(a).localeCompare(String(b), "ko") * sign
}
