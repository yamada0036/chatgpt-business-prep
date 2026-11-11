import * as cheerio from "cheerio"
import type { RawProduct } from "@/lib/audit/types"
import { htmlToText } from "@/lib/text"
import { toAbsoluteUrl } from "@/lib/url-safety"

export type ParsedPage = {
  title: string
  metaDescription: string
  siteName: string
  logoUrl: string
  coverUrl: string
  canonicalUrl: string
  navLabels: string[]
  links: { href: string; text: string }[]
  text: string
  isLoginWall: boolean
  isShopify: boolean
  currency: string
  schemaTypes: string[]
  countryHints: string[]
  organizationName: string
  products: RawProduct[]
  hasUnparsedOptions: boolean
}

const COUNTRY_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "美国", re: /\b(united states|u\.s\.a\.|usa)\b|美国/i },
  { label: "中国", re: /\bchina\b|中国/i },
  { label: "英国", re: /\bunited kingdom\b|\buk\b|英国/i },
  { label: "加拿大", re: /\bcanada\b|加拿大/i },
  { label: "澳大利亚", re: /\baustralia\b|澳大利亚/i },
]

export function parseHtml(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html)
  const title = collapse($("title").first().text())
  const metaDescription = collapse($('meta[name="description"]').attr("content") ?? "")
  const siteName = collapse($('meta[property="og:site_name"]').attr("content") ?? "")
  const canonical = toAbsoluteUrl($('link[rel="canonical"]').attr("href") ?? "", pageUrl) ?? ""
  const ogImage = toAbsoluteUrl($('meta[property="og:image"]').attr("content") ?? "", pageUrl) ?? ""
  const currency = detectCurrency(html, $)
  const schema = readJsonLd($)
  const schemaTypes = schema.types
  const organizationName = schema.organizationName
  const links: { href: string; text: string }[] = []
  $("a[href]").each((_, element) => {
    const href = toAbsoluteUrl($(element).attr("href") ?? "", pageUrl)
    if (!href) return
    links.push({ href, text: collapse($(element).text()) })
  })
  const navLabels: string[] = []
  $("nav a, header a").each((_, element) => {
    const label = collapse($(element).text())
    if (label && label.length <= 40 && !navLabels.includes(label)) navLabels.push(label)
  })
  const logoUrl = findLogo($, pageUrl)
  const coverUrl = ogImage && ogImage !== logoUrl ? ogImage : ""
  const text = htmlToText($("body").text() ? $.root().html() ?? html : html).slice(0, 8000)
  const bodyText = collapse($("body").text())
  const isLoginWall = looksLikeLogin($, bodyText)
  const isShopify = /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html)
  const countryHints = COUNTRY_PATTERNS.filter((item) => item.re.test(bodyText)).map((item) => item.label)
  const products = isLoginWall ? [] : schema.products.map((product) => absolutizeProduct(product, pageUrl))
  const hasUnparsedOptions = $("select").toArray().some((element) =>
    /color|size|colour|option/i.test(`${$(element).attr("name") ?? ""} ${$(element).attr("id") ?? ""}`),
  )
  if (hasUnparsedOptions) {
    for (const product of products) {
      if (!product.variantReliable) product.variantUnparsed = true
    }
  }
  return {
    title,
    metaDescription,
    siteName,
    logoUrl,
    coverUrl,
    canonicalUrl: canonical,
    navLabels,
    links,
    text: text.slice(0, 4000),
    isLoginWall,
    isShopify,
    currency,
    schemaTypes,
    countryHints,
    organizationName,
    products,
    hasUnparsedOptions,
  }
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function looksLikeLogin($: cheerio.CheerioAPI, bodyText: string): boolean {
  const password = $('input[type="password"]').length > 0
  if (!password) return false
  return bodyText.length < 900
}

function detectCurrency(html: string, $: cheerio.CheerioAPI): string {
  const shopify = html.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Za-z]{3})"/)
  if (shopify) return shopify[1].toUpperCase()
  const meta =
    $('meta[property="og:price:currency"]').attr("content") ||
    $('meta[property="product:price:currency"]').attr("content") ||
    ""
  return /^[A-Za-z]{3}$/.test(meta) ? meta.toUpperCase() : ""
}

