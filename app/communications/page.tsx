import type { Metadata } from "next"

import { CommunicationView } from "@/components/ip/communication-view"

export const metadata: Metadata = {
  title: "커뮤니케이션 로그 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <CommunicationView />
}
