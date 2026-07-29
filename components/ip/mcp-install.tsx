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

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { McpTokenPanel } from "@/components/ip/mcp-token-panel"

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
 * UTF-8 문자열을 base64 로.
 *
 * `btoa` 는 Latin-1 만 받아서, 토큰을 아직 발급하지 않았을 때 쓰는 한글
 * 자리표시자(`<발급한 토큰>`)에서 예외를 던진다. 그 호출이 렌더 경로에 있어서
 * 기록하기 화면 전체가 죽었다. 바이트로 바꿔 넣어 어떤 글자든 견디게 한다.
 */
function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * 커맨드와 딥링크는 각 도구의 실제 규격을 따른다. 틀리면 안내가 없느니만 못하다.
 *  * Claude Code·Gemini CLI 는 `--transport http`, Codex 는 `--url` 로 서로 다르다.
 *  * Cursor 는 설정 JSON 을 base64 로, VS Code 는 URL 인코딩으로 받는다.
 */
function buildClients(token: string | null): Client[] {
  // 토큰을 아직 발급하지 않았으면 자리를 비워 둔다. 커맨드 모양은 미리 보이되
  // 그대로 붙여넣으면 안 된다는 것이 드러나야 한다.
  const secret = token ?? "<발급한 토큰>"
  const headers = { Authorization: `Bearer ${secret}` }

  // base64 에는 `+` 와 `/` 가 섞인다. 쿼리 문자열에서 `+` 는 공백으로 읽히므로
  // 그대로 실어 보내면 받는 쪽에서 설정이 깨진다. 한 번 더 인코딩해 넘긴다.
  const cursorConfig = encodeURIComponent(
    base64Utf8(JSON.stringify({ url: MCP_URL, headers }))
  )
  const cursorLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${cursorConfig}`

  const vscodeConfig = encodeURIComponent(
    JSON.stringify({ name: SERVER_NAME, type: "http", url: MCP_URL, headers })
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
    cli(
      "Claude Code",
      `claude mcp add --transport http ${SERVER_NAME} ${MCP_URL} --header "Authorization: Bearer ${secret}"`
    ),
    // Codex 는 토큰 값이 아니라 **환경변수 이름**을 저장한다. 설정 파일에 비밀이
    // 남지 않는 대신, 쓰기 전에 그 변수를 내보내 둬야 한다.
    cli(
      "Codex",
      `export HADD_IP_TOKEN=${secret}\ncodex mcp add ${SERVER_NAME} --url ${MCP_URL} --bearer-token-env-var HADD_IP_TOKEN`
    ),
    cli(
      "Gemini CLI",
      `gemini mcp add --transport http ${SERVER_NAME} ${MCP_URL} --header "Authorization: Bearer ${secret}"`
    ),
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
          <li>아래 주소를 붙여넣습니다.</li>
          <li>
            <b>Request headers</b> 에{" "}
            <code className="bg-muted px-1">Authorization</code> ={" "}
            <code className="bg-muted px-1">Bearer {secret}</code> 를 넣고
            저장합니다.
          </li>
        </ol>
      ),
      note: "무료 요금제는 커넥터를 하나만 둘 수 있고, Pro 이상은 여러 개를 붙일 수 있습니다.",
      prompt: [
        "claude.ai 에 HADD IP 플랫폼의 MCP 서버를 커넥터로 추가하는 방법:",
        "",
        "1. 설정 → 커넥터",
        "2. 사용자 지정 커넥터 추가",
        `3. 주소 입력: ${MCP_URL}`,
        `4. Request headers 에 Authorization = Bearer ${secret}`,
      ].join("\n"),
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      showUrl: true,
      steps: (
        <ol className="ml-3.5 list-decimal space-y-1">
          <li>
            <b>설정 → 보안 및 로그인</b> 에서 <b>개발자 모드</b>를 켭니다. 회사
            요금제(Business·Enterprise)는 관리자가 Workspace Settings →
            Permissions &amp; Roles 에서 열어줘야 합니다.
          </li>
          <li>
            <b>설정 → 플러그인</b> 으로 갑니다. 예전 「커넥터」가 이름을 바꿔
            옮겨 온 자리라, 커넥터라는 메뉴는 더 이상 없습니다.
          </li>
          <li>
            플러그인 탭에서 검색창 옆 <b>+</b> 를 눌러 「새 플러그인」을 엽니다.
          </li>
          <li>
            <b>이름</b> 을 적고(예: HADD IP), <b>연결</b> 은 「서버 URL」 인
            채로 아래 주소를 넣습니다. 아이콘·설명은 건너뛰어도 됩니다.
          </li>
          <li>
            <b>인증은 「OAuth」 그대로</b> 둡니다. 토큰을 넣는 칸은 없습니다 —
            ChatGPT 는 정적 토큰을 보내지 못해서, 이쪽만 OAuth 로 붙습니다.
          </li>
          <li>
            경고 아래 <b>「내용을 이해했으며 계속 진행하길 원합니다」</b> 를
            체크하고 <b>만들기</b>. 검토되지 않았다는 경고는 공개 디렉터리에
            등재하지 않은 사내 서버라면 정상입니다.
          </li>
          <li>
            연결하면 <b>승인 화면</b>이 뜹니다. 허브 로그인 상태 그대로
            「승인」을 누르면 됩니다 — 토큰을 손으로 옮길 일이 없습니다.
          </li>
        </ol>
      ),
      note: (
        <>
          개발자 모드를 켜지 않으면 플러그인을 직접 만드는 <b>+</b> 가 보이지
          않습니다. 무료 요금제는 지원되지 않습니다.
          <br />
          <b>ChatGPT 는 위 토큰을 쓰지 않습니다.</b> 인증 방식이 OAuth·인증
          없음·혼합 셋뿐이라 정적 토큰을 보낼 자리가 없어, 이쪽만 OAuth 로
          붙습니다. 승인 화면에서 한 번 눌러 주면 끝입니다.
          <br />
          Supabase 처럼 <b>
            「Add to ChatGPT」 원클릭 버튼은 만들 수 없습니다
          </b>{" "}
          — 그 버튼은 OpenAI 플러그인 디렉터리에 심사를 거쳐 등재된 앱에만
          발급됩니다. 사내 도구를 공개 디렉터리에 올릴 일은 아니라 손으로
          추가하는 쪽을 씁니다.
        </>
      ),
      prompt: [
        "ChatGPT 에 HADD IP 플랫폼의 MCP 서버를 붙이는 방법:",
        "",
        "1. 설정 → 보안 및 로그인 → 개발자 모드 켜기. 회사 요금제는 관리자가 열어줘야 한다.",
        "2. 설정 → 플러그인 (예전 「커넥터」가 이름을 바꿔 옮겨 온 자리)",
        "3. 플러그인 탭에서 검색창 옆 + 를 눌러 「새 플러그인」 열기",
        "4. 이름: HADD IP / 연결: 서버 URL",
        `5. 서버 URL: ${MCP_URL}`,
        "6. 인증은 OAuth 그대로 둔다 (ChatGPT 는 정적 토큰을 못 보내므로 OAuth 로 붙는다)",
        "7. 「내용을 이해했으며 계속 진행하길 원합니다」 체크 후 만들기",
        "8. 승인 화면이 뜨면 「승인」 — 허브 로그인 상태 그대로 눌러 주면 된다",
      ].join("\n"),
    },
  ]
}

export function McpInstall() {
  // 방금 발급한 토큰. 커맨드·딥링크·프롬프트에 그대로 실어 보낸다.
  const [token, setToken] = useState<string | null>(null)
  const clients = useMemo(() => buildClients(token), [token])
  const [tab, setTab] = useState<string>("claude-code")
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
      </DialogTrigger>

      <DialogContent>
        <DialogHeader className="flex-row items-start justify-between gap-3 pr-10">
          <div className="min-w-0">
            <DialogTitle>AI 도구에 연결하기</DialogTitle>
            <DialogDescription>
              쓰시는 도구에 붙이면, 메일 본문을 그대로 주고 &ldquo;기록해
              줘&rdquo; 라고 말하는 것으로 입력이 끝납니다. 붙는 서버는 도구가
              달라도 하나입니다.
            </DialogDescription>
          </div>
        </DialogHeader>

        <McpTokenPanel onToken={setToken} />

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
            커맨드에는 토큰이 그대로 들어갑니다.{" "}
            <b>화면 공유·메신저·티켓에 붙여넣지 마세요.</b> 새어 나갔다 싶으면
            위에서 재발급하면 옛 토큰은 즉시 죽습니다.
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
              <HugeiconsIcon
                icon={Mail01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
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
      {/* Codex 처럼 두 줄짜리 커맨드가 있어 줄바꿈은 살린다. */}
      <code className="min-w-0 flex-1 overflow-x-auto bg-muted px-2 py-1.5 text-[10.5px] whitespace-pre text-foreground">
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
