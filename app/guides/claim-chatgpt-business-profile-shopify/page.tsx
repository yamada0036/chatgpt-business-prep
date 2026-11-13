import type { Metadata } from "next"
import Link from "next/link"
import { CLAIM_STEPS_EN, DISCLAIMER_SHORT, REQUIRED_FEED_FIELDS, SCORE_EXPLANATION } from "@/lib/official/spec"
import { pageMetadata } from "@/lib/seo"

export const metadata: Metadata = pageMetadata({
  path: "/guides/claim-chatgpt-business-profile-shopify",
  title: "How to prepare your Shopify store before claiming a ChatGPT business profile",
  description:
    "What to have on a public Shopify store before you claim a ChatGPT business profile yourself, and what the free prep audit checks. Not affiliated with OpenAI or Shopify.",
})

const SOURCES = [
  {
    title: "Introducing businesses in ChatGPT",
    href: "https://openai.com/index/introducing-businesses-chatgpt",
    publisher: "OpenAI",
  },
  {
    title: "Setting up your business on ChatGPT",
    href: "https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt",
    publisher: "OpenAI Help",
  },
  {
    title: "Product file upload specification",
    href: "https://developers.openai.com/commerce/specs/file-upload/products",
    publisher: "OpenAI",
  },
  {
    title: "Shopping from Shopify merchants in ChatGPT",
    href: "https://help.openai.com/en/articles/20001241-shopping-from-shopify-merchants-in-chatgpt",
    publisher: "OpenAI Help",
  },
  {
    title: "Selling on ChatGPT",
    href: "https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/chatgpt",
    publisher: "Shopify Help",
  },
] as const

export default function ShopifyClaimGuidePage() {
  return (
    <article className="max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Guide</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          How to prepare your Shopify store before claiming a ChatGPT business profile
        </h1>
        <p className="text-muted-foreground">{DISCLAIMER_SHORT}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Two different official paths</h2>
        <p>
          Claiming a business profile and selling through Shopify&apos;s ChatGPT channel are not the same step. OpenAI&apos;s
          help article, <a className="underline" href={SOURCES[1].href}>Setting up your business on ChatGPT</a>, is the
          place that describes claiming. Shopify&apos;s help article,{" "}
          <a className="underline" href={SOURCES[4].href}>Selling on ChatGPT</a>, describes a discovery channel that uses
          the Shopify Catalog. This tool does not connect a Shopify store, does not publish a product feed, and does not
          complete either process.
        </p>
        <p>
          Shopify says the ChatGPT channel is a discovery referrer and that the purchase is completed through the
          merchant&apos;s own online-store checkout. Shopify also says there are no fees for selling in ChatGPT beyond
          standard payment processing fees. Those statements are Shopify&apos;s, on the page linked above.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What Shopify lists for that channel</h2>
        <p>On the same Shopify help page, eligibility for selling on ChatGPT is described as:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>The store sells to customers in the United States. Shopify says the store can be based outside the United States.</li>
          <li>Products are eligible to be published to the Shopify Catalog.</li>
          <li>The merchant agrees to the Agentic Storefronts supplemental terms.</li>
          <li>Terms of service, Privacy policy, and Return and refund policy are completed in Shopify admin.</li>
        </ul>
        <p>
          Shopify says eligible stores are available for discovery through the Shopify Catalog without an extra setup
          step, and that a merchant can opt out of Shopify Catalog access for ChatGPT. Shopify also says products that
          are on OpenAI&apos;s prohibited-products list do not display. OpenAI publishes a separate page,{" "}
          <a className="underline" href={SOURCES[3].href}>Shopping from Shopify merchants in ChatGPT</a>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What to have before you claim the profile yourself</h2>
        <p>
          The claim is something you do in ChatGPT. This site does not sign in, does not enter a verification code, and
          does not submit the claim. OpenAI&apos;s setup article is the source for the steps below:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          {CLAIM_STEPS_EN.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          OpenAI&apos;s introduction, <a className="underline" href={SOURCES[0].href}>Introducing businesses in ChatGPT</a>,
          is the product announcement for businesses in ChatGPT. Read that page and the setup article before you decide
          whether claiming applies to your store. This guide does not add requirements those pages do not state.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Product fields, if you use a feed</h2>
        <p>
          OpenAI&apos;s <a className="underline" href={SOURCES[2].href}>product file upload specification</a> lists the
          fields a product file must include. This tool checks those same fields when you paste a feed URL:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {REQUIRED_FEED_FIELDS.map((field) => (
            <li key={field}>
              <code>{field}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What the free audit checks</h2>
        <p>{SCORE_EXPLANATION}</p>
        <p>
          The free audit reads a public store URL. It looks for a website, business description, category, logo,
          delivery policy, and return policy. A cover photo is optional. If you also paste a product feed, it checks the
          nine fields above. The score is this tool&apos;s score. It is not an OpenAI score, and a higher score is not an
          approval.
        </p>
        <p>
          <Link href="/" className="underline">
            Start the free audit
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sources</h2>
        <ul className="space-y-2">
          {SOURCES.map((source) => (
            <li key={source.href}>
              <a className="underline" href={source.href}>
                {source.title}
              </a>
              <span className="text-muted-foreground"> — {source.publisher}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}
