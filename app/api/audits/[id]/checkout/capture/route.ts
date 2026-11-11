import { orderUnlocksPack } from "@/lib/audit/types"
import { CheckoutError, observePayPalCapture } from "@/lib/paypal/orders"
import { toPublicAudit } from "@/lib/public-view"

export const dynamic = "force-dynamic"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let paypalOrderId = ""
  try {
    const body = (await request.json()) as { paypal_order_id?: string }
    paypalOrderId = body.paypal_order_id ?? ""
  } catch {
    paypalOrderId = ""
  }
  try {
    const audit = await observePayPalCapture(id, paypalOrderId || undefined)
    const view = toPublicAudit(audit)
    return Response.json({
      ...view,
      paid: orderUnlocksPack(audit.order.status),
      awaitingWebhook: Boolean(audit.order.paypalAwaitingWebhook),
    })
  } catch (error) {
    if (error instanceof CheckoutError) {
      return Response.json({ error: { code: "checkout", message: error.message } }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "PayPal capture did not finish."
    return Response.json({ error: { code: "checkout", message } }, { status: 400 })
  }
}
