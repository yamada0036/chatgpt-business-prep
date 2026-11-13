import { canDownloadPack, OWNER_REQUIRED } from "@/lib/access"
import { publishVersion } from "@/lib/audit/checkout"
import { applySupplement } from "@/lib/audit/supplement"
import { orderUnlocksPack, type OrderStatus } from "@/lib/audit/types"
import { ownerTokenMatches, readOwnerToken } from "@/lib/owner"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { presentAudit } from "@/lib/present"
import { readAudit, updateAudit } from "@/lib/store/audits"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const existing = await readAudit(id)
  if (!existing) return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  if (!ownerTokenMatches(existing.ownerSecretHash, readOwnerToken(request, id))) {
    return Response.json({ error: { code: "forbidden", message: OWNER_REQUIRED } }, { status: 403 })
  }
  if (!canDownloadPack(existing)) {
    return Response.json({ error: { code: "unpaid", message: ERROR_MESSAGES.unpaid } }, { status: 403 })
  }
  const body = (await request.json()) as { updates?: { key: string; value: string }[] }
  const updates = Array.isArray(body.updates) ? body.updates : []
  let rejected: { key: string; message: string }[] = []
  let appliedAudit
  try {
    appliedAudit = await updateAudit(id, async (audit) => {
    if (!canDownloadPack(audit)) throw new Error("unpaid")
    const result = applySupplement(audit, updates)
    rejected = result.rejected
    if (result.applied === 0) return audit
    const nextStatus: OrderStatus = orderUnlocksPack(audit.order.status) ? "delivered" : audit.order.status
    return publishVersion(result.audit, new Date(), { orderStatus: nextStatus })
  })
  } catch (error) {
    if (error instanceof Error && error.message === "unpaid") {
      return Response.json({ error: { code: "unpaid", message: ERROR_MESSAGES.unpaid } }, { status: 403 })
    }
    throw error
  }
  return Response.json({ ...presentAudit(appliedAudit), rejected })
}
