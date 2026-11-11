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

const ORDER_LABEL = { pending: "待支付", paid: "已支付", delivered: "已交付", failed: "已失败" } as const

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

  if (!audit) return <p className="text-sm text-muted-foreground">正在读取订单…</p>
  if (audit.status !== "complete" && audit.status !== "partial" && audit.order.status === "pending") {
    return <p className="text-sm">体检还没完成，暂时不能支付。</p>
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
      setError(data.error?.message ?? "支付没有完成。")
      return
    }
    if (action === "pay") router.push(`/audit/${id}/delivery`)
    else setAudit(data)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">一次一店准备包</h1>
      <Disclaimer compact />
      <Card>
        <CardHeader>
          <CardTitle>应付金额 {shown}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6">
          <p>订单状态：{ORDER_LABEL[audit.order.status]}</p>
          <p>{quote.priceEnvSet ? "金额来自环境变量 PREP_BASE_PRICE_CENTS 和加价配置。" : "正式价格尚未配置，当前金额是 0，只为验证付费门闩。"} 这是测试配置，不是已确定的正式售价。</p>
          <p>基础包 {money(quote.baseCents, quote.currency)}，包含 {quote.includedSkus} 行。本次计入 {quote.rowCount} 行，超出 {quote.overageBlocks} 档 × {money(quote.blockPriceCents, quote.currency)}，加价 {money(quote.overageCents, quote.currency)}。</p>
          <p>模拟支付记账金额与上面的应付金额使用同一个公式。这里不收集卡号。</p>
          {audit.order.failureReason ? <p>{audit.order.failureReason}</p> : null}
          {audit.order.status === "delivered" ? (
            <Button asChild><a href={`/audit/${id}/delivery`}>去交付页</a></Button>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="contact_email">联系邮箱（付费前必填）</Label>
                <Input id="contact_email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@store.example" />
                {audit.contactEmail ? <p className="text-muted-foreground">已保存 {audit.contactEmail}。留空则继续用它。</p> : null}
              </div>
              {error ? <p className="text-destructive">{error}</p> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="h-11" disabled={pending} onClick={() => pay("pay")}>确认模拟支付（测试）</Button>
                <Button variant="outline" disabled={pending} onClick={() => pay("fail")}>模拟支付失败（测试）</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {audit.order.status === "failed" ? (
        <Alert>
          <AlertTitle>已失败</AlertTitle>
          <AlertDescription>没有进入交付页。可以再用模拟支付成功重试。</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
