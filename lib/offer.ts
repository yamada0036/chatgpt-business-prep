import { getConfig } from "@/lib/config"
import { billingSentences, type Plan, type PublicOffer } from "@/lib/plan"
import { formatCents } from "@/lib/pricing"

/**
 * Server-only customer copy. Import this from Server Components and route
 * handlers. Client Components must receive the returned object as props or
 * JSON. This module reaches PayPal-related config through `getConfig` and
 * must not be imported by a Client Component.
 */
export type { PublicOffer }

export function getPublicOffer(): PublicOffer {
  const config = getConfig()
  const trialPriceLabel = formatCents(config.trialPriceCents, config.currency)
  const monthlyPriceLabel = formatCents(config.monthlyPriceCents, config.currency)
  const days = config.trialDays
  const included = config.includedSkus
  const copy = billingSentences({
    days,
    trialPriceLabel,
    monthlyPriceLabel,
    currency: config.currency,
  })
  const plans: Plan[] = [
    {
      id: "free",
      name: config.trialPriceCents === 0 ? "Free" : "Trial",
      headline: config.trialPriceCents === 0 ? "Free trial" : `${days}-day trial`,
      priceLabel: trialPriceLabel,
      priceCents: config.trialPriceCents,
      currency: config.currency,
      period: ` / ${days} days`,
      cta: config.trialPriceCents === 0 ? `Start ${days}-day free trial` : `Start ${days}-day trial`,
      features:
        config.trialPriceCents === 0
          ? [
              `${days}-day free trial — ${trialPriceLabel} during the trial`,
              "No card required to start the trial, no charge during the trial",
              `Full prep pack for ${days} days: readme, claim checklist, profile draft, product-feed CSV + issues file`,
              "Free audit summary and readiness score",
              `First ${included} product rows included`,
              `Ends after ${days} days — nothing is charged, the pack locks again`,
            ]
          : [
              `${days}-day trial for ${trialPriceLabel}`,
              `Then ${monthlyPriceLabel} per month, renewing automatically unless you cancel`,
              `Full prep pack for ${days} days: readme, claim checklist, profile draft, product-feed CSV + issues file`,
              "Free audit summary and readiness score",
              `First ${included} product rows included`,
              "Paid checkout is not available, so this price is not being charged",
            ],
    },
    {
      id: "pro",
      name: "Pro",
      headline: "Keep going monthly",
      priceLabel: monthlyPriceLabel,
      priceCents: config.monthlyPriceCents,
      currency: config.currency,
      period: "/ month",
      cta: "Continue with Pro",
      features: [
        config.trialPriceCents === 0 ? "Everything in the free trial, continued" : "Everything in the trial, continued",
        `Full prep pack every month — no ${days}-day limit`,
        "Agent Q&A pack when that box was checked",
        "Fill missing fields and generate a new pack version",
        `First ${included} product rows included. Larger catalogs are capped in the pack and do not add an SKU charge.`,
        config.trialPriceCents === 0
          ? "Only if you explicitly start it — doing nothing charges nothing. Paid monthly billing is not for sale yet."
          : `Renews automatically at ${monthlyPriceLabel} per month unless you cancel. Paid checkout is not available, so this is not being charged.`,
      ],
      recommended: true,
    },
  ]
  return {
    trialDays: days,
    trialPriceCents: config.trialPriceCents,
    monthlyPriceCents: config.monthlyPriceCents,
    currency: config.currency,
    trialPriceLabel,
    monthlyPriceLabel,
    includedSkus: included,
    trialCanStart: config.trialPriceCents === 0,
    paidAvailable: false,
    ...copy,
    plans,
  }
}
