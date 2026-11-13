import { CheckoutPanel } from "@/components/checkout-panel"
import { publicCheckoutConfig } from "@/lib/paypal/ready"
import { presentAudit } from "@/lib/present"
import { readAudit } from "@/lib/store/audits"

export const dynamic = "force-dynamic"

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const audit = await readAudit(id)
  return <CheckoutPanel id={id} initialAudit={audit ? presentAudit(audit) : null} initialConfig={publicCheckoutConfig()} />
}
