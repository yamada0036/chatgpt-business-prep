"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Plan } from "@/lib/plan"

/**
 * ChatGPT-style pricing: Free vs Pro, side by side, same product in two
 * stages. Prices come from the server offer. Both cards carry the same number of features
 * and their buttons sit at the same height, so neither card looks empty.
 *
 * Starting a trial needs a finished audit, so without an `auditId` both
 * buttons send the visitor to the homepage to run a free audit first.
 * The `auditId` prop is optional: when given, the Free card starts the
 * trial here and the Pro card links to that audit's delivery page.
 * Prices are passed in from the server. This file does not read env or PayPal secrets.
 */
export function PricingCards({
  auditId,
  plans,
  intro,
  footnote,
  trialCanStart,
}: {
  auditId?: string
  plans: Plan[]
  intro: string
  footnote: string
  trialCanStart: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)

  async function startTrial() {
    if (!auditId) return
    setPending(true)
    setMessage("")
    const response = await fetch(`/api/audits/${auditId}/trial`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_email: email }),
    })
    const data = (await response.json()) as { error?: { message: string } }
    setPending(false)
    if (!response.ok) {
      setMessage(data.error?.message ?? "The free trial could not start.")
      return
    }
    router.push(`/audit/${auditId}/delivery`)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Upgrade your plan</h1>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id} className={`flex h-full flex-col ${plan.recommended ? "border-primary shadow-sm" : ""}`}>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between">
                <CardTitle>{plan.name}</CardTitle>
                {plan.recommended ? <Badge>Recommended</Badge> : null}
              </div>
              <p className="text-2xl font-semibold tracking-tight">{plan.headline}</p>
              <p className="text-sm text-muted-foreground">
                {plan.id === "free" ? plan.features[2] : "The full prep pack, ready to submit yourself. Paid checkout is not available yet."}
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col space-y-4">
              <p className="text-3xl font-semibold">
                {plan.priceLabel}
                <span className="text-base font-normal text-muted-foreground">{plan.period}</span>
              </p>
              <ul className="space-y-2 text-sm leading-6">
                {plan.features.map((feature) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
              </ul>
              <div className="mt-auto space-y-2 pt-2">
                {plan.id === "pro" && auditId ? (
                  <>
                    <Button className="h-11 w-full" asChild>
                      <Link href={`/audit/${auditId}/delivery`}>{plan.cta}</Link>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Paid checkout is not available yet. This does not start a charge or a renewal.
                    </p>
                  </>
                ) : plan.id === "pro" ? (
                  <>
                    <Button className="h-11 w-full" asChild>
                      <Link href="/">{plan.cta}</Link>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Run a free audit first. The paid plan cannot be purchased while checkout is off.
                    </p>
                  </>
                ) : auditId ? (
                  <>
                    <Label htmlFor="trial_email">Contact email (to start trial access)</Label>
                    <Input
                      id="trial_email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@store.example"
                    />
                    {message ? <p className="text-sm text-destructive">{message}</p> : null}
                    <Button className="h-11 w-full" variant="outline" disabled={pending || !trialCanStart} onClick={startTrial}>
                      {plan.cta}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {trialCanStart
                        ? "No card required. Nothing is charged during this no-charge access. The download stays in the browser that created the audit."
                        : "This price is not being charged. Paid checkout is off, so the trial cannot start."}
                    </p>
                  </>
                ) : (
                  <>
                    <Button variant="outline" className="h-11 w-full" asChild>
                      <Link href="/">{plan.cta}</Link>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Run a free audit first. The paid trial cannot start while checkout is off.
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {footnote}
      </p>
    </div>
  )
}
