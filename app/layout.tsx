import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppShell } from "@/components/ip/app-shell"
import { cn } from "@/lib/utils"

// Inter/Geist Mono 에는 한글 글리프가 없으므로 시스템 고딕으로 폴백시킨다.
// next/font 는 옵션 값이 리터럴이어야 해서 배열을 그대로 적는다.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  fallback: [
    "Pretendard",
    "Apple SD Gothic Neo",
    "Noto Sans KR",
    "Malgun Gothic",
    "system-ui",
    "sans-serif",
  ],
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Apple SD Gothic Neo",
    "Noto Sans KR",
    "Malgun Gothic",
    "monospace",
  ],
})

export const metadata: Metadata = {
  title: "HADD SCIENCE 지식재산권 팔로우업",
  description:
    "HADD SCIENCE 상표·특허 현황과 미결 액션을 한 화면에서 팔로우업하는 내부 플랫폼",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
