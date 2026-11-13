import { createHash } from "node:crypto"
import { normalizeUrl } from "@/lib/url-safety"

/** Hashed slot ids only. The raw email and store URL are not used as object names. */
export function siteTrialSlot(storeUrl: string): string {
  return createHash("sha256").update(`site\n${normalizeUrl(storeUrl)}`).digest("hex")
}

export function emailTrialSlot(email: string): string {
  return createHash("sha256").update(`email\n${email.trim().toLowerCase()}`).digest("hex")
}
