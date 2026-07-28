/**
 * data/seed.json 의 타입 정의.
 * 시드는 실제 업무 데이터이므로 값은 그대로 두고, 여기서 형태만 고정한다.
 */

export const TRADEMARK_STATUSES = [
  "등록완료",
  "출원준비",
  "검토중",
  "거절결정",
  "중단",
  "아이디어",
] as const
export type TrademarkStatus = (typeof TRADEMARK_STATUSES)[number]

export const PATENT_STATUSES = ["등록", "출원", "출원준비"] as const
export type PatentStatus = (typeof PATENT_STATUSES)[number]

export const PRIORITIES = ["높음", "보통", "낮음"] as const
export type Priority = (typeof PRIORITIES)[number]

export const TARGETS = ["상표", "특허", "관리"] as const
export type Target = (typeof TARGETS)[number]

export type Direction = "발신" | "수신"

export interface Firm {
  name: string
  attorney: string
  email: string
  tel: string
  mobile: string
  staff: string[]
}

export interface Meta {
  org: string
  /** 시드 스냅샷 기준일 (KST, YYYY-MM-DD) */
  asOf: string
  owner: string
  firm: Firm
  note: string
}

export interface Trademark {
  id: string
  name: string
  nameKo: string
  classes: string[]
  goods: string | null
  regNo: string | null
  /** 등록일 또는 최종 진행일 (KST, YYYY-MM-DD) */
  date: string | null
  holder: string | null
  status: TrademarkStatus
  /** 변리사 판단 등록가능성(%) */
  probability: number | null
  note: string
}

export interface Patent {
  id: string
  title: string
  appNo: string | null
  regNo: string | null
  date: string | null
  applicant: string
  status: PatentStatus
  note: string
}

export interface Communication {
  /** DB uuid. 신규 작성 중인 항목은 아직 없을 수 있다. */
  id: string
  date: string
  dir: Direction
  from: string
  to: string
  target: Target
  subject: string
  body: string
  attachments: string[]
  followUp: string
  /** 미결(후속 조치 필요) 여부 */
  open: boolean
  /** Gmail 원문 딥링크에 쓰는 스레드 ID */
  threadId: string | null
  /** 연결된 상표/특허 ID */
  links: CommunicationLink[]
}

export interface CommunicationLink {
  kind: "trademark" | "patent"
  id: string
}

export const ACTION_STATES = ["open", "done", "dropped"] as const
export type ActionState = (typeof ACTION_STATES)[number]

export const ACTION_STATE_LABEL: Record<ActionState, string> = {
  open: "미결",
  done: "완료",
  dropped: "보류/취소",
}

export interface ActionItem {
  id: string
  target: Target
  subject: string
  requestedAt: string | null
  requester: string | null
  todo: string
  owner: string
  priority: Priority
  note: string
  state: ActionState
  resolution: string | null
  resolvedAt: string | null
}

export const FLAG_STATES = ["open", "resolved", "dismissed"] as const
export type FlagState = (typeof FLAG_STATES)[number]

export const FLAG_STATE_LABEL: Record<FlagState, string> = {
  open: "확인 필요",
  resolved: "해결됨",
  dismissed: "해당 없음",
}

/** ip.integrity_flags 한 행 */
export interface IntegrityFlagRow {
  id: string
  entityKind: "trademark" | "patent" | "action" | "general"
  entityId: string | null
  message: string
  source: "note" | "detector" | "manual"
  state: FlagState
  resolution: string | null
  resolvedAt: string | null
}

/** 상태 룩업 (ip.status_options) */
export interface StatusOption {
  kind: "trademark" | "patent"
  value: string
  sortOrder: number
  tone: string
  isOpen: boolean
}

export interface SeedData {
  meta: Meta
  trademarks: Trademark[]
  patents: Patent[]
  communications: Communication[]
  actions: ActionItem[]
}

/** 상표/특허 어느 쪽이든 "정체 판정" 대상이 되는 공통 형태 */
export interface StaleItem {
  kind: "상표" | "특허"
  id: string
  label: string
  status: string
  date: string | null
  days: number | null
}

/** note 안에서 "※" 로 시작하는 확인 필요 문구를 뽑아낸 결과 */
export interface IntegrityFlag {
  kind: "상표" | "특허"
  id: string
  label: string
  status: string
  message: string
}
