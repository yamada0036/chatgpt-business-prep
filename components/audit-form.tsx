"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Disclaimer } from "@/components/disclaimer"

export function AuditForm({ showFixtures = false }: { showFixtures?: boolean }) {
  const router = useRouter()
  const [storeUrl, setStoreUrl] = useState("")
  const [email, setEmail] = useState("")
  const [includeFeed, setIncludeFeed] = useState(true)
  const [includeAgent, setIncludeAgent] = useState(false)
  const [language, setLanguage] = useState("en")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    setPending(true)
    const body = new FormData()
    body.set("store_url", storeUrl.trim())
    body.set("contact_email", email.trim())
    body.set("include_product_feed", includeFeed ? "true" : "false")
    body.set("include_agent_pack", includeAgent ? "true" : "false")
    body.set("output_language", language)
    if (file) body.set("product_file", file)
    const response = await fetch("/api/audits", { method: "POST", body })
    const text = await response.text()
    let data: { id?: string; error?: { message: string } } = {}
    if (text) {
      try {
        data = JSON.parse(text) as { id?: string; error?: { message: string } }
      } catch {
        data = {}
      }
    }
    setPending(false)
    if (!response.ok || !data.id) {
      setError(data.error?.message ?? "The audit did not start.")
      return
    }
    router.push(`/audit/${data.id}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a one-store audit</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="store_url">Store URL</Label>
            <Input
              id="store_url"
              name="store_url"
              type="url"
              required
              placeholder="https://your-store.example"
              value={storeUrl}
              onChange={(event) => setStoreUrl(event.target.value)}
              className="h-11"
            />
          </div>
          {showFixtures ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStoreUrl(`${window.location.origin}/fixtures/incomplete`)}
              >
                Use incomplete fixture
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStoreUrl(`${window.location.origin}/fixtures/complete`)}
              >
                Use complete fixture
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="product_file">Product sheet (optional, CSV or XLSX)</Label>
            <Input
              id="product_file"
              name="product_file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="include_product_feed" checked={includeFeed} onCheckedChange={(value) => setIncludeFeed(value === true)} />
            <Label htmlFor="include_product_feed" className="leading-5">Also prepare the product feed (on by default)</Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="include_agent_pack" checked={includeAgent} onCheckedChange={(value) => setIncludeAgent(value === true)} />
            <Label htmlFor="include_agent_pack" className="leading-5">
              Draft an agent Q&amp;A. Agents can currently be published only by eligible ecommerce and online service businesses in the United States. If the pages are not enough, you still get a draft plus a warning.
            </Label>
          </div>
          <div className="space-y-2">
            <Label>Language for the copy you submit</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_email">Contact email (required before payment; you can leave it blank for now)</Label>
            <Input
              id="contact_email"
              name="contact_email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@store.example"
            />
          </div>
          <Disclaimer compact />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? "Submitting…" : "Start free audit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
