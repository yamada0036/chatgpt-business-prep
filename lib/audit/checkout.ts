import type { AuditRecord, OrderStatus } from "@/lib/audit/types"
import { orderUnlocksPack } from "@/lib/audit/types"
import { OWNER_REQUIRED, TrialError } from "@/lib/access"
import { incompleteRowCount } from "@/lib/feed/finalize"
import { packScope } from "@/lib/pack/scope"
import { renderPack, packFileList } from "@/lib/pack/render"
import { zipFiles } from "@/lib/pack/zip"
import { quotePrice } from "@/lib/pricing"
import { getConfig } from "@/lib/config"
import { getPublicOffer } from "@/lib/offer"
import { ownerTokenMatches } from "@/lib/owner"
import { claimTrialSlot, releaseTrialSlot, updateAudit, writeVersionFiles } from "@/lib/store/audits"
import { looksLikeEmail } from "@/lib/text"
import { emailTrialSlot, siteTrialSlot } from "@/lib/trial-slots"
import { zipFileName } from "@/lib/time"
import { isTrialActive, startTrialState } from "@/lib/subscription"

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
  void id
  void action
  void email
  throw new Error("Paid checkout is not available. No charge is created.")
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

/**
 * Start the 7-day free trial for one audit. Email only — no card, no
 * PayPal order, no charge (chargedCents stays 0). One trial per audit:
 * a second start is refused, and an expired trial cannot be restarted
 * on the same audit. The trial unlocks the pack by publishing version 1;
 * after `endsAt` the download route locks it again.
 */
export async function startFreeTrial(
  id: string,
  email: string,
  ownerToken: string,
  now = new Date(),
): Promise<AuditRecord> {
  const offer = getPublicOffer()
  if (!offer.trialCanStart) {
    throw new TrialError("The free trial cannot start while its configured price is not zero. Paid checkout is not available, so nothing was charged.")
  }
  return updateAudit(id, async (audit) => {
    if (!ownerTokenMatches(audit.ownerSecretHash, ownerToken)) throw new TrialError(OWNER_REQUIRED, 403)
    if (audit.status !== "complete" && audit.status !== "partial") {
      throw new TrialError("The audit is not finished, so the free trial cannot start yet.")
    }
    if (audit.order.status === "refunded") {
      throw new TrialError("This payment was refunded. The free trial cannot start.", 403)
    }
    if (orderUnlocksPack(audit.order.status)) return audit
    if (audit.trial && isTrialActive(audit.trial, now)) return audit
    if (audit.trial) {
      throw new TrialError("This audit already used its one free trial. The trial cannot be restarted.", 409)
    }
    const nextEmail = email?.trim() || audit.contactEmail.trim()
    if (!nextEmail || !looksLikeEmail(nextEmail)) {
      throw new TrialError("A contact email is required to start the free trial.")
    }
    const siteSlot = siteTrialSlot(audit.storeUrl)
    const emailSlot = emailTrialSlot(nextEmail)
    if ((await claimTrialSlot(siteSlot, audit.id)) === "conflict") {
      throw new TrialError("This store already used its one free trial.", 409)
    }
    if ((await claimTrialSlot(emailSlot, audit.id)) === "conflict") {
      await releaseTrialSlot(siteSlot, audit.id)
      throw new TrialError("This email already used its one free trial.", 409)
    }
    const withTrial: AuditRecord = {
      ...audit,
      contactEmail: nextEmail,
      trial: startTrialState(nextEmail, offer, now),
    }
    // A trial is not a payment. Keep the order pending so expiry can lock the pack.
    return publishVersion(withTrial, now, { orderStatus: "pending" })
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
  const trial =
    lockThisOrder && audit.trial && audit.trial.status !== "cancelled"
      ? { ...audit.trial, status: "cancelled" as const, cancelledAt: when.toISOString() }
      : audit.trial
  return {
    ...audit,
    trial,
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

export async function publishVersion(
  audit: AuditRecord,
  when = new Date(),
  options?: { orderStatus?: OrderStatus },
): Promise<AuditRecord> {
  const version = (audit.versions.at(-1)?.version ?? 0) + 1
  const files = renderPack(audit, version, when)
  const zip = await zipFiles(files)
  await writeVersionFiles(audit.id, version, files, zip)
  const names = packFileList(audit.includeAgentPack)
  const scoped = packScope(audit)
  return {
    ...audit,
    order: { ...audit.order, status: options?.orderStatus ?? "delivered" },
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
