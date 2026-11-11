import type { Cell, RawProduct, Sourced } from "@/lib/audit/types"
import { normalizeAvailability } from "@/lib/feed/availability"
import { formatMoney } from "@/lib/money"
import { normalizeUrl } from "@/lib/url-safety"

function equivalent(field: string, left: string, right: string): boolean {
  if (!left || !right) return false
  if (field === "price" || field === "sale_price" || field === "shipping_price") {
    const a = formatMoney(left, { allowZero: field === "shipping_price" })
    const b = formatMoney(right, { allowZero: field === "shipping_price" })
    return a.ok && b.ok && a.value === b.value
  }
  if (field === "availability") {
    const a = normalizeAvailability(left)
    const b = normalizeAvailability(right)
    return Boolean(a && b && a === b)
  }
  if (field.endsWith("_url") || field === "url" || field === "image_url" || field === "return_policy" || field === "seller_url") {
    return normalizeUrl(left) === normalizeUrl(right)
  }
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function matchKey(product: RawProduct): { id?: string; url?: string } {
  const id = product.fields.item_id?.value.trim()
  const url = product.fields.url?.value.trim()
  return {
    id: id || undefined,
    url: url ? normalizeUrl(url) : undefined,
  }
}

export function mergeProducts(base: RawProduct[], extras: RawProduct[]): RawProduct[] {
  if (base.length === 0) return extras.map(cloneProduct)
  const byId = new Map<string, RawProduct>()
  const byUrl = new Map<string, RawProduct>()
  for (const extra of extras) {
    const key = matchKey(extra)
    if (key.id && !byId.has(key.id)) byId.set(key.id, extra)
    if (key.url && !byUrl.has(key.url)) byUrl.set(key.url, extra)
  }
  return base.map((row) => {
    const key = matchKey(row)
    const match = (key.id && byId.get(key.id)) || (key.url && byUrl.get(key.url))
    if (!match) return cloneProduct(row)
    return mergeOne(row, match)
  })
}

function cloneProduct(product: RawProduct): RawProduct {
  return {
    fields: { ...product.fields },
    conflicts: { ...product.conflicts },
    variantReliable: product.variantReliable,
    variantUnparsed: product.variantUnparsed,
    sourceUrl: product.sourceUrl,
  }
}

function mergeOne(base: RawProduct, extra: RawProduct): RawProduct {
  const fields: Record<string, Cell> = { ...base.fields }
  const conflicts: Record<string, Sourced[]> = { ...base.conflicts }
  const keys = new Set([...Object.keys(base.fields), ...Object.keys(extra.fields)])
  for (const key of keys) {
    if (conflicts[key]?.length) continue
    const left = base.fields[key]
    const right = extra.fields[key]
    const a = left?.value.trim() ?? ""
    const b = right?.value.trim() ?? ""
    if (a && b && !equivalent(key, a, b)) {
      conflicts[key] = [
        { value: left.value, source: left.source },
        { value: right.value, source: right.source },
      ]
      delete fields[key]
      continue
    }
    if (!a && b && right) fields[key] = right
  }
  return {
    fields,
    conflicts,
    variantReliable: base.variantReliable || extra.variantReliable,
    variantUnparsed: base.variantUnparsed || extra.variantUnparsed,
    sourceUrl: base.sourceUrl || extra.sourceUrl,
  }
}
