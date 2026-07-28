"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"

import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"

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
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth 는 AuthGate 안에서만 쓸 수 있습니다.")
  return value
}

type Phase =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "no-access"; email: string }
  | { kind: "ready"; session: Session; member: Member }

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function resolve(session: Session | null) {
      if (cancelled) return
      if (!session) {
        setPhase({ kind: "signed-out" })
        return
      }

      // 허용목록에 없는 계정은 로그인은 되지만 멤버 행이 없다.
      const { data, error } = await supabase
        .from("members")
        .select("user_id, email, display_name, role")
        .eq("user_id", session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        setPhase({
          kind: "no-access",
          email: session.user.email ?? "(이메일 없음)",
        })
        return
      }

      const row = data as {
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
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      resolve(session)
    })

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

  if (phase.kind === "loading") {
    return (
      <Centered>
        <p className="text-muted-foreground">확인 중…</p>
      </Centered>
    )
  }

  if (phase.kind === "signed-out") {
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
            사내 계정으로 로그인해야 열람할 수 있습니다.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <Button
              onClick={() => signIn("google")}
              disabled={pending !== null}
              className="w-full"
            >
              {pending === "google" ? "이동 중…" : "Google 계정으로 로그인"}
            </Button>
            <Button
              variant="outline"
              onClick={() => signIn("kakao")}
              disabled={pending !== null}
              className="w-full"
            >
              {pending === "kakao" ? "이동 중…" : "카카오로 로그인"}
            </Button>
          </div>

          <p className="mt-4 text-[11px] text-muted-foreground">
            허브에서 이미 로그인하셨다면 자동으로 통과됩니다.
          </p>
        </div>
      </Centered>
    )
  }

  if (phase.kind === "no-access") {
    return (
      <Centered>
        <div className="w-full max-w-sm">
          <h1 className="font-heading text-base font-semibold">
            접근 권한이 없습니다
          </h1>
          <p className="mt-2 text-xs/relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{phase.email}</span>{" "}
            계정은 허용 목록에 없습니다. 담당자(정우창)에게 이 이메일로 권한
            요청을 남겨 주세요.
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            카카오 계정으로 로그인하셨고 이메일이 표시되지 않는다면, 카카오
            이메일 제공 동의가 꺼져 있는 경우입니다. Google 계정으로 시도해
            보세요.
          </p>
          <Button variant="outline" onClick={signOut} className="mt-4">
            다른 계정으로 로그인
          </Button>
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
