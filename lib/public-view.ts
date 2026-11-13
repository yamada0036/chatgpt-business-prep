import type { AuditRecord, SupplementTarget } from "@/lib/audit/types"
import { orderUnlocksPack } from "@/lib/audit/types"
import { profileCounts } from "@/lib/audit/score"
import { excerpt } from "@/lib/audit/profile"
import { FEED_FIELDS, REQUIRED_FEED_FIELDS } from "@/lib/official/spec"
import { incompleteRowCount } from "@/lib/feed/finalize"
import { packScope } from "@/lib/pack/scope"
import { paidCheckoutState, type PaidState } from "@/lib/paypal/ready"
import { isTrialActive, trialDaysLeft, trialStatus, type TrialStatus } from "@/lib/subscription"
import type { TrialState } from "@/lib/audit/types"

export type PublicAudit = {
  id: string
  status: AuditRecord["status"]
  error?: AuditRecord["error"]
  steps: AuditRecord["steps"]
  pages: AuditRecord["pages"]
  storeUrl: string
  includeProductFeed: boolean
  includeAgentPack: boolean
  outputLanguage: AuditRecord["outputLanguage"]
  contactEmail: string
  profile: {
    key: string
    fieldName: string
    required: boolean
    display: string
    status: string
    note: string
    source: string
    excerpt: string
  }[]
  profileCounts: ReturnType<typeof profileCounts>
  feedSummary: AuditRecord["feedSummary"]
  feedApplicable: boolean
  feedReason: string
  omittedRowCount: number
  urgent: AuditRecord["urgent"]
  eligibility: AuditRecord["eligibility"]
  score: AuditRecord["score"]
  order: AuditRecord["order"]
  sampleRows: { titleExcerpt: string; filled: { field: string; filled: boolean }[] }[]
  retentionDays: number
  expiresAt: string
  partialReason?: string
  columnMap?: { headers: string[]; fields: string[] }
  versions: AuditRecord["versions"]
  incompleteRowCount: number
  supplements: SupplementTarget[]
  paid: boolean
  trial?: TrialState
  trialStatus: TrialStatus
  trialDaysLeft: number
  skuCapNote: string
  paidCheckout: PaidState
}

export function toPublicAudit(audit: AuditRecord, now = new Date()): PublicAudit {
  const paid = orderUnlocksPack(audit.order.status) || isTrialActive(audit.trial, now)
  const status = trialStatus(audit.trial, now)
  const scope = packScope(audit)
  return {
    id: audit.id,
    status: audit.status,
    error: audit.error,
    steps: audit.steps,
    pages: audit.pages,
    storeUrl: audit.storeUrl,
    includeProductFeed: audit.includeProductFeed,
    includeAgentPack: audit.includeAgentPack,
    outputLanguage: audit.outputLanguage,
    contactEmail: maskEmail(audit.contactEmail),
    profile: audit.profile.map((field) => ({
      key: field.key,
      fieldName: field.fieldName,
      required: field.required,
      display: field.display,
      status: field.status,
      note: field.note,
      source: field.source,
      excerpt: excerpt(field.currentFound, 80),
    })),
    profileCounts: profileCounts(audit.profile),
    feedSummary: audit.feedSummary,
    feedApplicable: audit.feedApplicable,
    feedReason: audit.feedReason,
    omittedRowCount: audit.upload?.omittedRowCount ?? 0,
    urgent: audit.urgent,
    eligibility: audit.eligibility,
    score: audit.score,
    order: audit.order,
    sampleRows: audit.feedRows.slice(0, 2).map((row) => ({
      titleExcerpt: (row.cells.title?.value ?? "").slice(0, 18),
      filled: REQUIRED_FEED_FIELDS.map((field) => ({
        field,
        filled: Boolean(row.cells[field]?.value),
      })),
    })),
    retentionDays: audit.retentionDays,
    expiresAt: audit.expiresAt,
    partialReason: audit.partialReason,
    columnMap:
      audit.status === "needs_column_map" && audit.upload
        ? { headers: audit.upload.headers, fields: [...FEED_FIELDS] }
        : undefined,
    versions: paid ? audit.versions : [],
    incompleteRowCount: incompleteRowCount(scope.rows),
    supplements: paid ? supplementTargets(audit) : [],
    paid,
    trial: audit.trial,
    trialStatus: status,
    trialDaysLeft: trialDaysLeft(audit.trial, now),
    skuCapNote: scope.note,
    paidCheckout: paidCheckoutState(),
  }
}

function maskEmail(email: string): string {
  if (!email) return ""
  const [name, host] = email.split("@")
  if (!host) return ""
  return `${name.slice(0, 1)}•••@${host}`
}

function supplementTargets(audit: AuditRecord): SupplementTarget[] {
  const targets: SupplementTarget[] = []
  const seen = new Set<string>()
  for (const field of audit.profile) {
    if (field.status !== "needs_merchant_input" && field.status !== "conflict") continue
    const key = `profile:${field.key}`
    seen.add(key)
    targets.push({
      key,
      scope: "profile",
      field: field.fieldName,
      itemId: "",
      issueType: field.status,
      label: field.fieldName,
      currentValue: field.conflicts.map((item) => `${item.source}: ${item.value}`).join(" | ") || field.currentFound,
      conflicts: field.conflicts,
    })
  }
  for (const issue of audit.feedIssues) {
    if (!["missing", "needs_merchant_input", "conflict", "invalid"].includes(issue.issueType)) continue
    const key = `feed:${issue.rowIndex}:${issue.field}`
    if (seen.has(key)) continue
    seen.add(key)
    targets.push({
      key,
      scope: "feed",
      field: issue.field,
      rowIndex: issue.rowIndex,
      itemId: issue.itemId,
      issueType: issue.issueType,
      label: issue.itemId ? `${issue.itemId} · ${issue.field}` : `Row ${issue.rowIndex + 1} · ${issue.field}`,
      currentValue: issue.currentValue,
      conflicts: [],
    })
  }
  return targets
}
