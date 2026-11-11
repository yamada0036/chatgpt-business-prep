import { withQuote } from "@/lib/audit/compose"
import { isAuditRunning } from "@/lib/audit/run"
import { toPublicAudit } from "@/lib/public-view"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { readAudit, updateAudit } from "@/lib/store/audits"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let audit = await readAudit(id)
  if (!audit) return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  if (audit.status === "running" && !isAuditRunning(audit.id) && Date.now() - Date.parse(audit.createdAt) > 20_000) {
    audit = await updateAudit(audit.id, (current) => ({
      ...current,
      status: "error",
      error: { code: "interrupted", message: "The audit was interrupted. You can retry, and pages that were fetched will be fetched again." },
    }))
  }
  if (audit.order.status === "pending" && !audit.order.paypalOrderId) {
    const quoted = withQuote(audit)
    if (JSON.stringify(quoted.order.breakdown) !== JSON.stringify(audit.order.breakdown)) {
      audit = await updateAudit(audit.id, (current) => withQuote(current))
    }
  }
  return Response.json(toPublicAudit(audit))
}
