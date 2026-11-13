import type { TrialTerms } from "@/lib/subscription"

/** Serializable plan card. Safe to pass from a Server Component into a Client Component. */
export type PlanId = "free" | "pro"

export type Plan = {
  id: PlanId
  name: string
  headline: string
  priceLabel: string
  priceCents: number
  currency: string
  period: string
  cta: string
  features: string[]
  recommended?: boolean
}

/** Customer-facing prices and sentences. No secrets. */
export type PublicOffer = TrialTerms & {
  trialPriceLabel: string
  monthlyPriceLabel: string
  includedSkus: number
  trialCanStart: boolean
  paidAvailable: false
  intro: string
  footnote: string
  notForSale: string
  intended: string
  termsGate: string
  freeTrial: string
  plans: Plan[]
}

/** Defaults used only when a caller does not pass a server offer. Routes pass `getPublicOffer()`. */
export function documentedOffer(): PublicOffer {
  const trialPriceLabel = "USD 0.00"
  const monthlyPriceLabel = "USD 49.90"
  const days = 7
  const included = 50
  const notForSale =
    "Paid checkout is not available yet. This site does not charge a subscription and does not charge the earlier one-time pack. The paid month after the free trial is not being charged."
  const intended = `The price is a ${days}-day free trial for ${trialPriceLabel}, then ${monthlyPriceLabel} per month. Amounts are in USD. The trial is free: no card is required to start it and nothing is charged during the ${days} days. If you do nothing, the trial ends, the prep pack locks again, and nothing is charged. A paid month only starts if you explicitly start it after the trial.`
  const termsGate =
    "Paid monthly billing after the trial is not for sale yet. It will not start until the subscription terms are published and PayPal Subscriptions is wired up, because what a paid period includes, when a later charge would happen, how someone would cancel, and whether any fee is refundable are not decided. The free trial itself does not create a paid subscription."
  const freeTrial = `Free trial: ${days} days, ${trialPriceLabel}. Start with the browser that created the audit — no card, no PayPal payment during the trial. The full prep pack is downloadable during the trial in that browser. When the trial ends, access ends and no charge is made.`
  return {
    trialDays: days,
    trialPriceCents: 0,
    monthlyPriceCents: 4990,
    currency: "USD",
    trialPriceLabel,
    monthlyPriceLabel,
    includedSkus: included,
    trialCanStart: true,
    paidAvailable: false,
    intro: `Try the full prep pack free for ${days} days — ${trialPriceLabel}, no card, no charge. After that, Pro is ${monthlyPriceLabel} / month, only if you choose to continue. Paid monthly billing is not for sale yet.`,
    footnote: `Free is ${days} days only. After the trial, Pro is ${monthlyPriceLabel} / month — only if you explicitly start the paid subscription. Paid monthly billing is not for sale yet.`,
    notForSale,
    intended,
    termsGate,
    freeTrial,
    plans: [],
  }
}
