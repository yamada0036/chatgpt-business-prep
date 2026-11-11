import Link from "next/link"
import { Disclaimer } from "@/components/disclaimer"

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-border/80 bg-card/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="min-w-0">
            <span className="block text-xs tracking-[0.18em] text-muted-foreground uppercase">准备工具 · 不是 Business Hub</span>
            <span className="block text-lg font-semibold tracking-tight">铺前</span>
          </Link>
          <nav className="flex shrink-0 gap-4 text-sm">
            <Link href="/" className="hover:underline">体检</Link>
            <Link href="/help" className="hover:underline">分数与限度</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border/80">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <Disclaimer />
        </div>
      </footer>
    </>
  )
}
