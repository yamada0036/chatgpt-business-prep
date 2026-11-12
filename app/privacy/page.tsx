import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal-document"
import { PRIVACY_SECTIONS } from "@/lib/legal/public"

export const metadata: Metadata = {
  title: "Privacy policy · Prep",
  description: "What the prep audit stores, where it is kept, and how long the audit record lasts.",
}

export default function PrivacyPage() {
  return <LegalDocument title="Privacy policy" sections={PRIVACY_SECTIONS} />
}
