import { mkdtemp, readFile, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import JSZip from "jszip"
import { afterEach, describe, expect, it } from "vitest"
import { applySupplement } from "@/lib/audit/supplement"
import { publishVersion } from "@/lib/audit/checkout"
import { emptyScore, emptySummary, type AuditRecord, type RawProduct } from "@/lib/audit/types"
import { crawlStore } from "@/lib/crawl/fetch-store"
import { parseCsv } from "@/lib/csv"
import { finalizeProducts } from "@/lib/feed/finalize"
import { mergeProducts } from "@/lib/feed/merge"
import { autoMap } from "@/lib/feed/columns"
import { isValidGtin } from "@/lib/feed/gtin"
import { formatMoney } from "@/lib/money"
import { fixtureFetch } from "@/lib/fixtures/sites"
import { quotePrice } from "@/lib/pricing"
import { renderPack } from "@/lib/pack/render"
import { toPublicAudit } from "@/lib/public-view"
import { scoreAudit } from "@/lib/audit/score"
import { buildProfile } from "@/lib/audit/profile"
import { emptyFacts } from "@/lib/crawl/fetch-store"
import {
  AGENT_WARNING_ACTIONS,
  AGENT_WARNING_ELIGIBILITY,
  DISCLAIMER_SHORT,
  EXCLUDED_FEED_FIELDS,
  REQUIRED_FEED_FIELDS,
} from "@/lib/official/spec"
import { readAudit, readVersionFile, writeAudit } from "@/lib/store/audits"
import { assertPublicUrl, UrlError } from "@/lib/url-safety"

const fetchImpl = fixtureFetch("http://127.0.0.1")

function raw(fields: Record<string, string>, source = "https://shop.example/p"): RawProduct {
  return {
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value, source }])),
    conflicts: {},
    variantReliable: Boolean(fields.group_id && fields.variant_dict),
    variantUnparsed: false,
    sourceUrl: source,
  }
}

describe("official money, availability, and gtin", () => {
  it("formats USD with two decimals and rejects invented rounding", () => {
    expect(formatMoney("79.99 USD").ok && formatMoney("79.99 USD")).toMatchObject({ ok: true, value: "79.99 USD" })
    expect(formatMoney("$79.9", { currency: "USD" })).toMatchObject({ ok: true, value: "79.90 USD" })
    expect(formatMoney("80", { currency: "USD" })).toMatchObject({ ok: true, value: "80.00 USD" })
    expect(formatMoney("80.001 USD").ok).toBe(false)
    expect(formatMoney("1000.00 JPY").ok).toBe(false)
    expect(formatMoney("n/a USD").ok).toBe(false)
  })

  it("accepts only the five availability values after finalize", () => {
    const { rows, issues } = finalizeProducts([
      raw({
        item_id: "A",
        title: "Mug",
        description: "A mug.",
        url: "https://shop.example/mug",
        brand: "Harbor",
        seller_name: "Harbor",
        image_url: "https://shop.example/mug.png",
        availability: "sold out",
        price: "18.00 USD",
      }),
    ])
    expect(rows[0].cells.availability.value).toBe("out_of_stock")
    const unknown = finalizeProducts([
      raw({
        item_id: "B",
        title: "Mug",
        description: "A mug.",
        url: "https://shop.example/mug-b",
        brand: "Harbor",
        seller_name: "Harbor",
        image_url: "https://shop.example/mug.png",
        price: "18.00 USD",
      }),
    ])
    expect(unknown.rows[0].cells.availability.value).toBe("unknown")
    expect(unknown.issues.some((issue) => issue.field === "availability" && issue.issueType === "needs_merchant_input")).toBe(true)
    const bad = finalizeProducts([
      raw({
        item_id: "C",
        title: "Mug",
        description: "A mug.",
        url: "https://shop.example/mug-c",
        brand: "Harbor",
        seller_name: "Harbor",
        image_url: "https://shop.example/mug.png",
        availability: "maybe",
        price: "18.00 USD",
      }),
    ])
    expect(bad.rows[0].cells.availability.value).toBe("unknown")
    expect(bad.issues.some((issue) => issue.currentValue === "maybe")).toBe(true)
    expect(issues.length).toBeGreaterThanOrEqual(0)
  })

  it("checks the spec GTIN and drops an invented-looking bad code", () => {
    expect(isValidGtin("09506000134352")).toBe(true)
    const { rows, issues } = finalizeProducts([
      raw({
        item_id: "G",
        title: "Mug",
        description: "A mug.",
        url: "https://shop.example/g",
        brand: "Harbor",
        seller_name: "Harbor",
        image_url: "https://shop.example/g.png",
        price: "10.00 USD",
        gtin: "123",
      }),
    ])
    expect(rows[0].cells.gtin).toBeUndefined()
    expect(issues.some((issue) => issue.field === "gtin" && issue.issueType === "invalid")).toBe(true)
  })
})

