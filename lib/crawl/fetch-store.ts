import type { CrawlFacts, PageRecord, PageRole, RawProduct } from "@/lib/audit/types"
import { parseHtml, shopifyCatalogToProducts, type ParsedPage, type ShopifyProduct } from "@/lib/crawl/extract"
import { fetchPublic, type FetchFailure } from "@/lib/crawl/http"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { normalizeUrl, sameSite, hostsConflict } from "@/lib/url-safety"

export type CrawlResult = {
  pages: PageRecord[]
  facts: CrawlFacts
  products: RawProduct[]
  sawProductLinks: boolean
  extraNotes: { note: string; sourceUrl: string; itemId: string }[]
  partial: boolean
  partialReason?: string
  fatal?: { code: string; message: string }
}

export type CrawlOptions = {
  maxProductPages?: number
  maxInfoPages?: number
  maxVariantsPerProduct?: number
  budgetMs?: number
  fetchTimeoutMs?: number
  maxBytes?: number
  allowLoopback?: boolean
  includeProducts?: boolean
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  now?: () => number
}

const STOP_LABEL = /^(home|shop|store|cart|account|login|log in|sign in|search|contact|about|faq|menu|blog|all|products?|collections?|pages|policy|policies|shipping|delivery|returns|refunds|首页|购物车|登录|搜索|关于|联系|联系我们)$/i

