"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useData } from "@/components/ip/data-provider"

function isActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (href === "/") return path === "/"
  return path === href || path.startsWith(`${href}/`)
}

export function SiteNav() {
  const pathname = usePathname()
  const { communications, actions, flags } = useData()

  // 배지는 "지금 처리해야 할 것"만 센다. 완료 처리된 건 빠진다.
  const items: { href: string; label: string; badge?: number }[] = [
    { href: "/", label: "대시보드" },
    { href: "/trademarks", label: "상표" },
    { href: "/patents", label: "특허" },
    {
      href: "/communications",
      label: "커뮤니케이션",
      badge: communications.filter((c) => c.open).length,
    },
    {
      href: "/actions",
      label: "미결 액션",
      badge: actions.filter((a) => a.state === "open").length,
    },
    {
      href: "/integrity",
      label: "정합성 경고",
      badge: flags.filter((f) => f.state === "open").length,
    },
  ]

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
