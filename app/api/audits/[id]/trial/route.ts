import { TrialError } from "@/lib/access"
import { startFreeTrial } from "@/lib/audit/checkout"
import { readOwnerToken } from "@/lib/owner"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { presentAudit } from "@/lib/present"
import { readAudit } from "@/lib/store/audits"

export const dynamic = "force-dynamic"

/**
 * POST /api/audits/:id/trial — start the free trial.
 * Body: { contact_email }. A blank email keeps the address already stored on the audit.
 * Requires the owner cookie or x-prep-owner-token from the browser that created the audit.
 * No card, no PayPal, no charge. One trial per audit, per normalized store, and per email string.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const existing = await readAudit(id)
  if (!existing) {
    return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  }
  const body = (await request.json().catch(() => ({}))) as { contact_email?: string; email?: string }
  const typed = (body.contact_email ?? body.email ?? "").trim()
  try {
    const audit = await startFreeTrial(id, typed, readOwnerToken(request, id) ?? "")
    return Response.json(presentAudit(audit))
  } catch (error) {
    const message = error instanceof Error ? error.message : "The free trial could not start."
    const status = error instanceof TrialError ? error.status : 400
    const code = status === 403 ? "forbidden" : status === 409 ? "trial_used" : "trial"
    return Response.json({ error: { code, message } }, { status })
  }
}
