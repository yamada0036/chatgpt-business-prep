import { publishVersion } from "@/lib/audit/checkout"
import { applySupplement } from "@/lib/audit/supplement"
import { orderUnlocksPack } from "@/lib/audit/types"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { toPublicAudit } from "@/lib/public-view"
import { readAudit, updateAudit } from "@/lib/store/audits"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const existing = await readAudit(id)
  if (!existing) return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  if (!orderUnlocksPack(existing.order.status)) {
    return Response.json({ error: { code: "unpaid", message: ERROR_MESSAGES.unpaid } }, { status: 403 })
  }
  const body = (await request.json()) as { updates?: { key: string; value: string }[] }
  const updates = Array.isArray(body.updates) ? body.updates : []
  let rejected: { key: string; message: string }[] = []
  const appliedAudit = await updateAudit(id, async (audit) => {
    const result = applySupplement(audit, updates)
    rejected = result.rejected
    if (result.applied === 0) return audit
    return publishVersion(result.audit)
  })
  return Response.json({ ...toPublicAudit(appliedAudit), rejected })
}
