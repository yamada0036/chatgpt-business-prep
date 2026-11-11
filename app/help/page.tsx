import { SCORE_EXPLANATION, OFFICIAL_LINKS, DISCLAIMER_BLOCKS } from "@/lib/official/spec"

export default function HelpPage() {
  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">分数、抓取限度和准备包</h1>
      <p className="leading-7 text-muted-foreground">{SCORE_EXPLANATION}</p>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">默认限度</h2>
        <p className="leading-7 text-muted-foreground">
          免费体检默认最多抓取 30 个商品详情页，付费包处理上传表格默认最多 1,000 行。超出的行会在页面和 readme 里写明数量，不会静默丢掉。整次体检默认在约 110 秒内结束；超时会停下并给出已完成部分，可以重试。抓取结果和准备包默认保留 30 天，到期删除。这些数字都在环境变量里，见 README。
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">本地夹具</h2>
        <p className="leading-7 text-muted-foreground">
          用当前站点的主机和端口，把 <code>/fixtures/incomplete</code>、<code>/fixtures/complete</code>、<code>/fixtures/login</code> 或 <code>/fixtures/brochure</code> 拼成完整网址再体检。缺资料夹具故意没有品牌、价格和退货政策。
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">官方文档</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><a className="underline" href={OFFICIAL_LINKS.help}>Setting up your business on ChatGPT</a></li>
          <li><a className="underline" href={OFFICIAL_LINKS.products}>Product feeds for file upload</a></li>
          <li><a className="underline" href={OFFICIAL_LINKS.introducing}>Introducing Businesses in ChatGPT</a></li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">必须告诉商家的事实</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
          {DISCLAIMER_BLOCKS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </article>
  )
}
