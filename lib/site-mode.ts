export type PayPalEnvironment = "sandbox" | "live"
export type CheckoutMode = "simulated" | "paypal"

export function paypalEnvironment(): PayPalEnvironment {
  return process.env.PAYPAL_ENV?.trim().toLowerCase() === "live" ? "live" : "sandbox"
}

export function paypalClientId(): string {
  return process.env.PAYPAL_CLIENT_ID?.trim() ?? ""
}

export function paypalClientSecret(): string {
  return process.env.PAYPAL_CLIENT_SECRET?.trim() ?? ""
}

export function paypalWebhookId(): string {
  return process.env.PAYPAL_WEBHOOK_ID?.trim() ?? ""
}

export function isPayPalConfigured(): boolean {
  return Boolean(paypalClientId() && paypalClientSecret())
}

/** A Vercel production deployment, or `next start` outside Vercel. Preview stays separate. */
export function isProductionDeploy(): boolean {
  if (process.env.VERCEL_ENV === "production") return true
  return process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV
}

/**
 * Live PayPal, or any production deploy that has a price.
 * Sandbox on a laptop or a preview URL is not this mode.
 */
export function isTakingRealMoney(basePriceCents: number): boolean {
  if (paypalEnvironment() === "live") return true
  return isProductionDeploy() && basePriceCents > 0
}

/** Homepage fixture buttons stay available for local and preview sandbox tests. */
export function showFixtureButtons(): boolean {
  if (paypalEnvironment() === "live") return false
  if (isProductionDeploy()) return false
  return true
}

export function allowSimulatedPay(basePriceCents: number): boolean {
  if (isTakingRealMoney(basePriceCents)) return false
  if (isPayPalConfigured()) return false
  return true
}

export function checkoutMode(): CheckoutMode {
  return isPayPalConfigured() ? "paypal" : "simulated"
}

export function paypalApiBase(): string {
  return paypalEnvironment() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"
}
