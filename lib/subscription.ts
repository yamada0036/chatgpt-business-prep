import type { TrialState } from "@/lib/audit/types"

/**
 * Trial state for one audit. Prices and the length are passed in from the
 * server offer so this module does not read environment variables or PayPal
 * secrets. Nothing here creates a charge or a PayPal subscription.
 *
 * Free: USD 0.00 while PREP_TRIAL_PRICE_CENTS stays 0, no card, full pack
 * until `endsAt`, then it locks. Pro: the monthly price shown after the
 * trial. Paid monthly billing is not wired up.
 */

export type TrialTerms = {
  trialDays: number
  trialPriceCents: number
  monthlyPriceCents: number
  currency: string
}

export type TrialStatus = "none" | "active" | "expired" | "cancelled"

export function trialEndDate(startedAt: string | Date, days: number): Date {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt)
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
}

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
  if (!isTrialActive(trial, now) || !trial) return 0
  const msLeft = new Date(trial.endsAt).getTime() - now.getTime()
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)))
}

export function startTrialState(email: string, terms: TrialTerms, now = new Date()): TrialState {
  return {
    status: "active",
    email: email.trim().toLowerCase(),
    startedAt: now.toISOString(),
    endsAt: trialEndDate(now, terms.trialDays).toISOString(),
    trialDays: terms.trialDays,
    trialPriceCents: terms.trialPriceCents,
    monthlyPriceCents: terms.monthlyPriceCents,
    currency: terms.currency,
    chargedCents: 0,
  }
}
