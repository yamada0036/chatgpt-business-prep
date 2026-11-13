import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal-document"
import { privacySections } from "@/lib/legal/document"
import { getPublicOffer } from "@/lib/offer"
import { pageMetadata } from "@/lib/seo"

export const metadata: Metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy policy · Prep",
  description: "What the prep audit stores, where it is kept, and how long the audit record lasts.",
})

export default function PrivacyPage() {
  const offer = getPublicOffer()
  return <LegalDocument title="Privacy policy" sections={privacySections(offer)} />
}
