import type { FeedIssue, FeedRow, FeedSummary, RawProduct } from "@/lib/audit/types"
import { normalizeAvailability } from "@/lib/feed/availability"
import { isValidGtin } from "@/lib/feed/gtin"
import { compareMoney, formatMoney, moneyCurrency } from "@/lib/money"
import {
  CONDITION_VALUES,
  DESCRIPTION_HARD_CAP,
  DESCRIPTION_MAX,
  OPTIONAL_FEED_FIELDS,
  REQUIRED_FEED_FIELDS,
  TITLE_MAX,
  VARIANT_FEED_FIELDS,
  VARIANT_UNPARSED_NOTE,
  type FeedField,
} from "@/lib/official/spec"
import { charLength, clipChars, htmlToText, isPlaceholder } from "@/lib/text"
import { toAbsoluteUrl } from "@/lib/url-safety"

const URL_FIELDS = new Set(["url", "image_url", "seller_url", "return_policy", "additional_image_urls"])
const BAD_IMAGE = /\.(html?|php|aspx|pdf)(?:$|\?)/i

function blankIssue(
  rowIndex: number,
  itemId: string,
  field: string,
  issueType: FeedIssue["issueType"],
  currentValue: string,
  sourceUrl: string,
  note: string,
): FeedIssue {
  return {
    itemId,
    rowIndex,
    field,
    issueType,
    currentValue,
    suggestedValue: "",
    sourceUrl,
    note: `第 ${rowIndex + 1} 行。${note}`,
  }
}

