import { FEED_FIELDS, type FeedField } from "@/lib/official/spec"

const ALIASES: Record<FeedField, string[]> = {
  item_id: ["item_id", "id", "sku", "variant_sku", "商品id", "商品编号"],
  title: ["title", "name", "product_name", "product_title", "商品名称", "商品名", "标题"],
  description: ["description", "body", "body_html", "desc", "product_description", "描述", "商品描述"],
  url: ["url", "link", "product_url", "product_link", "商品链接", "链接"],
  brand: ["brand", "vendor", "品牌"],
  seller_name: ["seller_name", "seller", "store_name", "卖家", "店铺名"],
  image_url: ["image_url", "image", "image_src", "image_link", "图片", "主图"],
  availability: ["availability", "stock_status", "库存", "库存状态"],
  price: ["price", "variant_price", "regular_price", "价格", "售价"],
  sale_price: ["sale_price", "促销价"],
  group_id: ["group_id", "item_group_id", "parent_id"],
  listing_has_variations: ["listing_has_variations"],
  variant_dict: ["variant_dict"],
  additional_image_urls: ["additional_image_urls", "additional_images"],
  condition: ["condition", "成色"],
  product_category: ["product_category", "product_type", "category", "类目", "分类"],
  color: ["color", "colour", "颜色"],
  size: ["size", "尺码", "尺寸"],
  gtin: ["gtin", "barcode", "ean", "upc"],
  mpn: ["mpn"],
  seller_url: ["seller_url"],
  accepts_returns: ["accepts_returns"],
  return_deadline_in_days: ["return_deadline_in_days", "return_window"],
  return_policy: ["return_policy"],
  shipping_price: ["shipping_price", "运费"],
}

export function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_")
}

export function autoMap(headers: string[]): {
  mapping: Partial<Record<FeedField, string>>
  needsMap: boolean
} {
  const mapping: Partial<Record<FeedField, string>> = {}
  const used = new Set<string>()
  for (const field of FEED_FIELDS) {
    const aliases = new Set(ALIASES[field].map(normalizeHeader))
    const header = headers.find((candidate) => {
      if (used.has(candidate)) return false
      return aliases.has(normalizeHeader(candidate))
    })
    if (header) {
      mapping[field] = header
      used.add(header)
    }
  }
  const recognized = Object.keys(mapping).length
  const needsMap = recognized < 2 || (!mapping.item_id && !mapping.title && !mapping.url)
  return { mapping, needsMap }
}

export function mappingFromHeaders(
  headers: string[],
  proposed: Record<string, string>,
): Partial<Record<FeedField, string>> {
  const allowed = new Set<string>(FEED_FIELDS)
  const headerSet = new Set(headers)
  const mapping: Partial<Record<FeedField, string>> = {}
  for (const [field, header] of Object.entries(proposed)) {
    if (!allowed.has(field) || !header || !headerSet.has(header)) continue
    mapping[field as FeedField] = header
  }
  return mapping
}
