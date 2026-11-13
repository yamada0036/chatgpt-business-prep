import type { Metadata } from "next"
import Link from "next/link"
import { PricingCards } from "@/components/pricing-cards"
import { getPublicOffer } from "@/lib/offer"
import { pageMetadata } from "@/lib/seo"

export async function generateMetadata(): Promise<Metadata> {
  const offer = getPublicOffer()
  return pageMetadata({
    path: "/pricing",
    title: "Pricing · Prep",
    description: `Free audit, or Pro with a ${offer.trialDays}-day free trial (${offer.trialPriceLabel}, no card), then ${offer.monthlyPriceLabel} per month.`,
  })
}

export default function PricingPage() {
  const offer = getPublicOffer()
  return (
    <div className="space-y-6">
      <PricingCards plans={offer.plans} intro={offer.intro} footnote={offer.footnote} trialCanStart={offer.trialCanStart} />
      <p className="text-center text-sm text-muted-foreground">
        Full terms: <Link className="underline" href="/terms">Terms</Link> ·{" "}
        <Link className="underline" href="/privacy">Privacy</Link>
      </p>
    </div>
  )
}
