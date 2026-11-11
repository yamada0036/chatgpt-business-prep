import { getConfig } from "@/lib/config"
import { paypalClientId, paypalClientSecret, paypalWebhookId } from "@/lib/site-mode"
import { paidStorageBlocker } from "@/lib/store/audits"

export function checkoutBlocker(): string | null {
  if (!paypalClientId()) return "PAYPAL_CLIENT_ID is missing. Paid checkout cannot start."
  if (!paypalClientSecret()) return "PAYPAL_CLIENT_SECRET is missing. Paid checkout cannot start."
  if (!paypalWebhookId()) return "PAYPAL_WEBHOOK_ID is missing. Register the webhook before taking payment. Paid checkout cannot start."
  const storage = paidStorageBlocker()
  if (storage) return storage
  if (getConfig().basePriceCents <= 0) return "PREP_BASE_PRICE_CENTS is not a live price. Paid checkout cannot start."
  return null
}

export type PublicCheckoutConfig = {
  checkoutMode: "simulated" | "paypal"
  paypalClientId: string
  currency: string
  paypalEnv: "sandbox" | "live"
  showSimulatedPay: boolean
  showFixtures: boolean
  ready: boolean
  blocker: string
}

export function publicCheckoutConfig(): PublicCheckoutConfig {
  const config = getConfig()
  const blocker = config.checkoutMode === "paypal" ? checkoutBlocker() ?? "" : ""
  return {
    checkoutMode: config.checkoutMode,
    paypalClientId: config.checkoutMode === "paypal" ? paypalClientId() : "",
    currency: config.currency,
    paypalEnv: config.paypalEnv,
    showSimulatedPay: config.allowSimulatedPay,
    showFixtures: config.showFixtures,
    ready: config.checkoutMode === "paypal" && blocker === "",
    blocker,
  }
}
