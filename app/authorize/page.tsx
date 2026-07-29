import type { Metadata } from "next"

import { AuthorizeView } from "@/components/ip/authorize-view"

export const metadata: Metadata = {
  title: "AI 도구 접근 승인 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <AuthorizeView />
}
