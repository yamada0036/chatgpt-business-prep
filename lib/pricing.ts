import type { PriceBreakdown } from "@/lib/audit/types"
import { getConfig } from "@/lib/config"
import { checkoutMode } from "@/lib/site-mode"

export function quotePrice(rowCount: number): PriceBreakdown {
  const config = getConfig()
  const rows = Math.max(0, rowCount)
  const extra = Math.max(0, rows - config.includedSkus)
  const blockSize = config.overageBlockSize
  const overageBlocks = extra > 0 && blockSize > 0 ? Math.ceil(extra / blockSize) : 0
  const overageCents = overageBlocks * config.overageBlockPriceCents
  return {
    baseCents: config.basePriceCents,
    currency: config.currency,
    includedSkus: config.includedSkus,
    rowCount: rows,
    blockSize,
    blockPriceCents: config.overageBlockPriceCents,
    overageBlocks,
    overageCents,
    totalCents: config.basePriceCents + overageCents,
    priceEnvSet: config.priceEnvSet,
    mode: checkoutMode(),
  }
}

export function formatCents(cents: number, currency: string): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, "0")
  return `${sign}${currency} ${whole}.${frac}`
}
