"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Disclaimer } from "@/components/disclaimer"
import { IntendedOffer } from "@/components/intended-offer"
import type { PublicAudit } from "@/lib/public-view"

const DISPLAY: Record<string, string> = {
  ready: "Ready",
  missing: "Missing",
  needs_input: "Needs input",
  conflict: "Conflict",
  not_fetched: "Needs input (not fetched)",
}

export function AuditView({ id }: { id: string }) {
  const [audit, setAudit] = useState<PublicAudit | null>(null)
  const [error, setError] = useState("")
  const [mapping, setMapping] = useState<Record<string, string>>({})

  useEffect(() => {
    let stop = false
    async function tick() {
      const response = await fetch(`/api/audits/${id}`, { cache: "no-store" })
      const data = (await response.json()) as PublicAudit & { error?: { message: string } }
      if (stop) return
      if (!response.ok) {
        setError(data.error?.message ?? "This audit could not be loaded.")
        return
      }
      setAudit(data)
      if (data.status === "running") setTimeout(tick, 1200)
    }
    void tick()
    return () => {
      stop = true
    }
  }, [id])

  if (error) return <Alert variant="destructive"><AlertTitle>Could not open</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!audit) return <p className="text-sm text-muted-foreground">Loading this audit…</p>

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground break-all">{audit.storeUrl}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Free audit</h1>
        <Disclaimer compact />
      </div>
      <StepList audit={audit} />
      {audit.status === "running" ? <p className="text-sm text-muted-foreground">Only fetches that already happened are shown. Invented progress is not.</p> : null}
      {audit.status === "error" ? <ErrorState audit={audit} /> : null}
      {audit.status === "partial" ? (
        <Alert>
          <AlertTitle>Only part of this finished</AlertTitle>
          <AlertDescription>{audit.partialReason ?? "You can retry."}</AlertDescription>
        </Alert>
      ) : null}
      {audit.status === "needs_column_map" && audit.columnMap ? (
        <ColumnMap id={id} headers={audit.columnMap.headers} fields={audit.columnMap.fields} mapping={mapping} setMapping={setMapping} />
      ) : null}
      {audit.status === "complete" || audit.status === "partial" ? <Results audit={audit} /> : null}
      <PageList audit={audit} />
    </div>
  )
}

function StepList({ audit }: { audit: PublicAudit }) {
  const labels: Record<string, string> = { fetch: "Fetch pages", sheet: "Read the product sheet", check: "Check official fields" }
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {audit.steps.map((step) => (
        <li key={step.key} className="rounded-xl border border-border bg-card px-3 py-3 text-sm">
          <div className="font-medium">{labels[step.key]}</div>
          <div className="text-muted-foreground">{step.state === "done" ? "Done" : step.state === "active" ? "In progress" : step.state === "failed" ? "Failed" : "Waiting"}</div>
          {step.detail ? <div className="mt-1 text-muted-foreground">{step.detail}</div> : null}
        </li>
      ))}
    </ol>
  )
}

