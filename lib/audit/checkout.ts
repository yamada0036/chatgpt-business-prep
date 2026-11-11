import type { AuditRecord } from "@/lib/audit/types"
import { orderUnlocksPack } from "@/lib/audit/types"
import { incompleteRowCount } from "@/lib/feed/finalize"
import { packScope } from "@/lib/pack/scope"
import { renderPack, packFileList } from "@/lib/pack/render"
import { zipFiles } from "@/lib/pack/zip"
import { quotePrice } from "@/lib/pricing"
import { getConfig } from "@/lib/config"
import { updateAudit, writeVersionFiles } from "@/lib/store/audits"
import { looksLikeEmail } from "@/lib/text"
import { zipFileName } from "@/lib/time"

/**
 * Settlement boundary. A live PayPal order becomes paid only in
 * `fulfillVerifiedCapture`, after the webhook signature, capture id, PayPal
 * order id, amount, and currency have been checked. The return URL and the
 * capture API do not call this. `settleOrder` is the local simulated path and
 * refuses when real checkout is on.
 */
export async function settleOrder(
  id: string,
  action: "pay" | "fail",
  email?: string,
): Promise<AuditRecord> {
  if (!getConfig().allowSimulatedPay) {
    throw new Error("Simulated payment is disabled. Pay with PayPal Checkout. The return URL does not mark an order paid.")
  }
  return updateAudit(id, async (audit) => {
    if (audit.status !== "complete" && audit.status !== "partial") {
      throw new Error("The audit is not finished, so payment cannot start.")
    }
    const nextEmail = email?.trim() || audit.contactEmail
    if (action === "pay" && !looksLikeEmail(nextEmail)) {
      throw new Error("A contact email is required before payment.")
    }
    if (action === "fail") {
      return {
        ...audit,
        contactEmail: nextEmail,
        order: {
          ...audit.order,
          status: "failed",
          chargedCents: null,
          failureReason: "Simulated payment failed (test). Nothing was charged, and no prep pack was created.",
        },
      }
    }
    if (orderUnlocksPack(audit.order.status)) return audit
    const breakdown = quotePrice(audit.feedApplicable ? audit.feedRows.length : 0)
    const paidAt = new Date()
    const withOrder: AuditRecord = {
      ...audit,
      contactEmail: nextEmail,
      order: {
        status: "paid",
        breakdown,
        chargedCents: breakdown.totalCents,
        paidAt: paidAt.toISOString(),
      },
    }
    return publishVersion(withOrder, paidAt)
  })
}

export async function fulfillVerifiedCapture(audit: AuditRecord, captureId: string, when = new Date()): Promise<AuditRecord> {
  const amount = audit.order.paypalAmountCents ?? audit.order.breakdown.totalCents
  const order = { ...audit.order }
  delete order.failureReason
  const withOrder: AuditRecord = {
    ...audit,
    order: {
      ...order,
      status: "paid",
      chargedCents: amount,
      paidAt: when.toISOString(),
      paypalCaptureId: captureId,
      paypalAwaitingWebhook: false,
      settledCaptureIds: [...new Set([...(audit.order.settledCaptureIds ?? []), captureId])],
    },
  }
  return publishVersion(withOrder, when)
}

export function markCaptureRefunded(audit: AuditRecord, captureId: string, when = new Date()): AuditRecord {
  const blocked = new Set(audit.order.blockedCaptureIds ?? [])
  blocked.add(captureId)
  const isCurrent = !audit.order.paypalCaptureId || audit.order.paypalCaptureId === captureId
  const canLock =
    orderUnlocksPack(audit.order.status) || audit.order.status === "pending" || audit.order.status === "failed"
  const lockThisOrder = isCurrent && canLock
  return {
    ...audit,
    order: {
      ...audit.order,
      blockedCaptureIds: [...blocked],
      status: lockThisOrder ? "refunded" : audit.order.status,
      refundedAt: lockThisOrder ? when.toISOString() : audit.order.refundedAt,
      paypalAwaitingWebhook: lockThisOrder ? false : audit.order.paypalAwaitingWebhook,
      failureReason: lockThisOrder
        ? "PayPal refunded or reversed this payment. The prep pack is locked."
        : audit.order.failureReason,
    },
  }
}

export function markCaptureDenied(audit: AuditRecord): AuditRecord {
  if (audit.order.status !== "pending") return audit
  return {
    ...audit,
    order: {
      ...audit.order,
      status: "failed",
      chargedCents: null,
      paypalAwaitingWebhook: false,
      failureReason: "PayPal denied the capture. The prep pack stays locked.",
    },
  }
}

export async function publishVersion(audit: AuditRecord, when = new Date()): Promise<AuditRecord> {
  const version = (audit.versions.at(-1)?.version ?? 0) + 1
  const files = renderPack(audit, version, when)
  const zip = await zipFiles(files)
  await writeVersionFiles(audit.id, version, files, zip)
  const names = packFileList(audit.includeAgentPack)
  const scoped = packScope(audit)
  return {
    ...audit,
    order: { ...audit.order, status: "delivered" },
    versions: [
      ...audit.versions,
      {
        version,
        createdAt: when.toISOString(),
        zipName: zipFileName(audit.storeUrl, when),
        files: names,
        incompleteRowCount: incompleteRowCount(scoped.rows),
      },
    ],
  }
}
