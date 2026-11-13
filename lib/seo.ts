import type { Metadata } from "next"

export const SITE_ORIGIN = "https://chatgpt-business-prep.vercel.app"

export const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/terms",
  "/privacy",
  "/help",
  "/guides/claim-chatgpt-business-profile-shopify",
] as const

export function pageMetadata(input: { path: string; title: string; description: string }): Metadata {
  const url = input.path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${input.path}`
  return {
    title: { absolute: input.title },
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: input.title,
      description: input.description,
      siteName: "Prep",
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
    },
  }
}
