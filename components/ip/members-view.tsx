"use client"

import { useCallback, useEffect, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/ip/page-header"
import { useAuth } from "@/components/ip/auth-gate"
import { supabase } from "@/lib/supabase"
import { formatDate } from "@/lib/date"
import { cn } from "@/lib/utils"

const ROLES = ["owner", "editor", "viewer"] as const
const ROLE_LABEL: Record<string, string> = {
  owner: "관리자",
  editor: "편집",
  viewer: "읽기 전용",
}

interface RequestRow {
  user_id: string
  provider: string | null
  provider_email: string | null
  display_name: string
  work_email: string | null
  message: string
  state: "pending" | "approved" | "rejected"
  requested_at: string
}

interface MemberRow {
  user_id: string
  email: string
  display_name: string | null
  role: string
  created_at: string
}

export function MembersView() {
  const { isOwner, member } = useAuth()
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [roleChoice, setRoleChoice] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [req, mem] = await Promise.all([
      supabase
        .from("access_requests")
        .select("*")
        .order("requested_at", { ascending: false }),
      supabase.from("members").select("*").order("created_at"),
    ])
    if (req.error) setError(req.error.message)
    else setRequests((req.data ?? []) as RequestRow[])
    if (mem.error) setError(mem.error.message)
    else setMembers((mem.data ?? []) as MemberRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [req, mem] = await Promise.all([
        supabase
          .from("access_requests")
          .select("*")
          .order("requested_at", { ascending: false }),
        supabase.from("members").select("*").order("created_at"),
      ])
      if (cancelled) return
      if (req.error || mem.error) {
        setError(req.error?.message ?? mem.error?.message ?? null)
      } else {
        setRequests((req.data ?? []) as RequestRow[])
        setMembers((mem.data ?? []) as MemberRow[])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function approve(userId: string) {
    setBusy(userId)
    setError(null)
    const { error: err } = await supabase.rpc("approve_access_request", {
      target: userId,
      member_role: roleChoice[userId] ?? "editor",
    })
    if (err) setError(err.message)
    await load()
    setBusy(null)
  }

  async function reject(userId: string) {
    setBusy(userId)
    setError(null)
    const { error: err } = await supabase.rpc("reject_access_request", {
      target: userId,
    })
    if (err) setError(err.message)
    await load()
    setBusy(null)
  }

  async function changeRole(userId: string, role: string) {
    setBusy(userId)
    setError(null)
    const { error: err } = await supabase
      .from("members")
      .update({ role })
      .eq("user_id", userId)
    if (err) setError(err.message)
    await load()
    setBusy(null)
  }

  async function revoke(userId: string) {
    setBusy(userId)
    setError(null)
    const { error: err } = await supabase
      .from("members")
      .delete()
      .eq("user_id", userId)
    if (err) setError(err.message)
    await load()
    setBusy(null)
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="멤버"
          description="관리자만 접근할 수 있는 화면입니다."
        />
        <div className="py-14 text-center text-muted-foreground ring-1 ring-foreground/10">
          권한이 없습니다.
        </div>
      </div>
    )
  }

  const pending = requests.filter((r) => r.state === "pending")
  const decided = requests.filter((r) => r.state !== "pending")

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="멤버"
        description="접근 신청을 승인하거나 멤버 권한을 관리합니다. 업무 이메일이 네이버웍스라 소셜 계정 이메일과 다를 수 있으니, 이름과 남긴 말로 본인을 확인한 뒤 승인하세요."
      />

      {error ? (
        <Card className="ring-red-500/25">
          <CardContent className="text-red-600 dark:text-red-400">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">
          불러오는 중…
        </div>
      ) : null}

      <Card className={pending.length > 0 ? "ring-amber-500/30" : undefined}>
        <CardHeader>
          <CardTitle>승인 대기 {pending.length}건</CardTitle>
          <CardDescription>
            승인하면 즉시 데이터에 접근할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border/60">
          {pending.length === 0 ? (
            <p className="py-3 text-muted-foreground">
              대기 중인 신청이 없습니다.
            </p>
          ) : (
            pending.map((r) => (
              <div
                key={r.user_id}
                className="flex flex-col gap-2 py-3 first:pt-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.display_name}</span>
                  <Badge variant="outline">{r.provider ?? "unknown"}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {r.provider_email ?? "소셜 이메일 없음"}
                  </span>
                  {r.work_email ? (
                    <Badge variant="secondary">{r.work_email}</Badge>
                  ) : null}
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {formatDate(r.requested_at.slice(0, 10))}
                  </span>
                </div>

                {r.message ? (
                  <p className="text-muted-foreground">{r.message}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    items={Object.fromEntries(
                      ROLES.map((x) => [x, ROLE_LABEL[x]])
                    )}
                    value={roleChoice[r.user_id] ?? "editor"}
                    onValueChange={(v) =>
                      setRoleChoice((s) => ({ ...s, [r.user_id]: String(v) }))
                    }
                  >
                    <SelectTrigger size="sm" className="min-w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((x) => (
                        <SelectItem key={x} value={x}>
                          {ROLE_LABEL[x]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="xs"
                    disabled={busy === r.user_id}
                    onClick={() => void approve(r.user_id)}
                  >
                    승인
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy === r.user_id}
                    onClick={() => void reject(r.user_id)}
                  >
                    거절
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>멤버 {members.length}명</CardTitle>
          <CardDescription>
            역할을 바꾸거나 접근을 해제할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border/60">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0"
            >
              <span className="font-medium">
                {m.display_name ?? "(이름 없음)"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {m.email}
              </span>
              {m.user_id === member.userId ? (
                <Badge variant="secondary">나</Badge>
              ) : null}

              <div className="ml-auto flex items-center gap-2">
                <Select
                  items={Object.fromEntries(
                    ROLES.map((x) => [x, ROLE_LABEL[x]])
                  )}
                  value={m.role}
                  onValueChange={(v) => void changeRole(m.user_id, String(v))}
                  disabled={busy === m.user_id || m.user_id === member.userId}
                >
                  <SelectTrigger size="sm" className="min-w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {ROLE_LABEL[x]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="xs"
                  variant="ghost"
                  className={cn("text-red-600 dark:text-red-400")}
                  disabled={busy === m.user_id || m.user_id === member.userId}
                  onClick={() => void revoke(m.user_id)}
                >
                  해제
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {decided.length > 0 ? (
        <Card size="sm">
          <CardContent className="flex flex-col gap-1 text-muted-foreground">
            <div className="text-[11px] font-medium">처리된 신청</div>
            {decided.map((r) => (
              <div
                key={r.user_id}
                className="flex flex-wrap items-center gap-2"
              >
                <span>{r.display_name}</span>
                <span className="text-[11px]">
                  {r.provider_email ?? r.work_email ?? ""}
                </span>
                <Badge variant="outline">
                  {r.state === "approved" ? "승인" : "거절"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
