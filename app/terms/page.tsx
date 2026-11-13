import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal-document"
import { termsSections } from "@/lib/legal/document"
import { getPublicOffer } from "@/lib/offer"

export const metadata: Metadata = {
  title: "Terms of use · Prep",
  description: "Terms for the free store-prep audit. Paid checkout is not available.",
}

export default function TermsPage() {
  const offer = getPublicOffer()
  return <LegalDocument title="Terms of use" sections={termsSections(offer)} />
}
