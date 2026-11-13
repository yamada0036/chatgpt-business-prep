import { readFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GET as downloadGet } from "@/app/api/audits/[id]/download/route"
import { GET as auditGet } from "@/app/api/audits/[id]/route"
import { POST as supplementPost } from "@/app/api/audits/[id]/supplement/route"
import { POST as trialPost } from "@/app/api/audits/[id]/trial/route"
import { POST as createPost } from "@/app/api/audits/route"
import { markCaptureRefunded, startFreeTrial } from "@/lib/audit/checkout"
import { buildProfile } from "@/lib/audit/profile"
import { emptyScore, emptySummary, type AuditRecord } from "@/lib/audit/types"
import { emptyFacts } from "@/lib/crawl/fetch-store"
import { getPublicOffer } from "@/lib/offer"
import { createOwnerToken, hashOwnerToken, ownerCookieName } from "@/lib/owner"
import { presentAudit } from "@/lib/present"
import { readAudit, setAuditStoreForTests, writeAudit } from "@/lib/store/audits"
import { createDurableRepository, createMemoryMetadata, createMemoryObjectStore } from "@/lib/store/durable"

const originalEnv = { ...process.env }

function makeAudit(storeUrl = "https://harbor.example", email = ""): AuditRecord & { ownerToken: string } {
  const owner = createOwnerToken()
  const facts = emptyFacts(storeUrl)
  facts.homeFetched = true
  facts.finalUrl = storeUrl
  facts.siteName = "Harbor Sample"
  facts.description = "Harbor Sample sells handmade ceramic mugs online."
  facts.descriptionSource = `${storeUrl}/about`
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    retentionDays: 30,
    storeUrl,
    contactEmail: email,
    includeProductFeed: true,
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
    order: {
      status: "pending",
      breakdown: {
        baseCents: 0,
        currency: "USD",
        includedSkus: 50,
        rowCount: 0,
        blockSize: 50,
        blockPriceCents: 0,
        overageBlocks: 0,
        overageCents: 0,
        totalCents: 0,
        priceEnvSet: false,
        mode: "simulated",
      },
      chargedCents: null,
    },
    ownerSecretHash: owner.hash,
    versions: [],
    ownerToken: owner.token,
  } as AuditRecord & { ownerToken: string }
}

function cookieFor(audit: AuditRecord & { ownerToken: string }): string {
  return `${ownerCookieName(audit.id)}=${encodeURIComponent(audit.ownerToken)}`
}

async function persist(seeded: AuditRecord & { ownerToken: string }) {
  const { ownerToken: _token, ...record } = seeded
  await writeAudit(record)
}

beforeEach(() => {
  process.env.PREP_TRIAL_DAYS = "7"
  process.env.PREP_TRIAL_PRICE_CENTS = "0"
  process.env.PREP_MONTHLY_PRICE_CENTS = "4990"
  process.env.PREP_BASE_PRICE_CENTS = "0"
  process.env.PREP_CURRENCY = "USD"
  delete process.env.VERCEL
  delete process.env.VERCEL_ENV
  delete process.env.BLOB_READ_WRITE_TOKEN
  delete process.env.BLOB_STORE_ID
  delete process.env.DATABASE_URL
  setAuditStoreForTests(createDurableRepository({ metadata: createMemoryMetadata(), objects: createMemoryObjectStore() }))
})

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, originalEnv)
  setAuditStoreForTests(null)
})

