import { decidePayPalEvent, captureIdFromRefundLink, type PayPalEvent } from "@/lib/paypal/decide"
import { fulfillVerifiedCapture, markCaptureDenied, markCaptureRefunded } from "@/lib/audit/checkout"
import { orderUnlocksPack } from "@/lib/audit/types"
import {
  isPayPalCertUrl,
  readPayPalSignatureHeaders,
  verifyPayPalWebhook,
} from "@/lib/paypal/client"
import { paypalClientId, paypalClientSecret, paypalWebhookId } from "@/lib/site-mode"
import { auditIdForCapture, logEvent, readAudit, rememberCapture, updateAudit } from "@/lib/store/audits"

export type WebhookResult = { status: number; body: Record<string, unknown> }

function captureHint(event: PayPalEvent): string | null {
  const resource = event.resource
  if (!resource) return null
  if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") return captureIdFromRefundLink(resource)
  return resource.id ?? null
}

export async function applyPayPalWebhook(input: { headers: Headers; rawBody: string }): Promise<WebhookResult> {
  if (!paypalClientId() || !paypalClientSecret() || !paypalWebhookId()) {
    return { status: 503, body: { fulfilled: false, reason: "config" } }
  }
  if (input.rawBody.length > 1_000_000) return { status: 400, body: { fulfilled: false, reason: "body" } }
  const signature = readPayPalSignatureHeaders(input.headers)
  if (!signature) return { status: 400, body: { fulfilled: false, reason: "signature" } }
  if (!isPayPalCertUrl(signature.certUrl)) {
    logEvent("paypal_webhook_rejected", { reason: "cert_url" })
    return { status: 400, body: { fulfilled: false, reason: "signature" } }
  }
  let event: PayPalEvent
  try {
    event = JSON.parse(input.rawBody) as PayPalEvent
  } catch {
    return { status: 400, body: { fulfilled: false, reason: "body" } }
  }
  const verified = await verifyPayPalWebhook({ headers: signature, event })
  if (!verified) {
    logEvent("paypal_webhook_rejected", { reason: "signature" })
    return { status: 400, body: { fulfilled: false, reason: "signature" } }
  }

  const customId = event.resource?.custom_id
  const hintedCapture = captureHint(event)
  const auditId = customId || (hintedCapture ? await auditIdForCapture(hintedCapture) : null)
  if (!auditId) return { status: 200, body: { fulfilled: false, reason: "order" } }
  const existing = await readAudit(auditId)
  if (!existing) return { status: 200, body: { fulfilled: false, reason: "order" } }

  const decision = decidePayPalEvent(existing, event)
  if (decision.action === "reject" || decision.action === "ignore") {
    logEvent("paypal_webhook_ignored", { id: existing.id, reason: decision.reason })
    return { status: 200, body: { fulfilled: false, reason: decision.reason } }
  }

  const before = existing.versions.length
  const updated = await updateAudit(existing.id, async (current) => {
    const again = decidePayPalEvent(current, event)
    if (again.action === "fulfill") {
      if (current.order.blockedCaptureIds?.includes(again.captureId)) return markCaptureRefunded(current, again.captureId)
      await rememberCapture(again.captureId, current.id)
      return fulfillVerifiedCapture(current, again.captureId)
    }
    if (again.action === "refund") {
      await rememberCapture(again.captureId, current.id)
      return markCaptureRefunded(current, again.captureId)
    }
    if (again.action === "deny") return markCaptureDenied(current)
    return current
  })
  const fulfilled = orderUnlocksPack(updated.order.status) && updated.versions.length > before
  if (fulfilled) {
    logEvent("paypal_fulfilled", {
      id: updated.id,
      cents: updated.order.chargedCents ?? undefined,
      currency: updated.order.paypalCurrency,
    })
  }
  return {
    status: 200,
    body: {
      fulfilled,
      duplicate: decision.action === "duplicate" || (decision.action === "fulfill" && !fulfilled && orderUnlocksPack(updated.order.status)),
      status: updated.order.status,
      reason: decision.action,
    },
  }
}
