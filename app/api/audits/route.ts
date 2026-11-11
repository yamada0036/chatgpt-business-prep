import { randomUUID } from "node:crypto"
import { enqueueAudit } from "@/lib/audit/run"
import { emptyScore, emptySummary, initialSteps, type AuditRecord, type OutputLanguage } from "@/lib/audit/types"
import { getConfig } from "@/lib/config"
import { parseProductFile } from "@/lib/feed/parse-upload"
import { quotePrice } from "@/lib/pricing"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { logEvent, writeAudit } from "@/lib/store/audits"
import { looksLikeEmail } from "@/lib/text"
import { UrlError, assertPublicUrl } from "@/lib/url-safety"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const form = await request.formData()
  const storeUrl = String(form.get("store_url") ?? "").trim()
  const languageRaw = String(form.get("output_language") ?? "en")
  const outputLanguage: OutputLanguage = languageRaw === "zh" ? "zh" : "en"
  const includeProductFeed = String(form.get("include_product_feed") ?? "true") !== "false"
  const includeAgentPack = String(form.get("include_agent_pack") ?? "false") === "true"
  const contactEmail = String(form.get("contact_email") ?? "").trim()
  if (contactEmail && !looksLikeEmail(contactEmail)) {
    return Response.json({ error: { code: "email", message: "The contact email format is not valid." } }, { status: 400 })
  }
  const config = getConfig()
  try {
    await assertPublicUrl(storeUrl, { allowLoopback: config.allowLoopback })
  } catch (error) {
    const blocked = error instanceof UrlError && (error.code === "blocked" || error.code === "protocol" || error.code === "credentials")
    return Response.json(
      { error: { code: blocked ? "blocked" : "bad_url", message: blocked ? ERROR_MESSAGES.blocked : ERROR_MESSAGES.bad_url } },
      { status: 400 },
    )
  }
  let upload: AuditRecord["upload"]
  const file = form.get("product_file")
  if (file instanceof File && file.size > 0) {
    if (file.size > config.maxUploadBytes) {
      return Response.json({ error: { code: "too_large", message: ERROR_MESSAGES.too_large } }, { status: 400 })
    }
    const parsed = await parseProductFile(file.name, Buffer.from(await file.arrayBuffer()), config.maxFeedRows)
    if ("error" in parsed) return Response.json({ error: { code: "file", message: parsed.error } }, { status: 400 })
    upload = parsed.upload
  }
  const now = new Date()
  const audit: AuditRecord = {
    id: randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.retentionDays * 86_400_000).toISOString(),
    retentionDays: config.retentionDays,
    storeUrl,
    contactEmail,
    includeProductFeed,
    includeAgentPack,
    outputLanguage,
    status: "running",
    steps: initialSteps(),
    pages: [],
    crawl: null,
    crawledProducts: [],
    profile: [],
    feedRows: [],
    feedIssues: [],
    feedSummary: emptySummary(),
    feedApplicable: false,
    feedReason: "",
    urgent: [],
    eligibility: { agent: "", local: "", market: "" },
    score: emptyScore(),
    order: { status: "pending", breakdown: quotePrice(0), chargedCents: null },
    versions: [],
    upload,
  }
  await writeAudit(audit)
  logEvent("audit_created", { id: audit.id, feed: includeProductFeed, agent: includeAgentPack, rows: upload?.records.length ?? 0 })
  enqueueAudit(audit.id)
  return Response.json({ id: audit.id })
}
