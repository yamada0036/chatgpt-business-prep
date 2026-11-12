import { applyPayPalWebhook } from "@/lib/paypal/apply"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const rawBody = await request.text()
  const result = await applyPayPalWebhook({ headers: request.headers, rawBody })
  return Response.json(result.body, { status: result.status })
}
