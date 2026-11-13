import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { getPublicOffer } from "@/lib/offer"
import { createOwnerToken } from "@/lib/owner"
import { isTrialActive, startTrialState, trialDaysLeft, trialStatus } from "@/lib/subscription"
import { startFreeTrial } from "@/lib/audit/checkout"
import { buildProfile } from "@/lib/audit/profile"
import { emptyScore, emptySummary, type AuditRecord } from "@/lib/audit/types"
import { emptyFacts } from "@/lib/crawl/fetch-store"
import { toPublicAudit } from "@/lib/public-view"
import { readAudit, setAuditStoreForTests, writeAudit } from "@/lib/store/audits"
import { createDurableRepository, createMemoryMetadata, createMemoryObjectStore } from "@/lib/store/durable"
import { randomUUID } from "node:crypto"

const originalEnv = { ...process.env }
const owner = createOwnerToken()

function makeAudit(): AuditRecord {
  const facts = emptyFacts("https://harbor.example")
  facts.homeFetched = true
  facts.finalUrl = "https://harbor.example"
  facts.siteName = "Harbor Sample"
  facts.description = "Harbor Sample sells handmade ceramic mugs online."
  facts.descriptionSource = "https://harbor.example/about"
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    retentionDays: 30,
    storeUrl: "https://harbor.example",
    contactEmail: "",
    includeProductFeed: true,
    includeAgentPack: false,
    outputLanguage: "en",
    status: "complete",
    steps: [],
    pages: [{ url: "https://harbor.example", role: "home", status: "fetched" }],
    crawl: facts,
    crawledProducts: [],
    profile: buildProfile(facts, "en"),
    feedRows: [],
    feedIssues: [],
    feedSummary: emptySummary(),
    feedApplicable: false,
    feedReason: "",
    urgent: [],
    eligibility: { agent: "Cannot tell", local: "Local shops can claim an existing United States listing.", market: "The official file upload is aimed at the United States." },
    score: emptyScore(),
    order: {
      status: "pending",
      breakdown: { baseCents: 0, currency: "USD", includedSkus: 50, rowCount: 0, blockSize: 50, blockPriceCents: 0, overageBlocks: 0, overageCents: 0, totalCents: 0, priceEnvSet: false, mode: "simulated" },
      chargedCents: null,
    },
    ownerSecretHash: owner.hash,
    versions: [],
  }
}

beforeEach(() => {
  process.env.PREP_TRIAL_DAYS = "7"
  process.env.PREP_TRIAL_PRICE_CENTS = "0"
  process.env.PREP_MONTHLY_PRICE_CENTS = "4990"
  process.env.PREP_CURRENCY = "USD"
  delete process.env.VERCEL_ENV
  delete process.env.BLOB_READ_WRITE_TOKEN
  delete process.env.BLOB_STORE_ID
  delete process.env.DATABASE_URL
  setAuditStoreForTests(
    createDurableRepository({ metadata: createMemoryMetadata(), objects: createMemoryObjectStore() }),
  )
})

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, originalEnv)
  setAuditStoreForTests(null)
})

