import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal-document"
import { TERMS_SECTIONS } from "@/lib/legal/public"

export const metadata: Metadata = {
  title: "Terms of use · Prep",
  description: "Terms for the free store-prep audit. Paid checkout is not available.",
}

export default function TermsPage() {
  return <LegalDocument title="Terms of use" sections={TERMS_SECTIONS} />
}