describe("feed rules", () => {
  it("warns on long title without silent truncation", () => {
    const title = "T".repeat(151)
    const description = "D".repeat(5001)
    const { rows, issues } = finalizeProducts([
      raw({
        item_id: "LONG",
        title,
        description,
        url: "https://shop.example/long",
        brand: "Harbor",
        seller_name: "Harbor",
        image_url: "https://shop.example/long.png",
        availability: "in_stock",
        price: "10.00 USD",
      }),
    ])
    expect(rows[0].cells.title.value).toBe(title)
    expect(rows[0].cells.description.value).toBe(description)
    expect(issues.some((issue) => issue.field === "title" && issue.issueType === "invalid" && issue.note.includes("没有静默截断"))).toBe(true)
    expect(issues.some((issue) => issue.field === "description" && issue.issueType === "invalid")).toBe(true)
    expect(issues.some((issue) => issue.issueType === "truncated")).toBe(false)
  })

  it("does not overwrite a conflicting price", () => {
    const merged = mergeProducts(
      [raw({ item_id: "MUG-1", title: "Stone mug", price: "10.00 USD", url: "https://shop.example/mug" }, "商家上传表格")],
      [raw({ item_id: "MUG-1", title: "Stone mug", price: "12.00 USD", url: "https://shop.example/mug" })],
    )
    const { rows, issues } = finalizeProducts(merged)
    expect(rows[0].cells.price).toBeUndefined()
    const conflict = issues.find((issue) => issue.field === "price" && issue.issueType === "conflict")
    expect(conflict?.currentValue).toContain("10.00 USD")
    expect(conflict?.currentValue).toContain("12.00 USD")
  })

  it("asks for a column map when headers are not recognizable", () => {
    expect(autoMap(["foo", "bar"]).needsMap).toBe(true)
    expect(autoMap(["sku", "title", "price"]).needsMap).toBe(false)
    expect(autoMap(["sku", "title", "price"]).mapping.item_id).toBe("sku")
  })

  it("leaves an unparsed variant as one row with a note", () => {
    const product = raw({
      item_id: "TOTE-1",
      title: "Canvas tote",
      description: "A cotton tote.",
      url: "https://shop.example/tote",
      brand: "Harbor",
      seller_name: "Harbor",
      image_url: "https://shop.example/tote.png",
      price: "20.00 USD",
      availability: "in_stock",
    })
    product.variantUnparsed = true
    const { rows, issues } = finalizeProducts([product])
    expect(rows).toHaveLength(1)
    expect(rows[0].cells.group_id).toBeUndefined()
    expect(issues.some((issue) => issue.note.includes("未处理变体"))).toBe(true)
  })
})

