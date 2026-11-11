import { publicCheckoutConfig } from "@/lib/paypal/ready"

export const dynamic = "force-dynamic"

export function GET() {
  return Response.json(publicCheckoutConfig())
}
