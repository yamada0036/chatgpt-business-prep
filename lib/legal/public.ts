/** Public Waffo domain-control value. It is not a login or API secret. */
export const WAFFO_VERIFY_NAME = "waffo-verify"
export const WAFFO_VERIFY_CONTENT = "6501fadcd89117d73a42661b07884e88"

export const SUPPORT_EMAIL = "praxora-ai@mail.grokbot.com"
export const LEGAL_UPDATED = "14 November 2026"

/**
 * Matches the read path in lib/store. There is no separate deletion clock.
 * Price sentences live in lib/offer.ts so the legal pages and the pricing cards share one server value.
 */
export const RETENTION_FACT =
  "Each audit stores an expiry time. The default is 30 days after the audit is created. PREP_RETENTION_DAYS can change that number. After the expiry time, the next read of storage deletes that audit record and its prep files. This is not a separate scheduled job, so a record can remain until something reads the store. An uploaded sheet, crawl extracts, and a contact email saved on that audit are deleted with the record. Server logs and Vercel Web Analytics are not deleted by this expiry. A separate one-use record for that store or email, if one was stored, can remain after the audit record is deleted. That record is not the paid trial and it does not charge a fee."

export const SERVICE_FACT =
  "Prep is a preparation and audit tool. You submit a public store URL and, if you want, a product sheet. The tool reads those sources, compares them with published profile and product-feed fields, and shows a free audit."

export type LegalSection = { heading: string; paragraphs: string[] }
