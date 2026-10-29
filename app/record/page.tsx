import type { Metadata } from "next"

import { RecordView } from "@/components/ip/record-view"

export const metadata: Metadata = {
  title: "기록하기 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <RecordView />
}
