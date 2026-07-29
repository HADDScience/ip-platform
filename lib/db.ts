"use client"

import { supabase } from "@/lib/supabase"
import type {
  ActionItem,
  ActionState,
  Communication,
  CommunicationLink,
  FlagState,
  IntegrityFlagRow,
  NextTurn,
  Patent,
  Priority,
  ProgressEntry,
  Stage,
  StatusOption,
  Target,
  Trademark,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// DB 행 → 앱 타입 매핑
//
// DB 는 snake_case, 화면 코드는 기존 camelCase 를 그대로 쓴다.
// 데이터가 60여 행뿐이라 전량을 한 번에 읽어 메모리에 두고 쓴다.
// ---------------------------------------------------------------------------

interface TrademarkRow {
  id: string
  name: string
  name_ko: string
  classes: string[]
  goods: string | null
  app_no: string | null
  reg_no: string | null
  ref_date: string | null
  filed_on: string | null
  registered_on: string | null
  holder: string | null
  status: string
  probability: number | null
  note: string
}

interface PatentRow {
  id: string
  title: string
  app_no: string | null
  reg_no: string | null
  ref_date: string | null
  filed_on: string | null
  registered_on: string | null
  applicant: string
  status: string
  note: string
}

interface ProgressRow {
  id: string
  occurred_on: string
  entity_kind: string
  entity_id: string
  stage: string
  direction: string | null
  counterpart: string
  next_turn: string
  due_on: string | null
  app_no: string | null
  reg_no: string | null
  probability: number | null
  name: string | null
  holder: string | null
  note: string
  source: string
  raw: string | null
  created_at: string
}

interface CommunicationRow {
  id: string
  occurred_on: string
  direction: string
  from_name: string
  to_name: string
  target: string
  subject: string
  body: string
  attachments: string[]
  follow_up: string
  is_open: boolean
  gmail_thread_id: string | null
  communication_links?: { entity_kind: string; entity_id: string }[]
}

interface ActionRow {
  id: string
  target: string
  subject: string
  requested_at: string | null
  requester: string | null
  todo: string
  owner_name: string
  priority: string
  note: string
  state: string
  resolution: string | null
  resolved_at: string | null
}

interface FlagRow {
  id: string
  entity_kind: string
  entity_id: string | null
  message: string
  source: string
  state: string
  resolution: string | null
  resolved_at: string | null
}

const toTrademark = (r: TrademarkRow): Trademark => ({
  id: r.id,
  name: r.name,
  nameKo: r.name_ko,
  classes: r.classes ?? [],
  goods: r.goods,
  appNo: r.app_no,
  regNo: r.reg_no,
  date: r.ref_date,
  filedOn: r.filed_on,
  registeredOn: r.registered_on,
  holder: r.holder,
  status: r.status,
  probability: r.probability,
  note: r.note ?? "",
})

const toPatent = (r: PatentRow): Patent => ({
  id: r.id,
  title: r.title,
  appNo: r.app_no,
  regNo: r.reg_no,
  date: r.ref_date,
  filedOn: r.filed_on,
  registeredOn: r.registered_on,
  applicant: r.applicant ?? "",
  status: r.status,
  note: r.note ?? "",
})

const toProgress = (r: ProgressRow): ProgressEntry => ({
  id: r.id,
  date: r.occurred_on,
  entityKind: r.entity_kind as ProgressEntry["entityKind"],
  entityId: r.entity_id,
  stage: r.stage,
  direction: r.direction as ProgressEntry["direction"],
  counterpart: r.counterpart ?? "",
  nextTurn: r.next_turn as NextTurn,
  dueOn: r.due_on,
  appNo: r.app_no,
  regNo: r.reg_no,
  probability: r.probability,
  name: r.name ?? null,
  holder: r.holder ?? null,
  note: r.note ?? "",
  source: r.source as ProgressEntry["source"],
  raw: r.raw,
  createdAt: r.created_at,
})

const toCommunication = (r: CommunicationRow): Communication => ({
  id: r.id,
  date: r.occurred_on,
  dir: r.direction as Communication["dir"],
  from: r.from_name,
  to: r.to_name,
  target: r.target as Target,
  subject: r.subject,
  body: r.body ?? "",
  attachments: r.attachments ?? [],
  followUp: r.follow_up ?? "",
  open: r.is_open,
  threadId: r.gmail_thread_id,
  links: (r.communication_links ?? []).map((l) => ({
    kind: l.entity_kind as CommunicationLink["kind"],
    id: l.entity_id,
  })),
})

const toAction = (r: ActionRow): ActionItem => ({
  id: r.id,
  target: r.target as Target,
  subject: r.subject,
  requestedAt: r.requested_at,
  requester: r.requester,
  todo: r.todo,
  owner: r.owner_name ?? "",
  priority: r.priority as Priority,
  note: r.note ?? "",
  state: r.state as ActionState,
  resolution: r.resolution,
  resolvedAt: r.resolved_at,
})

const toFlag = (r: FlagRow): IntegrityFlagRow => ({
  id: r.id,
  entityKind: r.entity_kind as IntegrityFlagRow["entityKind"],
  entityId: r.entity_id,
  message: r.message,
  source: r.source as IntegrityFlagRow["source"],
  state: r.state as FlagState,
  resolution: r.resolution,
  resolvedAt: r.resolved_at,
})

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

export interface OrgMeta {
  org: string
  owner: string
  firm: {
    name: string
    attorney: string
    email: string
    tel: string
    mobile: string
    staff: string[]
  }
  note: string
}

export interface Snapshot {
  trademarks: Trademark[]
  patents: Patent[]
  progress: ProgressEntry[]
  communications: Communication[]
  actions: ActionItem[]
  flags: IntegrityFlagRow[]
  statusOptions: StatusOption[]
  stages: Stage[]
  meta: OrgMeta
}

function unwrap<T>(res: {
  data: T | null
  error: { message: string } | null
}): T {
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as T
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const [tm, pt, prog, comm, act, flags, status, meta] = await Promise.all([
    supabase.from("trademarks").select("*").order("id"),
    supabase.from("patents").select("*").order("id"),
    // 같은 날 기록이 여럿이면 날짜만으로는 순서가 정해지지 않는다. 적은 순서로
    // 갈라 준다 — 아니면 새로고침할 때마다 줄이 뒤바뀐다.
    supabase
      .from("progress_entries")
      .select("*")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("communications")
      .select("*, communication_links(entity_kind, entity_id)")
      .order("occurred_on", { ascending: false }),
    supabase.from("actions").select("*").order("id"),
    supabase.from("integrity_flags").select("*").order("created_at"),
    supabase
      .from("status_options")
      .select("*")
      .order("kind")
      .order("sort_order"),
    supabase.from("org_meta").select("*").eq("id", 1).maybeSingle(),
  ])

  if (meta.error) throw new Error(meta.error.message)

  // status_options 는 배지 색(statusOptions)과 양식의 단계 정의(stages)를 겸한다.
  const stageRows = unwrap<
    {
      kind: string
      value: string
      sort_order: number
      tone: string
      is_open: boolean
      wants_app_no?: boolean
      wants_reg_no?: boolean
      wants_probability?: boolean
      wants_due?: boolean
      selectable?: boolean
    }[]
  >(status)

  const metaRow = meta.data as {
    org: string
    owner_name: string
    firm: OrgMeta["firm"]
    note: string
  } | null

  return {
    meta: {
      org: metaRow?.org ?? "HADD SCIENCE",
      owner: metaRow?.owner_name ?? "",
      firm: metaRow?.firm ?? {
        name: "",
        attorney: "",
        email: "",
        tel: "",
        mobile: "",
        staff: [],
      },
      note: metaRow?.note ?? "",
    },
    trademarks: unwrap<TrademarkRow[]>(tm).map(toTrademark),
    patents: unwrap<PatentRow[]>(pt).map(toPatent),
    progress: unwrap<ProgressRow[]>(prog).map(toProgress),
    communications: unwrap<CommunicationRow[]>(comm).map(toCommunication),
    actions: unwrap<ActionRow[]>(act).map(toAction),
    flags: unwrap<FlagRow[]>(flags).map(toFlag),
    statusOptions: stageRows.map((r) => ({
      kind: r.kind as StatusOption["kind"],
      value: r.value,
      sortOrder: r.sort_order,
      tone: r.tone,
      isOpen: r.is_open,
    })),
    stages: stageRows.map((r) => ({
      kind: r.kind as Stage["kind"],
      value: r.value,
      sortOrder: r.sort_order,
      tone: r.tone,
      isOpen: r.is_open,
      wantsAppNo: r.wants_app_no ?? false,
      wantsRegNo: r.wants_reg_no ?? false,
      wantsProbability: r.wants_probability ?? false,
      wantsDue: r.wants_due ?? false,
      selectable: r.selectable ?? true,
    })),
  }
}

// ---------------------------------------------------------------------------
// 저장 (수정 / 추가 / 삭제)
// ---------------------------------------------------------------------------

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

/**
 * 진행 기록 저장. 지식재산권 목록 반영은 DB 트리거(ip.apply_progress_entry)가 한다.
 * 클라이언트에서 두 번 쓰지 않는 이유는, 여럿이 동시에 넣을 때
 * "더 최신 기록만 단계를 덮어쓴다" 판정이 서버 한 곳에 있어야 하기 때문이다.
 */
export async function saveProgress(e: ProgressEntry, isNew: boolean) {
  const row = {
    occurred_on: e.date,
    entity_kind: e.entityKind,
    entity_id: e.entityId,
    stage: e.stage,
    direction: e.direction,
    counterpart: e.counterpart,
    next_turn: e.nextTurn,
    due_on: e.dueOn,
    app_no: e.appNo,
    reg_no: e.regNo,
    probability: e.probability,
    name: e.name,
    holder: e.holder,
    note: e.note,
    source: e.source,
    raw: e.raw,
  }
  const { error } = isNew
    ? await supabase.from("progress_entries").insert(row)
    : await supabase.from("progress_entries").update(row).eq("id", e.id)
  check(error)
}

/**
 * 지식재산권 목록에 없는 건을 기록하면서 새로 만든다.
 * 이름만 받고 나머지는 비워 둔다 — 번호·날짜는 뒤따르는 기록이 채운다.
 */
export async function createCase(
  kind: "trademark" | "patent",
  name: string,
  existing: string[],
  stage: string
): Promise<string> {
  if (kind === "trademark") {
    const id = nextId("TM", existing)
    const { error } = await supabase
      .from("trademarks")
      .insert({ id, name, status: stage })
    check(error)
    return id
  }
  const id = nextId("PT", existing)
  const { error } = await supabase
    .from("patents")
    .insert({ id, title: name, status: stage })
  check(error)
  return id
}

export async function removeProgress(id: string) {
  const { error } = await supabase
    .from("progress_entries")
    .delete()
    .eq("id", id)
  check(error)
}

/** 「내 차례」 목록에서 바로 넘기기 */
export async function setNextTurn(id: string, nextTurn: NextTurn) {
  const { error } = await supabase
    .from("progress_entries")
    .update({ next_turn: nextTurn })
    .eq("id", id)
  check(error)
}

export async function saveTrademark(t: Trademark, isNew: boolean) {
  const row = {
    id: t.id,
    name: t.name,
    name_ko: t.nameKo,
    classes: t.classes,
    goods: t.goods,
    app_no: t.appNo,
    reg_no: t.regNo,
    ref_date: t.date,
    filed_on: t.filedOn,
    registered_on: t.registeredOn,
    holder: t.holder,
    status: t.status,
    probability: t.probability,
    note: t.note,
  }
  const { error } = isNew
    ? await supabase.from("trademarks").insert(row)
    : await supabase.from("trademarks").update(row).eq("id", t.id)
  check(error)
}

export async function savePatent(p: Patent, isNew: boolean) {
  const row = {
    id: p.id,
    title: p.title,
    app_no: p.appNo,
    reg_no: p.regNo,
    ref_date: p.date,
    filed_on: p.filedOn,
    registered_on: p.registeredOn,
    applicant: p.applicant,
    status: p.status,
    note: p.note,
  }
  const { error } = isNew
    ? await supabase.from("patents").insert(row)
    : await supabase.from("patents").update(row).eq("id", p.id)
  check(error)
}

export async function saveCommunication(
  c: Communication,
  isNew: boolean
): Promise<string> {
  const row = {
    occurred_on: c.date,
    direction: c.dir,
    from_name: c.from,
    to_name: c.to,
    target: c.target,
    subject: c.subject,
    body: c.body,
    attachments: c.attachments,
    follow_up: c.followUp,
    is_open: c.open,
    gmail_thread_id: c.threadId,
  }

  let id = c.id
  if (isNew) {
    const { data, error } = await supabase
      .from("communications")
      .insert(row)
      .select("id")
      .single()
    check(error)
    id = (data as { id: string }).id
  } else {
    const { error } = await supabase
      .from("communications")
      .update(row)
      .eq("id", c.id)
    check(error)
  }

  // 연결은 통째로 갈아끼운다 (개수가 적어 diff 할 이유가 없다).
  const del = await supabase
    .from("communication_links")
    .delete()
    .eq("communication_id", id)
  check(del.error)

  if (c.links.length > 0) {
    const ins = await supabase.from("communication_links").insert(
      c.links.map((l) => ({
        communication_id: id,
        entity_kind: l.kind,
        entity_id: l.id,
      }))
    )
    check(ins.error)
  }

  return id
}

export async function saveAction(a: ActionItem, isNew: boolean) {
  const row = {
    id: a.id,
    target: a.target,
    subject: a.subject,
    requested_at: a.requestedAt,
    requester: a.requester,
    todo: a.todo,
    owner_name: a.owner,
    priority: a.priority,
    note: a.note,
    state: a.state,
    resolution: a.resolution,
    resolved_at: a.resolvedAt,
  }
  const { error } = isNew
    ? await supabase.from("actions").insert(row)
    : await supabase.from("actions").update(row).eq("id", a.id)
  check(error)
}

export async function setActionState(
  id: string,
  state: ActionState,
  resolution: string | null
) {
  const { error } = await supabase
    .from("actions")
    .update({
      state,
      resolution,
      resolved_at: state === "open" ? null : new Date().toISOString(),
    })
    .eq("id", id)
  check(error)
}

export async function setFlagState(
  id: string,
  state: FlagState,
  resolution: string | null
) {
  const { error } = await supabase
    .from("integrity_flags")
    .update({
      state,
      resolution,
      resolved_at: state === "open" ? null : new Date().toISOString(),
    })
    .eq("id", id)
  check(error)
}

export async function addFlag(
  entityKind: IntegrityFlagRow["entityKind"],
  entityId: string | null,
  message: string
) {
  const { error } = await supabase.from("integrity_flags").insert({
    entity_kind: entityKind,
    entity_id: entityId,
    message,
    source: "manual",
  })
  check(error)
}

export type Entity = "trademarks" | "patents" | "communications" | "actions"

export async function remove(entity: Entity, id: string) {
  const { error } = await supabase.from(entity).delete().eq("id", id)
  check(error)
}

/** 삭제 직전 상태를 audit_log 에서 찾아 되돌린다. */
export async function undoDelete(entity: Entity, id: string) {
  const { data, error } = await supabase
    .from("audit_log")
    .select("before")
    .eq("entity", entity)
    .eq("entity_id", id)
    .eq("op", "delete")
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle()
  check(error)

  const before = (data as { before: Record<string, unknown> } | null)?.before
  if (!before) throw new Error("되돌릴 삭제 기록을 찾지 못했습니다.")

  // 생성열은 트리거가 다시 채운다.
  delete before.updated_at
  delete before.updated_by
  delete before.kind

  const { error: insErr } = await supabase.from(entity).insert(before)
  check(insErr)
}

/** 다음 ID 제안 (TM-22, PT-11, A-9 …) */
export function nextId(prefix: string, existing: string[]): string {
  const nums = existing
    .map((id) => Number(id.replace(`${prefix}-`, "")))
    .filter((n) => Number.isFinite(n))
  const next = (nums.length === 0 ? 0 : Math.max(...nums)) + 1
  const width = prefix === "A" ? 1 : 2
  return `${prefix}-${String(next).padStart(width, "0")}`
}

// ---------------------------------------------------------------------------
// MCP 개인 토큰
// ---------------------------------------------------------------------------

/**
 * 지금 살아 있는 토큰. 최대 하나다.
 * 원문은 발급 순간 말고는 어디에도 없어서 앞자리와 사용 시각만 알 수 있다.
 */
export interface McpToken {
  prefix: string
  createdAt: string
  lastUsedAt: string | null
}

export async function currentMcpToken(): Promise<McpToken | null> {
  const { data, error } = await supabase
    .from("mcp_tokens")
    .select("prefix, created_at, last_used_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  check(error)
  if (!data) return null
  return {
    prefix: data.prefix as string,
    createdAt: data.created_at as string,
    lastUsedAt: data.last_used_at as string | null,
  }
}

/**
 * 토큰 재발급. 쓰던 것은 즉시 죽고 새 것 하나만 남는다.
 *
 * 원문은 이 반환값으로만 존재한다. 화면을 벗어나면 다시 볼 방법이 없어
 * (DB 에는 해시만 있다) 그때는 또 재발급받아야 한다.
 */
export async function reissueMcpToken(): Promise<string> {
  const { data, error } = await supabase.rpc("reissue_mcp_token")
  check(error)
  return data as string
}

// ---------------------------------------------------------------------------
// 개인 설정
// ---------------------------------------------------------------------------

/** 단계 정렬 순서. 종류별로 사람이 정한 차례. 없는 단계는 파이프라인 순서를 따른다. */
export type StageOrder = Partial<Record<"trademark" | "patent", string[]>>

export async function loadStageOrder(userId: string): Promise<StageOrder> {
  const { data, error } = await supabase
    .from("member_prefs")
    .select("stage_order")
    .eq("user_id", userId)
    .maybeSingle()
  check(error)
  return ((data?.stage_order as StageOrder | undefined) ?? {}) as StageOrder
}

export async function saveStageOrder(
  userId: string,
  order: StageOrder
): Promise<void> {
  const { error } = await supabase.from("member_prefs").upsert(
    {
      user_id: userId,
      stage_order: order,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )
  check(error)
}

// ---------------------------------------------------------------------------
// 값 정정
// ---------------------------------------------------------------------------

/**
 * IP 화면에서 고칠 수 있는 칸.
 *
 * `undefined` = 안 바꿈 · `""` = 비움 · 값 = 그 값.
 * DB 쪽도 같은 약속을 쓴다(null=안 바꿈, ''=비움) — 기록의 칸이 null 이면
 * 「안 바꿈」이라 비우기를 표현할 방법이 달리 없기 때문이다.
 */
export interface Correction {
  name?: string
  holder?: string
  appNo?: string
  regNo?: string
  /** 단계 정정. "원래부터 이 단계였다"는 뜻이라 마지막 진행일을 움직이지 않는다. */
  stage?: string
}

/**
 * 지식재산권 목록 값 정정.
 *
 * 지식재산권 목록을 직접 찌르지 않고 **진행 기록 한 줄로** 남긴다. 그러면 무엇이 언제 왜
 * 바뀌었는지가 이력에 남고, 지식재산권 목록은 여전히 기록의 결과로만 바뀐다
 * (ip.apply_progress_entry 가 최신 기록의 값을 반영한다).
 *
 * 단계는 지금 것을 그대로 다시 적는다 — 정정은 일이 진행된 것이 아니므로
 * 단계를 움직이면 안 된다.
 */
export async function correctRecord(
  entityKind: "trademark" | "patent",
  entityId: string,
  stage: string,
  today: string,
  patch: Correction,
  reason: string
): Promise<void> {
  const changed = Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k)
  if (changed.length === 0) return

  const { error } = await supabase.from("progress_entries").insert({
    occurred_on: today,
    // 단계를 안 바꾸면 지금 단계를 그대로 다시 적는다. 무해하다.
    stage: patch.stage ?? stage,
    entity_kind: entityKind,
    entity_id: entityId,
    direction: null,
    counterpart: "",
    next_turn: "none",
    due_on: null,
    // undefined 는 null 로(안 바꿈), 빈 문자열은 그대로(비움) 넘긴다.
    app_no: patch.appNo ?? null,
    reg_no: patch.regNo ?? null,
    probability: null,
    name: patch.name ?? null,
    holder: patch.holder ?? null,
    note: reason.trim() || `값 정정 (${changed.join(", ")})`,
    source: "edit",
    raw: null,
  })
  check(error)
}

// ---------------------------------------------------------------------------
// 개시 스냅샷
// ---------------------------------------------------------------------------

/** 우리가 이어받은 시점의 값. 사건이 아니라 출발선이다. */
export interface OpeningState {
  stage: string
  refDate: string | null
  name: string
  holder: string | null
  appNo: string | null
  regNo: string | null
  /** 이어받은 날. 사건이 일어난 날이 아니다. */
  takenOverOn: string
  sourceNote: string
}

/** `kind:id` 로 찾을 수 있게 묶어 돌려준다. */
export async function loadOpeningState(): Promise<Map<string, OpeningState>> {
  const { data, error } = await supabase
    .from("opening_state")
    .select(
      "entity_kind, entity_id, stage, ref_date, name, holder, app_no, reg_no, taken_over_on, source_note"
    )
  check(error)
  const map = new Map<string, OpeningState>()
  for (const r of data ?? []) {
    map.set(`${r.entity_kind}:${r.entity_id}`, {
      stage: r.stage as string,
      refDate: r.ref_date as string | null,
      name: r.name as string,
      holder: r.holder as string | null,
      appNo: r.app_no as string | null,
      regNo: r.reg_no as string | null,
      takenOverOn: r.taken_over_on as string,
      sourceNote: r.source_note as string,
    })
  }
  return map
}
