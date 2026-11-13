import type {
  AvailabilityValue,
  IssueType,
  ProfileFieldKey,
} from "@/lib/official/spec"

export type OutputLanguage = "en" | "zh"

export type StepKey = "fetch" | "sheet" | "check"
export type StepState = "pending" | "active" | "done" | "failed"

export type AuditStep = {
  key: StepKey
  state: StepState
  detail?: string
}

export type PageRole =
  | "home"
  | "about"
  | "contact"
  | "delivery_policy"
  | "return_policy"
  | "listing"
  | "product"
  | "products_json"
  | "other"

export type PageRecord = {
  url: string
  role: PageRole
  status: "fetched" | "not_fetched"
  httpStatus?: number
  reason?: string
}

export type ProfileDisplay =
  | "ready"
  | "missing"
  | "needs_input"
  | "conflict"
  | "not_fetched"

export type ProfileStatus = "ready" | "needs_merchant_input" | "conflict"

export type Sourced = { value: string; source: string }

export type ProfileField = {
  key: ProfileFieldKey
  fieldName: string
  required: boolean
  display: ProfileDisplay
  status: ProfileStatus
  source: string
  currentFound: string
  suggestedValue: string
  conflicts: Sourced[]
  note: string
}

export type Cell = { value: string; source: string }

export type RawProduct = {
  fields: Record<string, Cell>
  conflicts: Record<string, Sourced[]>
  variantReliable: boolean
  variantUnparsed: boolean
  sourceUrl: string
}

export type FeedRow = {
  index: number
  cells: Record<string, Cell>
  conflicts: Record<string, Sourced[]>
}

export type FeedIssue = {
  itemId: string
  rowIndex: number
  field: string
  issueType: IssueType
  currentValue: string
  suggestedValue: string
  sourceUrl: string
  note: string
}

export type FeedSummary = {
  total: number
  complete: number
  missingRows: number
  invalidRows: number
}

export type UrgentIssue = { name: string; state: string; impact: string }

export type ScoreResult = {
  total: number
  profilePercent: number
  feedPercent: number | null
  feedWeighted: boolean
  explanation: string
}

export type Eligibility = { agent: string; local: string; market: string }

/**
 * Free trial, per audit. One trial per audit, started with an email only.
 * No card, no PayPal order, no charge during the trial (chargedCents is 0).
 * When `endsAt` passes the trial is expired and the pack locks again;
 * nothing is auto-charged — a paid month only starts if the merchant
 * explicitly starts it afterwards (PayPal Subscriptions, not wired yet).
 */
export type TrialState = {
  status: "active" | "cancelled"
  email: string
  startedAt: string
  endsAt: string
  trialDays: number
  trialPriceCents: number
  monthlyPriceCents: number
  currency: string
  chargedCents: number
  cancelledAt?: string
}

export type OrderStatus = "pending" | "paid" | "delivered" | "failed" | "refunded"

export function orderUnlocksPack(status: OrderStatus): boolean {
  return status === "paid" || status === "delivered"
}

export type PriceBreakdown = {
  baseCents: number
  currency: string
  includedSkus: number
  rowCount: number
  blockSize: number
  blockPriceCents: number
  overageBlocks: number
  overageCents: number
  totalCents: number
  priceEnvSet: boolean
  mode: "simulated" | "paypal"
}

export type Order = {
  status: OrderStatus
  breakdown: PriceBreakdown
  chargedCents: number | null
  paidAt?: string
  failureReason?: string
  paypalOrderId?: string
  paypalInvoiceId?: string
  paypalCaptureId?: string
  paypalAmountCents?: number
  paypalCurrency?: string
  paypalAwaitingWebhook?: boolean
  settledCaptureIds?: string[]
  blockedCaptureIds?: string[]
  refundedAt?: string
}

export type VersionMeta = {
  version: number
  createdAt: string
  zipName: string
  files: string[]
  incompleteRowCount: number
}

export type UploadData = {
  filename: string
  headers: string[]
  records: string[][]
  mapping: Record<string, string> | null
  mapUsed: boolean
  omittedRowCount: number
}

export type CrawlFacts = {
  finalUrl: string
  homeFetched: boolean
  siteName: string
  siteNameSource: string
  description: string
  descriptionSource: string
  categories: string[]
  categorySource: string
  logoUrl: string
  logoSource: string
  coverUrl: string
  coverSource: string
  deliveryUrl: string
  deliveryExcerpt: string
  deliveryFetched: boolean
  deliveryLinked: boolean
  returnUrl: string
  returnExcerpt: string
  returnFetched: boolean
  returnLinked: boolean
  acceptsReturns: boolean | null
  returnDays: number | null
  websiteConflicts: Sourced[]
  countryHints: string[]
  schemaTypes: string[]
  currency: string
}

export type AuditStatus =
  | "running"
  | "complete"
  | "partial"
  | "error"
  | "needs_column_map"

export type AuditRecord = {
  id: string
  createdAt: string
  expiresAt: string
  retentionDays: number
  storeUrl: string
  contactEmail: string
  includeProductFeed: boolean
  includeAgentPack: boolean
  outputLanguage: OutputLanguage
  status: AuditStatus
  error?: { code: string; message: string }
  steps: AuditStep[]
  pages: PageRecord[]
  crawl: CrawlFacts | null
  crawledProducts: RawProduct[]
  profile: ProfileField[]
  feedRows: FeedRow[]
  feedIssues: FeedIssue[]
  feedSummary: FeedSummary
  feedApplicable: boolean
  feedReason: string
  urgent: UrgentIssue[]
  eligibility: Eligibility
  score: ScoreResult
  order: Order
  trial?: TrialState
  versions: VersionMeta[]
  upload?: UploadData
  partialReason?: string
}

export type SupplementTarget = {
  key: string
  scope: "profile" | "feed"
  field: string
  rowIndex?: number
  itemId: string
  issueType: string
  label: string
  currentValue: string
  conflicts: Sourced[]
}

export function emptySummary(): FeedSummary {
  return { total: 0, complete: 0, missingRows: 0, invalidRows: 0 }
}

export function emptyScore(): ScoreResult {
  return {
    total: 0,
    profilePercent: 0,
    feedPercent: null,
    feedWeighted: false,
    explanation: "",
  }
}

export function initialSteps(): AuditStep[] {
  return [
    { key: "fetch", state: "pending" },
    { key: "sheet", state: "pending" },
    { key: "check", state: "pending" },
  ]
}

export function isAvailability(value: string): value is AvailabilityValue {
  return (
    value === "in_stock" ||
    value === "out_of_stock" ||
    value === "pre_order" ||
    value === "backorder" ||
    value === "unknown"
  )
}
