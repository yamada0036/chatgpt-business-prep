import { SCORE_EXPLANATION, OFFICIAL_LINKS, DISCLAIMER_BLOCKS } from "@/lib/official/spec"

export default function HelpPage() {
  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Score, crawl limits, and the prep pack</h1>
      <p className="leading-7 text-muted-foreground">{SCORE_EXPLANATION}</p>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Default limits</h2>
        <p className="leading-7 text-muted-foreground">
          A free audit fetches at most 30 product pages by default, and a paid pack keeps at most 1,000 rows from an uploaded sheet. Rows past that cap are counted on the page and in the readme. They are not dropped silently. An audit stops after about 110 seconds by default, returns the part that finished, and can be retried. Crawl results and prep packs are kept for 30 days, then deleted. These numbers are environment variables. See the README.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Local fixtures</h2>
        <p className="leading-7 text-muted-foreground">
          On this site&apos;s host and port, build a full URL from <code>/fixtures/incomplete</code>, <code>/fixtures/complete</code>, <code>/fixtures/login</code>, or <code>/fixtures/brochure</code> and run an audit. The incomplete fixture has no brand, price, or return policy on purpose.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Official docs</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><a className="underline" href={OFFICIAL_LINKS.help}>Setting up your business on ChatGPT</a></li>
          <li><a className="underline" href={OFFICIAL_LINKS.products}>Product feeds for file upload</a></li>
          <li><a className="underline" href={OFFICIAL_LINKS.introducing}>Introducing Businesses in ChatGPT</a></li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Facts the merchant has to see</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
          {DISCLAIMER_BLOCKS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </article>
  )
}
