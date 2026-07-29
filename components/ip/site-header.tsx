"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Download04Icon,
  HelpCircleIcon,
  Logout03Icon,
  Moon02Icon,
  RefreshIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Tutorial } from "@/components/ip/tutorial"
import { useAuth } from "@/components/ip/auth-gate"
import { useData } from "@/components/ip/data-provider"
import { useToday } from "@/hooks/use-today"
import { exportAll, exporterName } from "@/lib/excel"
import { formatDate } from "@/lib/date"

export function SiteHeader() {
  const today = useToday()
  const { resolvedTheme, setTheme } = useTheme()
  const { member, signOut } = useAuth()
  const { meta, trademarks, patents, refresh, reloading } = useData()
  const [busy, setBusy] = useState(false)
  // 첫 안내는 저절로 한 번 뜨고 끝난다. 다시 보고 싶을 때 여는 자리가 필요하다.
  const [help, setHelp] = useState(false)

  async function onExportAll() {
    setBusy(true)
    try {
      // 파일명 끝에 내려받은 사람을 적는다 — 기준 워크북의 관행이다.
      await exportAll({ trademarks, patents }, today, exporterName(member))
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            {meta.org}
          </div>
          <h1 className="font-heading text-base font-semibold tracking-tight">
            지식재산권 팔로우업
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden text-right text-[11px] leading-tight text-muted-foreground sm:block">
            <div>
              오늘 <span className="tabular-nums">{formatDate(today)}</span>{" "}
              (KST)
            </div>
            <div className="truncate" title={member.email}>
              {member.displayName ?? member.email}
              {member.role === "viewer" ? " · 읽기 전용" : ""}
            </div>
          </div>

          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="새로고침"
            disabled={reloading}
            onClick={() => void refresh()}
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              className={reloading ? "animate-spin" : undefined}
            />
          </Button>

          <Button size="sm" onClick={onExportAll} disabled={busy}>
            <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
            {busy ? "생성 중…" : "전체 엑셀"}
          </Button>

          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="테마 전환"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            <HugeiconsIcon
              icon={resolvedTheme === "dark" ? Sun03Icon : Moon02Icon}
              strokeWidth={2}
            />
          </Button>

          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="처음 안내 다시 보기"
            title="처음 안내 다시 보기"
            onClick={() => setHelp(true)}
          >
            <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} />
          </Button>

          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="로그아웃"
            onClick={() => void signOut()}
          >
            <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>

      {/* 처음 온 사람에게 저절로 뜨는 쪽 */}
      <Tutorial />
      {/* 물음표로 다시 여는 쪽. 본 표시를 다시 남기지 않는다. */}
      <Tutorial open={help} onOpenChange={setHelp} />
    </header>
  )
}
