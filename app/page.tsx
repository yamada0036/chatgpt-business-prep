import type { Metadata } from "next"
import { AuditForm } from "@/components/audit-form"
import { Disclaimer } from "@/components/disclaimer"
import { IntendedOffer } from "@/components/intended-offer"
import { WAFFO_VERIFY_CONTENT, WAFFO_VERIFY_NAME } from "@/lib/legal/public"
import { getPublicOffer } from "@/lib/offer"
import { DISCLAIMER_SHORT } from "@/lib/official/spec"
import { showFixtureButtons } from "@/lib/site-mode"

export const metadata: Metadata = {
  other: {
    [WAFFO_VERIFY_NAME]: WAFFO_VERIFY_CONTENT,
  },
}

export default function Home() {
  const offer = getPublicOffer()
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-5">
        <p className="text-sm text-muted-foreground">For stores with a public website, especially United States or cross-border Shopify sellers.</p>
        <h1 className="max-w-xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          See what your store is missing before you claim a ChatGPT business profile.
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted-foreground">
          Paste the store URL, and upload a product sheet if you already have one. The tool only reads public pages and the file you provide, checks them against the official profile fields and required product-feed fields, and starts with a free audit.
        </p>
        <div className="rounded-xl border border-border bg-accent/60 p-4">
          <Disclaimer compact />
        </div>
        <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
          <li>The free page shows a summary and masked samples. It does not download the full CSV or copy the full profile draft.</li>
          <li>You submit any prep materials yourself in Business Hub. This tool does not sign in, claim, or verify.</li>
          <li>Prices, brands, stock, and policies that were not fetched stay blank and are marked as needs input. Nothing is invented.</li>
        </ul>
        <IntendedOffer paragraphs={[offer.notForSale, offer.intended, offer.termsGate]} />
        <p className="sr-only">{DISCLAIMER_SHORT}</p>
      </section>
      <AuditForm showFixtures={showFixtureButtons()} />
    </div>
  )
}
