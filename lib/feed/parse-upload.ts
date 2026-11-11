import ExcelJS from "exceljs"
import type { Cell, RawProduct, UploadData } from "@/lib/audit/types"
import { parseCsv } from "@/lib/csv"
import { autoMap } from "@/lib/feed/columns"
import { ERROR_MESSAGES, UPLOAD_SOURCE } from "@/lib/official/spec"

export async function parseProductFile(
  filename: string,
  bytes: Buffer,
  maxRows: number,
): Promise<{ upload: UploadData } | { error: string }> {
  const lower = filename.toLowerCase()
  let table: string[][]
  try {
    if (lower.endsWith(".csv")) table = parseCsv(bytes.toString("utf8"))
    else if (lower.endsWith(".xlsx")) table = await readXlsx(bytes)
    else return { error: ERROR_MESSAGES.unsupported_file }
  } catch {
    return { error: ERROR_MESSAGES.unreadable }
  }
  if (table.length === 0) return { error: ERROR_MESSAGES.empty_file }
  const headers = table[0].map((header, index) => header.trim() || `column_${index + 1}`)
  const data = table.slice(1).filter((row) => row.some((cell) => cell.trim() !== ""))
  if (data.length === 0) return { error: ERROR_MESSAGES.empty_file }
  const kept = data.slice(0, maxRows).map((row) => headers.map((_, index) => (row[index] ?? "").trim()))
  const detected = autoMap(headers)
  return {
    upload: {
      filename,
      headers,
      records: kept,
      mapping: detected.needsMap ? null : detected.mapping,
      mapUsed: false,
      omittedRowCount: Math.max(0, data.length - kept.length),
    },
  }
}

async function readXlsx(bytes: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []
  const rows: string[][] = []
  sheet.eachRow((row) => {
    const values: string[] = []
    const width = Math.max(sheet.columnCount, row.cellCount)
    for (let index = 1; index <= width; index += 1) {
      const cell = row.getCell(index)
      values.push(cell.text?.trim() || valueToString(cell.value))
    }
    rows.push(values)
  })
  return rows
}

function valueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text
  if (typeof value === "object" && "result" in value) return valueToString(value.result as ExcelJS.CellValue)
  return ""
}

export function uploadToRaw(upload: UploadData): RawProduct[] {
  const mapping = upload.mapping ?? {}
  return upload.records.map((record) => {
    const fields: Record<string, Cell> = {}
    for (const [field, header] of Object.entries(mapping)) {
      const index = upload.headers.indexOf(header)
      if (index < 0) continue
      const value = (record[index] ?? "").trim()
      if (!value) continue
      fields[field] = { value, source: UPLOAD_SOURCE }
    }
    const hasVariant = Boolean(fields.variant_dict?.value && fields.group_id?.value && fields.listing_has_variations?.value === "true")
    return {
      fields,
      conflicts: {},
      variantReliable: hasVariant,
      variantUnparsed: false,
      sourceUrl: fields.url?.value ?? "",
    }
  })
}
