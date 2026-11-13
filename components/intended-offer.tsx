import Link from "next/link"

export function IntendedOffer({
  paragraphs,
  showPricingLink = true,
}: {
  paragraphs: string[]
  showPricingLink?: boolean
}) {
  return (
    <section className="space-y-2 text-sm leading-6">
      <h2 className="text-xl font-semibold text-foreground">Pricing</h2>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {showPricingLink ? (
        <p>
          <Link className="underline" href="/pricing">Pricing details</Link>
        </p>
      ) : null}
    </section>
  )
}
