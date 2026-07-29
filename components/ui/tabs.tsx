"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex shrink-0 gap-1 overflow-x-auto border-b border-border/60",
        className
      )}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      // Base UI 의 탭은 선택 상태를 `data-selected` 가 아니라 aria-selected 로
      // 알린다(`data-active` 도 같이 붙는다). 표준 속성 쪽에 걸어 둔다.
      className={cn(
        "relative shrink-0 px-2.5 py-2 text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-selected:text-foreground aria-selected:after:absolute aria-selected:after:inset-x-2 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:bg-primary aria-selected:after:content-['']",
        // 못 쓰는 탭. 커서만 막고 hover 는 살려 둔다 — 이유를 title 로 읽혀야 해서
        // pointer-events 를 끄면 안 된다.
        "disabled:cursor-not-allowed disabled:text-muted-foreground/45 disabled:line-through disabled:hover:text-muted-foreground/45 data-disabled:cursor-not-allowed data-disabled:text-muted-foreground/45 data-disabled:line-through",
        className
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTab, TabsPanel }
