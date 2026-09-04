"use client"

import { createContext, useContext, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  api,
  clearSession,
  clearSignInAttempt,
  hasTriedSignIn,
  markSignInAttempt,
  OmnisError,
  omnisSettingsUrl,
  readSession,
  redeemGrant,
  startSignIn,
  storeSession,
  takeGrantFromHash,
  type OmnisSession,
} from "@/lib/omnis"

interface Member {
  userId: string
  email: string
  displayName: string | null
  role: "owner" | "editor" | "viewer"
}

interface AuthValue {
  member: Member
  canWrite: boolean
  isOwner: boolean
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth 는 AuthGate 안에서만 쓸 수 있습니다.")
  return value
}

type Phase =
  | { kind: "loading" }
  | { kind: "signed-out"; error: string | null }
  | { kind: "not-a-member"; name: string }
  | { kind: "ready"; member: Member }

/**
 * 로그인 게이트.
 *
 * 계정의 주인은 Omnis 자체계정이다. 예전에는 Supabase 소셜 로그인으로 아무나 들어와
 * 「접근 신청」을 하고 관리자가 승인하는 구조였는데, 계정을 관리자가 만드는 Omnis
 * 계정 하나로 모으면서 그 절차가 계정 발급 시점으로 앞당겨졌다 — 그래서 신청 화면이
 * 통째로 사라졌다.
 *
 * 로그인 화면으로는 허브가 아니라 **발급자로 바로 간다.** 예전에 허브를 거친 것은
 * 허브만이 Supabase 세션을 가진 오리진이었기 때문인데, 이제 로그인 화면은 하나이므로
 * 중간에 들를 이유가 없다.
 *
 * 세션이 없으면 **버튼을 보여주지 않고 곧바로 보낸다.** 여기는 진입점이 아니다 —
 * 사람들은 Omnis 사이드바나 허브에서 이미 로그인한 채로 넘어온다. 그 상태에서
 * 「로그인」 버튼을 내밀면 계정이 두 개인 것처럼 읽힌다. 실제로 이 앱에 필요한 것은
 * 자기 audience 의 표 하나뿐이고, 그건 발급자 쿠키가 살아 있으면 눈에 보이지 않는
 * 왕복 한 번으로 끝난다.
 *
 * 다만 왕복이 표 없이 돌아올 수 있어(쿠키 차단·거절) 시도를 탭에 표시한다. 두 번째
 * 부터는 자동으로 보내지 않고 아래 화면을 보여준다 — 무한 왕복을 막는 유일한 장치다.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false

    /** 세션을 확보한 뒤, 이 사람이 구성원인지 서버에 물어본다. */
    async function settle(session: OmnisSession) {
      try {
        const snap = await api<{
          me: {
            userId: string
            email: string
            displayName: string | null
            role: Member["role"]
          }
        }>("/snapshot")
        if (cancelled) return
        setPhase({ kind: "ready", member: snap.me })
      } catch (err) {
        if (cancelled) return
        // 로그인은 됐는데 지식재산권 구성원이 아니다. 로그인 문제가 아니므로
        // 다시 로그인하라고 하면 안 된다 — 몇 번을 해도 같은 결과다.
        if (err instanceof OmnisError && err.code === "not_a_member") {
          setPhase({ kind: "not-a-member", name: session.user.name })
          return
        }
        clearSession()
        setPhase({
          kind: "signed-out",
          error: err instanceof OmnisError ? err.message : "자료를 불러오지 못했습니다.",
        })
      }
    }

    async function run() {
      const grant = takeGrantFromHash()

      if (grant) {
        try {
          const session = await redeemGrant(grant)
          if (cancelled) return
          storeSession(session)
          clearSignInAttempt()
          await settle(session)
        } catch (err) {
          if (cancelled) return
          clearSession()
          setPhase({
            kind: "signed-out",
            error: err instanceof OmnisError ? err.message : "로그인을 마치지 못했습니다.",
          })
        }
        return
      }

      const stored = readSession()
      if (!stored || stored.expiresAt <= Date.now()) {
        clearSession()
        // 이 탭에서 아직 시도한 적이 없으면 조용히 다녀온다. 이미 로그인돼 있으면
        // 화면이 깜빡이지도 않는다. loading 을 유지한 채 페이지가 떠난다.
        if (!hasTriedSignIn()) {
          startSignIn()
          return
        }
        setPhase({ kind: "signed-out", error: null })
        return
      }
      await settle(stored)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  function signOut() {
    clearSession()
    // 표시를 남기지 않으면 로그아웃하자마자 자동 진입이 다시 데려온다 —
    // 이 탭에서는 로그아웃이 불가능해진다.
    markSignInAttempt()
    setPhase({ kind: "signed-out", error: null })
  }

  if (phase.kind === "loading") {
    return (
      <Centered>
        <p className="text-muted-foreground">확인 중…</p>
      </Centered>
    )
  }

  if (phase.kind === "not-a-member") {
    return (
      <Centered>
        <div className="w-full max-w-sm">
          <div className="mb-1 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            HADD SCIENCE
          </div>
          <h1 className="font-heading text-lg font-semibold tracking-tight">
            접근 권한이 없습니다
          </h1>
          <p className="mt-2 text-xs/relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{phase.name}</span> 계정으로
            로그인했지만 지식재산권 자료를 볼 수 있는 구성원이 아닙니다. 담당자에게
            권한을 요청하세요.
          </p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" onClick={signOut}>
              다른 계정으로 로그인
            </Button>
            <a
              href={omnisSettingsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              계정 설정
            </a>
          </div>
        </div>
      </Centered>
    )
  }

  if (phase.kind === "signed-out") {
    return (
      <Centered>
        <div className="w-full max-w-sm">
          <div className="mb-1 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            HADD SCIENCE
          </div>
          <h1 className="font-heading text-lg font-semibold tracking-tight">
            지식재산권 팔로우업
          </h1>
          <p className="mt-2 text-xs/relaxed text-muted-foreground">
            HADD 계정으로 로그인하면 이 화면으로 돌아옵니다.
          </p>
          <Button size="sm" className="mt-4" onClick={() => startSignIn()}>
            HADD 계정으로 로그인
          </Button>
          {phase.error ? (
            <p role="alert" className="mt-3 text-[11px] text-red-600 dark:text-red-400">
              {phase.error}
            </p>
          ) : null}
        </div>
      </Centered>
    )
  }

  return (
    <AuthContext.Provider
      value={{
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4 text-xs">
      {children}
    </div>
  )
}
