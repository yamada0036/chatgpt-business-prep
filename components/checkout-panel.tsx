"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Disclaimer } from "@/components/disclaimer"
import type { PublicAudit } from "@/lib/public-view"

const ORDER_LABEL = { pending: "Pending payment", paid: "Paid", delivered: "Delivered", failed: "Failed" } as const

function money(cents: number, currency: string): string {
  const abs = Math.abs(cents)
  return `${cents < 0 ? "-" : ""}${currency} ${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

export function CheckoutPanel({ id }: { id: string }) {
  const router = useRouter()
  const [audit, setAudit] = useState<PublicAudit | null>(null)
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    void fetch(`/api/audits/${id}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: PublicAudit) => setAudit(data))
  }, [id])

  if (!audit) return <p className="text-sm text-muted-foreground">Loading the order…</p>
  if (audit.status !== "complete" && audit.status !== "partial" && audit.order.status === "pending") {
    return <p className="text-sm">The audit is not finished, so payment is not open yet.</p>
  }
  const quote = audit.order.breakdown
  const shown = money(quote.totalCents, quote.currency)

  async function pay(action: "pay" | "fail") {
    setPending(true)
    setError("")
    const response = await fetch(`/api/audits/${id}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, contact_email: email }),
    })
    const data = (await response.json()) as PublicAudit & { error?: { message: string } }
    setPending(false)
    if (!response.ok) {
      setError(data.error?.message ?? "Payment did not finish.")
      return
    }
    if (action === "pay") router.push(`/audit/${id}/delivery`)
    else setAudit(data)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">One-store prep pack</h1>
      <Disclaimer compact />
      <Card>
        <CardHeader>
          <CardTitle>Amount due {shown}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6">
          <p>Order status: {ORDER_LABEL[audit.order.status]}</p>
          <p>{quote.priceEnvSet ? "The amount comes from PREP_BASE_PRICE_CENTS and the overage settings." : "A live price is not configured, so the amount is 0 and only checks the payment gate."} This is a test configuration, not a decided live price.</p>
          <p>Base pack {money(quote.baseCents, quote.currency)}, including {quote.includedSkus} rows. This order counts {quote.rowCount} rows, {quote.overageBlocks} extra blocks × {money(quote.blockPriceCents, quote.currency)}, overage {money(quote.overageCents, quote.currency)}.</p>
          <p>Simulated payment records the same amount as the total above. This page does not collect card numbers.</p>
          {audit.order.failureReason ? <p>{audit.order.failureReason}</p> : null}
          {audit.order.status === "delivered" ? (
            <Button asChild><a href={`/audit/${id}/delivery`}>Go to delivery</a></Button>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="contact_email">Contact email (required before payment)</Label>
                <Input id="contact_email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@store.example" />
                {audit.contactEmail ? <p className="text-muted-foreground">Saved {audit.contactEmail}. Leave this blank to keep it.</p> : null}
              </div>
              {error ? <p className="text-destructive">{error}</p> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="h-11" disabled={pending} onClick={() => pay("pay")}>Confirm simulated payment (test)</Button>
                <Button variant="outline" disabled={pending} onClick={() => pay("fail")}>Simulate a failed payment (test)</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {audit.order.status === "failed" ? (
        <Alert>
          <AlertTitle>Failed</AlertTitle>
          <AlertDescription>Delivery did not open. You can retry with a successful simulated payment.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
