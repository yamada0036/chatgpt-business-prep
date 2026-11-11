import { DISCLAIMER_SHORT, OFFICIAL_LINKS } from "@/lib/official/spec"

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{DISCLAIMER_SHORT}</p>
      {compact ? null : (
        <p>
          官方说明：
          {" "}
          <a className="underline" href={OFFICIAL_LINKS.help}>Setting up your business on ChatGPT</a>
          {" · "}
          <a className="underline" href={OFFICIAL_LINKS.products}>Product feed spec</a>
          {" · "}
          <a className="underline" href={OFFICIAL_LINKS.introducing}>Introducing Businesses in ChatGPT</a>
        </p>
      )}
    </div>
  )
}
