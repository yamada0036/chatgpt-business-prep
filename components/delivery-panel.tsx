"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Disclaimer } from "@/components/disclaimer"
import type { PublicAudit } from "@/lib/public-view"
import { RETENTION_FACT } from "@/lib/legal/public"
import { shanghaiLabel } from "@/lib/time"

const ORDER_LABEL = { pending: "Pending payment", paid: "Paid", delivered: "Delivered", failed: "Failed", refunded: "Refunded" } as const

export function DeliveryPanel({ id }: { id: string }) {
  const [audit, setAudit] = useState<PublicAudit | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")

  useEffect(() => {
    let ignore = false
    fetch(`/api/audits/${id}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: PublicAudit) => {
        if (!ignore) setAudit(data)
      })
    return () => {
      ignore = true
    }
  }, [id])

  if (!audit) return <p className="text-sm text-muted-foreground">Opening the delivery page…</p>
  if (!audit.paid) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">Delivery is still locked</h1>
        <p className="text-sm">
          {audit.order.status === "refunded"
            ? "This payment was refunded or reversed. The prep pack is not available for download."
            : audit.trialStatus === "expired"
              ? "Your 7-day free trial ended. Nothing was charged. The prep pack is locked again."
              : "The full prep pack downloads during a 7-day free trial (USD 0.00, no card) or after a verified payment."}
        </p>
        <Button asChild><Link href={`/audit/${id}/checkout`}>Go to payment</Link></Button>
      </div>
    )
  }

  const latest = audit.versions.at(-1)

  async function supplement() {
    const updates = Object.entries(values)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => ({ key, value }))
    const response = await fetch(`/api/audits/${id}/supplement`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ updates }),
    })
    const data = (await response.json()) as PublicAudit & { error?: { message: string }; rejected?: { message: string }[] }
    if (!response.ok) {
      setMessage(data.error?.message ?? "A new version was not created.")
      return
    }
    setMessage(data.rejected?.length ? data.rejected.map((item) => item.message).join(" ") : "A new version was created. Older versions can still be downloaded.")
    setValues({})
    setAudit(data)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Prep pack</h1>
        <p className="text-sm text-muted-foreground break-all">{audit.storeUrl}</p>
        <p className="text-sm">Order status: {ORDER_LABEL[audit.order.status]}. This audit expires at {audit.expiresAt}. {RETENTION_FACT}</p>
        {audit.skuCapNote ? <p className="text-sm">{audit.skuCapNote}</p> : null}
        <Disclaimer compact />
      </div>
      {audit.incompleteRowCount > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>{audit.incompleteRowCount} rows still lack required fields</AlertTitle>
          <AlertDescription>Those rows may be rejected if you upload them as they are. Empty cells were not filled with invented values.</AlertDescription>
        </Alert>
      ) : null}
      <section className="space-y-3">
        {audit.versions.map((version) => (
          <Card key={version.version}>
            <CardHeader>
              <CardTitle>Version {version.version}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Generated: {shanghaiLabel(new Date(version.createdAt))}</p>
              <p>Store: {audit.storeUrl}</p>
              <p>File name: {version.zipName}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button asChild><a href={`/api/audits/${id}/download?version=${version.version}`}>Download the ZIP</a></Button>
                {version.files.map((file) => (
                  <Button key={file} variant="outline" asChild>
                    <a href={`/api/audits/${id}/download?version=${version.version}&file=${file}`}>{file}</a>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {latest ? null : <p className="text-sm">No files have been generated yet.</p>}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Fill missing fields and generate again</h2>
        <p className="text-sm text-muted-foreground">Only fields that need input, are missing, conflict, or are invalid are listed. Submitting creates a new version. Older packs stay downloadable.</p>
        {audit.supplements.length === 0 ? <p className="text-sm">No fields need a supplement.</p> : null}
        <div className="grid gap-4">
          {audit.supplements.map((item) => (
            <div key={item.key} className="space-y-1">
              <Label htmlFor={item.key}>{item.label} · {item.issueType}</Label>
              {item.currentValue ? <p className="text-xs break-all text-muted-foreground">Current: {item.currentValue.slice(0, 240)}</p> : null}
              <Input
                id={item.key}
                value={values[item.key] ?? ""}
                onChange={(event) => setValues({ ...values, [item.key]: event.target.value })}
              />
            </div>
          ))}
        </div>
        {message ? <p className="text-sm">{message}</p> : null}
        {audit.supplements.length > 0 ? <Button onClick={supplement}>Generate a new version</Button> : null}
      </section>
    </div>
  )
}
