import type { TrialState } from "@/lib/audit/types"
import { getConfig } from "@/lib/config"
import { formatCents } from "@/lib/pricing"

/**
 * ChatGPT-style plans for Prep: one product, two stages.
 *
 * Free: the 7-day free trial, USD 0.00, no card, no PayPal charge during
 * the trial. Full prep pack for 7 days, then it ends — nothing is charged
 * and the pack locks again.
 *
 * Pro: USD 49.90 / month after the trial — but only if the merchant
 * explicitly starts the paid subscription. This file does NOT auto-charge
 * anyone: there is no PayPal Subscriptions plan, no stored card, and no
 * recurring billing wired up yet.
 *
 * The free audit summary on the homepage stays free to run; it is what
 * the trial starts from. The trial itself is the Free plan.
 *
 * Prices come from env so the offer can be changed without editing code:
 * PREP_TRIAL_DAYS (default 7), PREP_TRIAL_PRICE_CENTS (default 0),
 * PREP_MONTHLY_PRICE_CENTS (default 4990).
 */

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

export function getPlans(): Plan[] {
  const config = getConfig()
  return [
    {
      id: "free",
      name: "Free",
      headline: "Free trial",
      priceLabel: formatCents(config.trialPriceCents, config.currency),
      priceCents: config.trialPriceCents,
      currency: config.currency,
      period: ` / ${config.trialDays} days`,
      cta: `Start ${config.trialDays}-day free trial`,
      features: [
        `${config.trialDays}-day free trial — ${formatCents(config.trialPriceCents, config.currency)} during the trial`,
        "No card required to start the trial, no charge during the trial",
        "Full prep pack for 7 days: readme, claim checklist, profile draft, product-feed CSV + issues file",
        "Free audit summary and readiness score",
        "First 50 product rows included",
        "Ends after 7 days — nothing is charged, the pack locks again",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      headline: "Keep going monthly",
      priceLabel: formatCents(config.monthlyPriceCents, config.currency),
      priceCents: config.monthlyPriceCents,
      currency: config.currency,
      period: "/ month",
      cta: "Continue with Pro",
      features: [
        "Everything in the free trial, continued",
        "Full prep pack every month — no 7-day limit",
        "Agent Q&A pack when that box was checked",
        "Fill missing fields and generate a new pack version",
        "First 50 product rows included; larger catalogs still pay the base price",
        "Only if you explicitly start it — doing nothing charges nothing",
      ],
      recommended: true,
    },
  ]
}

export function trialDays(): number {
  return getConfig().trialDays
}

export function trialPriceLabel(): string {
  const config = getConfig()
  return formatCents(config.trialPriceCents, config.currency)
}

export function monthlyPriceLabel(): string {
  const config = getConfig()
  return formatCents(config.monthlyPriceCents, config.currency)
}

export function trialEndDate(startedAt: string | Date, days = trialDays()): Date {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt)
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
}

export type TrialStatus = "none" | "active" | "expired" | "cancelled"

export function trialStatus(trial: TrialState | undefined, now = new Date()): TrialStatus {
  if (!trial) return "none"
  if (trial.status === "cancelled") return "cancelled"
  return now.getTime() < new Date(trial.endsAt).getTime() ? "active" : "expired"
}

export function isTrialActive(trial: TrialState | undefined, now = new Date()): boolean {
  return trialStatus(trial, now) === "active"
}

/** Whole days left, rounded up so "ends today" still reads as 1 day left until it passes. */
export function trialDaysLeft(trial: TrialState | undefined, now = new Date()): number {
  if (!isTrialActive(trial, now)) return 0
  const msLeft = new Date(trial!.endsAt).getTime() - now.getTime()
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)))
}

/** True when this audit may download the pack right now via its trial. */
export function trialUnlocksPack(trial: TrialState | undefined, now = new Date()): boolean {
  return isTrialActive(trial, now)
}

export function startTrialState(email: string, now = new Date()): TrialState {
  const config = getConfig()
  return {
    status: "active",
    email: email.trim().toLowerCase(),
    startedAt: now.toISOString(),
    endsAt: trialEndDate(now, config.trialDays).toISOString(),
    trialDays: config.trialDays,
    trialPriceCents: config.trialPriceCents,
    monthlyPriceCents: config.monthlyPriceCents,
    currency: config.currency,
    chargedCents: 0,
  }
}