function findLogo($: cheerio.CheerioAPI, pageUrl: string): string {
  const candidates = [
    $('img[alt*="logo" i]').attr("src"),
    $('img[src*="logo" i]').attr("src"),
    $('link[rel="apple-touch-icon"]').attr("href"),
    $('link[rel="icon"]').attr("href"),
  ]
  for (const candidate of candidates) {
    const absolute = toAbsoluteUrl(candidate ?? "", pageUrl)
    if (absolute) return absolute
  }
  return ""
}

type SchemaRead = {
  types: string[]
  organizationName: string
  products: RawProduct[]
}

function readJsonLd($: cheerio.CheerioAPI): SchemaRead {
  const nodes: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text()
    try {
      collectNodes(JSON.parse(raw), nodes)
    } catch {
      /* ignore malformed blocks */
    }
  })
  const types = new Set<string>()
  let organizationName = ""
  const products: RawProduct[] = []
  for (const node of nodes) {
    for (const type of nodeTypes(node)) types.add(type)
    if (!organizationName && nodeTypes(node).some((type) => /organization|onlinestore|store/i.test(type))) {
      organizationName = stringValue(node.name)
    }
    if (nodeTypes(node).includes("ProductGroup")) {
      products.push(...productGroup(node))
    } else if (nodeTypes(node).includes("Product")) {
      products.push(...productNode(node, ""))
    }
  }
  return { types: [...types], organizationName, products }
}

function collectNodes(value: unknown, out: Record<string, unknown>[]) {
  if (!value) return
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, out)
    return
  }
  if (typeof value !== "object") return
  const node = value as Record<string, unknown>
  if (Array.isArray(node["@graph"])) collectNodes(node["@graph"], out)
  out.push(node)
}

