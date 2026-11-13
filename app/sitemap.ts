import type { MetadataRoute } from "next"
import { PUBLIC_PATHS, SITE_ORIGIN } from "@/lib/seo"

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-11-13T00:00:00.000Z")
  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }))
}
