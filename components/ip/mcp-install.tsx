"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  LinkSquare02Icon,
  Mail01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"

/**
 * AI 도구 설치 안내.
 *
 * 메일에서 값을 뽑는 일은 규칙으로 짜맞추는 것보다 LLM 이 훨씬 잘한다. 그래서
 * 파싱을 우리 화면에 더 넣는 대신, 진행 기록을 읽고 쓰는 MCP 서버를 두고 각자
 * 쓰는 도구에 붙이게 한다.
 *
 * 원격(HTTP) MCP 하나로 통일한 이유는 브라우저에서 LLM 을 쓰는 사람 때문이다.
 * stdio 로 만들면 CLI 에서만 되지만, HTTP 로 두면 claude.ai·ChatGPT 의 커스텀
 * 커넥터로 같은 서버를 그대로 붙일 수 있다. 도구가 달라도 붙는 서버는 하나다.
 *
 * 붙이는 방법은 도구마다 세 갈래로 갈린다.
 *  * 딥링크가 있는 편집기(Cursor·VS Code) — 버튼 한 번
 *  * CLI(Claude Code·Codex·Gemini) — 커맨드 한 줄
 *  * 웹(claude.ai·ChatGPT) — 설정에서 손으로 추가
 * 그래서 도구별 탭으로 나눈다. 사람은 자기가 쓰는 도구 하나만 알면 된다.
 */

