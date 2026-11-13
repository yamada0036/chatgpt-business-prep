import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import JSZip from "jszip"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { POST as simulatedCheckout } from "@/app/api/audits/[id]/checkout/route"
import { POST as captureRoute } from "@/app/api/audits/[id]/checkout/capture/route"
import { GET as downloadPack } from "@/app/api/audits/[id]/download/route"
import { buildProfile } from "@/lib/audit/profile"
import { emptyScore, emptySummary, type AuditRecord, type FeedRow } from "@/lib/audit/types"
import { emptyFacts } from "@/lib/crawl/fetch-store"
import { getConfig } from "@/lib/config"
import { payPalValueToCents } from "@/lib/paypal/money"
import { applyPayPalWebhook } from "@/lib/paypal/apply"
import { setPayPalFetchForTests } from "@/lib/paypal/client"
import type { PayPalEvent } from "@/lib/paypal/decide"
import { createPayPalCheckout } from "@/lib/paypal/orders"
import { quotePrice } from "@/lib/pricing"
import { toPublicAudit } from "@/lib/public-view"
import { showFixtureButtons } from "@/lib/site-mode"
import { readAudit, readVersionFile, setAuditStoreForTests, writeAudit } from "@/lib/store/audits"
import { createDurableRepository, createMemoryMetadata, createMemoryObjectStore } from "@/lib/store/durable"
import { assertPublicUrl, UrlError } from "@/lib/url-safety"

const originalEnv = { ...process.env }
const calls: { url: string; body: unknown }[] = []
let verifyStatus = "SUCCESS"

function paypalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  const raw = typeof init?.body === "string" ? init.body : ""
  let body: unknown = raw
  if (raw.startsWith("{") || raw.startsWith("[")) body = JSON.parse(raw)
  calls.push({ url, body })
  if (url.endsWith("/v1/oauth2/token")) return Promise.resolve(Response.json({ access_token: "tok_test", expires_in: 3600 }))
  if (url.endsWith("/v2/checkout/orders")) return Promise.resolve(Response.json({ id: "ORDER123", status: "CREATED" }))
  if (url.endsWith("/capture")) {
    return Promise.resolve(
      Response.json({
        id: "ORDER123",
        status: "COMPLETED",
        purchase_units: [
          {
            payments: {
              captures: [
                {
                  id: "CAP123",
                  status: "COMPLETED",
                  amount: { currency_code: "USD", value: "49.00" },
                },
              ],
            },
          },
        ],
      }),
    )
  }
  if (url.endsWith("/v1/notifications/verify-webhook-signature")) {
    return Promise.resolve(Response.json({ verification_status: verifyStatus }))
  }
  return Promise.resolve(new Response("unexpected", { status: 500 }))
}

function makeAudit(rows = 0): AuditRecord {
  const facts = emptyFacts("https://harbor.example")
  facts.homeFetched = true
  facts.finalUrl = "https://harbor.example"
  facts.siteName = "Harbor Sample"
  facts.description = "Harbor Sample sells handmade ceramic mugs online."
  facts.descriptionSource = "https://harbor.example/about"
  const feedRows: FeedRow[] = Array.from({ length: rows }, (_, index) => ({
    index,
    cells: {
      item_id: { value: `SKU-${index + 1}`, source: "https://harbor.example" },
      title: { value: `Mug ${index + 1}`, source: "https://harbor.example" },
    },
    conflicts: {},
  }))
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    retentionDays: 30,
    storeUrl: "https://harbor.example",
    contactEmail: "merchant@harbor.example",
    includeProductFeed: true,
    includeAgentPack: false,
    outputLanguage: "en",
    status: "complete",
    steps: [],
    pages: [{ url: "https://harbor.example", role: "home", status: "fetched" }],
    crawl: facts,
    crawledProducts: [],
    profile: buildProfile(facts, "en"),
    feedRows,
    feedIssues: [],
    feedSummary: { ...emptySummary(), total: rows },
    feedApplicable: rows > 0,
    feedReason: "",
    urgent: [],
    eligibility: { agent: "Cannot tell", local: "Local shops can claim an existing United States listing.", market: "The official file upload is aimed at the United States." },
    score: emptyScore(),
    order: { status: "pending", breakdown: quotePrice(rows), chargedCents: null },
    versions: [],
  }
}

