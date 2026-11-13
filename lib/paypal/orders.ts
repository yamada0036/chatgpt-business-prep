import type { AuditRecord } from "@/lib/audit/types"
import { PayPalError, capturePayPalOrder as captureRemoteOrder } from "@/lib/paypal/client"
import { payPalValueToCents } from "@/lib/paypal/money"
import { logEvent, readAudit, rememberCapture, updateAudit } from "@/lib/store/audits"

export class CheckoutError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "CheckoutError"
    this.status = status
  }
}

export async function createPayPalCheckout(input: {
  id: string
  email?: string
  origin: string
}): Promise<AuditRecord> {
  void input
  throw new CheckoutError("Paid checkout is not available. No PayPal order is created.", 403)
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
