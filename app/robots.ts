import type { MetadataRoute } from "next"
import { SITE_ORIGIN } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/audit/", "/fixtures/"],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
