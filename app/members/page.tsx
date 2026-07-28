import type { Metadata } from "next"

import { MembersView } from "@/components/ip/members-view"

export const metadata: Metadata = {
  title: "멤버 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <MembersView />
}
