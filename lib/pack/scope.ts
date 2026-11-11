import type { AuditRecord, FeedIssue, FeedRow } from "@/lib/audit/types"
import { formatCents } from "@/lib/pricing"

export type PackScope = {
  rows: FeedRow[]
  issues: FeedIssue[]
  omitted: number
  note: string
}

/**
 * This version does not charge SKU overage. Catalogs larger than the included
 * count still pay the base price, and the paid pack keeps the first N rows.
 */
export function packScope(audit: AuditRecord): PackScope {
  const breakdown = audit.order.breakdown
  const rows = audit.feedRows
  const cap = breakdown.includedSkus
  const capped = breakdown.overageCents <= 0 && rows.length > cap
  const kept = capped ? rows.slice(0, Math.max(0, cap)) : rows
  const keptIndexes = new Set(kept.map((row) => row.index))
  const issues = capped ? audit.feedIssues.filter((issue) => keptIndexes.has(issue.rowIndex)) : audit.feedIssues
  const omitted = rows.length - kept.length
  const note =
    omitted > 0
      ? `This catalog has ${rows.length} product rows. The prep pack includes the first ${cap}. The other ${omitted} are not in the paid pack. The price stays ${formatCents(breakdown.totalCents, breakdown.currency)}. This version does not add a charge for extra SKUs.`
      : ""
  return { rows: kept, issues, omitted, note }
}
