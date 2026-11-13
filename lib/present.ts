import type { AuditRecord } from "@/lib/audit/types"
import { getPublicOffer } from "@/lib/offer"
import { toPublicAudit, type PublicAudit } from "@/lib/public-view"

/** Public audit JSON with the server's current price and trial length. */
export function presentAudit(audit: AuditRecord, now = new Date()): PublicAudit {
  return toPublicAudit(audit, now, getPublicOffer())
}
