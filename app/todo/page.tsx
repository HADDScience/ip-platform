import type { Metadata } from "next"

import { TodoView } from "@/components/ip/todo-view"

export const metadata: Metadata = {
  title: "내 차례 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <TodoView />
}