describe("fixtures", () => {
  it("keeps missing brand, price, and return policy empty", async () => {
    const crawl = await crawlStore("http://127.0.0.1/fixtures/incomplete", { fetchImpl, budgetMs: 20_000 })
    expect(crawl.fatal).toBeUndefined()
    const profile = buildProfile(crawl.facts, "en")
    const returns = profile.find((field) => field.key === "return_policy")
    expect(returns?.suggestedValue ?? "").toBe("")
    expect(returns?.display === "missing" || returns?.display === "needs_input" || returns?.display === "not_fetched").toBe(true)
    expect(JSON.stringify(profile)).not.toContain("不存在")
    const { rows } = finalizeProducts(crawl.products)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.cells.brand?.value ?? "").toBe("")
      expect(row.cells.price?.value ?? "").toBe("")
    }
    expect(rows.some((row) => row.cells.seller_name?.value === "Harbor Sample")).toBe(true)
  })

  it("records a login wall as not fetched", async () => {
    const crawl = await crawlStore("http://127.0.0.1/fixtures/login", { fetchImpl })
    expect(crawl.fatal?.code).toBe("login")
    expect(crawl.pages.every((page) => page.status === "not_fetched")).toBe(true)
    expect(JSON.stringify(crawl.pages)).toContain("未抓到")
    expect(JSON.stringify(crawl)).not.toContain("不存在")
  })

  it("still builds a profile for a non-shop site", async () => {
    const crawl = await crawlStore("http://127.0.0.1/fixtures/brochure", { fetchImpl })
    expect(crawl.fatal).toBeUndefined()
    expect(crawl.sawProductLinks).toBe(false)
    expect(buildProfile(crawl.facts, "en").some((field) => field.key === "website" && field.display === "ready")).toBe(true)
  })

  it("splits reliable Shopify variants", async () => {
    const crawl = await crawlStore("http://127.0.0.1/fixtures/shop", { fetchImpl })
    const { rows, issues } = finalizeProducts(crawl.products)
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.cells.group_id?.value))).toEqual(new Set(["100"]))
    expect(rows.every((row) => row.cells.listing_has_variations?.value === "true")).toBe(true)
    expect(rows.every((row) => row.cells.variant_dict?.value.includes("Black"))).toBe(true)
    expect(rows.map((row) => row.cells.item_id?.value).sort()).toEqual(["TRAIL-BLK-10", "TRAIL-BLK-11"])
    expect(rows.every((row) => row.cells.price?.value === "79.99 USD")).toBe(true)
    expect(rows.find((row) => row.cells.item_id?.value === "TRAIL-BLK-11")?.cells.sale_price?.value).toBe("59.99 USD")
    expect(rows.map((row) => row.cells.availability?.value).sort()).toEqual(["in_stock", "out_of_stock"])
    expect(rows.find((row) => row.cells.item_id?.value === "TRAIL-BLK-10")?.cells.gtin?.value).toBe("09506000134352")
    expect(issues.some((issue) => issue.note.includes("未处理变体"))).toBe(false)
  })

  it("does not pretend an option menu is a split", async () => {
    const crawl = await crawlStore("http://127.0.0.1/fixtures/options", { fetchImpl })
    const { rows, issues } = finalizeProducts(crawl.products)
    expect(rows).toHaveLength(1)
    expect(issues.some((issue) => issue.note.includes("未处理变体"))).toBe(true)
  })
})

describe("score", () => {
  it("weights profile and feed, then floors", () => {
    const facts = emptyFacts("https://shop.example")
    facts.homeFetched = true
    facts.finalUrl = "https://shop.example"
    facts.description = "We sell mugs from a small workshop and ship them to customers."
    facts.descriptionSource = "https://shop.example/about"
    facts.categories = ["Mugs"]
    facts.categorySource = "https://shop.example"
    facts.logoUrl = "https://shop.example/logo.png"
    facts.logoSource = "https://shop.example"
    facts.deliveryFetched = true
    facts.deliveryUrl = "https://shop.example/shipping"
    facts.deliveryExcerpt = "We ship orders."
    const profile = buildProfile(facts, "en")
    const score = scoreAudit({
      profile,
      includeFeed: true,
      feedApplicable: true,
      summary: { total: 2, complete: 1, missingRows: 1, invalidRows: 0 },
    })
    expect(score.feedWeighted).toBe(true)
    expect(score.total).toBe(Math.floor(score.profilePercent * 0.5 + 50 * 0.5))
    const profileOnly = scoreAudit({
      profile,
      includeFeed: false,
      feedApplicable: false,
      summary: emptySummary(),
    })
    expect(profileOnly.feedWeighted).toBe(false)
    expect(profileOnly.total).toBe(Math.floor(profileOnly.profilePercent))
  })
})

