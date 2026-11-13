import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Geist, Geist_Mono } from "next/font/google"
import { SiteShell } from "@/components/site-shell"
import { SITE_ORIGIN } from "@/lib/seo"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "Prep · ChatGPT business setup",
  description: "Check what a public store and product feed are missing. Start with a free audit. This tool does not claim the business and does not promise a recommendation.",
  alternates: { canonical: `${SITE_ORIGIN}/` },
  openGraph: {
    type: "website",
    siteName: "Prep",
    title: "Prep · ChatGPT business setup",
    description: "Check what a public store and product feed are missing. Start with a free audit. This tool does not claim the business and does not promise a recommendation.",
    url: `${SITE_ORIGIN}/`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Prep · ChatGPT business setup",
    description: "Check what a public store and product feed are missing. Start with a free audit. This tool does not claim the business and does not promise a recommendation.",
  },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteShell>{children}</SiteShell>
        <script defer src="/_vercel/insights/script.js" data-sdkn="@vercel/analytics/next" data-sdkv="2.0.1" />
        <Analytics />
      </body>
    </html>
  )
}
