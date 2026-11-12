import { settleOrder } from "@/lib/audit/checkout"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { toPublicAudit } from "@/lib/public-view"
import { readAudit } from "@/lib/store/audits"

export const dynamic = "force-dynamic"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const existing = await readAudit(id)
  if (!existing) return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  const body = (await request.json()) as { action?: "pay" | "fail"; contact_email?: string }
  if (body.action !== "pay" && body.action !== "fail") {
    return Response.json(
      { error: { code: "action", message: "Choose a successful simulated payment or a failed simulated payment." } },
      { status: 400 },
    )
  }
  try {
    const audit = await settleOrder(id, body.action, body.contact_email)
    return Response.json(toPublicAudit(audit))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment did not finish."
    const status = message.startsWith("Simulated payment is disabled") ? 403 : 400
    return Response.json({ error: { code: "checkout", message } }, { status })
  }
}
