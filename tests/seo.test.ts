import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { PUBLIC_PATHS, SITE_ORIGIN } from "@/lib/seo"
import { WAFFO_VERIFY_CONTENT } from "@/lib/legal/public"

describe("public SEO files", () => {
  it("lists the public pages and points robots at the sitemap", () => {
    const robots = readFileSync("app/robots.ts", "utf8")
    const sitemap = readFileSync("app/sitemap.ts", "utf8")
    expect(robots).toContain("allow: \"/\"")
    expect(robots).toContain("sitemap: `${SITE_ORIGIN}/sitemap.xml`")
    expect(SITE_ORIGIN).toBe("https://chatgpt-business-prep.vercel.app")
    expect(sitemap).toContain("PUBLIC_PATHS")
    expect(PUBLIC_PATHS).toEqual([
      "/",
      "/pricing",
      "/terms",
      "/privacy",
      "/help",
      "/guides/claim-chatgpt-business-profile-shopify",
    ])
  })

  it("renders the Vercel insights script from the root layout and keeps the Waffo tag", () => {
    const layout = readFileSync("app/layout.tsx", "utf8")
    const home = readFileSync("app/page.tsx", "utf8")
    expect(layout).toContain('from "@vercel/analytics/next"')
    expect(layout).toContain("<Analytics />")
    expect(layout).toContain('src="/_vercel/insights/script.js"')
    expect(home).toContain("WAFFO_VERIFY_CONTENT")
    expect(WAFFO_VERIFY_CONTENT).toBe("9c21a76acbde2bc00ada836d8153edfd")
  })
})
