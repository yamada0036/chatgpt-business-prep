import type { AuditRecord } from "@/lib/audit/types"
import { orderUnlocksPack } from "@/lib/audit/types"
import { centsToPayPalValue } from "@/lib/paypal/money"

export type PayPalResource = {
  id?: string
  status?: string
  custom_id?: string
  invoice_id?: string
  amount?: { currency_code?: string; value?: string }
  supplementary_data?: { related_ids?: { order_id?: string } }
  links?: { rel?: string; href?: string }[]
}

export type PayPalEvent = {
  id?: string
  event_type?: string
  resource?: PayPalResource
}

export type PayPalDecision =
  | { action: "fulfill"; captureId: string }
  | { action: "duplicate" }
  | { action: "refund"; captureId: string }
  | { action: "deny" }
  | { action: "reject"; reason: "amount" | "currency" | "order" | "capture" | "resource" }
  | { action: "ignore"; reason: string }

export function captureIdFromRefundLink(resource: PayPalResource): string | null {
  const href = resource.links?.find((link) => link.rel === "up")?.href
  if (!href) return null
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (host !== "paypal.com" && !host.endsWith(".paypal.com")) return null
  const match = /\/captures\/([A-Za-z0-9]+)$/.exec(url.pathname)
  return match?.[1] ?? null
}

function relatedOrderId(resource: PayPalResource): string | undefined {
  const orderId = resource.supplementary_data?.related_ids?.order_id
  return typeof orderId === "string" && orderId.trim() ? orderId : undefined
}

function sameOrder(audit: AuditRecord, resource: PayPalResource): boolean {
  if (resource.custom_id !== audit.id) return false
  const orderId = relatedOrderId(resource)
  if (!audit.order.paypalOrderId || orderId !== audit.order.paypalOrderId) return false
  if (audit.order.paypalInvoiceId && resource.invoice_id !== audit.order.paypalInvoiceId) return false
  return true
}

function amountMatches(audit: AuditRecord, resource: PayPalResource): "ok" | "amount" | "currency" {
  const expectedCents = audit.order.paypalAmountCents ?? audit.order.breakdown.totalCents
  const expectedCurrency = audit.order.paypalCurrency ?? audit.order.breakdown.currency
  if (resource.amount?.currency_code !== expectedCurrency) return "currency"
  if (resource.amount.value !== centsToPayPalValue(expectedCents)) return "amount"
  return "ok"
}

export function decidePayPalEvent(audit: AuditRecord, event: PayPalEvent): PayPalDecision {
  const resource = event.resource
  const type = event.event_type ?? ""
  if (!resource) return { action: "reject", reason: "resource" }

  if (type === "PAYMENT.CAPTURE.REFUNDED" || type === "PAYMENT.CAPTURE.REVERSED") {
    const captureId = type === "PAYMENT.CAPTURE.REFUNDED" ? captureIdFromRefundLink(resource) : resource.id
    if (!captureId) return { action: "reject", reason: "capture" }
    if (resource.custom_id && resource.custom_id !== audit.id) return { action: "reject", reason: "order" }
    const linked =
      resource.custom_id === audit.id ||
      (relatedOrderId(resource) !== undefined && relatedOrderId(resource) === audit.order.paypalOrderId) ||
      captureId === audit.order.paypalCaptureId ||
      Boolean(audit.order.settledCaptureIds?.includes(captureId)) ||
      Boolean(audit.order.blockedCaptureIds?.includes(captureId))
    if (!linked) return { action: "reject", reason: "order" }
    return { action: "refund", captureId }
  }

  if (type === "PAYMENT.CAPTURE.DENIED") {
    if (!sameOrder(audit, resource)) return { action: "reject", reason: "order" }
    if (audit.order.status !== "pending") return { action: "ignore", reason: "denied" }
    return { action: "deny" }
  }

  if (type === "PAYMENT.CAPTURE.PENDING") {
    return { action: "ignore", reason: "pending" }
  }

  if (type !== "PAYMENT.CAPTURE.COMPLETED") return { action: "ignore", reason: "event" }
  if (resource.status !== "COMPLETED") return { action: "ignore", reason: "pending" }
  if (!resource.id) return { action: "reject", reason: "capture" }
  if (!sameOrder(audit, resource)) return { action: "reject", reason: "order" }
  const amount = amountMatches(audit, resource)
  if (amount !== "ok") return { action: "reject", reason: amount }

  if (audit.order.blockedCaptureIds?.includes(resource.id)) return { action: "refund", captureId: resource.id }
  if (audit.order.settledCaptureIds?.includes(resource.id)) return { action: "duplicate" }
  if (orderUnlocksPack(audit.order.status)) return { action: "duplicate" }
  if (audit.order.status === "refunded" && audit.order.paypalCaptureId === resource.id) return { action: "duplicate" }
  if (audit.order.status !== "pending" && audit.order.status !== "failed") return { action: "ignore", reason: "status" }
  return { action: "fulfill", captureId: resource.id }
}
