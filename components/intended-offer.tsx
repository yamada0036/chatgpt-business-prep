import Link from "next/link"
import { OFFER_INTENDED, OFFER_NOT_FOR_SALE, OFFER_TERMS_GATE } from "@/lib/legal/public"

export function IntendedOffer({ showPricingLink = true }: { showPricingLink?: boolean }) {
  return (
    <section className="space-y-2 text-sm leading-6">
      <h2 className="text-xl font-semibold text-foreground">Pricing</h2>
      <p>{OFFER_NOT_FOR_SALE}</p>
      <p>{OFFER_INTENDED}</p>
      <p>{OFFER_TERMS_GATE}</p>
      {showPricingLink ? (
        <p>
          <Link className="underline" href="/pricing">Pricing details</Link>
        </p>
      ) : null}
    </section>
  )
}
