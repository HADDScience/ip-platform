"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useData } from "@/components/ip/data-provider"
import { useAuth } from "@/components/ip/auth-gate"
import { useToday } from "@/hooks/use-today"
import { detect } from "@/lib/detect"

function isActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (href === "/") return path === "/"
  return path === href || path.startsWith(`${href}/`)
}

export function SiteNav() {
  const pathname = usePathname()
  const today = useToday()
  const { trademarks, patents, progress } = useData()
  const { isOwner } = useAuth()

  // 배지는 "지금 손대야 할 것"만 센다.
  const badge = useMemo(() => {
    const latest = new Map<string, (typeof progress)[number]>()
    for (const e of progress) {
      const k = `${e.entityKind}:${e.entityId}`
      const cur = latest.get(k)
      if (!cur || e.date > cur.date) latest.set(k, e)
    }
    const ours = [...latest.values()].filter((e) => e.nextTurn === "us").length
    return ours + detect(trademarks, patents, today).length
  }, [progress, trademarks, patents, today])

  const items: { href: string; label: string; badge?: number }[] = [
    { href: "/", label: "기록하기" },
    { href: "/register", label: "대장" },
    { href: "/todo", label: "내 차례", badge },
  ]

  // 멤버 관리는 관리자에게만 보인다.
  if (isOwner) items.push({ href: "/members", label: "멤버" })

  return (
    <nav className="sticky top-[57px] z-30 border-b border-border/60 bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex w-full max-w-[1400px] gap-1 overflow-x-auto px-4 sm:px-6">
        {items.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                active
                  ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
              {item.badge ? (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 items-center justify-center px-1 text-[10px] tabular-nums",
                    active
                      ? "bg-primary/12 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
