import { CheckoutPanel } from "@/components/checkout-panel"
import { publicCheckoutConfig } from "@/lib/paypal/ready"
import { toPublicAudit } from "@/lib/public-view"
import { readAudit } from "@/lib/store/audits"

export const dynamic = "force-dynamic"

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const audit = await readAudit(id)
  return <CheckoutPanel id={id} initialAudit={audit ? toPublicAudit(audit) : null} initialConfig={publicCheckoutConfig()} />
}
