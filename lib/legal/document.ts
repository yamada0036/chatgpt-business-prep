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
      heading: "If a submission breaks these rules",
      paragraphs: [
        "Use a public store URL you are allowed to use, and upload only a CSV or XLSX sheet you are allowed to upload. Do not submit unlawful material. Do not submit passwords, verification codes, or identity documents. The form does not ask for those.",
        "The site refuses a submission it can already check: a URL that is not public http or https, a URL that contains a username or password, a URL that points at a private or local address, a file over the upload limit or that is not a readable CSV or XLSX sheet, and a contact email that is not a valid address format.",
        "There is no user account, so there is nothing to suspend. If a submission breaks these rules, or if the operator finds that the submitter was not allowed to use the store URL or the file, the operator may remove that audit record and its prep files from this site's storage. The operator may also refuse a later submission when the operator can match it to the same store URL or email. That refusal is limited to this site and to the submission the operator can match. The site has no automatic block list.",
        "The operator may stop providing this tool for that submission. Stopping it means the audit is no longer kept in this site's store, either because the operator removes it or because a later read after the expiry time removes it. This page does not promise how soon that happens. Removing the audit does not delete Vercel function logs or Vercel Web Analytics events. A trial slot for that store or email can remain. The slot only records that a trial was already used.",
        "These are the steps this site can take. They do not replace a consequence that applicable law already provides, and this page does not name a governing law. Paid checkout is not available. This section does not add a charge or a refund rule.",
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
      heading: "Requests about your information",
      paragraphs: [
        "A right to see, correct, or delete information, or to object to its use, depends on the law that applies to you. This page does not name that law and does not certify compliance with a privacy statute. A request is not granted where that law does not require it or where this site no longer has the record.",
        `Send the request to ${SUPPORT_EMAIL} and include the audit id from the audit link. There is no account page and no search by email. A trial slot stores a hash and an audit id, not a searchable copy of the email, so the operator cannot reliably find an audit from an email address alone.`,
        "Anyone with the audit link can open the public audit page. That page shows the store URL, the readiness result, short samples, and a masked contact email if one was saved. It does not show the full email, the owner cookie, or the full product sheet. The browser that created the audit holds an HttpOnly cookie. While the free trial allows it, that browser can download the prep pack. If you email the audit id and the record still exists, the operator can read the private record and tell you the stored contact email, the store URL, and whether a product sheet and crawl extracts are there. The cookie value itself is not stored. Only a hash of it is stored. This page does not describe what remains in Vercel function logs or Vercel Web Analytics.",
        "The browser that created the audit can fill missing profile or feed fields, and can save a contact email, while that browser is still allowed to do so. For another correction, email the audit id and the change you want. If the record still exists, the operator can correct the contact email stored on that audit. The operator cannot correct text that exists only in a Vercel log or in Web Analytics, and this page does not promise a new crawl.",
        "There is no delete button. Email the audit id and ask for deletion. The operator can then delete that audit record and its prep files from the private store. The site does not promise that this happens immediately or on a stated date. A later read after the expiry time also removes that record, as described above. Deleting the audit does not delete Vercel function logs or Vercel Web Analytics. The trial slot can remain, and it does not keep a copy of the email. If the audit is already gone, there may be nothing left in this store to delete.",
        "The prep-pack download is the copy this site provides. There is no second export of server logs. The site does not keep a marketing list, and it has no feature that sends the store contents you submit into a model-training pipeline. To avoid a new audit, do not submit one. Asking to restrict or object does not switch off Vercel Web Analytics. This application has no switch for that.",
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
