import type { LegalSection } from "@/lib/legal/public"
import { LEGAL_UPDATED } from "@/lib/legal/public"

export function LegalDocument({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <article className="max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}.</p>
      </header>
      {sections.map((section) => (
        <section key={section.heading} className="space-y-3">
          <h2 className="text-xl font-semibold">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="leading-7 text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  )
}
