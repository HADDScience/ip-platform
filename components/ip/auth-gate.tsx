"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  GoogleSignInButton,
  KakaoSignInButton,
} from "@/components/ip/social-buttons"
import { supabase } from "@/lib/supabase"
import {
  clearHubLoginTried,
  goToHubLogin,
  hasTriedHubLogin,
  hubUrl,
  markHubLoginTried,
} from "@/lib/hub"

interface Member {
  userId: string
  email: string
  displayName: string | null
  role: "owner" | "editor" | "viewer"
}

interface AuthValue {
  session: Session
  member: Member
  canWrite: boolean
  isOwner: boolean
  signOut: () => Promise<void>
}

/**
 * 카카오 로그인 노출 여부.
 *
 * 아래 로그인 버튼은 **로컬 개발 폴백 전용**이다. 배포 환경에서 로그인 화면은
 * 허브 하나뿐이고, 이 앱은 허브로 보내기만 한다(`lib/hub.ts`).
 *
 * Supabase 의 카카오 프로바이더는 `account_email profile_image profile_nickname` 를
 * 고정으로 요청한다. 클라이언트의 scopes 옵션은 이 기본값을 대체하지 않고 덧붙기만 하고,
 * `external_kakao_email_optional` 도 응답 처리에만 영향을 줄 뿐 요청 scope 를 바꾸지 않는다.
 * (supabase/supabase#36878 로 아직 열려 있는 문제)
 *
 * 카카오는 설정되지 않은 동의항목이 섞여 있으면 KOE205 로 인가를 거절하므로,
 * 콘솔에서 해당 항목을 열어야 로그인이 된다. 2026-07-28 개인 개발자 비즈 앱 전환과
 * 동의항목 설정을 마쳐 활성화했다.
 *
 * 이메일은 우리 쪽에서 필수가 아니다. 승인은 관리자 승인으로 이뤄지고,
 * 멤버 식별자는 신청서의 업무 이메일을 우선한다(20260728070000_prefer_work_email).
 */
const KAKAO_ENABLED = true

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth 는 AuthGate 안에서만 쓸 수 있습니다.")
  return value
}

type RequestState = "pending" | "approved" | "rejected"