/** 서버 주소. 값 자체는 브라우저 번들에 이미 들어 있는 공개 값이다. */
const MCP_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/ip-mcp`

/** MCP 클라이언트가 서버를 부르는 이름. 딥링크와 커맨드에서 같아야 한다. */
const SERVER_NAME = "hadd-ip"

interface Client {
  id: string
  /** 탭에 적을 짧은 이름 */
  name: string
  /** 커맨드 한 줄로 끝나는 도구라면 그 커맨드 */
  command?: string
  /** 눌러서 바로 설치되는 도구라면 그 딥링크 */
  install?: string
  /** 손으로 설정해야 하는 도구라면 그 절차 */
  steps?: React.ReactNode
  /** 커맨드 대신 주소만 필요할 때 */
  showUrl?: boolean
  note?: React.ReactNode
  /** 「프롬프트 복사」가 내보낼 글. 에이전트가 그대로 읽고 실행할 수 있어야 한다. */
  prompt: string
}

/**
 * 커맨드와 딥링크는 각 도구의 실제 규격을 따른다. 틀리면 안내가 없느니만 못하다.
 *  * Claude Code·Gemini CLI 는 `--transport http`, Codex 는 `--url` 로 서로 다르다.
 *  * Cursor 는 설정 JSON 을 base64 로, VS Code 는 URL 인코딩으로 받는다.
 */
function buildClients(): Client[] {
  const cursorConfig = btoa(JSON.stringify({ url: MCP_URL }))
  const cursorLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${cursorConfig}`

  const vscodeConfig = encodeURIComponent(
    JSON.stringify({ name: SERVER_NAME, type: "http", url: MCP_URL })
  )
  const vscodeLink = `vscode:mcp/install?${vscodeConfig}`

  const cli = (label: string, command: string): Client => ({
    id: label.toLowerCase().replace(/\s+/g, "-"),
    name: label,
    command,
    prompt: [
      `HADD IP 플랫폼의 MCP 서버를 ${label} 에 붙여 줘.`,
      "",
      "아래 커맨드를 실행하면 된다:",
      command,
      "",
      "설치한 뒤 도구 목록이 보이는지 확인해 줘.",
    ].join("\n"),
  })

  return [
    cli("Claude Code", `claude mcp add --transport http ${SERVER_NAME} ${MCP_URL}`),
    cli("Codex", `codex mcp add ${SERVER_NAME} --url ${MCP_URL}`),
    cli("Gemini CLI", `gemini mcp add --transport http ${SERVER_NAME} ${MCP_URL}`),
    {
      id: "cursor",
      name: "Cursor",
      install: cursorLink,
      showUrl: true,
      note: "버튼이 반응하지 않으면 Cursor 가 설치돼 있지 않거나 브라우저가 앱 실행을 막은 것입니다. 그때는 설정 → MCP 에 위 주소를 직접 넣으세요.",
      prompt: [
        "HADD IP 플랫폼의 MCP 서버를 Cursor 에 붙여 줘.",
        "",
        `이름: ${SERVER_NAME}`,
        `주소(streamable HTTP): ${MCP_URL}`,
        "",
        "설정 → MCP 에 추가한 뒤 도구 목록이 보이는지 확인해 줘.",
      ].join("\n"),
    },
    {
      id: "vscode",
      name: "VS Code",
      install: vscodeLink,
      showUrl: true,
      note: "버튼이 반응하지 않으면 VS Code 가 설치돼 있지 않거나 브라우저가 앱 실행을 막은 것입니다. 그때는 MCP: Add Server 명령에서 위 주소를 직접 넣으세요.",
      prompt: [
        "HADD IP 플랫폼의 MCP 서버를 VS Code 에 붙여 줘.",
        "",
        `이름: ${SERVER_NAME}`,
        `형식: http`,
        `주소: ${MCP_URL}`,
        "",
        "MCP: Add Server 로 추가한 뒤 도구 목록이 보이는지 확인해 줘.",
      ].join("\n"),
    },
    {
      id: "claude-ai",
      name: "claude.ai",
      showUrl: true,
      steps: (
        <ol className="ml-3.5 list-decimal space-y-1">
          <li>
            <b>설정 → 커넥터</b> 로 들어갑니다.
          </li>
          <li>
            <b>사용자 지정 커넥터 추가</b> 를 누릅니다.
          </li>
          <li>아래 주소를 붙여넣고 저장합니다.</li>
        </ol>
      ),
      note: "무료 요금제는 커넥터를 하나만 둘 수 있고, Pro 이상은 여러 개를 붙일 수 있습니다.",
      prompt: [
        "claude.ai 에 HADD IP 플랫폼의 MCP 서버를 커넥터로 추가하는 방법:",
        "",
        "1. 설정 → 커넥터",
        "2. 사용자 지정 커넥터 추가",
        `3. 주소 입력: ${MCP_URL}`,
      ].join("\n"),
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      showUrl: true,
      steps: (
        <ol className="ml-3.5 list-decimal space-y-1">
          <li>
            <b>개발자 모드를 먼저 켭니다.</b>{" "}
            개인 요금제(Plus·Pro)는 설정에서 직접 켜고, 회사
            요금제(Business·Enterprise)는 관리자가 Workspace Settings → Permissions
            &amp; Roles 에서 열어줘야 합니다.
          </li>
          <li>
            <b>설정 → 커넥터</b> 에서 커스텀 커넥터를 추가합니다.
          </li>
          <li>아래 주소를 붙여넣고 저장합니다.</li>
        </ol>
      ),
      note: (
        <>
          개발자 모드를 켜지 않으면 커넥터를 추가하는 메뉴 자체가 보이지 않습니다.
          무료 요금제는 지원되지 않습니다.
          <br />
          Supabase 처럼 <b>「Add to ChatGPT」 원클릭 버튼은 만들 수 없습니다</b> —
          그 버튼은 OpenAI 앱 디렉터리에 심사를 거쳐 등재된 앱에만 발급됩니다.
          사내 도구를 공개 디렉터리에 올릴 일은 아니라 손으로 추가하는 쪽을 씁니다.
        </>
      ),
      prompt: [
        "ChatGPT 에 HADD IP 플랫폼의 MCP 서버를 커넥터로 추가하는 방법:",
        "",
        "1. 개발자 모드를 켠다 (설정 → 커넥터 → 고급). 회사 요금제는 관리자가 열어줘야 한다.",
        "2. 설정 → 커넥터에서 커스텀 커넥터 추가",
        `3. 주소 입력: ${MCP_URL}`,
      ].join("\n"),
    },
  ]
}