function nodeTypes(node: Record<string, unknown>): string[] {
  const raw = node["@type"]
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.map((item) => String(item).replace(/^https?:\/\/schema\.org\//, ""))
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return String(value)
  if (value && typeof value === "object" && "name" in value) {
    return stringValue((value as { name?: unknown }).name)
  }
  return ""
}

function imageUrls(value: unknown): string[] {
  if (!value) return []
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(imageUrls)
  if (typeof value === "object" && value && "url" in value) return imageUrls((value as { url?: unknown }).url)
  return []
}

function productGroup(node: Record<string, unknown>): RawProduct[] {
  const groupId = stringValue(node.productGroupID) || stringValue(node.sku)
  const variants = Array.isArray(node.hasVariant) ? node.hasVariant : []
  if (variants.length === 0) return productNode(node, groupId)
  const parentBrand = brandOf(node.brand)
  const parentName = stringValue(node.name)
  const rows: RawProduct[] = []
  variants.forEach((variant) => {
    if (!variant || typeof variant !== "object") return
    const child = variant as Record<string, unknown>
    const made = productNode(
      {
        ...child,
        brand: child.brand ?? node.brand,
        description: child.description ?? node.description,
        image: child.image ?? node.image,
      },
      groupId,
    )
    for (const product of made) {
      const dict: Record<string, string> = {}
      if (stringValue(child.color)) dict.color = stringValue(child.color)
      if (stringValue(child.size)) dict.size = stringValue(child.size)
      if (Object.keys(dict).length > 0 && product.fields.item_id?.value && groupId && groupId !== product.fields.item_id.value) {
        product.fields.group_id = { value: groupId, source: product.sourceUrl }
        product.fields.listing_has_variations = { value: "true", source: product.sourceUrl }
        product.fields.variant_dict = { value: JSON.stringify(dict), source: product.sourceUrl }
        if (stringValue(child.color)) product.fields.color = { value: stringValue(child.color), source: product.sourceUrl }
        if (stringValue(child.size)) product.fields.size = { value: stringValue(child.size), source: product.sourceUrl }
        product.variantReliable = true
        const title = product.fields.title?.value || parentName
        if (parentBrand && !product.fields.brand) {
          product.fields.brand = { value: parentBrand, source: product.sourceUrl }
        }
        if (title) product.fields.title = { value: title, source: product.fields.title?.source || product.sourceUrl }
      } else {
        product.variantUnparsed = variants.length > 1
      }
      rows.push(product)
    }
  })
  return rows
}

function productNode(node: Record<string, unknown>, groupId: string): RawProduct[] {
  const offers = node.offers
  const offerList = Array.isArray(offers) ? offers : offers && typeof offers === "object" ? [offers] : []
  const aggregate = offerList.length === 1 && nodeTypes(offerList[0] as Record<string, unknown>).includes("AggregateOffer")
  const variantOffers =
    !aggregate &&
    offerList.length > 1 &&
    offerList.every((offer) => {
      const item = offer as Record<string, unknown>
      return stringValue(item.sku) || stringValue(item.url)
    })
  if (variantOffers) {
    return offerList.map((offer) =>
      oneProduct(node, offer as Record<string, unknown>, groupId || stringValue(node.sku) || stringValue(node.productID)),
    ).map((product) => {
      product.variantUnparsed = true
      product.variantReliable = false
      return product
    })
  }
  const product = oneProduct(node, (offerList[0] as Record<string, unknown>) ?? {}, groupId)
  if (aggregate) {
    const count = Number((offerList[0] as Record<string, unknown>).offerCount ?? 0)
    if (count > 1) product.variantUnparsed = true
  }
  return [product]
}

function oneProduct(node: Record<string, unknown>, offer: Record<string, unknown>, groupId: string): RawProduct {
  const sourceUrl = stringValue(offer.url) || stringValue(node.url)
  const fields: RawProduct["fields"] = {}
  const put = (key: string, value: string) => {
    if (value) fields[key] = { value, source: sourceUrl }
  }
  put("item_id", stringValue(offer.sku) || stringValue(node.sku) || stringValue(node.productID))
  put("title", stringValue(node.name))
  put("description", stringValue(node.description))
  put("url", sourceUrl)
  put("brand", brandOf(node.brand))
  const images = imageUrls(node.image)
  if (images[0]) put("image_url", images[0])
  if (images.length > 1) put("additional_image_urls", images.slice(1).join(","))
  const price = stringValue(offer.price)
  const currency = stringValue(offer.priceCurrency)
  if (price && currency) put("price", `${price} ${currency}`)
  else if (price) put("price", price)
  const availability = stringValue(offer.availability)
  if (availability) put("availability", availability)
  const condition = stringValue(offer.itemCondition) || stringValue(node.itemCondition)
  if (condition) put("condition", condition)
  const gtin = stringValue(node.gtin) || stringValue(node.gtin13) || stringValue(node.gtin12) || stringValue(node.gtin14) || stringValue(node.gtin8)
  if (gtin) put("gtin", gtin)
  const mpn = stringValue(node.mpn)
  if (mpn) put("mpn", mpn)
  const category = stringValue(node.category)
  if (category) put("product_category", category)
  if (groupId && fields.item_id?.value && groupId !== fields.item_id.value && fields.variant_dict) {
    put("group_id", groupId)
  }
  return {
    fields,
    conflicts: {},
    variantReliable: false,
    variantUnparsed: false,
    sourceUrl,
  }
}

function brandOf(value: unknown): string {
  return stringValue(value)
}

function absolutizeProduct(product: RawProduct, pageUrl: string): RawProduct {
  const source = toAbsoluteUrl(product.sourceUrl, pageUrl) || pageUrl
  const fields = { ...product.fields }
  for (const key of ["url", "image_url", "seller_url", "return_policy"]) {
    if (!fields[key]?.value) continue
    const absolute = toAbsoluteUrl(fields[key].value, pageUrl)
    if (absolute) fields[key] = { value: absolute, source }
  }
  if (fields.additional_image_urls?.value) {
    const urls = fields.additional_image_urls.value
      .split(",")
      .map((item) => toAbsoluteUrl(item.trim(), pageUrl))
      .filter((item): item is string => Boolean(item))
    if (urls.length) fields.additional_image_urls = { value: urls.join(","), source }
  }
  for (const field of Object.values(fields)) {
    if (field.source && !/^https?:\/\//.test(field.source)) field.source = source
    if (!field.source) field.source = source
  }
  if (!fields.url?.value) fields.url = { value: source, source }
  else fields.url = { value: fields.url.value, source }
  return { ...product, fields, sourceUrl: fields.url.value || source }
}

export type ShopifyVariant = {
  id?: number | string
  title?: string
  sku?: string
  price?: string
  compare_at_price?: string | null
  available?: boolean
  option1?: string | null
  option2?: string | null
  option3?: string | null
  barcode?: string | null
  featured_image?: { src?: string } | null
}

export type ShopifyProduct = {
  id?: number | string
  title?: string
  handle?: string
  body_html?: string
  vendor?: string
  product_type?: string
  options?: { name?: string }[]
  images?: { src?: string }[]
  variants?: ShopifyVariant[]
}

export function shopifyCatalogToProducts(
  payload: { products?: ShopifyProduct[] },
  origin: string,
  currency: string,
  sourceUrl: string,
  maxVariants: number,
): { products: RawProduct[]; notices: { note: string; sourceUrl: string; itemId: string }[] } {
  const products: RawProduct[] = []
  const notices: { note: string; sourceUrl: string; itemId: string }[] = []
  for (const product of payload.products ?? []) {
    const variants = product.variants ?? []
    const kept = variants.slice(0, maxVariants)
    if (variants.length > kept.length) {
      notices.push({
        itemId: String(product.id ?? ""),
        sourceUrl,
        note: `该商品还有 ${variants.length - kept.length} 个规格超出本次上限，没有写入。`,
      })
    }
    const multiple = kept.filter((variant) => (variant.title ?? "") !== "Default Title").length > 1 || kept.length > 1
    for (const variant of kept) {
      const handle = product.handle ?? ""
      const page = handle ? `${origin}/products/${handle}?variant=${variant.id ?? ""}` : sourceUrl
      const fields: RawProduct["fields"] = {}
      const put = (key: string, value: string) => {
        if (value) fields[key] = { value, source: page }
      }
      const sku = (variant.sku ?? "").trim()
      const variantId = variant.id === undefined ? "" : String(variant.id)
      const groupId = product.id === undefined ? "" : String(product.id)
      let itemId = sku || variantId
      if (itemId && groupId && itemId === groupId && variantId) itemId = variantId
      put("item_id", itemId)
      const variantTitle = variant.title && variant.title !== "Default Title" ? variant.title : ""
      const title = variantTitle ? `${product.title ?? ""} — ${variantTitle}` : (product.title ?? "")
      put("title", title.trim())
      put("description", product.body_html ?? "")
      put("url", page)
      put("brand", product.vendor ?? "")
      const image = variant.featured_image?.src || product.images?.[0]?.src || ""
      put("image_url", image)
      const extras = (product.images ?? [])
        .map((item) => item.src ?? "")
        .filter((src) => src && src !== image)
      if (extras.length) put("additional_image_urls", extras.join(","))
      if (variant.price && currency) {
        const compare = variant.compare_at_price ? Number(variant.compare_at_price) : NaN
        const current = Number(variant.price)
        if (Number.isFinite(compare) && Number.isFinite(current) && compare > current) {
          put("price", `${variant.compare_at_price} ${currency}`)
          put("sale_price", `${variant.price} ${currency}`)
        } else {
          put("price", `${variant.price} ${currency}`)
        }
      } else if (variant.price) {
        put("price", variant.price)
      }
      if (typeof variant.available === "boolean") {
        put("availability", variant.available ? "in_stock" : "out_of_stock")
      }
      if (variant.barcode) put("gtin", variant.barcode)
      if (product.product_type) put("product_category", product.product_type)
      const optionNames = product.options ?? []
      const dict: Record<string, string> = {}
      const options = [variant.option1, variant.option2, variant.option3]
      options.forEach((option, index) => {
        const name = optionNames[index]?.name?.trim()
        const picked = option?.trim()
        if (!name || !picked || picked === "Default Title") return
        dict[name] = picked
        if (/color|colour/i.test(name)) put("color", picked)
        if (/size/i.test(name)) put("size", picked)
      })
      const reliable = multiple && Object.keys(dict).length > 0 && itemId && groupId && itemId !== groupId
      if (reliable) {
        put("group_id", groupId)
        put("listing_has_variations", "true")
        put("variant_dict", JSON.stringify(dict))
      }
      products.push({
        fields,
        conflicts: {},
        variantReliable: Boolean(reliable),
        variantUnparsed: Boolean(multiple && !reliable),
        sourceUrl: page,
      })
    }
  }
  return { products, notices }
}
