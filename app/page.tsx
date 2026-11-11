import { AuditForm } from "@/components/audit-form"
import { Disclaimer } from "@/components/disclaimer"
import { DISCLAIMER_SHORT } from "@/lib/official/spec"

export default function Home() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-5">
        <p className="text-sm text-muted-foreground">给有公开网站的电商，尤其是美国站或跨境 Shopify 卖家。</p>
        <h1 className="max-w-xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          检查你的店要认领 ChatGPT 商家资料时会缺什么。
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted-foreground">
          贴上店铺网址，也可以再上传已有商品表。工具只读公开网页和你提供的文件，对照官方资料项和商品 feed 必填字段，先给出免费体检。
        </p>
        <div className="rounded-xl border border-border bg-accent/60 p-4">
          <Disclaimer compact />
        </div>
        <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
          <li>免费页只给摘要和打码示例，不能下载完整 CSV，也不能复制完整资料草稿。</li>
          <li>付费后的准备包由你自己拿到 Business Hub 提交。这里不登录、不认领、不核验。</li>
          <li>抓不到的价格、品牌、库存和政策会留空，标成待补充，不会编造。</li>
        </ul>
        <p className="sr-only">{DISCLAIMER_SHORT}</p>
      </section>
      <AuditForm />
    </div>
  )
}