type Phase =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "leaving" }
  | { kind: "needs-request"; session: Session }
  | { kind: "awaiting"; session: Session; state: RequestState }
  | { kind: "ready"; session: Session; member: Member }

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function resolve(session: Session | null) {
      if (cancelled) return
      if (!session) {
        // 로그인 화면은 허브 하나뿐이다. 돌아올 자리를 들려 허브로 보낸다.
        // 허브를 쓸 수 없거나(로컬) 이미 다녀왔으면 아래 signed-out 화면을 쓴다.
        if (hubUrl() && !hasTriedHubLogin()) {
          markHubLoginTried()
          setPhase({ kind: "leaving" })
          goToHubLogin()
          return
        }
        setPhase({ kind: "signed-out" })
        return
      }

      // 허브 왕복이 성사됐다. 다음 로그아웃 때 다시 보낼 수 있게 표시를 지운다.
      clearHubLoginTried()

      const { data: memberRow } = await supabase
        .from("members")
        .select("user_id, email, display_name, role")
        .eq("user_id", session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (memberRow) {
        const row = memberRow as {
          user_id: string
          email: string
          display_name: string | null
          role: Member["role"]
        }
        setPhase({
          kind: "ready",
          session,
          member: {
            userId: row.user_id,
            email: row.email,
            displayName: row.display_name,
            role: row.role,
          },
        })
        return
      }

      // 멤버가 아니면 접근 요청 상태를 본다.
      const { data: reqRow } = await supabase
        .from("access_requests")
        .select("state")
        .eq("user_id", session.user.id)
        .maybeSingle()

      if (cancelled) return

      const state = (reqRow as { state: RequestState } | null)?.state
      setPhase(
        state && state !== "rejected"
          ? { kind: "awaiting", session, state }
          : state === "rejected"
            ? { kind: "awaiting", session, state }
            : { kind: "needs-request", session }
      )
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      resolve(session)
    )

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signIn(provider: "google" | "kakao") {
    setPending(provider)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.href },
    })
    if (error) {
      setPending(null)
      alert(`로그인을 시작하지 못했습니다: ${error.message}`)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setPhase({ kind: "signed-out" })
  }

  if (phase.kind === "loading" || phase.kind === "leaving") {
    return (
      <Centered>
        <p className="text-muted-foreground">
          {phase.kind === "leaving"
            ? "허브 로그인 화면으로 이동 중…"
            : "확인 중…"}
        </p>
      </Centered>
    )
  }

  if (phase.kind === "signed-out") {
    // 허브에 다녀왔는데도 세션이 없다. 자동 재이동은 무한 왕복이 되므로 손으로 맡긴다.
    if (hubUrl()) {
      return (
        <Centered>
          <div className="w-full max-w-xs">
            <div className="mb-1 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              HADD SCIENCE
            </div>
            <h1 className="font-heading text-lg font-semibold tracking-tight">
              지식재산권 팔로우업
            </h1>
            <p className="mt-2 text-xs/relaxed text-muted-foreground">
              허브에서 로그인이 완료되지 않았습니다. 다시 시도해 주세요.
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => {
                markHubLoginTried()
                setPhase({ kind: "leaving" })
                goToHubLogin()
              }}
            >
              허브에서 로그인
            </Button>
          </div>
        </Centered>
      )
    }

    // 로컬 개발 폴백 — 배포 환경에서는 여기까지 오지 않는다.
    return (
      <Centered>
        <div className="w-full max-w-xs">
          <div className="mb-1 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            HADD SCIENCE
          </div>
          <h1 className="font-heading text-lg font-semibold tracking-tight">
            지식재산권 팔로우업
          </h1>
          <p className="mt-2 text-xs/relaxed text-muted-foreground">
            로컬 개발용 로그인입니다. 배포 환경에서는 허브 로그인 화면을 씁니다.
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <GoogleSignInButton
              onClick={() => signIn("google")}
              disabled={pending !== null}
              pending={pending === "google"}
            />
            {KAKAO_ENABLED ? (
              <KakaoSignInButton
                onClick={() => signIn("kakao")}
                disabled={pending !== null}
                pending={pending === "kakao"}
              />
            ) : null}
          </div>
        </div>
      </Centered>
    )
  }

  if (phase.kind === "needs-request") {
    return (
      <Centered>
        <AccessRequestForm
          session={phase.session}
          onDone={() =>
            setPhase({
              kind: "awaiting",
              session: phase.session,
              state: "pending",
            })
          }
          onSignOut={signOut}
        />
      </Centered>
    )
  }

  if (phase.kind === "awaiting") {
    const rejected = phase.state === "rejected"
    return (
      <Centered>
        <div className="w-full max-w-sm">
          <h1 className="font-heading text-base font-semibold">
            {rejected ? "접근이 거절되었습니다" : "승인 대기 중입니다"}
          </h1>
          <p className="mt-2 text-xs/relaxed text-muted-foreground">
            {rejected
              ? "담당자에게 문의하시거나, 정보를 수정해 다시 신청할 수 있습니다."
              : "관리자(정우창)가 승인하면 바로 이용할 수 있습니다. 승인 후 이 페이지를 새로고침해 주세요."}
          </p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              새로고침
            </Button>
            {rejected ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPhase({ kind: "needs-request", session: phase.session })
                }
              >
                다시 신청
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => void signOut()}>
              로그아웃
            </Button>
          </div>
        </div>
      </Centered>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        session: phase.session,
        member: phase.member,
        canWrite: phase.member.role !== "viewer",
        isOwner: phase.member.role === "owner",
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

function AccessRequestForm({
  session,
  onDone,
  onSignOut,
}: {
  session: Session
  onDone: () => void
  onSignOut: () => Promise<void>
}) {
  const providerEmail = session.user.email ?? ""
  const meta = session.user.user_metadata as Record<string, unknown>
  const [name, setName] = useState(
    String(meta?.full_name ?? meta?.name ?? "") || ""
  )
  // 업무 이메일은 더 이상 묻지 않는다. 소셜 계정이 이미 회사 주소면 그것을
  // 그대로 쓰고, 아니면 관리자가 승인하며 사람을 알아본다 — 승인이 있는데 주소를
  // 한 번 더 받아 적는 것은 신청자에게 일만 늘린다. work_email 칸은 남겨 둔다.
  // 이미 적어 낸 사람들의 값이 식별자로 쓰이고 있다.
  const workEmail = providerEmail.endsWith("@haddscience.com")
    ? providerEmail
    : ""
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) {
      setError("이름을 입력해 주세요.")
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from("access_requests").upsert({
      user_id: session.user.id,
      provider: session.user.app_metadata?.provider ?? null,
      provider_email: providerEmail || null,
      display_name: name.trim(),
      work_email: workEmail.trim() || null,
      message: message.trim(),
      state: "pending",
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onDone()
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-heading text-base font-semibold">접근 신청</h1>
      <p className="mt-2 text-xs/relaxed text-muted-foreground">
        관리자가 확인할 수 있도록 본인 정보를 남겨 주세요. 승인 후 이용할 수
        있습니다.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <Field label="이름" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="정우창"
            className="h-8 text-xs"
          />
        </Field>

        <Field label="남길 말">
          <Textarea
            value={message}
            rows={2}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="소속·용도 등"
            className="text-xs"
          />
        </Field>

        <p className="text-[11px] text-muted-foreground">
          로그인 계정:{" "}
          <span className="font-medium text-foreground">
            {providerEmail || "(이메일 없음 · 카카오)"}
          </span>
        </p>

        {error ? (
          <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        <div className="flex gap-2">
          <Button size="sm" onClick={() => void submit()} disabled={saving}>
            {saving ? "보내는 중…" : "신청하기"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void onSignOut()}>
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4 text-xs">
      {children}
    </div>
  )
}
