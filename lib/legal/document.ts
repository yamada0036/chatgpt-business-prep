import type { LegalSection } from "@/lib/legal/public"
import {
  RETENTION_FACT,
  SERVICE_FACT,
  SUPPORT_EMAIL,
} from "@/lib/legal/public"
import { getPublicOffer, type PublicOffer } from "@/lib/offer"

/** Server-only legal sections. Price sentences come from the same offer as the pricing cards. */
export function termsSections(offer: PublicOffer = getPublicOffer()): LegalSection[] {
  return [
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
      paragraphs: [offer.notForSale, offer.intended, offer.termsGate],
    },
    {
      heading: "What you submit",
      paragraphs: [
        "The store URL must be a public http or https address you are allowed to use. The optional product file must be a CSV or XLSX sheet you are allowed to upload. Do not upload unlawful content, passwords, verification codes, or identity documents. The form does not ask for those.",
        "A contact email is optional for the free audit. If you type one, it is stored with that audit. The browser that creates the audit also receives an HttpOnly cookie. That cookie authorizes the free trial and the prep-pack download. A shared link does not include the cookie. The email address is not verified.",
      ],
    },
    {
      heading: "The free trial",
      paragraphs: [
        offer.freeTrial,
        "One trial is stored for a normalized store URL and for an email string. A second audit of the same store, or the same email on another store, does not start another trial. The email is not verified, so a different email string is a different record. Different domain names are different stores. Opening someone else's audit link does not transfer the trial.",
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
}

export function privacySections(offer: PublicOffer = getPublicOffer()): LegalSection[] {
  return [
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
        "If you leave the email blank, the free audit still runs. If you type an email, it is saved on the audit record. The public audit page shows a masked form of that email, not the full address. A trial email is stored the same way and is also masked on the public page.",
        "The browser that creates the audit receives an HttpOnly cookie named for that audit. The server stores only a hash of the cookie value. The cookie is what authorizes the free trial and the prep-pack download. It is not a password, it is not shown on the public page, and it is not an email verification.",
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
        "A separate trial slot records that a normalized store URL, or an email string, has already been used. The slot stores the audit id, not a copy of the email. It can outlive the audit record.",
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
        offer.intended,
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
}

export function pricingSections(offer: PublicOffer = getPublicOffer()): LegalSection[] {
  return [
    {
      heading: "Free trial",
      paragraphs: [offer.freeTrial],
    },
    {
      heading: "After the trial",
      paragraphs: [offer.notForSale, offer.intended, offer.termsGate],
    },
    {
      heading: "What you can use now",
      paragraphs: [
        "The free audit is available. It does not download the full product-feed CSV or the full profile draft.",
        "This site is not affiliated with OpenAI or Shopify, and it does not guarantee that ChatGPT or Business Hub will approve or recommend a business.",
      ],
    },
  ]
}
