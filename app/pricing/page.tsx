import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal-document"
import { PRICING_SECTIONS } from "@/lib/legal/public"

export const metadata: Metadata = {
  title: "Pricing · Prep",
  description: "The intended subscription price is not being charged. Paid checkout is not available.",
}

export default function PricingPage() {
  return <LegalDocument title="Pricing" sections={PRICING_SECTIONS} />
}