export async function crawlStore(startUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const now = options.now ?? Date.now
  const budgetMs = options.budgetMs ?? 110_000
  const deadline = now() + budgetMs
  const maxProducts = options.maxProductPages ?? 30
  const maxInfo = options.maxInfoPages ?? 8
  const includeProducts = options.includeProducts !== false
  const pages: PageRecord[] = []
  const timedOut = () => now() > deadline

  const home = await fetchPublic(startUrl, requestOptions(options))
  if (!home.ok) {
    pages.push(pageRecord(startUrl, "home", home.reason, home.httpStatus))
    return {
      pages,
      facts: emptyFacts(startUrl),
      products: [],
      sawProductLinks: false,
      extraNotes: [],
      partial: false,
      fatal: fatalFrom(home.reason),
    }
  }

  const homeParsed = parseHtml(home.body, home.url)
  if (homeParsed.isLoginWall) {
    pages.push({
      url: home.url,
      role: "home",
      status: "not_fetched",
      httpStatus: home.httpStatus,
      reason: "未抓到：需要登录或被拦截",
    })
    return {
      pages,
      facts: emptyFacts(home.url),
      products: [],
      sawProductLinks: false,
      extraNotes: [],
      partial: false,
      fatal: { code: "login", message: ERROR_MESSAGES.login },
    }
  }
  pages.push({ url: home.url, role: "home", status: "fetched", httpStatus: home.httpStatus })

  const parsedByUrl = new Map<string, ParsedPage>([[home.url, homeParsed]])
  let partial = false
  let partialReason: string | undefined

  const infoLinks = uniqueLinks(homeParsed, home.url).filter((link) =>
    classify(link.href, link.text).some((role) => role === "about" || role === "contact" || role === "delivery_policy" || role === "return_policy"),
  )
  const seen = new Set<string>([normalizeUrl(home.url)])
  let infoCount = 0
  for (const link of infoLinks) {
    if (infoCount >= maxInfo) break
    const key = normalizeUrl(link.href)
    if (seen.has(key)) continue
    seen.add(key)
    if (timedOut()) {
      partial = true
      partialReason = "已达到本次抓取时间上限。下面是已完成的部分，可以重试。"
      break
    }
    infoCount += 1
    const roles = classify(link.href, link.text).filter((role) => role === "about" || role === "contact" || role === "delivery_policy" || role === "return_policy")
    const fetched = await fetchPublic(link.href, requestOptions(options))
    if (!fetched.ok) {
      for (const role of roles) pages.push(pageRecord(link.href, role, fetched.reason, fetched.httpStatus))
      continue
    }
    const parsed = parseHtml(fetched.body, fetched.url)
    if (parsed.isLoginWall) {
      for (const role of roles) {
        pages.push({
          url: fetched.url,
          role,
          status: "not_fetched",
          httpStatus: fetched.httpStatus,
          reason: "未抓到：需要登录或被拦截",
        })
      }
      continue
    }
    for (const role of roles) {
      pages.push({ url: fetched.url, role, status: "fetched", httpStatus: fetched.httpStatus })
    }
    parsedByUrl.set(fetched.url, parsed)
  }

  const productLinks = uniqueLinks(homeParsed, home.url).filter((link) => classify(link.href, link.text).includes("product"))
  let sawProductLinks = productLinks.length > 0 || homeParsed.products.length > 0 || homeParsed.isShopify
  let products: RawProduct[] = homeParsed.products.slice(0, maxProducts)
  let currency = homeParsed.currency
  const extraNotes: { note: string; sourceUrl: string; itemId: string }[] = []
  let usedCatalog = false

  if (includeProducts && !partial && homeParsed.isShopify && products.length === 0) {
    const catalog = await fetchShopifyCatalog(home.url, maxProducts, homeParsed.currency, options, timedOut)
    if (catalog.partial) {
      partial = true
      partialReason = "已达到本次抓取时间上限。下面是已完成的部分，可以重试。"
    }
    if (catalog.page) pages.push(catalog.page)
    if (catalog.products.length) {
      products = catalog.products
      sawProductLinks = true
      usedCatalog = true
      if (catalog.currency) currency = catalog.currency
    }
    extraNotes.push(...catalog.notices)
  }

  if (includeProducts && !partial && !usedCatalog && products.length < maxProducts) {
    const listingLinks = uniqueLinks(homeParsed, home.url)
      .filter((link) => classify(link.href, link.text).includes("listing"))
      .slice(0, 2)
    for (const link of listingLinks) {
      if (timedOut()) {
        partial = true
        partialReason = "已达到本次抓取时间上限。下面是已完成的部分，可以重试。"
        break
      }
      const fetched = await fetchPublic(link.href, requestOptions(options))
      if (!fetched.ok) {
        pages.push(pageRecord(link.href, "listing", fetched.reason, fetched.httpStatus))
        continue
      }
      const parsed = parseHtml(fetched.body, fetched.url)
      pages.push({ url: fetched.url, role: "listing", status: "fetched", httpStatus: fetched.httpStatus })
      if (!currency && parsed.currency) currency = parsed.currency
      for (const candidate of parsed.links) {
        if (classify(candidate.href, candidate.text).includes("product")) productLinks.push(candidate)
      }
      products.push(...parsed.products)
      if (parsed.products.length || parsed.links.some((item) => classify(item.href, item.text).includes("product"))) {
        sawProductLinks = true
      }
    }
  }

  if (includeProducts && !partial && !usedCatalog) {
    const queue: string[] = []
    for (const link of productLinks) {
      const key = normalizeUrl(link.href)
      if (seen.has(key)) continue
      seen.add(key)
      queue.push(link.href)
      if (queue.length >= maxProducts) break
    }
    const fetchedProducts = await mapPool(queue, 4, async (href) => {
      if (timedOut()) return null
      const fetched = await fetchPublic(href, requestOptions(options))
      return { href, fetched }
    })
    if (timedOut()) {
      partial = true
      partialReason = "已达到本次抓取时间上限。下面是已完成的部分，可以重试。"
    }
    for (const item of fetchedProducts) {
      if (!item) continue
      if (!item.fetched.ok) {
        pages.push(pageRecord(item.href, "product", item.fetched.reason, item.fetched.httpStatus))
        continue
      }
      const parsed = parseHtml(item.fetched.body, item.fetched.url)
      if (parsed.isLoginWall) {
        pages.push({
          url: item.fetched.url,
          role: "product",
          status: "not_fetched",
          httpStatus: item.fetched.httpStatus,
          reason: "未抓到：需要登录或被拦截",
        })
        continue
      }
      pages.push({ url: item.fetched.url, role: "product", status: "fetched", httpStatus: item.fetched.httpStatus })
      if (!currency && parsed.currency) currency = parsed.currency
      const found = parsed.products.length
        ? parsed.products
        : minimalProduct(parsed, item.fetched.url)
      products.push(...found)
    }
  }

  products = dedupeProducts(products).slice(0, Math.max(maxProducts, products.length))
  const variantCap = Math.max(maxProducts, maxProducts * (options.maxVariantsPerProduct ?? 40))
  if (products.length > variantCap) products = products.slice(0, variantCap)

  const facts = assembleFacts({
    startUrl,
    finalUrl: home.url,
    home: homeParsed,
    pages,
    parsedByUrl,
    currency,
    products,
  })
  return {
    pages,
    facts,
    products: decorateProducts(products, facts),
    sawProductLinks,
    extraNotes,
    partial,
    partialReason,
  }
}

