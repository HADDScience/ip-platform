import type { Metadata } from "next"

import { PatentView } from "@/components/ip/patent-view"

export const metadata: Metadata = {
  title: "특허 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <PatentView />
}