describe("pack and payment gate", () => {
  const dirs: string[] = []

  afterEach(() => {
    delete process.env.PREP_DATA_DIR
    delete process.env.PREP_BASE_PRICE_CENTS
    delete process.env.PREP_INCLUDED_SKUS
    delete process.env.PREP_OVERAGE_BLOCK_SIZE
    delete process.env.PREP_OVERAGE_BLOCK_PRICE_CENTS
  })

  function audit(patch: Partial<AuditRecord> = {}): AuditRecord {
    const facts = emptyFacts("https://harbor.example")
    facts.homeFetched = true
    facts.finalUrl = "https://harbor.example"
    facts.siteName = "Harbor Sample"
    facts.description = "Harbor Sample sells handmade ceramic mugs online."
    facts.descriptionSource = "https://harbor.example/about"
    const profile = buildProfile(facts, "en")
    const base: AuditRecord = {
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
      profile,
      feedRows: [],
      feedIssues: [],
      feedSummary: emptySummary(),
      feedApplicable: true,
      feedReason: "",
      urgent: [],
      eligibility: { agent: "无法判断", local: "本地店和餐馆目前只能认领已有的美国 listing。", market: "官方标准格式上传目前默认面向美国市场。" },
      score: emptyScore(),
      order: {
        status: "pending",
        breakdown: quotePrice(0),
        chargedCents: null,
      },
      versions: [],
      ...patch,
    }
    return base
  }

  it("hides the full draft before payment and quotes the configured price", async () => {
    process.env.PREP_BASE_PRICE_CENTS = "4900"
    process.env.PREP_INCLUDED_SKUS = "1"
    process.env.PREP_OVERAGE_BLOCK_SIZE = "1"
    process.env.PREP_OVERAGE_BLOCK_PRICE_CENTS = "100"
    const record = audit()
    record.profile = record.profile.map((field) =>
      field.key === "business_description"
        ? { ...field, suggestedValue: "FULL DRAFT THAT MUST NOT LEAK ON THE FREE PAGE ".repeat(8), display: "ready", status: "ready" }
        : field,
    )
    const { rows, issues, summary } = finalizeProducts([
      raw({
        item_id: "1",
        title: "Stone mug with a very specific public title",
        description: "Heavy ceramic mug.",
        url: "https://harbor.example/mug",
        brand: "Harbor",
        seller_name: "Harbor Sample",
        image_url: "https://harbor.example/mug.png",
        availability: "in_stock",
        price: "18.00 USD",
      }),
      raw({
        item_id: "2",
        title: "Second",
        description: "Second mug.",
        url: "https://harbor.example/two",
        seller_name: "Harbor Sample",
        image_url: "https://harbor.example/two.png",
        availability: "in_stock",
        price: "9.00 USD",
      }),
    ])
    record.feedRows = rows
    record.feedIssues = issues
    record.feedSummary = summary
    record.order.breakdown = quotePrice(rows.length)
    const view = toPublicAudit(record)
    const encoded = JSON.stringify(view)
    expect(encoded).not.toContain("FULL DRAFT")
    expect(encoded).not.toContain("Heavy ceramic mug")
    expect(view.sampleRows).toHaveLength(2)
    expect(view.paid).toBe(false)
    expect(view.versions).toHaveLength(0)
    expect(view.order.breakdown.totalCents).toBe(quotePrice(2).totalCents)
    expect(view.order.breakdown.totalCents).toBe(5000)
    expect(view.incompleteRowCount).toBe(1)
  })

  it("writes the required zip set and keeps an older version", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "prep-"))
    dirs.push(dir)
    process.env.PREP_DATA_DIR = dir
    const withAgent = audit({ includeAgentPack: true })
    const finalized = finalizeProducts([
      raw({
        item_id: "1",
        title: "Stone mug",
        description: 'A "heavy" mug, handmade.',
        url: "https://harbor.example/mug",
        brand: "Harbor",
        seller_name: "Harbor Sample",
        image_url: "https://harbor.example/mug.png",
        availability: "in_stock",
        price: "18 USD",
      }),
    ])
    withAgent.feedRows = finalized.rows
    withAgent.feedIssues = finalized.issues
    withAgent.feedSummary = finalized.summary
    await writeAudit(withAgent)
    const first = await publishVersion(withAgent)
    await writeAudit(first)
    const loaded = await readAudit(first.id)
    expect(loaded?.versions).toHaveLength(1)
    const zipBytes = await readVersionFile(first.id, 1, "pack.zip")
    const zip = await JSZip.loadAsync(zipBytes!)
    const names = Object.keys(zip.files).sort()
    expect(names).toEqual([
      "00-readme.md",
      "01-claim-checklist.md",
      "02-profile-draft.md",
      "03-product-feed-issues.csv",
      "03-product-feed.csv",
      "04-agent-pack.md",
    ])
    const readme = await zip.files["00-readme.md"].async("string")
    const feed = await zip.files["03-product-feed.csv"].async("string")
    const issues = await zip.files["03-product-feed-issues.csv"].async("string")
    const agent = await zip.files["04-agent-pack.md"].async("string")
    const profile = await zip.files["02-profile-draft.md"].async("string")
    expect(readme.startsWith("\uFEFF")).toBe(false)
    expect(feed.charCodeAt(0)).toBe(0xfeff)
    expect(readme).toContain(DISCLAIMER_SHORT)
    expect(readme).toContain("不代认领")
    expect(readme).toContain("不保证推荐")
    expect(profile).toContain("field_name:")
    expect(profile).toContain("status:")
    const table = parseCsv(feed)
    expect(table[0].slice(0, 9)).toEqual([...REQUIRED_FEED_FIELDS])
    for (const banned of EXCLUDED_FEED_FIELDS) expect(table[0]).not.toContain(banned)
    expect(table[1][table[0].indexOf("price")]).toBe("18.00 USD")
    expect(["in_stock", "out_of_stock", "pre_order", "backorder", "unknown"]).toContain(table[1][table[0].indexOf("availability")])
    expect(feed).toContain('"A ""heavy"" mug, handmade."')
    expect(issues).toContain("item_id,field,issue_type")
    expect(agent.startsWith("# Business agent draft")).toBe(true)
    expect(agent.indexOf(AGENT_WARNING_ELIGIBILITY)).toBeLessThan(400)
    expect(agent).toContain(AGENT_WARNING_ACTIONS)
    expect(agent).toContain("不能代为下单、预约或查询顾客订单")
    const withoutAgent = audit({ includeAgentPack: false, id: randomUUID() })
    const files = renderPack(withoutAgent, 1, new Date())
    expect(files["04-agent-pack.md"]).toBeUndefined()

    const supplemented = applySupplement(first, [{ key: "profile:return_policy", value: "https://harbor.example/returns" }])
    expect(supplemented.applied).toBe(1)
    expect(supplemented.audit.profile.find((field) => field.key === "return_policy")?.source).toBe("商家补充")
    const second = await publishVersion(supplemented.audit)
    await writeAudit(second)
    expect((await readVersionFile(second.id, 1, "pack.zip"))?.byteLength).toBeGreaterThan(10)
    expect((await readVersionFile(second.id, 2, "02-profile-draft.md"))?.toString("utf8")).toContain("商家补充")
  })
})

describe("boundaries", () => {
  it("blocks metadata addresses and accepts loopback fixtures", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest")).rejects.toBeInstanceOf(UrlError)
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UrlError)
    await expect(assertPublicUrl("http://user:pass@example.com")).rejects.toBeInstanceOf(UrlError)
    await expect(assertPublicUrl("http://127.0.0.1/fixtures/incomplete", { allowLoopback: true })).resolves.toBeInstanceOf(URL)
  })

  it("has no password, id-document, or card fields in the app UI", async () => {
    const roots = ["app", "components"]
    const files: string[] = []
    async function walk(dir: string) {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full)
      }
    }
    for (const root of roots) await walk(path.join(process.cwd(), root))
    const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n")
    expect(source).not.toMatch(/type=["']password["']/)
    expect(source).not.toMatch(/证件|护照|身份证|cvv|cardnumber|otp/i)
    expect(source).not.toMatch(/官方合作|一键认领/)
    expect(source).not.toMatch(/(?<!不)保证被推荐/)
  })
})
