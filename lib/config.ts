import path from "node:path"
import {
  allowSimulatedPay,
  checkoutMode,
  isTakingRealMoney,
  paypalEnvironment,
  showFixtureButtons,
  type CheckoutMode,
  type PayPalEnvironment,
} from "@/lib/site-mode"

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.trunc(value)
}

export type AppConfig = {
  basePriceCents: number
  priceEnvSet: boolean
  trialDays: number
  trialPriceCents: number
  monthlyPriceCents: number
  currency: string
  includedSkus: number
  overageBlockSize: number
  overageBlockPriceCents: number
  maxProductPages: number
  maxInfoPages: number
  maxVariantsPerProduct: number
  maxFeedRows: number
  auditBudgetMs: number
  fetchTimeoutMs: number
  maxBytes: number
  retentionDays: number
  maxUploadBytes: number
  allowLoopback: boolean
  dataDir: string
  checkoutMode: CheckoutMode
  paypalEnv: PayPalEnvironment
  allowSimulatedPay: boolean
  showFixtures: boolean
}

export function getConfig(): AppConfig {
  const currency = (process.env.PREP_CURRENCY || "USD").trim().toUpperCase()
  const basePriceCents = Math.max(0, envInt("PREP_BASE_PRICE_CENTS", 0))
  const takingRealMoney = isTakingRealMoney(basePriceCents)
  return {
    basePriceCents,
    priceEnvSet: Boolean(process.env.PREP_BASE_PRICE_CENTS?.trim()),
    // Published price: 7 days at USD 9.90, then USD 49.90 / month.
    // Paid checkout is off, so a non-zero trial price cannot be started or charged.
    trialDays: Math.max(1, envInt("PREP_TRIAL_DAYS", 7)),
    trialPriceCents: Math.max(0, envInt("PREP_TRIAL_PRICE_CENTS", 990)),
    monthlyPriceCents: Math.max(0, envInt("PREP_MONTHLY_PRICE_CENTS", 4990)),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    includedSkus: Math.max(0, envInt("PREP_INCLUDED_SKUS", 50)),
    overageBlockSize: envInt("PREP_OVERAGE_BLOCK_SIZE", 50),
    overageBlockPriceCents: Math.max(0, envInt("PREP_OVERAGE_BLOCK_PRICE_CENTS", 0)),
    maxProductPages: Math.max(1, envInt("PREP_MAX_PRODUCT_PAGES", 30)),
    maxInfoPages: Math.max(1, envInt("PREP_MAX_INFO_PAGES", 8)),
    maxVariantsPerProduct: Math.max(1, envInt("PREP_MAX_VARIANTS_PER_PRODUCT", 40)),
    maxFeedRows: Math.max(1, envInt("PREP_MAX_FEED_ROWS", 1000)),
    auditBudgetMs: Math.max(5_000, envInt("PREP_AUDIT_BUDGET_MS", 110_000)),
    fetchTimeoutMs: Math.max(1_000, envInt("PREP_FETCH_TIMEOUT_MS", 12_000)),
    maxBytes: Math.max(50_000, envInt("PREP_MAX_PAGE_BYTES", 1_500_000)),
    retentionDays: Math.max(1, envInt("PREP_RETENTION_DAYS", 30)),
    maxUploadBytes: Math.max(10_000, envInt("PREP_MAX_UPLOAD_BYTES", 5_000_000)),
    allowLoopback: takingRealMoney ? false : process.env.PREP_ALLOW_LOOPBACK !== "false",
    dataDir: process.env.PREP_DATA_DIR || path.join(process.cwd(), "data"),
    checkoutMode: checkoutMode(),
    paypalEnv: paypalEnvironment(),
    allowSimulatedPay: allowSimulatedPay(basePriceCents),
    showFixtures: showFixtureButtons(),
  }
}
