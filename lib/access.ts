import type { AuditRecord } from "@/lib/audit/types"
import { orderUnlocksPack } from "@/lib/audit/types"
import { isTrialActive } from "@/lib/subscription"

export class TrialError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "TrialError"
    this.status = status
  }
}

export const OWNER_REQUIRED =
  "This browser did not create the audit. The free summary stays visible, and the trial and prep-pack download stay closed. Audits opened from a shared link, or created before owner locking, do not receive a new credential."

/**
 * Download and supplement access. A refunded order locks the pack even if the
 * trial end date is still in the future. Paid checkout is still closed; a
 * paid or delivered order remains the other way in.
 */
export function canDownloadPack(audit: AuditRecord, now = new Date()): boolean {
  if (audit.order.status === "refunded") return false
  if (orderUnlocksPack(audit.order.status)) return true
  return isTrialActive(audit.trial, now)
}
