import type { Metadata } from "next"

import { RegisterView } from "@/components/ip/register-view"

export const metadata: Metadata = {
  title: "IP · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <RegisterView />
}