export function McpInstall() {
  const clients = useMemo(() => buildClients(), [])
  const [tab, setTab] = useState<string>(clients[0].id)
  const [copied, setCopied] = useState<string | null>(null)

  const current = clients.find((c) => c.id === tab) ?? clients[0]

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
    <Dialog>
      <DialogTrigger className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/15 transition-colors hover:text-foreground">
        AI 도구 설치하기 (MCP)
        <Badge className="bg-amber-500/15 text-[9px] text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
          준비 중
        </Badge>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader className="flex-row items-start justify-between gap-3 pr-10">
          <div className="min-w-0">
            <DialogTitle>AI 도구에 연결하기</DialogTitle>
            <DialogDescription>
              쓰시는 도구에 붙이면, 메일 본문을 그대로 주고 &ldquo;기록해 줘&rdquo;
              라고 말하는 것으로 입력이 끝납니다. 붙는 서버는 도구가 달라도
              하나입니다.
            </DialogDescription>
          </div>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(String(value))}
          className="min-h-0 flex-1"
        >
          <TabsList className="px-4">
            {clients.map((client) => (
              <TabsTab key={client.id} value={client.id}>
                {client.name}
              </TabsTab>
            ))}
          </TabsList>

          {clients.map((client) => (
            <TabsPanel
              key={client.id}
              value={client.id}
              className="min-h-0 flex-1 overflow-y-auto p-4"
            >
              {client.command ? (
                <>
                  <p className="mb-2 text-muted-foreground">
                    터미널에 아래 한 줄을 붙여넣으세요.
                  </p>
                  <CopyRow
                    text={client.command}
                    copied={copied === client.id}
                    onCopy={() => void copy(client.id, client.command!)}
                  />
                </>
              ) : null}

              {client.install ? (
                <>
                  <p className="mb-2 text-muted-foreground">
                    버튼 한 번으로 설치됩니다.
                  </p>
                  <a
                    href={client.install}
                    className="inline-flex items-center gap-1.5 bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <HugeiconsIcon
                      icon={LinkSquare02Icon}
                      strokeWidth={2}
                      className="size-3.5"
                    />
                    {client.name} 에 설치
                  </a>
                </>
              ) : null}

              {client.steps ? (
                <div className="text-muted-foreground">{client.steps}</div>
              ) : null}

              {client.showUrl ? (
                <div className="mt-2.5">
                  <CopyRow
                    text={MCP_URL}
                    copied={copied === client.id}
                    onCopy={() => void copy(client.id, MCP_URL)}
                  />
                </div>
              ) : null}

              {client.note ? (
                <p className="mt-2.5 text-[11px]/relaxed text-muted-foreground">
                  {client.note}
                </p>
              ) : null}
            </TabsPanel>
          ))}
        </Tabs>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 p-4">
          <p className="text-[11px]/relaxed text-muted-foreground">
            서버는 아직 올라가지 않았습니다. 그때까지는 메일 본문을 붙여넣어 양식을
            채우는 기존 방법을 쓰세요.
          </p>
          <div className="flex items-center gap-1.5">
            {/* 안내를 통째로 복사해 에이전트에게 넘기는 길. 손으로 옮기지 않아도 된다. */}
            <button
              type="button"
              onClick={() => void copy("prompt", current.prompt)}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/15 transition-colors hover:text-foreground"
            >
              <HugeiconsIcon
                icon={copied === "prompt" ? Tick02Icon : Copy01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {copied === "prompt" ? "복사됨" : "프롬프트 복사"}
            </button>
            <Link
              href="/intake"
              className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/15 transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-3.5" />
              메일 붙여넣기
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
