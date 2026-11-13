import { getConfig } from "@/lib/config"
import type { Plan, PublicOffer } from "@/lib/plan"
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
  const notForSale =
    "Paid checkout is not available yet. This site does not charge a subscription and does not charge the earlier one-time pack. The paid month after the free trial is not being charged."
  const intended = `The price is a ${days}-day free trial for ${trialPriceLabel}, then ${monthlyPriceLabel} per month. Amounts are in ${config.currency}. The trial is free: no card is required to start it and nothing is charged during the ${days} days. If you do nothing, the trial ends, the prep pack locks again, and nothing is charged. A paid month only starts if you explicitly start it after the trial.`
  const termsGate =
    "Paid monthly billing after the trial is not for sale yet. It will not start until the subscription terms are published and PayPal Subscriptions is wired up, because what a paid period includes, when a later charge would happen, how someone would cancel, and whether any fee is refundable are not decided. The free trial itself does not create a paid subscription."
  const freeTrial = `Free trial: ${days} days, ${trialPriceLabel}. Start with the browser that created the audit — no card, no PayPal payment during the trial. The full prep pack is downloadable during the trial in that browser. When the trial ends, access ends and no charge is made.`
  const plans: Plan[] = [
    {
      id: "free",
      name: "Free",
      headline: "Free trial",
      priceLabel: trialPriceLabel,
      priceCents: config.trialPriceCents,
      currency: config.currency,
      period: ` / ${days} days`,
      cta: `Start ${days}-day free trial`,
      features: [
        `${days}-day free trial — ${trialPriceLabel} during the trial`,
        "No card required to start the trial, no charge during the trial",
        `Full prep pack for ${days} days: readme, claim checklist, profile draft, product-feed CSV + issues file`,
        "Free audit summary and readiness score",
        `First ${included} product rows included`,
        `Ends after ${days} days — nothing is charged, the pack locks again`,
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
        "Everything in the free trial, continued",
        `Full prep pack every month — no ${days}-day limit`,
        "Agent Q&A pack when that box was checked",
        "Fill missing fields and generate a new pack version",
        `First ${included} product rows included. Larger catalogs are capped in the pack and do not add an SKU charge.`,
        "Only if you explicitly start it — doing nothing charges nothing. Paid monthly billing is not for sale yet.",
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
    intro: `Try the full prep pack free for ${days} days — ${trialPriceLabel}, no card, no charge. After that, Pro is ${monthlyPriceLabel} / month, only if you choose to continue. Paid monthly billing is not for sale yet.`,
    footnote: `Free is ${days} days only. After the trial, Pro is ${monthlyPriceLabel} / month — only if you explicitly start the paid subscription. Paid monthly billing is not for sale yet.`,
    notForSale,
    intended,
    termsGate,
    freeTrial,
    plans,
  }
}
