"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon } from "@hugeicons/core-free-icons"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ProgressForm } from "@/components/ip/progress-form"
import { useAuth } from "@/components/ip/auth-gate"

/**
 * 기록하기 — 어느 화면에서든 오른쪽 아래 버튼으로 연다.
 *
 * 기록은 다른 화면을 보다가 떠오르는 일이라 탭으로 옮겨 가게 두면 보던 자리를
 * 잃는다. 그래서 양식만 창으로 띄운다. 최근 기록 목록·수정·삭제는 /record 에 남아
 * 있고 창 안의 링크로 간다.
 */
export function RecordFab() {
  const pathname = usePathname()
  const { canWrite } = useAuth()
  const [open, setOpen] = useState(false)
  // 저장할 때마다 양식을 새로 마운트해 빈 칸으로 되돌린다.
  const [round, setRound] = useState(0)

  const onRecordPage = /^\/record\/?$/.test(pathname)
  if (!canWrite || onRecordPage) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="기록하기"
        className="fixed right-4 bottom-4 z-40 flex h-12 items-center gap-1.5 rounded-full bg-primary pr-5 pl-4 text-sm font-medium text-primary-foreground shadow-lg ring-1 ring-black/5 transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] sm:right-6 sm:bottom-6"
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2.2} className="size-5" />
        기록하기
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[44rem]">
          <DialogHeader className="pr-10">
            <DialogTitle>기록하기</DialogTitle>
            <DialogDescription>
              언제 · 어느 건이 · 어디까지 갔고 · 이제 누구 차례인지. IP 현황은
              이 기록에서 자동으로 갱신됩니다.{" "}
              <Link
                href="/record"
                onClick={() => setOpen(false)}
                className="text-primary hover:underline"
              >
                최근 기록 보기
              </Link>
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <ProgressForm
              key={round}
              onSaved={() => {
                setRound((r) => r + 1)
                setOpen(false)
              }}
              onCancel={() => setOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
