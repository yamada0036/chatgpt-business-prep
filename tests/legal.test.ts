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
    process.env.PREP_TRIAL_PRICE_CENTS = "990"
    process.env.PREP_MONTHLY_PRICE_CENTS = "4990"
    process.env.PREP_CURRENCY = "USD"
    const offer = getPublicOffer()
    const text = [offer.notForSale, offer.intended, offer.termsGate, offer.intro, offer.footnote, offer.freeTrial, ...offer.plans.flatMap((plan) => plan.features), ...termsSections(offer).flatMap((section) => section.paragraphs), ...privacySections(offer).flatMap((section) => section.paragraphs)].join("\n")
    expect(offer.trialPriceCents).toBe(990)
    expect(offer.monthlyPriceCents).toBe(4990)
    expect(offer.paidAvailable).toBe(false)
    expect(offer.trialCanStart).toBe(false)
    expect(text).toContain("USD 9.90")
    expect(text).toContain("USD 49.90")
    expect(text).toContain("within 7 days after each charge")
    expect(text).toContain("USD 9.90 trial fee and each USD 49.90 monthly fee")
    expect(text).toContain("renews automatically unless you cancel")
    expect(text).toContain("Cancellation stops the next renewal")
    expect(text).toContain("until the end of that paid period")
    expect(text).toContain("applicable law already gives you is unaffected")
    expect(text).toContain(SUPPORT_EMAIL)
    expect(text).toContain("not being charged")
    expect(text).toContain(RETENTION_FACT)
    const billing = [offer.notForSale, offer.intended, offer.termsGate, offer.intro, offer.footnote, offer.freeTrial, ...offer.plans.flatMap((plan) => plan.features)].join("\n")
    expect(billing).not.toMatch(/payment provider|no refund button|no cancellation button|no automatic refund|does not name that law|how soon a request/i)
    expect(text).not.toMatch(/whether any fee is refundable are not decided/)
    expect(text).not.toMatch(/This section does not add a charge or a refund rule/)
    expect(text).not.toMatch(/payment provider will approve/i)
    expect(text).not.toMatch(/GetPraxora|TBD|lorem|cancel anytime|no refunds|Waffo checkout/i)
    expect(text).not.toMatch(/\$49 one-time|USD 49\.00/)
    expect(text).not.toMatch(/deleted after 30 days/i)
  })

  it("explains misuse consequences and information requests without new promises", () => {
    const offer = getPublicOffer()
    const terms = termsSections(offer)
    const privacy = privacySections(offer)
    const misuse = terms.find((section) => section.heading === "If a submission breaks these rules")
    const requests = privacy.find((section) => section.heading === "Requests about your information")
    expect(misuse?.paragraphs.join("\n")).toMatch(/no user account/i)
    expect(misuse?.paragraphs.join("\n")).toMatch(/no automatic block list/i)
    expect(misuse?.paragraphs.join("\n")).not.toContain(SUPPORT_EMAIL)
    expect(requests?.paragraphs.join("\n")).toContain(SUPPORT_EMAIL)
    expect(requests?.paragraphs.join("\n")).toMatch(/audit id/)
    expect(requests?.paragraphs.join("\n")).toMatch(/no delete button/i)
    const added = `${misuse?.paragraphs.join("\n")}\n${requests?.paragraphs.join("\n")}`
    expect(added).not.toMatch(/GDPR|PIPL|governing law is|account suspension|deleted after 30 days|no refunds|GetPraxora/i)
    expect(WAFFO_VERIFY_CONTENT).toBe("6501fadcd89117d73a42661b07884e88")
  })

  it("puts the exact Waffo ownership meta on the homepage and links the legal pages", async () => {
    const home = await readFile(path.join(process.cwd(), "app/page.tsx"), "utf8")
    const shell = await readFile(path.join(process.cwd(), "components/site-shell.tsx"), "utf8")
    expect(WAFFO_VERIFY_NAME).toBe("waffo-verify")
    expect(WAFFO_VERIFY_CONTENT).toBe("6501fadcd89117d73a42661b07884e88")
    expect(home).toContain("WAFFO_VERIFY_NAME")
    expect(home).toContain("WAFFO_VERIFY_CONTENT")
    expect(shell).toContain('href="/terms"')
    expect(shell).toContain('href="/privacy"')
    expect(shell).toContain('href="/pricing"')
    expect(shell).toContain("`mailto:${SUPPORT_EMAIL}`")
    expect(shell).toContain("`Customer support: ${SUPPORT_EMAIL}`")
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
