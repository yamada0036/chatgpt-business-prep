import type { AuditRecord, FeedRow, ProfileField, RawProduct } from "@/lib/audit/types"
import { scoreAudit, urgentIssues } from "@/lib/audit/score"
import { finalizeProducts } from "@/lib/feed/finalize"
import { FEED_FIELDS, MERCHANT_SOURCE, PROFILE_FIELDS } from "@/lib/official/spec"
import { withQuote } from "@/lib/audit/compose"
import { toAbsoluteUrl } from "@/lib/url-safety"

export type SupplementUpdate = { key: string; value: string }

export function applySupplement(
  audit: AuditRecord,
  updates: SupplementUpdate[],
): { audit: AuditRecord; applied: number; rejected: { key: string; message: string }[] } {
  const rejected: { key: string; message: string }[] = []
  let profile = audit.profile.map((field) => ({ ...field, conflicts: [...field.conflicts] }))
  let rows = audit.feedRows.map((row) => ({
    ...row,
    cells: { ...row.cells },
    conflicts: { ...row.conflicts },
  }))
  let applied = 0
  for (const update of updates) {
    const value = update.value.trim()
    if (!value) continue
    if (update.key.startsWith("profile:")) {
      const key = update.key.slice("profile:".length)
      const meta = PROFILE_FIELDS.find((field) => field.key === key)
      if (!meta) {
        rejected.push({ key: update.key, message: "未知资料字段。" })
        continue
      }
      if (key === "website" || key === "logo" || key === "cover_photo") {
        const absolute = toAbsoluteUrl(value, audit.storeUrl)
        if (!absolute) {
          rejected.push({ key: update.key, message: "需要一个 http(s) 网址。" })
          continue
        }
        profile = profile.map((field) => (field.key === key ? filledProfile(field, absolute) : field))
      } else {
        profile = profile.map((field) => (field.key === key ? filledProfile(field, value) : field))
      }
      applied += 1
      continue
    }
    const match = /^feed:(\d+):([a-z0-9_]+)$/.exec(update.key)
    if (!match || !(FEED_FIELDS as readonly string[]).includes(match[2])) {
      rejected.push({ key: update.key, message: "未知商品字段。" })
      continue
    }
    const rowIndex = Number(match[1])
    const field = match[2]
    const row = rows.find((item) => item.index === rowIndex)
    if (!row) {
      rejected.push({ key: update.key, message: "没有这一行。" })
      continue
    }
    row.cells[field] = { value, source: MERCHANT_SOURCE }
    delete row.conflicts[field]
    applied += 1
  }
  if (applied > 0 && audit.includeProductFeed && audit.feedApplicable) {
    const finalized = finalizeProducts(rowsToRaw(rows))
    rows = finalized.rows
    const score = scoreAudit({
      profile,
      includeFeed: true,
      feedApplicable: true,
      summary: finalized.summary,
    })
    const next = withQuote({
      ...audit,
      profile,
      feedRows: rows,
      feedIssues: finalized.issues,
      feedSummary: finalized.summary,
      score,
      urgent: urgentIssues(profile, finalized.summary, true),
    })
    return { audit: next, applied, rejected }
  }
  const score = scoreAudit({
    profile,
    includeFeed: audit.includeProductFeed,
    feedApplicable: audit.feedApplicable,
    summary: audit.feedSummary,
  })
  return {
    audit: withQuote({
      ...audit,
      profile,
      feedRows: rows,
      score,
      urgent: urgentIssues(profile, audit.feedSummary, audit.feedApplicable),
    }),
    applied,
    rejected,
  }
}

function filledProfile(field: ProfileField, value: string): ProfileField {
  return {
    ...field,
    display: "ready",
    status: "ready",
    source: MERCHANT_SOURCE,
    suggestedValue: value,
    conflicts: [],
    note: "商家补充。",
  }
}

function rowsToRaw(rows: FeedRow[]): RawProduct[] {
  return rows.map((row) => ({
    fields: { ...row.cells },
    conflicts: { ...row.conflicts },
    variantReliable: Boolean(row.cells.group_id?.value && row.cells.variant_dict?.value && row.cells.listing_has_variations?.value === "true"),
    variantUnparsed: false,
    sourceUrl: row.cells.url?.value || "",
  }))
}
