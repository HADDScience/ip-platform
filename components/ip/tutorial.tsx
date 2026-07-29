"use client"

import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  File01Icon,
  RoboticIcon,
  Timer02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { McpInstall } from "@/components/ip/mcp-install"
import { useAuth } from "@/components/ip/auth-gate"
import { loadTutorialSeen, markTutorialSeen } from "@/lib/db"
import { cn } from "@/lib/utils"

/**
 * 첫 안내.
 *
 * 화면이 셋뿐이라 둘러보면 알 것 같지만, 실제로 모르고 지나치는 것이 둘 있다.
 *  * 이 도구의 입력은 「기록하기」 하나뿐이라는 것 — 목록을 직접 고치는 화면을
 *    찾다가 없어서 헤맨다.
 *  * AI 도구 연결(MCP) — 버튼 하나 뒤에 숨어 있어, 모르면 끝까지 모른 채로
 *    손으로만 쓴다. 이 도구를 가장 크게 바꾸는 것이 그것인데.
 * 그래서 마지막 걸음을 MCP 에 두고, 거기서 설치 창으로 곧장 넘긴다.
 *
 * 한 번 닫으면 다시 뜨지 않는다. 계정에 적으므로 기기를 옮겨도 마찬가지다.
 * 다시 보고 싶으면 머리말의 물음표를 누른다.
 */

interface Step {
  title: string
  lead: string
  body: React.ReactNode
}

const STEPS: Step[] = [
  {
    title: "기록을 쌓으면 목록이 따라옵니다",
    lead: "이 도구에서 사람이 채우는 것은 「진행 기록」 하나뿐입니다.",
    body: (
      <div className="flex flex-col gap-2">
        <p>
          상표·특허의 단계·번호·날짜를 직접 고치는 화면은 없습니다. 무슨 일이
          있었는지만 적으면 지식재산권 목록이 그 결과로 바뀝니다.
        </p>
        <div className="flex flex-wrap items-center gap-1.5 border border-border/60 p-2.5 text-[11px]">
          <Chip>진행 기록</Chip>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-3.5 text-muted-foreground"
          />
          <Chip>지식재산권 목록</Chip>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-3.5 text-muted-foreground"
          />
          <Chip>밀린 업무 · 엑셀</Chip>
        </div>
        <p className="text-muted-foreground">
          그래서 나중에 &ldquo;이게 왜 이 단계지?&rdquo; 를 물으면 항상 답이
          있습니다. 목록은 기록에서 언제든 다시 계산됩니다.
        </p>
      </div>
    ),
  },
  {
    title: "기록하기",
    lead: "언제 · 어느 건이 · 어디까지 갔고 · 이제 누구 차례인지.",
    body: (
      <ul className="flex flex-col gap-1.5">
        <Bullet>
          단계를 고르면 그 단계에 필요한 칸(출원번호·기한 등)만 나타납니다.
        </Bullet>
        <Bullet>
          <b>누구 차례인지</b>가 중요합니다. 「회신 필요」로 두면 밀린 업무에
          올라오고, 「상대 회신 대기」면 상대가 답할 때까지 세어 둡니다.
        </Bullet>
        <Bullet>
          메일이 근거면 방향(수신·송신)을 채우세요. 나중에 근거의 무게를
          가릅니다.
        </Bullet>
      </ul>
    ),
  },
  {
    title: "IP",
    lead: "지금 상태와 지나온 이력이 한 줄씩 놓입니다.",
    body: (
      <ul className="flex flex-col gap-1.5">
        <Bullet>
          줄을 누르면 펼쳐집니다 — 상세와 진행 이력이 함께 나옵니다.
        </Bullet>
        <Bullet>
          잘못 적힌 값은 <b>「값 고치기」</b>로 바로잡습니다. 목록을 직접 찌르지
          않고 「값 정정」 기록으로 남아, 무엇을 왜 고쳤는지 이력에 남습니다.
        </Bullet>
        <Bullet>
          모든 열을 정렬할 수 있고, 단계 차례는 사람마다 다르게 둘 수 있습니다.
        </Bullet>
        <Bullet>
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon
              icon={File01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
            머리말의 <b>「전체 엑셀」</b>
          </span>{" "}
          은 기존 관리 양식 그대로 내려받습니다.
        </Bullet>
      </ul>
    ),
  },
  {
    title: "밀린 IP 업무",
    lead: "지금 손대야 할 것만 모읍니다.",
    body: (
      <ul className="flex flex-col gap-1.5">
        <Bullet>
          <b>회신 필요</b> — 공이 우리에게 있는 건. 여기 있는 동안 날이 셉니다.
        </Bullet>
        <Bullet>
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon
              icon={Timer02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
            <b>멈춘 지 오래된 건</b>
          </span>{" "}
          — 며칠째 아무 기록이 없는지 세어 보여줍니다.
        </Bullet>
        <Bullet>
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon
              icon={Alert02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
            <b>확인 필요</b>
          </span>{" "}
          — 입력된 정보끼리 아귀가 맞지 않는 곳입니다. 「IP에서 보기」를 누르면
          그 줄로 데려갑니다.
        </Bullet>
      </ul>
    ),
  },
  {
    title: "AI 도구에 연결하기",
    lead: "여기까지 오셨으면 이것 하나만 더. 입력하는 방식이 바뀝니다.",
    body: (
      <div className="flex flex-col gap-2">
        <p>
          쓰시는 AI 도구에 이 서버를 붙이면, <b>메일 본문을 그대로 붙여넣고</b>{" "}
          &ldquo;기록해 줘&rdquo; 라고 말하는 것으로 입력이 끝납니다. 어느
          건인지 찾고, 단계를 고르고, 누구 차례인지 정하는 일을 도구가 합니다.
        </p>
        <div className="border border-border/60 p-2.5">
          <div className="mb-1 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
            이렇게 됩니다
          </div>
          <p className="text-[11px] text-muted-foreground">
            &ldquo;이주철 변리사님한테 이렇게 보냈어&rdquo; + 메일 붙여넣기
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px]">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            기록 한 줄 + 단계 갱신 + 「상대 회신 대기」까지 한 번에
          </p>
        </div>
        <p className="text-muted-foreground">
          Claude Code · Codex · Gemini CLI · Cursor · VS Code 는 커맨드 한 줄,
          ChatGPT 는 승인 한 번이면 됩니다.
        </p>
      </div>
    ),
  },
]

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted px-1.5 py-0.5 font-medium text-foreground">
      {children}
    </span>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
      <span>{children}</span>
    </li>
  )
}

