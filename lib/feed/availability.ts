import { AVAILABILITY_VALUES, type AvailabilityValue } from "@/lib/official/spec"

const MAP: Record<string, AvailabilityValue> = {
  in_stock: "in_stock",
  instock: "in_stock",
  available: "in_stock",
  yes: "in_stock",
  true: "in_stock",
  out_of_stock: "out_of_stock",
  outofstock: "out_of_stock",
  sold_out: "out_of_stock",
  soldout: "out_of_stock",
  unavailable: "out_of_stock",
  false: "out_of_stock",
  no: "out_of_stock",
  pre_order: "pre_order",
  preorder: "pre_order",
  backorder: "backorder",
  back_order: "backorder",
  unknown: "unknown",
}

export function normalizeAvailability(raw: string): AvailabilityValue | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/schema\.org\//, "")
    .replace(/[\s-]+/g, "_")
  const value = MAP[key]
  return value && AVAILABILITY_VALUES.includes(value) ? value : null
}
