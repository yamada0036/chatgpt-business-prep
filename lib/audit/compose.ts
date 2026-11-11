import type { AuditRecord, FeedIssue, OutputLanguage } from "@/lib/audit/types"
import { emptySummary } from "@/lib/audit/types"
import { buildEligibility } from "@/lib/audit/eligibility"
import { buildProfile } from "@/lib/audit/profile"
import { scoreAudit, urgentIssues } from "@/lib/audit/score"
import type { CrawlResult } from "@/lib/crawl/fetch-store"
import { finalizeProducts } from "@/lib/feed/finalize"
import { mergeProducts } from "@/lib/feed/merge"
import { uploadToRaw } from "@/lib/feed/parse-upload"
import { quotePrice } from "@/lib/pricing"

export function composeFromSources(input: {
  includeProductFeed: boolean
  outputLanguage: OutputLanguage
  crawl: CrawlResult
  upload?: AuditRecord["upload"]
}): Pick<
  AuditRecord,
  | "profile"
  | "feedRows"
  | "feedIssues"
  | "feedSummary"
  | "feedApplicable"
  | "feedReason"
  | "urgent"
  | "eligibility"
  | "score"
> {
  const profile = buildProfile(input.crawl.facts, input.outputLanguage)
  let feedApplicable = false
  let feedReason = ""
  let finalized = finalizeProducts([])
  if (!input.includeProductFeed) {
    feedReason = "The merchant did not ask for a product feed."
  } else if (input.upload) {
    feedApplicable = true
    const merged = mergeProducts(uploadToRaw(input.upload), input.crawl.products)
    finalized = finalizeProducts(merged)
    if (input.upload.omittedRowCount > 0) {
      feedReason = `${input.upload.omittedRowCount} uploaded rows were over the cap and were not put in the prep pack.`
    }
  } else if (!input.crawl.sawProductLinks) {
    feedReason = "No publicly reachable products were found. The profile checklist was still created. A product feed does not apply."
  } else {
    feedApplicable = true
    finalized = finalizeProducts(input.crawl.products)
    if (finalized.rows.length === 0) {
      feedReason = "Product links were seen, but no product rows that can be written to the feed were fetched."
    }
  }
  if (!feedApplicable) finalized = { rows: [], issues: [], summary: emptySummary() }
  const extra: FeedIssue[] = input.crawl.extraNotes.map((note, index) => ({
    itemId: note.itemId,
    rowIndex: finalized.rows[index]?.index ?? 0,
    field: "variant_dict",
    issueType: "needs_merchant_input",
    currentValue: "",
    suggestedValue: "",
    sourceUrl: note.sourceUrl,
    note: note.note,
  }))
  const feedIssues = [...finalized.issues, ...extra]
  const feedSummary = finalized.summary
  const score = scoreAudit({
    profile,
    includeFeed: input.includeProductFeed,
    feedApplicable,
    summary: feedSummary,
  })
  return {
    profile,
    feedRows: finalized.rows,
    feedIssues,
    feedSummary,
    feedApplicable,
    feedReason,
    urgent: urgentIssues(profile, feedSummary, feedApplicable),
    eligibility: buildEligibility({
      countryHints: input.crawl.facts.countryHints,
      schemaTypes: input.crawl.facts.schemaTypes,
    }),
    score,
  }
}

export function withQuote(audit: AuditRecord): AuditRecord {
  if (audit.order.status !== "pending") return audit
  if (audit.order.paypalOrderId) return audit
  return {
    ...audit,
    order: {
      ...audit.order,
      breakdown: quotePrice(audit.feedApplicable ? audit.feedRows.length : 0),
    },
  }
}