describe("trial owner, privacy, and repeat limits", () => {
  it("hides the trial email and refuses a link that lacks the owner credential", async () => {
    const seeded = makeAudit()
    await persist(seeded)
    const started = await startFreeTrial(seeded.id, "merchant@harbor.example", seeded.ownerToken, new Date("2026-11-13T12:00:00Z"))
    const view = presentAudit(started, new Date("2026-11-13T12:00:00Z"))
    expect(JSON.stringify(view)).not.toContain("merchant@harbor.example")
    expect(JSON.stringify(view)).not.toContain(seeded.ownerSecretHash)
    expect(view.contactEmail).toBe("m•••@harbor.example")
    expect(view.trial).not.toHaveProperty("email")
    expect(view.offer.monthlyPriceLabel).toContain("49.90")
    expect(view.offer.paidAvailable).toBe(false)

    const hidden = await downloadGet(new Request(`http://local/api/audits/${seeded.id}/download`), {
      params: Promise.resolve({ id: seeded.id }),
    })
    expect(hidden.status).toBe(403)
    const opened = await downloadGet(
      new Request(`http://local/api/audits/${seeded.id}/download`, { headers: { cookie: cookieFor(seeded) } }),
      { params: Promise.resolve({ id: seeded.id }) },
    )
    expect(opened.status).toBe(200)
    expect(opened.headers.get("content-type")).toContain("application/zip")
    await expect(startFreeTrial(seeded.id, "merchant@harbor.example", "wrong-token")).rejects.toThrow(/did not create/)
  })

  it("keeps a saved email when the form sends a blank address", async () => {
    const seeded = makeAudit("https://harbor.example", "saved@harbor.example")
    await persist(seeded)
    const response = await trialPost(
      new Request(`http://local/api/audits/${seeded.id}/trial`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieFor(seeded) },
        body: JSON.stringify({ contact_email: "" }),
      }),
      { params: Promise.resolve({ id: seeded.id }) },
    )
    expect(response.status).toBe(200)
    const stored = await readAudit(seeded.id)
    expect(stored?.trial?.email).toBe("saved@harbor.example")
    expect(JSON.stringify(await response.json())).not.toContain("saved@harbor.example")
  })

  it("blocks a second audit of the same store or the same email, including www", async () => {
    const first = makeAudit("https://harbor.example/path/")
    const sameSite = makeAudit("https://www.harbor.example/path")
    const sameEmail = makeAudit("https://other.example")
    const fresh = makeAudit("https://third.example")
    await persist(first)
    await persist(sameSite)
    await persist(sameEmail)
    await persist(fresh)
    await startFreeTrial(first.id, "merchant@harbor.example", first.ownerToken)
    await expect(startFreeTrial(sameSite.id, "other@harbor.example", sameSite.ownerToken)).rejects.toThrow(/store already used/)
    await expect(startFreeTrial(sameEmail.id, "Merchant@Harbor.example", sameEmail.ownerToken)).rejects.toThrow(/email already used/)
    const started = await startFreeTrial(fresh.id, "fresh@third.example", fresh.ownerToken)
    expect(started.trial?.chargedCents).toBe(0)
  })

  it("lets only one of two concurrent trials claim a store", async () => {
    const left = makeAudit("https://race.example")
    const right = makeAudit("https://www.race.example/")
    await persist(left)
    await persist(right)
    const results = await Promise.allSettled([
      startFreeTrial(left.id, "left@race.example", left.ownerToken),
      startFreeTrial(right.id, "right@race.example", right.ownerToken),
    ])
    const fulfilled = results.filter((result) => result.status === "fulfilled")
    const rejected = results.filter((result) => result.status === "rejected")
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/store already used/)
  })

  it("locks the download after expiry and after a refund cancels the trial", async () => {
    const seeded = makeAudit()
    await persist(seeded)
    await startFreeTrial(seeded.id, "merchant@harbor.example", seeded.ownerToken, new Date("2020-01-01T00:00:00Z"))
    const expired = await downloadGet(
      new Request(`http://local/api/audits/${seeded.id}/download`, { headers: { cookie: cookieFor(seeded) } }),
      { params: Promise.resolve({ id: seeded.id }) },
    )
    expect(expired.status).toBe(403)

    const active = makeAudit("https://refund.example")
    await persist(active)
    const started = await startFreeTrial(active.id, "merchant@refund.example", active.ownerToken)
    const refunded = markCaptureRefunded(started, "CAP123")
    expect(refunded.trial?.status).toBe("cancelled")
    expect(refunded.order.status).toBe("refunded")
    await writeAudit(refunded)
    const locked = await downloadGet(
      new Request(`http://local/api/audits/${active.id}/download`, { headers: { cookie: cookieFor(active) } }),
      { params: Promise.resolve({ id: active.id }) },
    )
    expect(locked.status).toBe(403)
    const supplement = await supplementPost(
      new Request(`http://local/api/audits/${active.id}/supplement`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieFor(active) },
        body: JSON.stringify({ updates: [] }),
      }),
      { params: Promise.resolve({ id: active.id }) },
    )
    expect(supplement.status).toBe(403)
  })

  it("allows a supplement during an active trial and keeps the order pending", async () => {
    const seeded = makeAudit("https://supplement.example")
    await persist(seeded)
    await startFreeTrial(seeded.id, "merchant@supplement.example", seeded.ownerToken)
    const missing = await supplementPost(
      new Request(`http://local/api/audits/${seeded.id}/supplement`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates: [] }),
      }),
      { params: Promise.resolve({ id: seeded.id }) },
    )
    expect(missing.status).toBe(403)
    const allowed = await supplementPost(
      new Request(`http://local/api/audits/${seeded.id}/supplement`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieFor(seeded) },
        body: JSON.stringify({ updates: [] }),
      }),
      { params: Promise.resolve({ id: seeded.id }) },
    )
    expect(allowed.status).toBe(200)
    expect((await readAudit(seeded.id))?.order.status).toBe("pending")
  })

  it("uses the configured trial length and monthly price on the server offer", async () => {
    process.env.PREP_TRIAL_DAYS = "11"
    process.env.PREP_MONTHLY_PRICE_CENTS = "4990"
    process.env.PREP_TRIAL_PRICE_CENTS = "0"
    const offer = getPublicOffer()
    expect(offer.trialDays).toBe(11)
    expect(offer.plans[0]?.features.join(" ")).toContain("11 days")
    expect(offer.plans[0]?.features.join(" ")).not.toMatch(/Ends after 7 days/)
    expect(offer.monthlyPriceCents).toBe(4990)
    expect(offer.paidAvailable).toBe(false)
    const seeded = makeAudit("https://days.example")
    await persist(seeded)
    const view = presentAudit(await startFreeTrial(seeded.id, "merchant@days.example", seeded.ownerToken))
    expect(view.offer.trialDays).toBe(11)
    expect(view.trial?.trialDays).toBe(11)
    const loaded = await auditGet(new Request(`http://local/api/audits/${seeded.id}`), {
      params: Promise.resolve({ id: seeded.id }),
    })
    const body = (await loaded.json()) as { offer: { trialDays: number; monthlyPriceLabel: string }; trial?: { email?: string } }
    expect(body.offer.trialDays).toBe(11)
    expect(body.offer.monthlyPriceLabel).toContain("49.90")
    expect(body.trial?.email).toBeUndefined()

    process.env.PREP_TRIAL_PRICE_CENTS = "990"
    const priced = makeAudit("https://priced.example")
    await persist(priced)
    await expect(startFreeTrial(priced.id, "merchant@priced.example", priced.ownerToken)).rejects.toThrow(/not zero/)
  })

  it("sets an owner cookie when an audit is created and does not put the token in the JSON", async () => {
    const body = new FormData()
    body.set("store_url", "http://127.0.0.1/fixtures/complete")
    body.set("contact_email", "owner@harbor.example")
    body.set("include_product_feed", "false")
    body.set("include_agent_pack", "false")
    body.set("output_language", "en")
    const response = await createPost(new Request("http://127.0.0.1/api/audits", { method: "POST", body }))
    expect(response.status).toBe(200)
    const json = (await response.json()) as { id: string; ownerToken?: string }
    expect(json.ownerToken).toBeUndefined()
    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain(`prep_owner_${json.id}=`)
    expect(setCookie).toContain("HttpOnly")
    const token = decodeURIComponent(/prep_owner_[^=]+=([^;]+)/.exec(setCookie)?.[1] ?? "")
    const stored = await readAudit(json.id)
    expect(stored?.ownerSecretHash).toBe(hashOwnerToken(token))
    expect(JSON.stringify(json)).not.toContain(token)
  })

  it("keeps PayPal secrets out of client components", async () => {
    const files = [
      "components/pricing-cards.tsx",
      "components/trial-panel.tsx",
      "components/delivery-panel.tsx",
      "components/audit-view.tsx",
      "components/checkout-panel.tsx",
      "components/intended-offer.tsx",
      "components/audit-form.tsx",
    ]
    const sources = await Promise.all(files.map(async (file) => ({ file, source: await readFile(path.join(process.cwd(), file), "utf8") })))
    for (const { file, source } of sources) {
      const valueImports = source
        .split("\n")
        .filter((line) => /from ["']@\/lib\/(config|site-mode|offer|paypal|pricing|public-view)["']/.test(line) && !line.includes("import type "))
      expect(valueImports, file).toEqual([])
      expect(source, file).not.toMatch(/PAYPAL_CLIENT_SECRET|getPlans\(/)
    }
  })
})
