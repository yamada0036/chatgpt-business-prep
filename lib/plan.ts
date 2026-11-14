import { SUPPORT_EMAIL } from "@/lib/legal/public"
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

export type BillingSentences = {
  notForSale: string
  intended: string
  termsGate: string
  freeTrial: string
  intro: string
  footnote: string
}

/** Published price and refund rules. Checkout being off is stated separately inside these sentences. */
export function billingSentences(input: {
  days: number
  trialPriceLabel: string
  monthlyPriceLabel: string
  currency: string
}): BillingSentences {
  const { days, trialPriceLabel, monthlyPriceLabel, currency } = input
  return {
    notForSale:
      "Paid checkout is not available yet. This site does not charge a subscription and does not charge the earlier one-time pack. The trial fee and the monthly fee are not being charged.",
    intended: `The published price is a ${days}-day trial for ${trialPriceLabel}, then ${monthlyPriceLabel} per month. Amounts are in ${currency}. After the trial, the monthly fee renews automatically unless you cancel. Because paid checkout is not available, that charge and that renewal do not run on this site today.`,
    termsGate: `You may request a refund within 7 days after each charge. That request covers the ${trialPriceLabel} trial fee and each ${monthlyPriceLabel} monthly fee. Send a refund or cancellation request to ${SUPPORT_EMAIL}. Cancellation stops the next renewal. It does not by itself refund a charge already made. If a charge is not refunded, paid access continues until the end of that paid period. A refund right that applicable law already gives you is unaffected.`,
    freeTrial: `The ${days}-day trial is ${trialPriceLabel}, then ${monthlyPriceLabel} per month. The monthly fee renews automatically unless you cancel. Paid checkout is not available, so this site does not collect that trial fee or start that renewal.`,
    intro: `A ${days}-day trial is ${trialPriceLabel}, then ${monthlyPriceLabel} per month. The monthly fee renews automatically unless you cancel. Paid checkout is not available, so nothing is being charged.`,
    footnote: `A refund may be requested within 7 days after each charge, for the ${trialPriceLabel} trial fee and for each ${monthlyPriceLabel} monthly fee. Send a refund or cancellation request to ${SUPPORT_EMAIL}. Cancellation stops the next renewal. If a charge is not refunded, paid access continues until the end of that paid period. A refund right that applicable law already gives you is unaffected. Paid checkout is not available yet.`,
  }
}

/** Defaults used only when a caller does not pass a server offer. Routes pass `getPublicOffer()`. */
export function documentedOffer(): PublicOffer {
  const trialPriceLabel = "USD 9.90"
  const monthlyPriceLabel = "USD 49.90"
  const days = 7
  const included = 50
  const copy = billingSentences({ days, trialPriceLabel, monthlyPriceLabel, currency: "USD" })
  return {
    trialDays: days,
    trialPriceCents: 990,
    monthlyPriceCents: 4990,
    currency: "USD",
    trialPriceLabel,
    monthlyPriceLabel,
    includedSkus: included,
    trialCanStart: false,
    paidAvailable: false,
    ...copy,
    plans: [],
  }
}
