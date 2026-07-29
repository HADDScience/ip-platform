"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  Copy01Icon,
  Mail01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * AI 도구 설치 안내.
 *
 * 메일에서 값을 뽑는 일은 규칙으로 짜맞추는 것보다 LLM 이 훨씬 잘한다. 그래서
 * 파싱을 우리 화면에 더 넣는 대신, 진행 기록을 읽고 쓰는 MCP 서버를 두고 각자
 * 쓰는 도구에 붙이게 한다.
 *
 * 원격(HTTP) MCP 하나로 통일한 이유는 브라우저에서 LLM 을 쓰는 사람 때문이다.
 * stdio 로 만들면 CLI 에서만 되지만, HTTP 로 두면 claude.ai·ChatGPT 의 커스텀
 * 커넥터로 같은 서버를 그대로 붙일 수 있다.
 */

/** 서버 주소. 값 자체는 브라우저 번들에 이미 들어 있는 공개 값이다. */
const MCP_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/ip-mcp`

/** 커맨드는 각 CLI 의 실제 문법을 따른다. 틀리면 안내가 없느니만 못하다. */
const CLI_TOOLS: { name: string; command: string }[] = [
  {
    name: "Claude Code",
    command: `claude mcp add --transport http hadd-ip ${MCP_URL}`,
  },
  {
    name: "Codex",
    command: `codex mcp add hadd-ip --url ${MCP_URL}`,
  },
  {
    name: "Gemini CLI",
    command: `gemini mcp add --transport http hadd-ip ${MCP_URL}`,
  },
]

export function McpInstall() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // 바깥을 누르거나 Esc 를 누르면 닫는다.
  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    } catch {
      // 클립보드가 막힌 환경(비 HTTPS 등). 값은 화면에 그대로 보이니 손으로 복사한다.
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/15 transition-colors hover:text-foreground"
      >
        AI 도구 설치하기 (MCP)
        <Badge className="bg-amber-500/15 text-[9px] text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
          준비 중
        </Badge>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="absolute top-full right-0 z-50 mt-1 w-[min(92vw,29rem)] border border-border/60 bg-background p-3 shadow-lg">
          <p className="text-[11px]/relaxed text-muted-foreground">
            쓰시는 도구에 아래 한 줄을 붙이면, 메일 본문을 그대로 주고
            &ldquo;기록해 줘&rdquo; 라고 말하는 것으로 입력이 끝납니다.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {CLI_TOOLS.map((tool) => (
              <div key={tool.name}>
                <div className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {tool.name}
                </div>
                <CopyRow
                  text={tool.command}
                  copied={copied === tool.name}
                  onCopy={() => void copy(tool.name, tool.command)}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              브라우저에서 쓰신다면
            </div>
            <p className="text-[11px]/relaxed text-muted-foreground">
              claude.ai 는 <b>설정 → 커넥터 → 사용자 지정 커넥터 추가</b>,
              ChatGPT 는 <b>설정 → 커넥터</b> 에서 같은 주소를 넣으면 됩니다.
              설치 없이 CLI 와 같은 기능을 씁니다.
            </p>
            <div className="mt-1.5">
              <CopyRow
                text={MCP_URL}
                copied={copied === "url"}
                onCopy={() => void copy("url", MCP_URL)}
              />
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-3">
            <p className="text-[11px]/relaxed text-muted-foreground">
              서버는 아직 올라가지 않았습니다. 그때까지는 메일 본문을 붙여넣어
              양식을 채우는 기존 방법을 쓰세요.
            </p>
            <Link
              href="/intake"
              className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/15 transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-3.5" />
              메일 붙여넣기
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CopyRow({
  text,
  copied,
  onCopy,
}: {
  text: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex items-stretch gap-1">
      <code className="min-w-0 flex-1 overflow-x-auto bg-muted px-2 py-1.5 text-[10.5px] whitespace-nowrap text-foreground">
        {text}
      </code>
      <button
        type="button"
        onClick={onCopy}
        aria-label="복사"
        className="flex shrink-0 items-center gap-1 px-2 text-[10.5px] font-medium text-muted-foreground ring-1 ring-foreground/15 transition-colors hover:text-foreground"
      >
        <HugeiconsIcon
          icon={copied ? Tick02Icon : Copy01Icon}
          strokeWidth={2}
          className="size-3.5"
        />
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  )
}
