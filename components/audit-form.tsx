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

export function AuditForm() {
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
    const data = (await response.json()) as { id?: string; error?: { message: string } }
    setPending(false)
    if (!response.ok || !data.id) {
      setError(data.error?.message ?? "没有开始体检。")
      return
    }
    router.push(`/audit/${data.id}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>开始一次一店体检</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="store_url">店铺网址</Label>
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStoreUrl(`${window.location.origin}/fixtures/incomplete`)}
            >
              填入缺资料夹具
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStoreUrl(`${window.location.origin}/fixtures/complete`)}
            >
              填入资料较全夹具
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="product_file">商品表（可选，CSV 或 XLSX）</Label>
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
            <Label htmlFor="include_product_feed" className="leading-5">一并整理商品 feed（默认勾选）</Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="include_agent_pack" checked={includeAgent} onCheckedChange={(value) => setIncludeAgent(value === true)} />
            <Label htmlFor="include_agent_pack" className="leading-5">
              生成 Agent 问答草稿。Agent 目前仅美国符合条件的电商和线上服务可发布；即使勾选，信息不足时也只给草稿并加警告。
            </Label>
          </div>
          <div className="space-y-2">
            <Label>官方提交用文案语言</Label>
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
            <Label htmlFor="contact_email">联系邮箱（付费前必填，现在可以先留空）</Label>
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
            {pending ? "正在提交…" : "开始免费体检"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
