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
import { createPayPalCheckout, observePayPalCapture } from "@/lib/paypal/orders"
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
  it("charges 49.00 USD and unlocks the pack only after a verified capture webhook", async () => {
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

    const created = await createPayPalCheckout({
      id: seeded.id,
      email: "merchant@harbor.example",
      origin: "https://prep.example",
    })
    expect(created.order.status).toBe("pending")
    expect(created.order.paypalAmountCents).toBe(4900)
    expect(created.order.paypalCurrency).toBe("USD")
    const createCall = calls.find((call) => call.url.endsWith("/v2/checkout/orders"))
    const createBody = createCall?.body as {
      intent: string
      purchase_units: { custom_id: string; amount: { currency_code: string; value: string } }[]
    }
    expect(createBody.intent).toBe("CAPTURE")
    expect(createBody.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "49.00" })
    expect(createBody.purchase_units[0].custom_id).toBe(seeded.id)

    const captured = await observePayPalCapture(seeded.id, "ORDER123")
    expect(captured.order.status).toBe("pending")
    expect(captured.versions).toHaveLength(0)
    expect(captured.order.paypalAwaitingWebhook).toBe(true)
    const captureResponse = await captureRoute(
      new Request("http://local/capture", { method: "POST", body: JSON.stringify({ paypal_order_id: "ORDER123" }) }),
      { params: Promise.resolve({ id: seeded.id }) },
    )
    const captureJson = (await captureResponse.json()) as { paid: boolean }
    expect(captureJson.paid).toBe(false)
    expect((await download(seeded.id)).status).toBe(403)

    const paid = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify(completedEvent(captured)),
    })
    expect(paid.status).toBe(200)
    expect(paid.body.fulfilled).toBe(true)
    const stored = await readAudit(seeded.id)
    expect(stored?.order.status).toBe("delivered")
    expect(stored?.order.chargedCents).toBe(4900)
    expect(stored?.versions).toHaveLength(1)
    const zipResponse = await download(seeded.id)
    expect(zipResponse.status).toBe(200)
    expect(zipResponse.headers.get("content-type")).toContain("zip")
    const zip = await JSZip.loadAsync(Buffer.from(await zipResponse.arrayBuffer()))
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining(["00-readme.md", "01-claim-checklist.md", "02-profile-draft.md", "03-product-feed.csv", "03-product-feed-issues.csv"]),
    )

    const replay = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify(completedEvent(stored!)),
    })
    expect(replay.status).toBe(200)
    expect(replay.body.fulfilled).toBe(false)
    expect((await readAudit(seeded.id))?.versions).toHaveLength(1)

    await rm(dir, { recursive: true, force: true })
    await expect(readFile(path.join(dir, "ephemeral.txt"))).rejects.toThrow()
    const surviving = await readVersionFile(seeded.id, 1, "pack.zip")
    expect(surviving?.byteLength).toBeGreaterThan(10)
  })

  it("rejects a bad signature, amount, currency, or order id", async () => {
    const seeded = makeAudit()
    await writeAudit(seeded)
    const created = await createPayPalCheckout({ id: seeded.id, origin: "https://prep.example" })

    verifyStatus = "FAILURE"
    const badSignature = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify(completedEvent(created)),
    })
    expect(badSignature.status).toBe(400)
    expect(badSignature.body.reason).toBe("signature")
    expect((await readAudit(seeded.id))?.order.status).toBe("pending")
    expect((await readAudit(seeded.id))?.versions).toHaveLength(0)

    setPayPalFetchForTests(async () => {
      throw new Error("cert url must not be fetched")
    })
    const badCert = await applyPayPalWebhook({
      headers: signedHeaders("https://evil.example/cert"),
      rawBody: JSON.stringify(completedEvent(created)),
    })
    expect(badCert.status).toBe(400)
    expect((await readAudit(seeded.id))?.versions).toHaveLength(0)
    setPayPalFetchForTests(paypalFetch)
    verifyStatus = "SUCCESS"

    const wrongAmount = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify(completedEvent(created, { amount: { currency_code: "USD", value: "50.00" } })),
    })
    expect(wrongAmount.body.fulfilled).toBe(false)
    expect(wrongAmount.body.reason).toBe("amount")

    const wrongCurrency = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify(completedEvent(created, { amount: { currency_code: "EUR", value: "49.00" } })),
    })
    expect(wrongCurrency.body.reason).toBe("currency")

    const wrongOrder = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify(
        completedEvent(created, { supplementary_data: { related_ids: { order_id: "OTHER-ORDER" } } }),
      ),
    })
    expect(wrongOrder.body.reason).toBe("order")
    expect((await readAudit(seeded.id))?.order.status).toBe("pending")
    expect((await readAudit(seeded.id))?.versions).toHaveLength(0)
    expect(payPalValueToCents("49.00")).toBe(4900)
    expect(payPalValueToCents("49")).toBeNull()
    expect(payPalValueToCents("49.0")).toBeNull()
  })

  it("does not fulfill pending or denied captures, and a refund locks the pack", async () => {
    const seeded = makeAudit()
    await writeAudit(seeded)
    const created = await createPayPalCheckout({ id: seeded.id, origin: "https://prep.example" })
    const pending = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify({
        event_type: "PAYMENT.CAPTURE.PENDING",
        resource: { ...completedEvent(created).resource, status: "PENDING" },
      }),
    })
    expect(pending.body.fulfilled).toBe(false)
    expect((await readAudit(seeded.id))?.order.status).toBe("pending")

    const denied = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify({
        event_type: "PAYMENT.CAPTURE.DENIED",
        resource: completedEvent(created).resource,
      }),
    })
    expect(denied.body.fulfilled).toBe(false)
    expect((await readAudit(seeded.id))?.order.status).toBe("failed")
    expect((await readAudit(seeded.id))?.versions).toHaveLength(0)

    await writeAudit({ ...(await readAudit(seeded.id))!, order: { ...(await readAudit(seeded.id))!.order, status: "pending" } })
    await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify(completedEvent(created)),
    })
    expect((await download(seeded.id)).status).toBe(200)
    const refunded = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify({
        id: "WH-REFUND",
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: {
          id: "REFUND1",
          custom_id: seeded.id,
          links: [{ rel: "up", href: "https://api.sandbox.paypal.com/v2/payments/captures/CAP123" }],
        },
      }),
    })
    expect(refunded.body.fulfilled).toBe(false)
    expect((await readAudit(seeded.id))?.order.status).toBe("refunded")
    expect((await download(seeded.id)).status).toBe(403)
    const replayed = await applyPayPalWebhook({
      headers: signedHeaders(),
      rawBody: JSON.stringify(completedEvent(created)),
    })
    expect(replayed.body.fulfilled).toBe(false)
    expect((await readAudit(seeded.id))?.order.status).toBe("refunded")
  })

  it("refuses to take payment when durable storage is missing", async () => {
    setAuditStoreForTests(null)
    calls.length = 0
    await expect(createPayPalCheckout({ id: randomUUID(), origin: "https://prep.example" })).rejects.toThrow(/Paid checkout cannot start/)
    expect(calls).toHaveLength(0)
    process.env.BLOB_READ_WRITE_TOKEN = "token"
    await expect(createPayPalCheckout({ id: randomUUID(), origin: "https://prep.example" })).rejects.toThrow(/DATABASE_URL/)
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
