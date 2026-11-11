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
    feedReason = "商家未要求整理商品 feed。"
  } else if (input.upload) {
    feedApplicable = true
    const merged = mergeProducts(uploadToRaw(input.upload), input.crawl.products)
    finalized = finalizeProducts(merged)
    if (input.upload.omittedRowCount > 0) {
      feedReason = `上传表格共超出上限 ${input.upload.omittedRowCount} 行，这些行没有进入准备包。`
    }
  } else if (!input.crawl.sawProductLinks) {
    feedReason = "未发现可公开访问的商品。资料清单已生成。商品 feed 不适用。"
  } else {
    feedApplicable = true
    finalized = finalizeProducts(input.crawl.products)
    if (finalized.rows.length === 0) {
      feedReason = "看到了商品入口，但没有抓到可写入 feed 的商品行。"
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
  return {
    ...audit,
    order: {
      ...audit.order,
      breakdown: quotePrice(audit.feedApplicable ? audit.feedRows.length : 0),
    },
  }
}
