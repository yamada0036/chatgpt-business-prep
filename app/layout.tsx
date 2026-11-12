import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Geist, Geist_Mono } from "next/font/google"
import { SiteShell } from "@/components/site-shell"
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
  title: "Prep · ChatGPT business setup",
  description: "Check what a public store and product feed are missing. Start with a free audit, then download a prep pack after payment. This tool does not claim the business and does not promise a recommendation.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteShell>{children}</SiteShell>
        <Analytics />
      </body>
    </html>
  )
}