function signedHeaders(cert = "https://api.sandbox.paypal.com/v1/notifications/certs/CERT"): Headers {
  return new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": cert,
    "paypal-transmission-id": "trans-1",
    "paypal-transmission-sig": "sig-should-not-be-logged",
    "paypal-transmission-time": "2026-11-11T00:00:00Z",
  })
}

function completedEvent(audit: AuditRecord, patch: Record<string, unknown> = {}): PayPalEvent {
  return {
    id: "WH-1",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "CAP123",
      status: "COMPLETED",
      custom_id: audit.id,
      invoice_id: audit.order.paypalInvoiceId,
      amount: { currency_code: "USD", value: "49.00" },
      supplementary_data: { related_ids: { order_id: audit.order.paypalOrderId } },
      ...patch,
    },
  }
}

async function download(id: string, file?: string): Promise<Response> {
  const url = new URL(`http://local/api/audits/${id}/download`)
  if (file) url.searchParams.set("file", file)
  return downloadPack(new Request(url), { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  calls.length = 0
  verifyStatus = "SUCCESS"
  process.env.PREP_BASE_PRICE_CENTS = "4900"
  process.env.PREP_CURRENCY = "USD"
  process.env.PREP_INCLUDED_SKUS = "50"
  process.env.PREP_OVERAGE_BLOCK_PRICE_CENTS = "0"
  process.env.PAYPAL_CLIENT_ID = "client"
  process.env.PAYPAL_CLIENT_SECRET = "secret"
  process.env.PAYPAL_WEBHOOK_ID = "WH-TEST"
  process.env.PAYPAL_ENV = "sandbox"
  delete process.env.VERCEL_ENV
  delete process.env.BLOB_READ_WRITE_TOKEN
  delete process.env.BLOB_STORE_ID
  delete process.env.DATABASE_URL
  setAuditStoreForTests(
    createDurableRepository({ metadata: createMemoryMetadata(), objects: createMemoryObjectStore() }),
  )
  setPayPalFetchForTests(paypalFetch)
})

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, originalEnv)
  setAuditStoreForTests(null)
  setPayPalFetchForTests(null)
})

