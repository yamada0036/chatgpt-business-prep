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
    note: `Row ${rowIndex + 1}. ${note}`,
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
          "Sources for the same field disagree. The cell was left blank, and neither value was chosen.",
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
              ? "After truncation the title is still over 150 characters."
              : "After truncation the description is still over 5,000 characters.",
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
        source: sourceUrlOf(product.fields.availability?.source ?? "", page) || page || "official rule",
      }
      issues.push(
        blankIssue(
          index,
          itemId,
          "availability",
          "needs_merchant_input",
          "",
          page,
          "Stock status is unknown. The official value unknown was written. The cell was not left blank and was not marked in stock.",
        ),
      )
    }

    for (const field of REQUIRED_FEED_FIELDS) {
      if (field === "availability") continue
      if (!cells[field]?.value) {
        issues.push(
          blankIssue(index, itemId, field, "missing", "", page, "A required field is empty."),
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
          "Return days are written only when accepts_returns is true. The return policy was not guessed to be accepted.",
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
            "sale_price must be greater than 0, use the same currency as price, and be strictly less than price. The value was omitted.",
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
          "item_id is duplicated in this feed. The cell was left blank. A new ID was not invented.",
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
      note: "A placeholder was removed and was not treated as a real value.",
      current: value,
    }
  }
  if (field === "availability") {
    const availability = normalizeAvailability(value)
    if (!availability) {
      return {
        value: "unknown",
        issue: "invalid",
        note: "An unrecognized stock value was not copied through. The cell was set to the official value unknown.",
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
            ? "There is an amount but no reliable currency code. The currency was not guessed."
            : "The price is not in amount-plus-currency-code form. The cell was left blank.",
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
        note: "The amount format is invalid, so it was omitted.",
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
      note = `Over ${DESCRIPTION_HARD_CAP} characters. It was truncated and marked truncated.`
    } else if (charLength(text) > max) {
      issue = "invalid"
      note =
        field === "title"
          ? "The title is over 150 characters. The official guidance is to stay within that length. This tool did not silently truncate it."
          : "The description is over 5,000 characters. The official guidance is to stay within that length. This tool did not silently truncate it."
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
        note: "The GTIN failed the check or is not 8, 12, 13, or 14 digits. It was left blank. A code was not invented.",
        current: value,
      }
    }
    return { value: digits, note: "" }
  }
  if (field === "condition") {
    const key = value.toLowerCase().replace(/^https?:\/\/schema\.org\//, "").replace(/condition$/, "")
    const mapped = key.includes("refurb") ? "refurbished" : key.includes("used") ? "used" : key.includes("new") ? "new" : ""
    if (!(CONDITION_VALUES as readonly string[]).includes(mapped)) {
      return { value: "", drop: true, issue: "invalid", note: "condition must be new, refurbished, or used.", current: value }
    }
    return { value: mapped, note: "" }
  }
  if (field === "accepts_returns" || field === "listing_has_variations") {
    const token = value.toLowerCase()
    if (["true", "yes", "1"].includes(token)) return { value: "true", note: "" }
    if (["false", "no", "0"].includes(token)) return { value: "false", note: "" }
    return { value: "", drop: true, issue: "invalid", note: "A boolean must be true or false.", current: value }
  }
  if (field === "return_deadline_in_days") {
    if (!/^\d+$/.test(value) || Number(value) <= 0) {
      return { value: "", drop: true, issue: "invalid", note: "Return days must be a positive integer.", current: value }
    }
    return { value: String(Number(value)), note: "" }
  }
  if (field === "variant_dict") {
    if (!isVariantDict(value)) {
      return { value: "", drop: true, issue: "invalid", note: "variant_dict is not a JSON object whose keys and values are non-empty strings.", current: value }
    }
    return { value: canonicalDict(value), note: "" }
  }
  if (field === "additional_image_urls") {
    const urls = splitImages(value, page)
    if (urls.length === 0) {
      return { value: "", drop: true, issue: "invalid", note: "The extra images have no usable absolute URL.", current: value }
    }
    return { value: urls.join(","), note: "" }
  }
  if (URL_FIELDS.has(field) || field === "url" || field === "image_url") {
    const absolute = toAbsoluteUrl(value, page || value)
    if (!absolute) {
      return { value: "", drop: true, issue: "invalid", note: "This is not a publicly reachable absolute http(s) URL.", current: value }
    }
    if (field === "image_url" && BAD_IMAGE.test(absolute)) {
      return { value: "", drop: true, issue: "invalid", note: "The image URL points at a page rather than an image file.", current: value }
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
