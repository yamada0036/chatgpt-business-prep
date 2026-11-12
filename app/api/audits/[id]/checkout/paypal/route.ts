import { CheckoutError, createPayPalCheckout } from "@/lib/paypal/orders"
import { requestOrigin } from "@/lib/http/origin"

export const dynamic = "force-dynamic"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let email = ""
  try {
    const body = (await request.json()) as { contact_email?: string }
    email = body.contact_email ?? ""
  } catch {
    email = ""
  }
  try {
    const audit = await createPayPalCheckout({ id, email, origin: requestOrigin(request) })
    return Response.json({
      paypalOrderId: audit.order.paypalOrderId,
      amountCents: audit.order.paypalAmountCents,
      currency: audit.order.paypalCurrency,
    })
  } catch (error) {
    if (error instanceof CheckoutError) {
      return Response.json({ error: { code: "checkout", message: error.message } }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "PayPal checkout did not start."
    return Response.json({ error: { code: "checkout", message } }, { status: 400 })
  }
}
