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
import type { PublicAudit } from "@/lib/public-view"

function formatCents(cents: number, currency: string): string {
  const abs = Math.abs(cents)
  return `${cents < 0 ? "-" : ""}${currency} ${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

const DISPLAY: Record<string, string> = {
  ready: "已具备",
  missing: "缺失",
  needs_input: "需补充",
  conflict: "有冲突",
  not_fetched: "需补充（未抓到）",
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
        setError(data.error?.message ?? "读不到这次体检。")
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

  if (error) return <Alert variant="destructive"><AlertTitle>打不开</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  if (!audit) return <p className="text-sm text-muted-foreground">正在读取这次体检…</p>

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground break-all">{audit.storeUrl}</p>
        <h1 className="text-3xl font-semibold tracking-tight">免费体检</h1>
        <Disclaimer compact />
      </div>
      <StepList audit={audit} />
      {audit.status === "running" ? <p className="text-sm text-muted-foreground">只显示已经发生的抓取，不展示编造的中间结果。</p> : null}
      {audit.status === "error" ? <ErrorState audit={audit} /> : null}
      {audit.status === "partial" ? (
        <Alert>
          <AlertTitle>只完成了一部分</AlertTitle>
          <AlertDescription>{audit.partialReason ?? "可以重试。"}</AlertDescription>
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
  const labels: Record<string, string> = { fetch: "抓取页面", sheet: "读取商品表", check: "对照官方字段检查" }
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {audit.steps.map((step) => (
        <li key={step.key} className="rounded-xl border border-border bg-card px-3 py-3 text-sm">
          <div className="font-medium">{labels[step.key]}</div>
          <div className="text-muted-foreground">{step.state === "done" ? "完成" : step.state === "active" ? "进行中" : step.state === "failed" ? "失败" : "等待"}</div>
          {step.detail ? <div className="mt-1 text-muted-foreground">{step.detail}</div> : null}
        </li>
      ))}
    </ol>
  )
}

function ErrorState({ audit }: { audit: PublicAudit }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>这次体检没有完成</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{audit.error?.message}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={() => retry(audit.id)}>重试</Button>
          <Button variant="outline" asChild><Link href="/">更换网址或文件</Link></Button>
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
  const price = formatCents(audit.order.breakdown.totalCents, audit.order.breakdown.currency)
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>准备度 {audit.score.total}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6">
          <p>这是本工具的准备度，不是官方分数。范围 0–100。</p>
          <p className="text-muted-foreground">{audit.score.explanation}</p>
          <p>资料分 {audit.score.profilePercent}{audit.score.feedWeighted ? `，feed 分 ${audit.score.feedPercent}` : "。本次不把 feed 算进总分。"}</p>
        </CardContent>
      </Card>
      <section className="grid gap-3">
        <h2 className="text-xl font-semibold">最急的 {audit.urgent.length} 个问题</h2>
        {audit.urgent.length === 0 ? <p className="text-sm text-muted-foreground">六个资料项里没有冲突、缺失或未抓到的项。</p> : null}
        {audit.urgent.map((issue) => (
          <Card key={issue.name}>
            <CardHeader>
              <CardTitle>{issue.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>现状：{issue.state}</p>
              <p className="text-muted-foreground">{issue.impact}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">资料检查</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge>已具备 {audit.profileCounts.ready}</Badge>
          <Badge variant="secondary">缺失 {audit.profileCounts.missing}</Badge>
          <Badge variant="outline">需补充 {audit.profileCounts.needs_input}</Badge>
          <Badge variant="destructive">有冲突 {audit.profileCounts.conflict}</Badge>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-2">项目</th>
                <th className="p-2">结果</th>
                <th className="p-2">摘录</th>
              </tr>
            </thead>
            <tbody>
              {audit.profile.map((field) => (
                <tr key={field.key} className="border-t border-border align-top">
                  <td className="p-2 font-medium">{field.fieldName}{field.required ? "" : "（可选）"}</td>
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
        <p className="text-sm text-muted-foreground">摘录不是完整资料草稿。完整 `02-profile-draft.md` 只在付费准备包里。</p>
      </section>
      {audit.includeProductFeed ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Feed 摘要</h2>
          {audit.feedApplicable ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="总行数" value={audit.feedSummary.total} />
                <Stat label="必填齐全" value={audit.feedSummary.complete} />
                <Stat label="缺字段" value={audit.feedSummary.missingRows} />
                <Stat label="格式错误" value={audit.feedSummary.invalidRows} />
              </div>
              {audit.omittedRowCount > 0 ? <p className="text-sm text-destructive">上传表格有 {audit.omittedRowCount} 行超出上限，没有进入本次结果。</p> : null}
              {audit.feedReason ? <p className="text-sm text-muted-foreground">{audit.feedReason}</p> : null}
              <div className="space-y-2">
                <h3 className="font-medium">打码示例（最多两行，不能当完整 CSV）</h3>
                {audit.sampleRows.length === 0 ? <p className="text-sm text-muted-foreground">没有可展示的商品行。</p> : null}
                {audit.sampleRows.map((row, index) => (
                  <p key={index} className="text-sm">
                    {row.titleExcerpt || "（标题为空）"}
                    {" · "}
                    {row.filled.map((item) => `${item.field}:${item.filled ? "有值" : "空"}`).join(" · ")}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm">商品 feed 不适用。{audit.feedReason}</p>
          )}
        </section>
      ) : null}
      <section className="space-y-2 text-sm leading-6">
        <h2 className="text-xl font-semibold">资格提示</h2>
        <p>{audit.eligibility.agent}</p>
        <p>{audit.eligibility.local}</p>
        <p>{audit.eligibility.market}</p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>一次一店准备包</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6">
          <p>完整包含 00-readme.md、01-claim-checklist.md、02-profile-draft.md、03-product-feed.csv、03-product-feed-issues.csv{audit.includeAgentPack ? "、04-agent-pack.md" : ""}。未勾选 Agent 时不含 agent 文件。</p>
          <p>
            {audit.order.breakdown.priceEnvSet ? "价格来自环境变量。" : "正式价格还没由产品负责人配置，当前按 0 计算，方便走通付费门闩。"}
            {" "}当前是测试配置，不是已确定的正式售价。基础包 {formatCents(audit.order.breakdown.baseCents, audit.order.breakdown.currency)}，包含 {audit.order.breakdown.includedSkus} 行。
            本次 {audit.order.breakdown.rowCount} 行，加价 {audit.order.breakdown.overageBlocks} 档，应付 {price}。模拟支付会按同一金额记账。
          </p>
          <Button className="h-11" asChild><Link href={`/audit/${audit.id}/checkout`}>查看应付金额并模拟支付</Link></Button>
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
      <h2 className="text-xl font-semibold">页面</h2>
      <ul className="space-y-1 text-sm">
        {audit.pages.map((page) => (
          <li key={`${page.role}-${page.url}`} className="break-all">
            {page.status === "fetched" ? "已抓到" : "未抓到"} · {page.role} · {page.url}
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
      setMessage(data.error?.message ?? "映射没有保存。")
      return
    }
    window.location.reload()
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>表格列对不上官方字段</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-6">请把你的列名对应到官方英文字段。必填列是 item_id、title、description、url、brand、seller_name、image_url、availability、price。这一步只能做一次。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.slice(0, 9).map((field) => (
            <div key={field} className="space-y-1">
              <Label>{field}</Label>
              <Select value={mapping[field] || undefined} onValueChange={(value) => setMapping({ ...mapping, [field]: value })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="不映射" /></SelectTrigger>
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
        <Button type="button" onClick={submit}>用这次映射重新检查</Button>
      </CardContent>
    </Card>
  )
}
