import type { Metadata } from "next"
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
  title: "铺前 · ChatGPT 商家入驻准备",
  description: "检查公开店铺资料和商品 feed 缺什么。先免费体检，付费后下载准备包。不代认领，不保证推荐。",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  )
}
