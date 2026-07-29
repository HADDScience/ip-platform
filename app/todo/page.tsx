import type { Metadata } from "next"

import { TodoView } from "@/components/ip/todo-view"

export const metadata: Metadata = {
  title: "밀린 IP 업무 · HADD SCIENCE 지식재산권 팔로우업",
}

export default function Page() {
  return <TodoView />
}
