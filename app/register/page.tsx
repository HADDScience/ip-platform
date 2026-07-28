import type { Metadata } from "next"

import { RegisterView } from "@/components/ip/register-view"

export const metadata: Metadata = {
  title: "대장 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <RegisterView />
}
