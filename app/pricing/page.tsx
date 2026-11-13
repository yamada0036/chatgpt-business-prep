import type { Metadata } from "next"
import Link from "next/link"
import { PricingCards } from "@/components/pricing-cards"

export const metadata: Metadata = {
  title: "Pricing · Prep",
  description: "Free audit, or Pro with a 7-day free trial (USD 0.00, no card), then USD 49.90 per month.",
}

export default function PricingPage() {
  return (
    <div className="space-y-6">
      <PricingCards />
      <p className="text-center text-sm text-muted-foreground">
        Full terms: <Link className="underline" href="/terms">Terms</Link> ·{" "}
        <Link className="underline" href="/privacy">Privacy</Link>
      </p>
    </div>
  )
}