function requestOptions(options: CrawlOptions) {
  return {
    timeoutMs: options.fetchTimeoutMs ?? 12_000,
    maxBytes: options.maxBytes ?? 1_500_000,
    allowLoopback: options.allowLoopback !== false,
    fetchImpl: options.fetchImpl,
  }
}

function fatalFrom(reason: FetchFailure): { code: string; message: string } {
  if (reason === "login") return { code: "login", message: ERROR_MESSAGES.login }
  if (reason === "timeout") return { code: "timeout", message: ERROR_MESSAGES.timeout }
  if (reason === "blocked") return { code: "blocked", message: ERROR_MESSAGES.blocked }
  return { code: "unreachable", message: ERROR_MESSAGES.unreachable }
}

function reasonText(reason: FetchFailure): string {
  if (reason === "login") return "未抓到：需要登录或被拦截"
  if (reason === "timeout") return "未抓到：超时"
  if (reason === "blocked") return "未抓到：被拦截"
  return "未抓到：打不开"
}

function pageRecord(url: string, role: PageRole, reason: FetchFailure, httpStatus?: number): PageRecord {
  return { url, role, status: "not_fetched", httpStatus, reason: reasonText(reason) }
}

export function emptyFacts(finalUrl: string): CrawlFacts {
  return {
    finalUrl,
    homeFetched: false,
    siteName: "",
    siteNameSource: "",
    description: "",
    descriptionSource: "",
    categories: [],
    categorySource: "",
    logoUrl: "",
    logoSource: "",
    coverUrl: "",
    coverSource: "",
    deliveryUrl: "",
    deliveryExcerpt: "",
    deliveryFetched: false,
    deliveryLinked: false,
    returnUrl: "",
    returnExcerpt: "",
    returnFetched: false,
    returnLinked: false,
    acceptsReturns: null,
    returnDays: null,
    websiteConflicts: [],
    countryHints: [],
    schemaTypes: [],
    currency: "",
  }
}

function uniqueLinks(page: ParsedPage, pageUrl: string) {
  const seen = new Set<string>()
  const links: { href: string; text: string }[] = []
  for (const link of page.links) {
    if (!sameSite(link.href, pageUrl)) continue
    const key = normalizeUrl(link.href)
    if (seen.has(key)) continue
    seen.add(key)
    links.push(link)
  }
  return links
}

