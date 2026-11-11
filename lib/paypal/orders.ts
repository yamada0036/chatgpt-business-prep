import { randomBytes } from "node:crypto"
import type { AuditRecord } from "@/lib/audit/types"
import { getConfig } from "@/lib/config"
import { quotePrice } from "@/lib/pricing"
import { PayPalError, capturePayPalOrder as captureRemoteOrder, createPayPalOrder } from "@/lib/paypal/client"
import { payPalValueToCents } from "@/lib/paypal/money"
import { checkoutBlocker } from "@/lib/paypal/ready"
import { logEvent, readAudit, rememberCapture, updateAudit } from "@/lib/store/audits"
import { looksLikeEmail } from "@/lib/text"

export class CheckoutError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "CheckoutError"
    this.status = status
  }
}

function rowCount(audit: AuditRecord): number {
  return audit.feedApplicable ? audit.feedRows.length : 0
}

export async function createPayPalCheckout(input: {
  id: string
  email?: string
  origin: string
}): Promise<AuditRecord> {
  const blocker = checkoutBlocker()
  if (blocker) throw new CheckoutError(blocker, 503)
  const existing = await readAudit(input.id)
  if (!existing) throw new CheckoutError("This audit does not exist.", 404)
  if (existing.status !== "complete" && existing.status !== "partial") {
    throw new CheckoutError("The audit is not finished, so payment cannot start.")
  }
  if (existing.order.status === "paid" || existing.order.status === "delivered") {
    throw new CheckoutError("This order is already paid.", 409)
  }
  const email = input.email?.trim() || existing.contactEmail
  if (!looksLikeEmail(email)) throw new CheckoutError("A contact email is required before payment.")
  const fresh = quotePrice(rowCount(existing))
  if (fresh.totalCents !== existing.order.breakdown.totalCents || fresh.currency !== existing.order.breakdown.currency) {
    await updateAudit(existing.id, (current) => ({
      ...current,
      order: { ...current.order, breakdown: fresh },
    }))
    throw new CheckoutError("The amount due changed. Reload this page and pay the amount it shows.", 409)
  }
  if (fresh.totalCents <= 0) throw new CheckoutError("A live price is not configured.", 503)
  const config = getConfig()
  if (fresh.currency !== config.currency) {
    throw new CheckoutError("The currency on this order does not match the site configuration.", 409)
  }
  const invoiceId = `${existing.id.slice(0, 8)}${randomBytes(4).toString("hex")}`
  const origin = input.origin.replace(/\/$/, "")
  let created: { id: string }
  try {
    created = await createPayPalOrder({
      auditId: existing.id,
      invoiceId,
      currency: fresh.currency,
      amountCents: fresh.totalCents,
      returnUrl: `${origin}/audit/${existing.id}/checkout/return`,
      cancelUrl: `${origin}/audit/${existing.id}/checkout`,
    })
  } catch (error) {
    if (error instanceof PayPalError) throw new CheckoutError(error.message, error.status)
    throw error
  }
  let saved: AuditRecord
  try {
    saved = await updateAudit(existing.id, (current) => {
      if (current.order.status === "paid" || current.order.status === "delivered") return current
      return {
        ...current,
        contactEmail: email,
        order: {
          ...current.order,
          status: "pending",
          breakdown: fresh,
          chargedCents: null,
          failureReason: undefined,
          paypalOrderId: created.id,
          paypalInvoiceId: invoiceId,
          paypalAmountCents: fresh.totalCents,
          paypalCurrency: fresh.currency,
          paypalCaptureId: undefined,
          paypalAwaitingWebhook: false,
        },
      }
    })
  } catch {
    throw new CheckoutError(
      "The PayPal order could not be stored. Do not approve a PayPal window that is still open. Payment was not completed.",
      503,
    )
  }
  logEvent("paypal_order_created", {
    id: existing.id,
    cents: fresh.totalCents,
    currency: fresh.currency,
  })
  return saved
}

const DECLINED = new Set(["DECLINED", "FAILED", "DENIED", "VOIDED"])

export async function observePayPalCapture(id: string, paypalOrderIdFromClient?: string): Promise<AuditRecord> {
  const existing = await readAudit(id)
  if (!existing) throw new CheckoutError("This audit does not exist.", 404)
  if (!existing.order.paypalOrderId) throw new CheckoutError("No PayPal order exists for this audit.", 409)
  if (paypalOrderIdFromClient && paypalOrderIdFromClient !== existing.order.paypalOrderId) {
    throw new CheckoutError("That PayPal order does not match this audit.", 400)
  }
  if (existing.order.status === "paid" || existing.order.status === "delivered" || existing.order.status === "refunded") {
    return existing
  }
  let observed
  try {
    observed = await captureRemoteOrder(existing.order.paypalOrderId, `prep-capture-${existing.id}-${existing.order.paypalOrderId}`)
  } catch (error) {
    if (error instanceof PayPalError) throw new CheckoutError(error.message, error.status)
    throw error
  }
  if (observed.orderId !== existing.order.paypalOrderId) {
    throw new CheckoutError("PayPal returned a different order id. The pack stays locked.", 409)
  }
  const expectedValue = existing.order.paypalAmountCents
  const observedCents = observed.value ? payPalValueToCents(observed.value) : null
  const amountMismatch =
    observed.status === "COMPLETED" &&
    observed.value !== null &&
    expectedValue !== undefined &&
    (observed.currency !== existing.order.paypalCurrency || observedCents !== expectedValue)
  if (amountMismatch) {
    logEvent("paypal_capture_amount_mismatch", { id })
  }
  if (observed.captureId && !amountMismatch) await rememberCapture(observed.captureId, existing.id)
  return updateAudit(id, (current) => {
    if (current.order.status === "paid" || current.order.status === "delivered" || current.order.status === "refunded") {
      return current
    }
    if (DECLINED.has(observed.status)) {
      return {
        ...current,
        order: {
          ...current.order,
          status: "failed",
          chargedCents: null,
          paypalAwaitingWebhook: false,
          failureReason: "PayPal did not capture the payment. The prep pack stays locked.",
        },
      }
    }
    if (amountMismatch) {
      return {
        ...current,
        order: {
          ...current.order,
          paypalAwaitingWebhook: false,
          failureReason: "PayPal reported an amount that does not match this page. The prep pack stays locked.",
        },
      }
    }
    return {
      ...current,
      order: {
        ...current.order,
        status: "pending",
        chargedCents: null,
        paypalCaptureId: observed.captureId ?? current.order.paypalCaptureId,
        paypalAwaitingWebhook: observed.status === "COMPLETED",
        failureReason: undefined,
      },
    }
  })
}
