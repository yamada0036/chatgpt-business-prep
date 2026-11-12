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

export type PaidState = "ready" | "simulated" | "coming_soon" | "unavailable" | "not_for_sale"

export function paidCheckoutState(): PaidState {
  return "not_for_sale"
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
  paidState: PaidState
}

export function publicCheckoutConfig(): PublicCheckoutConfig {
  const config = getConfig()
  const paidState = paidCheckoutState()
  return {
    checkoutMode: config.checkoutMode,
    paypalClientId: paidState === "ready" ? paypalClientId() : "",
    currency: config.currency,
    paypalEnv: config.paypalEnv,
    showSimulatedPay: paidState === "simulated",
    showFixtures: config.showFixtures,
    ready: paidState === "ready",
    blocker: paidState === "unavailable" ? checkoutBlocker() ?? "" : "",
    paidState,
  }
}