function sourceUrlOf(source: string, fallback: string): string {
  if (/^https?:\/\//i.test(source)) return source
  if (/^https?:\/\//i.test(fallback)) return fallback
  return ""
}

function cleanText(value: string): string {
  const text = value.includes("<") ? htmlToText(value) : value
  return text.replace(/\s+/g, " ").trim()
}

export function finalizeProducts(products: RawProduct[]): {
  rows: FeedRow[]
  issues: FeedIssue[]
  summary: FeedSummary
} {
  const issues: FeedIssue[] = []
  const rows: FeedRow[] = products.map((product, index) => {
    const cells = { ...product.fields }
    const conflicts = { ...product.conflicts }
    const page = product.sourceUrl
    for (const [field, values] of Object.entries(conflicts)) {
      if (!values?.length) continue
      delete cells[field]
      issues.push(
        blankIssue(
          index,
          cells.item_id?.value ?? "",
          field,
          "conflict",
          values.map((item) => `${item.source}: ${item.value}`).join(" | "),
          values.map((item) => item.source).find((source) => /^https?:\/\//.test(source)) ?? "",
          "同一字段的来源不一致，单元格留空，没有选用其中一个。",
        ),
      )
    }

    for (const field of Object.keys(cells)) {
      const cell = cells[field]
      if (!cell) continue
      const normalized = normalizeCell(field, cell.value, page)
      if (normalized.drop) {
        delete cells[field]
        if (normalized.issue) {
          issues.push(
            blankIssue(
              index,
              cells.item_id?.value ?? product.fields.item_id?.value ?? "",
              field,
              normalized.issue,
              normalized.current ?? cell.value,
              sourceUrlOf(cell.source, page),
              normalized.note,
            ),
          )
        }
        continue
      }
      cells[field] = { value: normalized.value, source: cell.source }
      if (normalized.issue) {
        issues.push(
          blankIssue(
            index,
            cells.item_id?.value ?? "",
            field,
            normalized.issue,
            normalized.current ?? normalized.value,
            sourceUrlOf(cell.source, page),
            normalized.note,
          ),
        )
      }
      if (
        (field === "title" || field === "description") &&
        normalized.issue === "truncated" &&
        charLength(normalized.value) > (field === "title" ? TITLE_MAX : DESCRIPTION_MAX)
      ) {
        issues.push(
          blankIssue(
            index,
            cells.item_id?.value ?? "",
            field,
            "invalid",
            normalized.value,
            sourceUrlOf(cell.source, page),
            field === "title"
              ? "截断后标题仍超过 150 个字符。"
              : "截断后描述仍超过 5000 个字符。",
          ),
        )
      }
    }

    if (product.variantUnparsed) {
      delete cells.group_id
      delete cells.listing_has_variations
      delete cells.variant_dict
      issues.push(
        blankIssue(
          index,
          cells.item_id?.value ?? "",
          "variant_dict",
          "needs_merchant_input",
          "",
          page,
          VARIANT_UNPARSED_NOTE,
        ),
      )
    } else if (cells.group_id || cells.listing_has_variations || cells.variant_dict) {
      const group = cells.group_id?.value ?? ""
      const item = cells.item_id?.value ?? ""
      const dictOk = isVariantDict(cells.variant_dict?.value ?? "")
      const flag = cells.listing_has_variations?.value === "true"
      if (!product.variantReliable || !group || !item || group === item || !dictOk || !flag) {
        delete cells.group_id
        delete cells.listing_has_variations
        delete cells.variant_dict
        issues.push(
          blankIssue(
            index,
            item,
            "variant_dict",
            "needs_merchant_input",
            "",
            page,
            VARIANT_UNPARSED_NOTE,
          ),
        )
      }
    }

    const itemId = cells.item_id?.value ?? ""
    if (!cells.availability?.value) {
      cells.availability = {
        value: "unknown",
        source: sourceUrlOf(product.fields.availability?.source ?? "", page) || page || "官方规则",
      }
      issues.push(
        blankIssue(
          index,
          itemId,
          "availability",
          "needs_merchant_input",
          "",
          page,
          "库存状态未知。按官方要求写入 unknown，没有把它留空，也没有写成有货。",
        ),
      )
    }

    for (const field of REQUIRED_FEED_FIELDS) {
      if (field === "availability") continue
      if (!cells[field]?.value) {
        issues.push(
          blankIssue(index, itemId, field, "missing", "", page, "必填字段为空。"),
        )
      }
    }

    if (cells.return_deadline_in_days?.value && cells.accepts_returns?.value !== "true") {
      const current = cells.return_deadline_in_days.value
      delete cells.return_deadline_in_days
      issues.push(
        blankIssue(
          index,
          itemId,
          "return_deadline_in_days",
          "invalid",
          current,
          page,
          "退货天数只在 accepts_returns 为 true 时写入。没有把退货政策推测成接受退货。",
        ),
      )
    }

    if (cells.sale_price?.value && cells.price?.value) {
      const order = compareMoney(cells.sale_price.value, cells.price.value)
      const same = moneyCurrency(cells.sale_price.value) === moneyCurrency(cells.price.value)
      if (!same || order === null || order >= 0) {
        const current = cells.sale_price.value
        delete cells.sale_price
        issues.push(
          blankIssue(
            index,
            itemId,
            "sale_price",
            "invalid",
            current,
            page,
            "sale_price 必须大于 0、与 price 同币种，并且严格小于 price。该值已省略。",
          ),
        )
      }
    }

    return { index, cells, conflicts }
  })

  const seen = new Set<string>()
  for (const row of rows) {
    const id = row.cells.item_id?.value ?? ""
    if (!id) continue
    if (seen.has(id)) {
      delete row.cells.item_id
      issues.push(
        blankIssue(
          row.index,
          id,
          "item_id",
          "invalid",
          id,
          "",
          "item_id 在本 feed 内重复。单元格已留空，没有另造一个新 ID。",
        ),
      )
    } else {
      seen.add(id)
    }
  }

  const summary = summarize(rows, issues)
  return { rows, issues, summary }
}

function summarize(rows: FeedRow[], issues: FeedIssue[]): FeedSummary {
  let complete = 0
  let missingRows = 0
  let invalidRows = 0
  for (const row of rows) {
    const related = issues.filter((issue) => issue.rowIndex === row.index)
    const missing = REQUIRED_FEED_FIELDS.some((field) => !row.cells[field]?.value)
    const invalid = related.some(
      (issue) =>
        (REQUIRED_FEED_FIELDS as readonly string[]).includes(issue.field) &&
        issue.issueType === "invalid",
    )
    if (missing) missingRows += 1
    if (invalid) invalidRows += 1
    if (!missing && !invalid) complete += 1
  }
  return { total: rows.length, complete, missingRows, invalidRows }
}

type Normalized = {
  value: string
  drop?: boolean
  issue?: FeedIssue["issueType"]
  note: string
  current?: string
}

function normalizeCell(field: string, raw: string, page: string): Normalized {
  const value = raw.trim()
  if (!value) return { value: "", drop: true, note: "" }
  if (field !== "availability" && isPlaceholder(value)) {
    return {
      value: "",
      drop: true,
      issue: "invalid",
      note: "占位符已去掉，没有把它当成真实值。",
      current: value,
    }
  }
  if (field === "availability") {
    const availability = normalizeAvailability(value)
    if (!availability) {
      return {
        value: "unknown",
        issue: "invalid",
        note: "无法识别的库存值没有照搬。单元格改为官方允许的 unknown。",
        current: value,
      }
    }
    return { value: availability, note: "" }
  }
  if (field === "price") {
    const money = formatMoney(value)
    if (!money.ok) {
      return {
        value: "",
        drop: true,
        issue: money.reason === "currency" ? "needs_merchant_input" : "invalid",
        note:
          money.reason === "currency"
            ? "有金额但没有可靠的货币代码，没有猜测币种。"
            : "价格不是「金额 货币代码」格式，单元格留空。",
        current: value,
      }
    }
    return { value: money.value, note: "" }
  }
  if (field === "sale_price" || field === "shipping_price") {
    const money = formatMoney(value, { allowZero: field === "shipping_price" })
    if (!money.ok) {
      return {
        value: "",
        drop: true,
        issue: "invalid",
        note: "金额格式无效，已省略。",
        current: value,
      }
    }
    return { value: money.value, note: "" }
  }
  if (field === "title" || field === "description") {
    let text = cleanText(value)
    const max = field === "title" ? TITLE_MAX : DESCRIPTION_MAX
    let issue: FeedIssue["issueType"] | undefined
    let note = ""
    if (charLength(text) > DESCRIPTION_HARD_CAP) {
      text = clipChars(text, DESCRIPTION_HARD_CAP).text
      issue = "truncated"
      note = `超过 ${DESCRIPTION_HARD_CAP} 个字符，已截断并标记 truncated。`
    } else if (charLength(text) > max) {
      issue = "invalid"
      note =
        field === "title"
          ? "标题超过 150 个字符。官方建议不超过该长度。本工具没有静默截断。"
          : "描述超过 5000 个字符。官方建议不超过该长度。本工具没有静默截断。"
    }
    return { value: text, issue, note, current: text }
  }
  if (field === "gtin") {
    const digits = value.replace(/[\s-]/g, "")
    if (!isValidGtin(digits)) {
      return {
        value: "",
        drop: true,
        issue: "invalid",
        note: "GTIN 未通过校验或不是 8/12/13/14 位。已留空，没有编造编号。",
        current: value,
      }
    }
    return { value: digits, note: "" }
  }
  if (field === "condition") {
    const key = value.toLowerCase().replace(/^https?:\/\/schema\.org\//, "").replace(/condition$/, "")
    const mapped = key.includes("refurb") ? "refurbished" : key.includes("used") ? "used" : key.includes("new") ? "new" : ""
    if (!(CONDITION_VALUES as readonly string[]).includes(mapped)) {
      return { value: "", drop: true, issue: "invalid", note: "condition 只能是 new、refurbished 或 used。", current: value }
    }
    return { value: mapped, note: "" }
  }
  if (field === "accepts_returns" || field === "listing_has_variations") {
    const token = value.toLowerCase()
    if (["true", "yes", "1"].includes(token)) return { value: "true", note: "" }
    if (["false", "no", "0"].includes(token)) return { value: "false", note: "" }
    return { value: "", drop: true, issue: "invalid", note: "布尔值只能是 true 或 false。", current: value }
  }
  if (field === "return_deadline_in_days") {
    if (!/^\d+$/.test(value) || Number(value) <= 0) {
      return { value: "", drop: true, issue: "invalid", note: "退货天数必须是正整数。", current: value }
    }
    return { value: String(Number(value)), note: "" }
  }
  if (field === "variant_dict") {
    if (!isVariantDict(value)) {
      return { value: "", drop: true, issue: "invalid", note: "variant_dict 不是键值都为非空字符串的 JSON 对象。", current: value }
    }
    return { value: canonicalDict(value), note: "" }
  }
  if (field === "additional_image_urls") {
    const urls = splitImages(value, page)
    if (urls.length === 0) {
      return { value: "", drop: true, issue: "invalid", note: "附加图片没有可用的绝对 URL。", current: value }
    }
    return { value: urls.join(","), note: "" }
  }
  if (URL_FIELDS.has(field) || field === "url" || field === "image_url") {
    const absolute = toAbsoluteUrl(value, page || value)
    if (!absolute) {
      return { value: "", drop: true, issue: "invalid", note: "不是可公开访问的绝对 http(s) URL。", current: value }
    }
    if (field === "image_url" && BAD_IMAGE.test(absolute)) {
      return { value: "", drop: true, issue: "invalid", note: "图片 URL 指向页面而不是直接图片。", current: value }
    }
    return { value: absolute, note: "" }
  }
  return { value, note: "" }
}

function isVariantDict(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false
    const entries = Object.entries(parsed)
    if (entries.length === 0) return false
    return entries.every(([key, item]) => key.trim() && typeof item === "string" && item.trim())
  } catch {
    return false
  }
}

function canonicalDict(value: string): string {
  const parsed = JSON.parse(value) as Record<string, string>
  const sorted = Object.keys(parsed)
    .sort()
    .reduce<Record<string, string>>((bag, key) => {
      bag[key] = parsed[key]
      return bag
    }, {})
  return JSON.stringify(sorted)
}

function splitImages(value: string, page: string): string[] {
  let parts: string[] = []
  if (value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) parts = parsed.map((item) => String(item))
    } catch {
      parts = []
    }
  }
  if (parts.length === 0) parts = value.split(",")
  const urls: string[] = []
  for (const part of parts) {
    const absolute = toAbsoluteUrl(part.trim(), page || part.trim())
    if (absolute && !BAD_IMAGE.test(absolute)) urls.push(absolute)
  }
  return urls
}

export function columnsFor(rows: FeedRow[]): string[] {
  const used = new Set<string>()
  for (const row of rows) {
    for (const [field, cell] of Object.entries(row.cells)) {
      if (cell?.value) used.add(field)
    }
  }
  const columns: string[] = [...REQUIRED_FEED_FIELDS]
  for (const field of VARIANT_FEED_FIELDS) if (used.has(field)) columns.push(field)
  for (const field of OPTIONAL_FEED_FIELDS) if (used.has(field)) columns.push(field)
  return columns
}

export function incompleteRowCount(rows: FeedRow[]): number {
  return rows.filter((row) => REQUIRED_FEED_FIELDS.some((field) => !row.cells[field]?.value)).length
}

export function feedFieldList(): FeedField[] {
  return [...REQUIRED_FEED_FIELDS, ...VARIANT_FEED_FIELDS, ...OPTIONAL_FEED_FIELDS]
}
