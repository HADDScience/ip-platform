import type { Metadata } from "next"

import { TrademarkView } from "@/components/ip/trademark-view"

export const metadata: Metadata = {
  title: "상표 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <TrademarkView />
}
