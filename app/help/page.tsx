import type { Metadata } from "next"
import { SCORE_EXPLANATION, OFFICIAL_LINKS, DISCLAIMER_BLOCKS } from "@/lib/official/spec"
import { RETENTION_FACT } from "@/lib/legal/public"
import { pageMetadata } from "@/lib/seo"
import { showFixtureButtons } from "@/lib/site-mode"

export const metadata: Metadata = pageMetadata({
  path: "/help",
  title: "Score and limits · Prep",
  description: "How the prep score is calculated, what the crawler reads, and what the prep pack contains.",
})

export default function HelpPage() {
  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Score, crawl limits, and the prep pack</h1>
      <p className="leading-7 text-muted-foreground">{SCORE_EXPLANATION}</p>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Default limits</h2>
        <p className="leading-7 text-muted-foreground">
          A free audit fetches at most 30 product pages by default, and an uploaded sheet is read up to 1,000 rows. Rows past that upload cap are counted and are not dropped silently. An audit stops after about 110 seconds by default, returns the part that finished, and can be retried. {RETENTION_FACT} The crawl limits are environment variables. See the README.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Local fixtures</h2>
        <p className="leading-7 text-muted-foreground">
          {showFixtureButtons()
            ? "On this site's host and port, build a full URL from /fixtures/incomplete, /fixtures/complete, /fixtures/login, or /fixtures/brochure and run an audit. The incomplete fixture has no brand, price, or return policy on purpose."
            : "Fixture store buttons are hidden on this public site. Use a store URL you control."}
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
