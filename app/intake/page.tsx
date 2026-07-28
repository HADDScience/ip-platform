import type { Metadata } from "next"

import { IntakeView } from "@/components/ip/intake-view"

export const metadata: Metadata = {
  title: "메일로 입력 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <IntakeView />
}
