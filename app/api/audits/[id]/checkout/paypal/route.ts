export const dynamic = "force-dynamic"

export async function POST() {
  return Response.json(
    { error: { code: "checkout", message: "Paid checkout is not available. No PayPal order is created." } },
    { status: 403 },
  )
}
