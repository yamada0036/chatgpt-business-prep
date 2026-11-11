"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Disclaimer } from "@/components/disclaimer"
import type { PublicAudit } from "@/lib/public-view"

export function CheckoutReturn({ id }: { id: string }) {
  const [audit, setAudit] = useState<PublicAudit | null>(null)
  const [note, setNote] = useState("Waiting for PayPal to confirm the capture.")

  useEffect(() => {
    let stop = false
    async function watch() {
      const capture = await fetch(`/api/audits/${id}/checkout/capture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
      if (!capture.ok) {
        const body = (await capture.json()) as { error?: { message: string } }
        if (!stop) setNote(body.error?.message ?? "PayPal has not confirmed this payment.")
      }
      for (let attempt = 0; attempt < 15 && !stop; attempt += 1) {
        const response = await fetch(`/api/audits/${id}`, { cache: "no-store" })
        const data = (await response.json()) as PublicAudit
        if (stop) return
        if (data.order) setAudit(data)
        if (data.paid) return
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      if (!stop) setNote("This return page does not unlock the pack. It stays locked until a verified PayPal capture webhook arrives.")
    }
    void watch()
    return () => {
      stop = true
    }
  }, [id])

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Back from PayPal</h1>
      <Disclaimer compact />
      <p className="text-sm leading-6">
        Opening this page does not mark the order paid. The prep pack stays locked until PayPal sends a verified capture webhook for the same amount, currency, and order.
      </p>
      {audit?.paid ? (
        <Button asChild><Link href={`/audit/${id}/delivery`}>Download the prep pack</Link></Button>
      ) : (
        <p className="text-sm text-muted-foreground">{note}</p>
      )}
      {audit?.order.failureReason ? <p className="text-sm">{audit.order.failureReason}</p> : null}
    </div>
  )
}
