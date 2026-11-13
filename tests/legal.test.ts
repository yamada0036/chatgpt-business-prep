import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { publishVersion } from "@/lib/audit/checkout"
import { emptyScore, emptySummary, type AuditRecord } from "@/lib/audit/types"
import { buildProfile } from "@/lib/audit/profile"
import { emptyFacts } from "@/lib/crawl/fetch-store"
import { privacySections, termsSections } from "@/lib/legal/document"
import {
  RETENTION_FACT,
  SUPPORT_EMAIL,
  WAFFO_VERIFY_CONTENT,
  WAFFO_VERIFY_NAME,
} from "@/lib/legal/public"
import { getPublicOffer } from "@/lib/offer"
import { createDurableRepository, createMemoryMetadata, createMemoryObjectStore } from "@/lib/store/durable"
import { readAudit, setAuditStoreForTests, writeAudit } from "@/lib/store/audits"

const pages = ["app/page.tsx", "app/terms/page.tsx", "app/privacy/page.tsx", "app/pricing/page.tsx", "app/help/page.tsx", "components/site-shell.tsx", "components/intended-offer.tsx", "lib/legal/public.ts"]

describe("public legal copy", () => {
  it("states the intended subscription as not for sale and omits undecided commercial rules", () => {
    process.env.PREP_TRIAL_DAYS = "7"
    process.env.PREP_TRIAL_PRICE_CENTS = "0"
    process.env.PREP_MONTHLY_PRICE_CENTS = "4990"
    process.env.PREP_CURRENCY = "USD"
    const offer = getPublicOffer()
    const text = [offer.notForSale, offer.intended, offer.termsGate, ...termsSections(offer).flatMap((section) => section.paragraphs), ...privacySections(offer).flatMap((section) => section.paragraphs)].join("\n")
    expect(text).toContain(offer.trialPriceLabel)
    expect(text).toContain(`${offer.trialDays}-day`)
    expect(text).toContain(offer.monthlyPriceLabel)
    expect(text).toContain("not being charged")
    expect(text).toContain(SUPPORT_EMAIL)
    expect(text).toContain(RETENTION_FACT)
    expect(text).not.toMatch(/GetPraxora|TBD|lorem|cancel anytime|no refunds|Waffo checkout/i)
    expect(text).not.toMatch(/\$49 one-time|USD 49\.00/)
    expect(text).not.toMatch(/deleted after 30 days/i)
  })

  it("puts the exact Waffo ownership meta on the homepage and links the legal pages", async () => {
    const home = await readFile(path.join(process.cwd(), "app/page.tsx"), "utf8")
    const shell = await readFile(path.join(process.cwd(), "components/site-shell.tsx"), "utf8")
    expect(WAFFO_VERIFY_NAME).toBe("waffo-verify")
    expect(WAFFO_VERIFY_CONTENT).toBe("56efef08aaf5a8144992e96465438566")
    expect(home).toContain("WAFFO_VERIFY_NAME")
    expect(home).toContain("WAFFO_VERIFY_CONTENT")
    expect(shell).toContain('href="/terms"')
    expect(shell).toContain('href="/privacy"')
    expect(shell).toContain('href="/pricing"')
    const joined = (await Promise.all(pages.map((file) => readFile(path.join(process.cwd(), file), "utf8")))).join("\n")
    expect(joined).not.toMatch(/GetPraxora/)
  })

  it("deletes an expired audit on read instead of keeping it for a promised clock time", async () => {
    const store = createDurableRepository({ metadata: createMemoryMetadata(), objects: createMemoryObjectStore() })
    setAuditStoreForTests(store)
    const facts = emptyFacts("https://harbor.example")
    facts.homeFetched = true
    const audit: AuditRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      retentionDays: 30,
      storeUrl: "https://harbor.example",
      contactEmail: "",
      includeProductFeed: false,
      includeAgentPack: false,
      outputLanguage: "en",
      status: "complete",
      steps: [],
      pages: [],
      crawl: facts,
      crawledProducts: [],
      profile: buildProfile(facts, "en"),
      feedRows: [],
      feedIssues: [],
      feedSummary: emptySummary(),
      feedApplicable: false,
      feedReason: "",
      urgent: [],
      eligibility: { agent: "", local: "", market: "" },
      score: emptyScore(),
      order: { status: "pending", breakdown: { baseCents: 0, currency: "USD", includedSkus: 50, rowCount: 0, blockSize: 50, blockPriceCents: 0, overageBlocks: 0, overageCents: 0, totalCents: 0, priceEnvSet: false, mode: "simulated" }, chargedCents: null },
      versions: [],
    }
    await writeAudit(audit)
    expect(await readAudit(audit.id)).toBeNull()
    const fresh = { ...audit, id: "22222222-2222-4222-8222-222222222222", expiresAt: new Date(Date.now() + 86_400_000).toISOString() }
    await writeAudit(fresh)
    expect((await readAudit(fresh.id))?.id).toBe(fresh.id)
    await publishVersion(fresh)
    setAuditStoreForTests(null)
  })
})