export function classify(href: string, text: string): PageRole[] {
  const blob = `${href} ${text}`.toLowerCase()
  const roles: PageRole[] = []
  let pathname = ""
  try {
    pathname = new URL(href).pathname
  } catch {
    pathname = href
  }
  if (/\/collections?\//.test(pathname) && !/\/products?\//.test(pathname)) roles.push("listing")
  else if (/\/products?\//.test(pathname)) roles.push("product")
  else if (/\/collections?\//.test(href)) roles.push("listing")
  if (/return|refund|退货|退款/.test(blob)) roles.push("return_policy")
  if (/shipping|delivery|配送|运费|发货/.test(blob)) roles.push("delivery_policy")
  if (/about|关于/.test(blob) && !roles.includes("product")) roles.push("about")
  if (/contact|联系/.test(blob) && !roles.includes("product")) roles.push("contact")
  return roles
}

async function fetchShopifyCatalog(
  pageUrl: string,
  limit: number,
  currencyHint: string,
  options: CrawlOptions,
  timedOut: () => boolean,
): Promise<{
  products: RawProduct[]
  notices: { note: string; sourceUrl: string; itemId: string }[]
  page?: PageRecord
  partial: boolean
  currency: string
}> {
  if (timedOut()) return { products: [], notices: [], partial: true, currency: currencyHint }
  const origin = new URL(pageUrl).origin
  const dir = pageUrl.endsWith("/") ? pageUrl : `${pageUrl}/`
  const candidates = [
    new URL(`/products.json?limit=${limit}`, origin).href,
    new URL(`products.json?limit=${limit}`, dir).href,
  ]
  for (const candidate of [...new Set(candidates)]) {
    const fetched = await fetchPublic(candidate, requestOptions(options))
    if (!fetched.ok) {
      if (candidate === candidates[0]) continue
      return {
        products: [],
        notices: [],
        partial: false,
        currency: currencyHint,
        page: pageRecord(candidate, "products_json", fetched.reason, fetched.httpStatus),
      }
    }
    try {
      const payload = JSON.parse(fetched.body) as { products?: ShopifyProduct[] }
      if (!payload.products) continue
      const sliced = payload.products.slice(0, limit)
      const storefront = new URL(fetched.url).pathname === "/products.json"
        ? origin
        : fetched.url.replace(/\/products\.json.*$/, "")
      const built = shopifyCatalogToProducts(
        { products: sliced },
        storefront,
        currencyHint,
        fetched.url,
        options.maxVariantsPerProduct ?? 40,
      )
      const notices = [...built.notices]
      if (payload.products.length > sliced.length) {
        notices.push({
          itemId: "",
          sourceUrl: fetched.url,
          note: `公开商品列表有 ${payload.products.length} 个商品，本次只处理前 ${sliced.length} 个。`,
        })
      }
      return {
        products: built.products,
        notices,
        partial: false,
        currency: currencyHint,
        page: { url: fetched.url, role: "products_json", status: "fetched", httpStatus: fetched.httpStatus },
      }
    } catch {
      continue
    }
  }
  return { products: [], notices: [], partial: false, currency: currencyHint }
}

function minimalProduct(parsed: ParsedPage, pageUrl: string): RawProduct[] {
  const title = parsed.title.replace(/\s+[|\-–—].*$/, "").trim()
  if (!title) return []
  return [
    {
      fields: {
        title: { value: title, source: pageUrl },
        url: { value: pageUrl, source: pageUrl },
      },
      conflicts: {},
      variantReliable: false,
      variantUnparsed: parsed.hasUnparsedOptions,
      sourceUrl: pageUrl,
    },
  ]
}

function dedupeProducts(products: RawProduct[]): RawProduct[] {
  const byKey = new Map<string, RawProduct>()
  const loose: RawProduct[] = []
  for (const product of products) {
    const id = product.fields.item_id?.value
    const url = product.fields.url?.value ? normalizeUrl(product.fields.url.value) : ""
    const key = id || url
    if (!key) {
      loose.push(product)
      continue
    }
    const existing = byKey.get(key)
    if (!existing || Object.keys(product.fields).length > Object.keys(existing.fields).length) {
      byKey.set(key, product)
    }
  }
  return [...byKey.values(), ...loose]
}

function assembleFacts(input: {
  startUrl: string
  finalUrl: string
  home: ParsedPage
  pages: PageRecord[]
  parsedByUrl: Map<string, ParsedPage>
  currency: string
  products: RawProduct[]
}): CrawlFacts {
  const facts = emptyFacts(input.finalUrl)
  facts.homeFetched = true
  facts.currency = input.currency
  facts.siteName = input.home.siteName || input.home.organizationName
  facts.siteNameSource = facts.siteName ? input.finalUrl : ""
  facts.logoUrl = input.home.logoUrl
  facts.logoSource = input.home.logoUrl ? input.finalUrl : ""
  facts.coverUrl = input.home.coverUrl
  facts.coverSource = input.home.coverUrl ? input.finalUrl : ""
  const hints = new Set<string>(input.home.countryHints)
  const types = new Set<string>(input.home.schemaTypes)
  for (const parsed of input.parsedByUrl.values()) {
    for (const hint of parsed.countryHints) hints.add(hint)
    for (const type of parsed.schemaTypes) types.add(type)
  }
  facts.countryHints = [...hints]
  facts.schemaTypes = [...types]

  const about = findPage(input.pages, input.parsedByUrl, "about")
  const aboutText = about?.parsed.text ?? ""
  const homeText = input.home.metaDescription || input.home.text
  if (aboutText.length > 40) {
    facts.description = aboutText.slice(0, 2000)
    facts.descriptionSource = about!.url
  } else if (homeText.trim()) {
    facts.description = homeText.slice(0, 2000)
    facts.descriptionSource = input.finalUrl
  }

  const labels = input.home.navLabels
    .map((label) => label.trim())
    .filter((label) => label.length >= 2 && label.length <= 40 && !STOP_LABEL.test(label))
  const categories = [...new Set(labels)].slice(0, 6)
  if (categories.length === 0) {
    for (const product of input.products) {
      const category = product.fields.product_category?.value
      if (category && !categories.includes(category)) categories.push(category)
      if (categories.length >= 6) break
    }
  }
  facts.categories = categories
  facts.categorySource = categories.length ? input.products.find((item) => item.fields.product_category)?.sourceUrl || input.finalUrl : ""

  const deliveryPage = input.pages.find((page) => page.role === "delivery_policy")
  if (deliveryPage) {
    facts.deliveryLinked = true
    facts.deliveryUrl = deliveryPage.url
    if (deliveryPage.status === "fetched") {
      facts.deliveryFetched = true
      facts.deliveryExcerpt = (input.parsedByUrl.get(deliveryPage.url)?.text ?? "").slice(0, 800)
    }
  }
  const returnPage = input.pages.find((page) => page.role === "return_policy")
  if (returnPage) {
    facts.returnLinked = true
    facts.returnUrl = returnPage.url
    if (returnPage.status === "fetched") {
      facts.returnFetched = true
      facts.returnExcerpt = (input.parsedByUrl.get(returnPage.url)?.text ?? "").slice(0, 800)
      const signal = returnSignals(facts.returnExcerpt)
      facts.acceptsReturns = signal.accepts
      facts.returnDays = signal.days
    }
  }

  let inputHost = ""
  let finalHost = ""
  try {
    inputHost = new URL(input.startUrl).hostname
    finalHost = new URL(input.finalUrl).hostname
  } catch {
    inputHost = ""
  }
  const canonicalHost = (() => {
    try {
      return input.home.canonicalUrl ? new URL(input.home.canonicalUrl).hostname : ""
    } catch {
      return ""
    }
  })()
  const conflicts = []
  if (inputHost && finalHost && hostsConflict(inputHost, finalHost)) {
    conflicts.push({ value: input.startUrl, source: "提交的网址" }, { value: input.finalUrl, source: input.finalUrl })
  } else if (canonicalHost && inputHost && hostsConflict(inputHost, canonicalHost) && input.home.canonicalUrl) {
    conflicts.push({ value: input.startUrl, source: "提交的网址" }, { value: input.home.canonicalUrl, source: input.home.canonicalUrl })
  }
  facts.websiteConflicts = conflicts
  return facts
}

function findPage(pages: PageRecord[], parsedByUrl: Map<string, ParsedPage>, role: PageRole) {
  const page = pages.find((item) => item.role === role && item.status === "fetched")
  if (!page) return null
  const parsed = parsedByUrl.get(page.url)
  if (!parsed) return null
  return { url: page.url, parsed }
}

function returnSignals(text: string): { accepts: boolean | null; days: number | null } {
  const no = /no returns|all sales are final|do not accept returns|不接受退货|不支持退货|不予退货/i.test(text)
  const yes = /accept returns|returns are accepted|you may return|可以退货|接受退货|支持退货/i.test(text)
  let accepts: boolean | null = null
  if (yes && !no) accepts = true
  else if (no && !yes) accepts = false
  let days: number | null = null
  const match = text.match(/(\d+)\s*(?:days?|天)/i)
  if (match && accepts === true) {
    const value = Number(match[1])
    if (value > 0 && value < 3650) days = value
  }
  return { accepts, days }
}

function decorateProducts(products: RawProduct[], facts: CrawlFacts): RawProduct[] {
  return products.map((product) => {
    const fields = { ...product.fields }
    if (!fields.seller_name?.value && facts.siteName) {
      fields.seller_name = { value: facts.siteName, source: facts.siteNameSource || facts.finalUrl }
    }
    if (!fields.seller_url?.value && facts.finalUrl) {
      fields.seller_url = { value: facts.finalUrl, source: facts.finalUrl }
    }
    if (!fields.return_policy?.value && facts.returnFetched && facts.returnUrl) {
      fields.return_policy = { value: facts.returnUrl, source: facts.returnUrl }
    }
    if (!fields.accepts_returns?.value && facts.acceptsReturns !== null && facts.returnUrl) {
      fields.accepts_returns = { value: facts.acceptsReturns ? "true" : "false", source: facts.returnUrl }
    }
    if (!fields.return_deadline_in_days?.value && facts.acceptsReturns === true && facts.returnDays && facts.returnUrl) {
      fields.return_deadline_in_days = { value: String(facts.returnDays), source: facts.returnUrl }
    }
    return { ...product, fields }
  })
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

export function shopifyCurrencyFromHtml(html: string): string {
  return parseHtml(html, "https://example.com").currency
}
