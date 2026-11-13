import { startFreeTrial } from "@/lib/audit/checkout"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { toPublicAudit } from "@/lib/public-view"
import { readAudit } from "@/lib/store/audits"

export const dynamic = "force-dynamic"

/**
 * POST /api/audits/:id/trial — start the 7-day free trial.
 * Body: { contact_email }. Email only. No card, no PayPal, no charge.
 * One trial per audit; an expired trial cannot be restarted.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const existing = await readAudit(id)
  if (!existing) {
    return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  }
  const body = (await request.json().catch(() => ({}))) as { contact_email?: string; email?: string }
  const email = body.contact_email ?? body.email ?? existing.contactEmail
  try {
    const audit = await startFreeTrial(id, email)
    return Response.json(toPublicAudit(audit))
  } catch (error) {
    const message = error instanceof Error ? error.message : "The free trial could not start."
    return Response.json({ error: { code: "trial", message } }, { status: 400 })
  }
}