describe("7-day free trial", () => {
  it("is USD 0.00 for 7 days (Free), then USD 49.90 / month (Pro), with no card", () => {
    const plans = getPublicOffer().plans
    expect(plans).toHaveLength(2)
    // Free is the 7-day trial, not a forever-free tier.
    expect(plans[0]!.id).toBe("free")
    expect(plans[0]!.priceCents).toBe(0)
    expect(plans[0]!.period).toContain("7 days")
    expect(plans[0]!.features.join(" ")).toMatch(/7-day free trial/)
    expect(plans[0]!.features.join(" ")).toMatch(/No card required/)
    expect(plans[0]!.features.join(" ")).toMatch(/Ends after 7 days/)
    // Pro is the monthly plan after the trial.
    expect(plans[1]!.id).toBe("pro")
    expect(plans[1]!.priceCents).toBe(4990)
    expect(plans[1]!.priceLabel).toContain("49.90")
    expect(plans[1]!.period).toContain("month")
    expect(plans[0]!.features).toHaveLength(plans[1]!.features.length)
  })

  it("starts with an email only, charges 0, and unlocks the pack for 7 days", async () => {
    const seeded = makeAudit()
    await writeAudit(seeded)
    const started = await startFreeTrial(seeded.id, "merchant@harbor.example", owner.token, new Date("2026-11-13T12:00:00Z"))
    expect(started.trial?.chargedCents).toBe(0)
    expect(started.trial?.trialPriceCents).toBe(0)
    expect(started.trial?.monthlyPriceCents).toBe(4990)
    expect(started.trial?.endsAt).toBe("2026-11-20T12:00:00.000Z")
    // A trial is not a payment: the order stays pending.
    expect(started.order.status).toBe("pending")
    expect(started.versions).toHaveLength(1)

    const view = toPublicAudit(started, new Date("2026-11-13T12:00:00Z"))
    expect(JSON.stringify(view)).not.toContain("merchant@harbor.example")
    expect(view.trial).not.toHaveProperty("email")
    expect(view.paid).toBe(true)
    expect(view.trialStatus).toBe("active")
    expect(view.trialDaysLeft).toBe(7)
    expect(view.versions).toHaveLength(1)
  })

  it("locks the pack again after 7 days and charges nothing", async () => {
    const seeded = makeAudit()
    await writeAudit(seeded)
    const started = await startFreeTrial(seeded.id, "merchant@harbor.example", owner.token, new Date("2026-11-13T12:00:00Z"))
    const after = toPublicAudit(started, new Date("2026-11-21T12:00:01Z"))
    expect(after.trialStatus).toBe("expired")
    expect(after.trialDaysLeft).toBe(0)
    expect(after.paid).toBe(false)
    expect(after.versions).toHaveLength(0)
    expect((await readAudit(seeded.id))?.trial?.chargedCents).toBe(0)
  })

  it("does not stack a second trial on the same audit, and an expired trial cannot restart", async () => {
    const seeded = makeAudit()
    await writeAudit(seeded)
    const first = await startFreeTrial(seeded.id, "merchant@harbor.example", owner.token, new Date("2026-11-13T12:00:00Z"))
    // Re-starting while active is idempotent: same trial, no second version.
    const again = await startFreeTrial(seeded.id, "merchant@harbor.example", owner.token, new Date("2026-11-14T12:00:00Z"))
    expect(again.trial?.startedAt).toBe(first.trial?.startedAt)
    expect(again.versions).toHaveLength(1)
    // After expiry the same audit cannot start a new trial.
    await expect(startFreeTrial(seeded.id, "merchant@harbor.example", owner.token, new Date("2026-11-21T12:00:00Z"))).rejects.toThrow(
      /already used its one free trial/,
    )
  })

  it("requires an email and a finished audit", async () => {
    const seeded = makeAudit()
    await writeAudit(seeded)
    await expect(startFreeTrial(seeded.id, "not-an-email", owner.token)).rejects.toThrow(/contact email is required/)
    const running = { ...makeAudit(), status: "running" as const }
    await writeAudit(running)
    await expect(startFreeTrial(running.id, "merchant@harbor.example", owner.token)).rejects.toThrow(/not finished/)
  })

  it("pure trial helpers: active inside 7 days, expired after", () => {
    const trial = startTrialState("merchant@harbor.example", { trialDays: 7, trialPriceCents: 0, monthlyPriceCents: 4990, currency: "USD" }, new Date("2026-11-13T12:00:00Z"))
    expect(isTrialActive(trial, new Date("2026-11-19T12:00:00Z"))).toBe(true)
    expect(trialStatus(trial, new Date("2026-11-20T12:00:01Z"))).toBe("expired")
    expect(trialDaysLeft(trial, new Date("2026-11-19T12:00:00Z"))).toBe(1)
  })
})
