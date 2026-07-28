"use client"

import type {
  ActionItem,
  Communication,
  Patent,
  Trademark,
} from "@/lib/types"
import { daysBetween } from "@/lib/date"

type CellValue = string | number

interface Column<T> {
  header: string
  /** 엑셀 열 너비 (문자 수 기준) */
  width: number
  value: (row: T, today: string) => CellValue
}

const dash = (v: string | null | undefined): string => (v ? v : "—")

const elapsed = (from: string | null, today: string): CellValue => {
  const d = daysBetween(from, today)
  return d === null ? "—" : d
}

export const TRADEMARK_COLUMNS: Column<Trademark>[] = [
  { header: "ID", width: 8, value: (t) => t.id },
  { header: "상표명", width: 18, value: (t) => t.name },
  { header: "한글명", width: 14, value: (t) => t.nameKo },
  { header: "상품류", width: 22, value: (t) => t.classes.join(", ") },
  { header: "지정상품", width: 42, value: (t) => dash(t.goods) },
  { header: "등록/출원번호", width: 18, value: (t) => dash(t.regNo) },
  { header: "기준일", width: 12, value: (t) => dash(t.date) },
  { header: "경과일", width: 9, value: (t, today) => elapsed(t.date, today) },
  { header: "출원인", width: 10, value: (t) => dash(t.holder) },
  { header: "상태", width: 10, value: (t) => t.status },
  {
    header: "등록가능성(%)",
    width: 14,
    value: (t) => (t.probability === null ? "—" : t.probability),
  },
  { header: "비고", width: 90, value: (t) => t.note },
]

export const PATENT_COLUMNS: Column<Patent>[] = [
  { header: "ID", width: 8, value: (p) => p.id },
  { header: "발명의 명칭", width: 56, value: (p) => p.title },
  { header: "출원번호", width: 20, value: (p) => dash(p.appNo) },
  { header: "등록번호", width: 16, value: (p) => dash(p.regNo) },
  { header: "기준일", width: 12, value: (p) => dash(p.date) },
  { header: "경과일", width: 9, value: (p, today) => elapsed(p.date, today) },
  { header: "출원인", width: 14, value: (p) => p.applicant },
  { header: "상태", width: 10, value: (p) => p.status },
  { header: "비고", width: 90, value: (p) => p.note },
]

export const COMMUNICATION_COLUMNS: Column<Communication>[] = [
  { header: "일자", width: 12, value: (c) => c.date },
  { header: "경과일", width: 9, value: (c, today) => elapsed(c.date, today) },
  { header: "구분", width: 8, value: (c) => c.dir },
  { header: "발신", width: 18, value: (c) => c.from },
  { header: "수신", width: 18, value: (c) => c.to },
  { header: "대상", width: 8, value: (c) => c.target },
  { header: "제목", width: 44, value: (c) => c.subject },
  { header: "내용", width: 100, value: (c) => c.body },
  { header: "첨부", width: 40, value: (c) => c.attachments.join(", ") || "—" },
  { header: "후속조치", width: 40, value: (c) => dash(c.followUp) },
  { header: "미결", width: 8, value: (c) => (c.open ? "미결" : "완결") },
  { header: "스레드 ID", width: 20, value: (c) => dash(c.threadId) },
]

export const ACTION_COLUMNS: Column<ActionItem>[] = [
  { header: "ID", width: 8, value: (a) => a.id },
  { header: "우선순위", width: 10, value: (a) => a.priority },
  { header: "대상", width: 8, value: (a) => a.target },
  { header: "건명", width: 40, value: (a) => a.subject },
  { header: "요청일", width: 12, value: (a) => dash(a.requestedAt) },
  {
    header: "경과일",
    width: 9,
    value: (a, today) => elapsed(a.requestedAt, today),
  },
  { header: "요청자", width: 16, value: (a) => dash(a.requester) },
  { header: "조치사항", width: 80, value: (a) => a.todo },
  { header: "담당", width: 16, value: (a) => a.owner },
  { header: "비고", width: 50, value: (a) => a.note },
]

type XlsxModule = typeof import("xlsx")

function buildSheet<T>(
  xlsx: XlsxModule,
  rows: T[],
  columns: Column<T>[],
  today: string
) {
  const aoa: CellValue[][] = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => c.value(row, today))),
  ]
  const sheet = xlsx.utils.aoa_to_sheet(aoa)
  sheet["!cols"] = columns.map((c) => ({ wch: c.width }))
  sheet["!autofilter"] = {
    ref: xlsx.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length, c: columns.length - 1 },
    }),
  }
  return sheet
}

/** HADD_IP_현황_20260727.xlsx 형태의 파일명 */
export function fileName(label: string, today: string): string {
  return `HADD_IP_${label}_${today.replace(/-/g, "")}.xlsx`
}

interface SheetSpec {
  name: string
  rows: unknown[]
  columns: Column<unknown>[]
}

function sheetSpec<T>(
  name: string,
  rows: T[],
  columns: Column<T>[]
): SheetSpec {
  return { name, rows, columns } as unknown as SheetSpec
}

async function write(specs: SheetSpec[], today: string, name: string) {
  const xlsx = await import("xlsx")
  const book = xlsx.utils.book_new()
  for (const spec of specs) {
    xlsx.utils.book_append_sheet(
      book,
      buildSheet(xlsx, spec.rows, spec.columns, today),
      spec.name
    )
  }
  xlsx.writeFile(book, name)
}

/** 전체 내보내기 — 상표 / 특허 / 커뮤니케이션 로그 / 미결 액션 4개 시트 */
export async function exportAll(
  data: {
    trademarks: Trademark[]
    patents: Patent[]
    communications: Communication[]
    actions: ActionItem[]
  },
  today: string
): Promise<void> {
  await write(
    [
      sheetSpec("상표", data.trademarks, TRADEMARK_COLUMNS),
      sheetSpec("특허", data.patents, PATENT_COLUMNS),
      sheetSpec("커뮤니케이션 로그", data.communications, COMMUNICATION_COLUMNS),
      sheetSpec("미결 액션", data.actions, ACTION_COLUMNS),
    ],
    today,
    fileName("현황", today)
  )
}

/** 현재 필터가 적용된 화면 하나만 내보내기 */
export async function exportView<T>(
  label: string,
  sheetName: string,
  rows: T[],
  columns: Column<T>[],
  today: string
): Promise<void> {
  await write(
    [sheetSpec(sheetName, rows, columns)],
    today,
    fileName(label, today)
  )
}