function ErrorState({ audit }: { audit: PublicAudit }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>This audit did not finish</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{audit.error?.message}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={() => retry(audit.id)}>Retry</Button>
          <Button variant="outline" asChild><Link href="/">Change the URL or file</Link></Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

async function retry(id: string) {
  await fetch(`/api/audits/${id}/retry`, { method: "POST" })
  window.location.reload()
}

function Results({ audit }: { audit: PublicAudit }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Readiness {audit.score.total}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6">
          <p>This is this tool&apos;s readiness score, not an official score. Range 0–100.</p>
          <p className="text-muted-foreground">{audit.score.explanation}</p>
          <p>Profile score {audit.score.profilePercent}{audit.score.feedWeighted ? `, feed score ${audit.score.feedPercent}` : ". The feed is not included in this total."}</p>
        </CardContent>
      </Card>
      <section className="grid gap-3">
        <h2 className="text-xl font-semibold">{audit.urgent.length} most urgent issues</h2>
        {audit.urgent.length === 0 ? <p className="text-sm text-muted-foreground">None of the six profile fields conflict, are missing, or were not fetched.</p> : null}
        {audit.urgent.map((issue) => (
          <Card key={issue.name}>
            <CardHeader>
              <CardTitle>{issue.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>Status: {issue.state}</p>
              <p className="text-muted-foreground">{issue.impact}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Profile check</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge>Ready {audit.profileCounts.ready}</Badge>
          <Badge variant="secondary">Missing {audit.profileCounts.missing}</Badge>
          <Badge variant="outline">Needs input {audit.profileCounts.needs_input}</Badge>
          <Badge variant="destructive">Conflict {audit.profileCounts.conflict}</Badge>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-2">Field</th>
                <th className="p-2">Result</th>
                <th className="p-2">Excerpt</th>
              </tr>
            </thead>
            <tbody>
              {audit.profile.map((field) => (
                <tr key={field.key} className="border-t border-border align-top">
                  <td className="p-2 font-medium">{field.fieldName}{field.required ? "" : " (optional)"}</td>
                  <td className="p-2">{DISPLAY[field.display] ?? field.display}</td>
                  <td className="p-2 text-muted-foreground">
                    {field.excerpt || "—"}
                    {field.note ? <span className="mt-1 block">{field.note}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">An excerpt is not the full profile draft. The full `02-profile-draft.md` is only in the paid prep pack.</p>
      </section>
      {audit.includeProductFeed ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Feed summary</h2>
          {audit.feedApplicable ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Rows" value={audit.feedSummary.total} />
                <Stat label="Required fields filled" value={audit.feedSummary.complete} />
                <Stat label="Missing fields" value={audit.feedSummary.missingRows} />
                <Stat label="Invalid format" value={audit.feedSummary.invalidRows} />
              </div>
              {audit.omittedRowCount > 0 ? <p className="text-sm text-destructive">{audit.omittedRowCount} uploaded rows were over the cap and are not in this result.</p> : null}
              {audit.feedReason ? <p className="text-sm text-muted-foreground">{audit.feedReason}</p> : null}
              <div className="space-y-2">
                <h3 className="font-medium">Masked sample (at most two rows, not a full CSV)</h3>
                {audit.sampleRows.length === 0 ? <p className="text-sm text-muted-foreground">No product rows to show.</p> : null}
                {audit.sampleRows.map((row, index) => (
                  <p key={index} className="text-sm">
                    {row.titleExcerpt || "(empty title)"}
                    {" · "}
                    {row.filled.map((item) => `${item.field}:${item.filled ? "filled" : "empty"}`).join(" · ")}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm">The product feed does not apply. {audit.feedReason}</p>
          )}
        </section>
      ) : null}
      <section className="space-y-2 text-sm leading-6">
        <h2 className="text-xl font-semibold">Eligibility notes</h2>
        <p>{audit.eligibility.agent}</p>
        <p>{audit.eligibility.local}</p>
        <p>{audit.eligibility.market}</p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>One-store prep pack</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6">
          <p>The free audit does not include the full prep files. Those files are 00-readme.md, 01-claim-checklist.md, 02-profile-draft.md, 03-product-feed.csv, and 03-product-feed-issues.csv{audit.includeAgentPack ? ", plus 04-agent-pack.md" : ""}. The agent file is omitted when that box is off.</p>
          <p>This run counted {audit.order.breakdown.rowCount} product rows.</p>
          {audit.skuCapNote ? <p>{audit.skuCapNote}</p> : null}
          <IntendedOffer />
        </CardContent>
      </Card>
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}

function PageList({ audit }: { audit: PublicAudit }) {
  if (audit.pages.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">Pages</h2>
      <ul className="space-y-1 text-sm">
        {audit.pages.map((page) => (
          <li key={`${page.role}-${page.url}`} className="break-all">
            {page.status === "fetched" ? "Fetched" : "Not fetched"} · {page.role} · {page.url}
            {page.reason ? ` · ${page.reason}` : ""}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ColumnMap({
  id,
  headers,
  fields,
  mapping,
  setMapping,
}: {
  id: string
  headers: string[]
  fields: string[]
  mapping: Record<string, string>
  setMapping: (value: Record<string, string>) => void
}) {
  const [message, setMessage] = useState("")
  async function submit() {
    const response = await fetch(`/api/audits/${id}/column-map`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mapping }),
    })
    const data = (await response.json()) as { error?: { message: string } }
    if (!response.ok) {
      setMessage(data.error?.message ?? "The mapping was not saved.")
      return
    }
    window.location.reload()
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>These columns do not match the official fields</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-6">Map your column names to the official English fields. Required columns are item_id, title, description, url, brand, seller_name, image_url, availability, and price. This step can be done once.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.slice(0, 9).map((field) => (
            <div key={field} className="space-y-1">
              <Label>{field}</Label>
              <Select value={mapping[field] || undefined} onValueChange={(value) => setMapping({ ...mapping, [field]: value })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Do not map" /></SelectTrigger>
                <SelectContent>
                  {headers.map((header) => (
                    <SelectItem key={header} value={header}>{header}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        <Button type="button" onClick={submit}>Check again with this mapping</Button>
      </CardContent>
    </Card>
  )
}