export function Tutorial({
  open,
  onOpenChange,
}: {
  /** 넘기면 바깥에서 여닫는다. 머리말의 물음표가 그렇게 쓴다. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
} = {}) {
  const { member } = useAuth()
  const controlled = open !== undefined

  // 처음 온 사람에게 저절로 뜨는 쪽. 바깥에서 열 때는 이 값을 쓰지 않는다.
  const [auto, setAuto] = useState(false)
  const [step, setStep] = useState(0)
  const [mcpOpen, setMcpOpen] = useState(false)

  useEffect(() => {
    if (controlled) return
    let cancelled = false
    loadTutorialSeen(member.userId)
      .then((seen) => {
        if (!cancelled && !seen) setAuto(true)
      })
      .catch(() => {
        // 취향 하나 못 읽었다고 화면을 막지 않는다. 안 뜨면 그만이다.
      })
    return () => {
      cancelled = true
    }
  }, [controlled, member.userId])

  const isOpen = controlled ? open : auto

  function close() {
    if (controlled) {
      onOpenChange?.(false)
    } else {
      setAuto(false)
      // 닫힌 것은 본 것이다. 실패해도 조용히 넘긴다 — 다음에 한 번 더 뜰 뿐이다.
      void markTutorialSeen(member.userId).catch(() => {})
    }
    setStep(0)
  }

  const last = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <DialogContent className="max-w-[34rem]">
          <DialogHeader className="pr-10">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {last ? (
                <HugeiconsIcon
                  icon={RoboticIcon}
                  strokeWidth={2}
                  className="size-3.5"
                />
              ) : null}
              {step + 1} / {STEPS.length}
            </div>
            <DialogTitle>{current.title}</DialogTitle>
            <DialogDescription>{current.lead}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-xs/relaxed">
            {current.body}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 p-4">
            {/* 걸음 표시는 눌러서 오갈 수 있다. 되돌아보고 싶을 때가 있다. */}
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  aria-label={`${i + 1}. ${s.title}`}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1 w-5 transition-colors",
                    i === step ? "bg-primary" : "bg-muted hover:bg-primary/40"
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={close}>
                {last ? "나중에" : "건너뛰기"}
              </Button>
              {last ? (
                <Button
                  size="sm"
                  onClick={() => {
                    close()
                    setMcpOpen(true)
                  }}
                >
                  연결하기
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep(step + 1)}>
                  다음
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 마지막 걸음에서 곧장 넘어가는 자리. 안내를 닫고 설치 창을 연다. */}
      <McpInstall open={mcpOpen} onOpenChange={setMcpOpen} />
    </>
  )
}
