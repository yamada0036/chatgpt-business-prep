/** Public Waffo domain-control value. It is not a login or API secret. */
export const WAFFO_VERIFY_NAME = "waffo-verify"
export const WAFFO_VERIFY_CONTENT = "56efef08aaf5a8144992e96465438566"

export const SUPPORT_EMAIL = "praxora-ai@mail.grokbot.com"
export const LEGAL_UPDATED = "12 November 2026"

export const INTENDED_TRIAL_USD = "9.90"
export const INTENDED_TRIAL_DAYS = 7
export const INTENDED_MONTHLY_USD = "49.90"

export const OFFER_NOT_FOR_SALE =
  "Paid checkout is not available. This site does not charge a subscription and does not charge the earlier one-time pack."

export const OFFER_INTENDED =
  "The intended price, which is not being charged, is a 7-day paid trial for USD 9.90, then USD 49.90 per month. Amounts are in USD. The trial would be paid, not free."

export const OFFER_TERMS_GATE =
  "Sales will not start until the subscription terms are published. Those terms are not published, because what a paid period includes, when a later charge would happen, how someone would cancel, and whether any fee is refundable are not decided."

/** Matches the read path in lib/store. There is no separate deletion clock. */
export const RETENTION_FACT =
  "Each audit stores an expiry time. The default is 30 days after the audit is created. PREP_RETENTION_DAYS can change that number. After the expiry time, the next read of storage deletes that audit record and its prep files. This is not a separate scheduled job, so a record can remain until something reads the store. An uploaded sheet, crawl extracts, and a contact email saved on that audit are deleted with the record. Server logs and Vercel Web Analytics are not deleted by this expiry."

export const SERVICE_FACT =
  "Prep is a preparation and audit tool. You submit a public store URL and, if you want, a product sheet. The tool reads those sources, compares them with published profile and product-feed fields, and shows a free audit."

export type LegalSection = { heading: string; paragraphs: string[] }

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "The service",
    paragraphs: [
      SERVICE_FACT,
      "You submit any materials to ChatGPT or Business Hub yourself. This tool does not sign in, claim a business, or verify one.",
      "This tool does not claim the business, does not promise a recommendation, and does not collect identity documents. It does not sign in to ChatGPT or Business Hub, does not collect passwords or verification codes, and does not guarantee approval.",
      "The site is not affiliated with OpenAI or Shopify. Links to their documents are references to third-party pages.",
    ],
  },
  {
    heading: "The free audit",
    paragraphs: [
      "The free audit is what the site offers now. It shows a readiness summary and short samples. It does not download the full product-feed CSV or the full profile draft.",
      "Prices, brands, stock, and policies that were not found on the public pages or in your file stay blank. The tool does not invent them.",
    ],
  },
  {
    heading: "Paid access",
    paragraphs: [OFFER_NOT_FOR_SALE, OFFER_INTENDED, OFFER_TERMS_GATE],
  },
  {
    heading: "What you submit",
    paragraphs: [
      "The store URL must be a public http or https address you are allowed to use. The optional product file must be a CSV or XLSX sheet you are allowed to upload. Do not upload unlawful content, passwords, verification codes, or identity documents. The form does not ask for those.",
      "A contact email is optional for the free audit. If you type one, it is stored with that audit.",
    ],
  },
  {
    heading: "Operator and contact",
    paragraphs: [
      "The service is operated by an individual in mainland China. This page does not publish the operator's legal name or postal address.",
      `Questions about these terms: ${SUPPORT_EMAIL}.`,
    ],
  },
]

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "What this policy covers",
    paragraphs: [
      SERVICE_FACT,
      "This policy states only the collection and storage this application actually performs. It does not state a governing law or a legal basis for processing.",
    ],
  },
  {
    heading: "Information you submit",
    paragraphs: [
      "The audit form collects the store URL, whether to prepare a product feed, whether to draft an agent Q&A, the output language, an optional contact email, and an optional CSV or XLSX product sheet.",
      "If you leave the email blank, the free audit still runs. If you type an email, it is saved on the audit record. The public audit page shows a masked form of that email, not the full address.",
      "The sheet's rows are saved inside the audit record. The application does not ask for a card number, a PayPal password, a verification code, or an identity document.",
    ],
  },
  {
    heading: "Information taken from public pages",
    paragraphs: [
      "For the store URL you submit, the server fetches publicly reachable pages, within the crawl limits described on the score and limits page. It stores extracted fields, page addresses, and fetch status. It does not store a claim that a missing page proves a policy does not exist.",
    ],
  },
  {
    heading: "Where audit records are stored",
    paragraphs: [
      "On the public site, the audit record and any generated prep files are stored in private Vercel Blob. The application is hosted by Vercel. A local disk directory is used only when the process is not running on Vercel and Blob storage is not configured. Postgres is not required and is not used for these records.",
      "The application does not sell the store contents you submit, and it has no feature that sends those contents into a model-training pipeline.",
    ],
  },
  {
    heading: "How long the audit record is kept",
    paragraphs: [RETENTION_FACT],
  },
  {
    heading: "Hosting, logs, and analytics",
    paragraphs: [
      "Vercel hosts the site, stores the private Blob files, and receives the function logs. Those logs are written by this application as event names and audit ids. The logger skips fields whose names look like passwords, verification codes, card data, or secrets.",
      "The site loads Vercel Web Analytics. This policy does not describe how long Vercel keeps analytics events or server logs.",
    ],
  },
  {
    heading: "Payments",
    paragraphs: [
      "Paid checkout is not available. The site does not create a PayPal order and does not accept a card payment. No payment processor is charging the intended subscription.",
      OFFER_INTENDED,
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      "The service is operated by an individual in mainland China. This page does not publish the operator's legal name or postal address.",
      `Privacy questions: ${SUPPORT_EMAIL}.`,
    ],
  },
]

export const PRICING_SECTIONS: LegalSection[] = [
  {
    heading: "Not for sale",
    paragraphs: [OFFER_NOT_FOR_SALE, OFFER_INTENDED, OFFER_TERMS_GATE],
  },
  {
    heading: "What you can use now",
    paragraphs: [
      "The free audit is available. It does not download the full product-feed CSV or the full profile draft.",
      "This site is not affiliated with OpenAI or Shopify, and it does not guarantee that ChatGPT or Business Hub will approve or recommend a business.",
    ],
  },
]
