import type { Metadata } from "next"

import { IntegrityView } from "@/components/ip/integrity-view"

export const metadata: Metadata = {
  title: "정합성 경고 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <IntegrityView />
}
