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
import { shanghaiLabel } from "@/lib/time"

const ORDER_LABEL = { pending: "待支付", paid: "已支付", delivered: "已交付", failed: "已失败" } as const

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

  if (!audit) return <p className="text-sm text-muted-foreground">正在打开交付页…</p>
  if (!audit.paid) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">交付页还锁着</h1>
        <p className="text-sm">支付成功后才能下载完整准备包。</p>
        <Button asChild><Link href={`/audit/${id}/checkout`}>去支付</Link></Button>
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
      setMessage(data.error?.message ?? "没有生成新版本。")
      return
    }
    setMessage(data.rejected?.length ? data.rejected.map((item) => item.message).join(" ") : "已生成新版本，旧版本仍可下载。")
    setValues({})
    setAudit(data)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">准备包</h1>
        <p className="text-sm text-muted-foreground break-all">{audit.storeUrl}</p>
        <p className="text-sm">订单状态：{ORDER_LABEL[audit.order.status]}。抓取结果和准备包保留 {audit.retentionDays} 天，到 {audit.expiresAt} 删除，不永久保存。</p>
        <Disclaimer compact />
      </div>
      {audit.incompleteRowCount > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>有 {audit.incompleteRowCount} 行仍缺少必填字段</AlertTitle>
          <AlertDescription>这些行如果直接上传，可能被官方拒绝。空单元格没有用假值填上。</AlertDescription>
        </Alert>
      ) : null}
      <section className="space-y-3">
        {audit.versions.map((version) => (
          <Card key={version.version}>
            <CardHeader>
              <CardTitle>版本 {version.version}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>生成时间：{shanghaiLabel(new Date(version.createdAt))}</p>
              <p>店铺：{audit.storeUrl}</p>
              <p>文件名：{version.zipName}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button asChild><a href={`/api/audits/${id}/download?version=${version.version}`}>下载整包 ZIP</a></Button>
                {version.files.map((file) => (
                  <Button key={file} variant="outline" asChild>
                    <a href={`/api/audits/${id}/download?version=${version.version}&file=${file}`}>{file}</a>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {latest ? null : <p className="text-sm">还没有生成文件。</p>}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">补充缺失字段后再生成</h2>
        <p className="text-sm text-muted-foreground">只列出待补充、缺失、冲突或格式无效的字段。提交后生成新版本，旧包仍可下载。</p>
        {audit.supplements.length === 0 ? <p className="text-sm">没有需要补充的字段。</p> : null}
        <div className="grid gap-4">
          {audit.supplements.map((item) => (
            <div key={item.key} className="space-y-1">
              <Label htmlFor={item.key}>{item.label} · {item.issueType}</Label>
              {item.currentValue ? <p className="text-xs break-all text-muted-foreground">当前：{item.currentValue.slice(0, 240)}</p> : null}
              <Input
                id={item.key}
                value={values[item.key] ?? ""}
                onChange={(event) => setValues({ ...values, [item.key]: event.target.value })}
              />
            </div>
          ))}
        </div>
        {message ? <p className="text-sm">{message}</p> : null}
        {audit.supplements.length > 0 ? <Button onClick={supplement}>生成新版本</Button> : null}
      </section>
    </div>
  )
}
