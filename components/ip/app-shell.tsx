"use client"

import { AuthGate } from "@/components/ip/auth-gate"
import { DataProvider } from "@/components/ip/data-provider"
import { SiteHeader } from "@/components/ip/site-header"
import { SiteNav } from "@/components/ip/site-nav"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <DataProvider>
        <div className="flex min-h-svh flex-col bg-background">
          <SiteHeader />
          <SiteNav />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
            {children}
          </main>
          <footer className="border-t border-border/60 py-5">
            <div className="mx-auto w-full max-w-[1400px] px-4 text-xs text-muted-foreground sm:px-6">
              HADD SCIENCE 지식재산권 팔로우업 · 모든 변경은 즉시 저장되고 수정
              이력이 남습니다.
            </div>
          </footer>
        </div>
      </DataProvider>
    </AuthGate>
  )
}