describe("PayPal checkout acceptance", () => {
  it("does not create a PayPal charge or unlock a pack from checkout", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "prep-deploy-"))
    process.env.PREP_DATA_DIR = dir
    await writeFile(path.join(dir, "ephemeral.txt"), "wiped on deploy")
    const seeded = makeAudit()
    seeded.profile = seeded.profile.map((field) =>
      field.key === "business_description"
        ? { ...field, suggestedValue: "FULL DRAFT THAT MUST NOT LEAK", display: "ready", status: "ready" }
        : field,
    )
    await writeAudit(seeded)
    const unpaid = toPublicAudit((await readAudit(seeded.id))!)
    expect(JSON.stringify(unpaid)).not.toContain("FULL DRAFT")
    expect((await download(seeded.id, "03-product-feed.csv")).status).toBe(403)

    await expect(createPayPalCheckout({
      id: seeded.id,
      email: "merchant@harbor.example",
      origin: "https://prep.example",
    })).rejects.toThrow(/not available/)
    expect(calls).toHaveLength(0)
    const captureResponse = await captureRoute()
    expect(captureResponse.status).toBe(403)
    const blocked = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify(completedEvent(seeded)),
    })
    expect(blocked.body.fulfilled).toBe(false)
    expect(blocked.body.reason).toBe("checkout_disabled")
    const stored = await readAudit(seeded.id)
    expect(stored?.order.status).toBe("pending")
    expect(stored?.versions).toHaveLength(0)
    expect((await download(seeded.id)).status).toBe(403)

    await rm(dir, { recursive: true, force: true })
    await expect(readFile(path.join(dir, "ephemeral.txt"))).rejects.toThrow()
  })

  it("does not mark an order paid from a webhook while checkout is off", async () => {
    const seeded = makeAudit()
    await writeAudit(seeded)
    const blocked = await applyPayPalWebhook({
      headers: signedHeaders("https://evil.example/cert"),
      rawBody: JSON.stringify(completedEvent(seeded, { amount: { currency_code: "EUR", value: "50.00" } })),
    })
    expect(blocked.body.fulfilled).toBe(false)
    expect(blocked.body.reason).toBe("checkout_disabled")
    expect((await readAudit(seeded.id))?.order.status).toBe("pending")
    expect((await readAudit(seeded.id))?.versions).toHaveLength(0)
    expect(payPalValueToCents("49.00")).toBe(4900)
    expect(payPalValueToCents("49")).toBeNull()
    expect(payPalValueToCents("49.0")).toBeNull()
  })

  it("leaves an unpaid audit unpaid when a capture webhook arrives", async () => {
    const seeded = makeAudit()
    await writeAudit(seeded)
    const pending = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify({
        event_type: "PAYMENT.CAPTURE.PENDING",
        resource: { id: "CAP123", status: "PENDING", custom_id: seeded.id },
      }),
    })
    expect(pending.body.fulfilled).toBe(false)
    expect((await readAudit(seeded.id))?.order.status).toBe("pending")
    expect((await download(seeded.id)).status).toBe(403)
  })

  it("refuses to take payment when durable storage is missing", async () => {
    setAuditStoreForTests(null)
    calls.length = 0
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.BLOB_STORE_ID
    await expect(createPayPalCheckout({ id: randomUUID(), origin: "https://prep.example" })).rejects.toThrow(/not available/)
    expect(calls).toHaveLength(0)
  })

  it("stores an audit in Blob without Postgres and returns a JSON error when storage is missing on Vercel", async () => {
    const { createBlobMetadata, createMemoryJsonBlob } = await import("@/lib/store/blob-meta")
    const { paidCheckoutState } = await import("@/lib/paypal/ready")
    const { POST } = await import("@/app/api/audits/route")
    const { StorageError, writeAudit: saveAudit } = await import("@/lib/store/audits")
    const blobs = createMemoryJsonBlob()
    const meta = createBlobMetadata(blobs)
    const seeded = makeAudit()
    await meta.upsert(seeded)
    const loaded = await meta.get(seeded.id)
    expect(loaded?.record.storeUrl).toBe(seeded.storeUrl)
    expect(await meta.compareAndSwap(seeded.id, { ...seeded, contactEmail: "next@harbor.example" }, loaded!.generation)).toBe(true)
    expect(await meta.compareAndSwap(seeded.id, seeded, loaded!.generation)).toBe(false)
    expect(StorageError).toBeTruthy()

    delete process.env.PAYPAL_CLIENT_ID
    delete process.env.PAYPAL_CLIENT_SECRET
    delete process.env.VERCEL_ENV
    process.env.VERCEL = "1"
    process.env.PREP_BASE_PRICE_CENTS = "0"
    expect(paidCheckoutState()).toBe("not_for_sale")

    setAuditStoreForTests(null)
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.BLOB_STORE_ID
    process.env.VERCEL = "1"
    await expect(saveAudit(makeAudit())).rejects.toThrow(/private Blob storage is not configured/)
    const body = new FormData()
    body.set("store_url", "https://example.com")
    body.set("contact_email", "")
    body.set("include_product_feed", "true")
    body.set("include_agent_pack", "false")
    body.set("output_language", "en")
    const response = await POST(new Request("http://local/api/audits", { method: "POST", body }))
    expect(response.status).toBe(503)
    const json = (await response.json()) as { error: { message: string } }
    expect(json.error.message).toMatch(/Blob/)
    expect(json.error.message).not.toMatch(/mkdir/)
  })

  it("turns off fixture buttons, loopback, and simulated pay for the public paid configuration", async () => {
    process.env.VERCEL_ENV = "production"
    process.env.PREP_ALLOW_LOOPBACK = "true"
    expect(showFixtureButtons()).toBe(false)
    expect(getConfig().allowLoopback).toBe(false)
    expect(getConfig().allowSimulatedPay).toBe(false)
    await expect(assertPublicUrl("http://127.0.0.1/fixtures/incomplete", { allowLoopback: getConfig().allowLoopback })).rejects.toBeInstanceOf(UrlError)
    const seeded = makeAudit()
    await writeAudit(seeded)
    const response = await simulatedCheckout(
      new Request("http://local/checkout", {
        method: "POST",
        body: JSON.stringify({ action: "pay", contact_email: "merchant@harbor.example" }),
      }),
      { params: Promise.resolve({ id: seeded.id }) },
    )
    expect(response.status).toBe(403)
    expect((await readAudit(seeded.id))?.order.status).toBe("pending")
    expect((await readAudit(seeded.id))?.versions).toHaveLength(0)

    delete process.env.VERCEL_ENV
    process.env.PAYPAL_ENV = "live"
    expect(showFixtureButtons()).toBe(false)
    expect(getConfig().allowLoopback).toBe(false)

    delete process.env.PAYPAL_ENV
    delete process.env.VERCEL_ENV
    expect(showFixtureButtons()).toBe(true)
    const form = await readFile(path.join(process.cwd(), "components/audit-form.tsx"), "utf8")
    const page = await readFile(path.join(process.cwd(), "app/page.tsx"), "utf8")
    expect(form).toMatch(/showFixtures \?/)
    expect(page).toContain("showFixtureButtons()")
  })

  it("includes only the first 50 SKUs and says so when there is no overage charge", async () => {
    const seeded = makeAudit(51)
    expect(seeded.order.breakdown.totalCents).toBe(4900)
    expect(seeded.order.breakdown.overageCents).toBe(0)
    await writeAudit(seeded)
    const { publishVersion } = await import("@/lib/audit/checkout")
    const published = await publishVersion(seeded)
    await writeAudit(published)
    const view = toPublicAudit(published)
    expect(view.skuCapNote).toContain("first 50")
    expect(view.skuCapNote).toContain("does not add a charge")
    const zipBytes = await readVersionFile(seeded.id, 1, "pack.zip")
    const zip = await JSZip.loadAsync(zipBytes!)
    const feed = await zip.files["03-product-feed.csv"].async("string")
    const readme = await zip.files["00-readme.md"].async("string")
    expect(feed.trim().split("\n")).toHaveLength(51)
    expect(feed).toContain("SKU-1")
    expect(feed).not.toContain("SKU-51")
    expect(readme).toContain("first 50")
    expect(readme).toContain("not in the paid pack")
  })

  it("has no card form and documents the webhook", async () => {
    const roots = ["components/checkout-panel.tsx", "components/paypal-buttons.tsx", "components/checkout-return.tsx", "components/audit-form.tsx"]
    const source = (await Promise.all(roots.map((file) => readFile(path.join(process.cwd(), file), "utf8")))).join("\n")
    expect(source).not.toMatch(/type=["']password["']/)
    expect(source).not.toMatch(/cc-number|cardnumber|card-number/i)
    expect(source).toContain("does not collect card numbers")
    expect(source).toContain("disable-funding=card")
    const returnPage = await readFile(path.join(process.cwd(), "components/checkout-return.tsx"), "utf8")
    expect(returnPage).not.toContain("searchParams")
    expect(returnPage).not.toContain("PayerID")
    const readme = await readFile(path.join(process.cwd(), "README.md"), "utf8")
    const example = await readFile(path.join(process.cwd(), ".env.example"), "utf8")
    for (const name of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_ENV", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "DATABASE_URL"]) {
      expect(example).toContain(name)
      expect(readme).toContain(name)
    }
    expect(example).toMatch(/^PAYPAL_CLIENT_ID=$/m)
    expect(example).toMatch(/^PAYPAL_CLIENT_SECRET=$/m)
    expect(example).toMatch(/^PAYPAL_WEBHOOK_ID=$/m)
    expect(example).toContain("PAYPAL_ENV=sandbox")
    expect(readme).toContain("/api/paypal/webhook")
    expect(readme).toContain("PAYMENT.CAPTURE.COMPLETED")
    expect(readme).toMatch(/PAYPAL_ENV=live/)
    const blobSource = await readFile(path.join(process.cwd(), "lib/store/vercel-blob.ts"), "utf8")
    expect(blobSource).toContain('access: "private"')
    expect(blobSource).not.toContain('access: "public"')
  })
})
