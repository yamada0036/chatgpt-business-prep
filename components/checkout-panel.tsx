"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Disclaimer } from "@/components/disclaimer"
import { PayPalButtons } from "@/components/paypal-buttons"
import type { PublicAudit } from "@/lib/public-view"

type CheckoutConfig = {
  checkoutMode: "simulated" | "paypal"
  paypalClientId: string
  currency: string
  paypalEnv: "sandbox" | "live"
  showSimulatedPay: boolean
  ready: boolean
  blocker: string
}

const ORDER_LABEL = {
  pending: "Pending payment",
  paid: "Paid",
  delivered: "Delivered",
  failed: "Failed",
  refunded: "Refunded",
} as const

function money(cents: number, currency: string): string {
  const abs = Math.abs(cents)
  return `${cents < 0 ? "-" : ""}${currency} ${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

export function CheckoutPanel({
  id,
  initialAudit,
  initialConfig,
}: {
  id: string
  initialAudit: PublicAudit | null
  initialConfig: CheckoutConfig
}) {
  const router = useRouter()
  const [audit, setAudit] = useState<PublicAudit | null>(initialAudit)
  const [config, setConfig] = useState<CheckoutConfig | null>(initialConfig)
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const load = useCallback(() => {
    return Promise.all([
      fetch(`/api/audits/${id}`, { cache: "no-store" }).then((response) => response.json() as Promise<PublicAudit>),
      fetch("/api/checkout/config", { cache: "no-store" }).then((response) => response.json() as Promise<CheckoutConfig>),
    ]).then(([nextAudit, nextConfig]) => {
      setAudit(nextAudit)
      setConfig(nextConfig)
    })
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const reportError = useCallback((message: string) => setError(message), [])
  const awaitWebhook = useCallback(() => {
    router.push(`/audit/${id}/checkout/return`)
  }, [id, router])

  if (!audit || !config) return <p className="text-sm text-muted-foreground">Loading the order…</p>
  if (!audit.order) return <p className="text-sm">This order could not be loaded.</p>
  if (audit.status !== "complete" && audit.status !== "partial" && audit.order.status === "pending") {
    return <p className="text-sm">The audit is not finished, so payment is not open yet.</p>
  }
  const quote = audit.order.breakdown
  const shown = money(quote.totalCents, quote.currency)
  const paypal = config.checkoutMode === "paypal"

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
          <p>
            {quote.priceEnvSet
              ? "PayPal charges this same amount. The figure on this page is the amount sent to PayPal."
              : "A live price is not configured, so checkout cannot charge this order."}
            {" "}This page does not collect card numbers, bank details, or a PayPal password.
          </p>
          <p>
            Base pack {money(quote.baseCents, quote.currency)}, including {quote.includedSkus} product rows. This order counts {quote.rowCount} rows.
          </p>
          {audit.skuCapNote ? <p>{audit.skuCapNote}</p> : null}
          {audit.order.failureReason ? <p>{audit.order.failureReason}</p> : null}
          {audit.order.status === "delivered" || audit.order.status === "paid" ? (
            <Button asChild><a href={`/audit/${id}/delivery`}>Go to delivery</a></Button>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="contact_email">Contact email (required before payment)</Label>
                <Input id="contact_email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@store.example" />
                {audit.contactEmail ? <p className="text-muted-foreground">Saved {audit.contactEmail}. Leave this blank to keep it.</p> : null}
              </div>
              {error ? <p className="text-destructive">{error}</p> : null}
              {paypal && config.ready && config.paypalClientId ? (
                <div className="space-y-2">
                  <p>You pay on PayPal. Approving the payment does not unlock the pack until PayPal confirms the capture.</p>
                  {config.paypalEnv === "sandbox" ? <p className="text-muted-foreground">Sandbox mode. No live charge is sent to a live PayPal account.</p> : null}
                  <PayPalButtons
                    id={id}
                    clientId={config.paypalClientId}
                    currency={quote.currency}
                    email={email}
                    amountCents={quote.totalCents}
                    onAwaitingWebhook={awaitWebhook}
                    onError={reportError}
                  />
                </div>
              ) : null}
              {paypal && !config.ready ? <p className="text-destructive">{config.blocker}</p> : null}
              {!paypal && config.showSimulatedPay ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="h-11" disabled={pending} onClick={() => pay("pay")}>Confirm simulated payment (test)</Button>
                  <Button variant="outline" disabled={pending} onClick={() => pay("fail")}>Simulate a failed payment (test)</Button>
                </div>
              ) : null}
              {!paypal && !config.showSimulatedPay ? (
                <p className="text-destructive">PayPal Checkout is not configured, so payment cannot start.</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      {audit.order.status === "failed" ? (
        <Alert>
          <AlertTitle>Failed</AlertTitle>
          <AlertDescription>Delivery did not open. You can try payment again.</AlertDescription>
        </Alert>
      ) : null}
      {audit.order.status === "refunded" ? (
        <Alert>
          <AlertTitle>Refunded</AlertTitle>
          <AlertDescription>This payment was refunded or reversed. The prep pack is locked.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
