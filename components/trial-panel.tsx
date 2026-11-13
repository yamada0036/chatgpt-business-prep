"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PublicAudit } from "@/lib/public-view"
import { shanghaiLabel } from "@/lib/time"

/**
 * Start / show the 7-day free trial for one audit.
 * Email only — no card, no PayPal, no charge during the trial.
 */
export function TrialPanel({ id, audit }: { id: string; audit: PublicAudit }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  if (audit.trialStatus === "active" && audit.trial) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Free trial active — {audit.trialDaysLeft} day{audit.trialDaysLeft === 1 ? "" : "s"} left</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6">
          <p>
            Started {shanghaiLabel(new Date(audit.trial.startedAt))}, ends{" "}
            {shanghaiLabel(new Date(audit.trial.endsAt))}. Charged so far: USD 0.00.
          </p>
          <p>
            When the trial ends the prep pack locks again and nothing is charged. A paid month only starts if you
            explicitly start it afterwards.
          </p>
          <Button asChild>
            <a href={`/audit/${id}/delivery`}>Go to delivery</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (audit.trialStatus === "expired") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Free trial ended</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6">
          <p>Your 7-day free trial ended on {audit.trial ? shanghaiLabel(new Date(audit.trial.endsAt)) : ""}. Nothing was charged.</p>
          <p>The trial cannot be restarted on this audit. Paid monthly billing after the trial is not for sale yet.</p>
        </CardContent>
      </Card>
    )
  }

  async function start() {
    setPending(true)
    setError("")
    const response = await fetch(`/api/audits/${id}/trial`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_email: email }),
    })
    const data = (await response.json()) as PublicAudit & { error?: { message: string } }
    setPending(false)
    if (!response.ok) {
      setError(data.error?.message ?? "The free trial could not start.")
      return
    }
    router.push(`/audit/${id}/delivery`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Free trial — 7 days free</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6">
        <p>USD 0.00 during the trial. No card required, no PayPal payment, nothing charged for 7 days.</p>
        <p>The full prep pack downloads during the trial. After 7 days it locks again unless you continue with Pro (USD 49.90 / month, not for sale yet).</p>
        <div className="space-y-2">
          <Label htmlFor="trial_email">Contact email (required to start the trial)</Label>
          <Input
            id="trial_email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@store.example"
          />
          {audit.contactEmail ? <p className="text-muted-foreground">Saved {audit.contactEmail}. Leave this blank to keep it.</p> : null}
        </div>
        {error ? <p className="text-destructive">{error}</p> : null}
        <Button className="h-11" disabled={pending} onClick={start}>
          Start 7-day free trial
        </Button>
      </CardContent>
    </Card>
  )
}
