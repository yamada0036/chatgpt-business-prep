# Prep

A preparation site for merchants who want to claim a business in ChatGPT. It checks public pages and an optional product spreadsheet against the official profile fields and the OpenAI discovery product feed, shows a free audit, and — after a verified PayPal capture — downloads a prep pack the merchant submits themselves.

This tool does not claim the business, sign in to ChatGPT or Business Hub, collect identity documents, or promise ranking or approval.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

```bash
npm test
npm run lint
```

## Where config lives

Prices, SKU allowance, crawl caps, retention, PayPal, and storage are environment variables. Copy `.env.example` to `.env.local`. Do not put real secrets in the repo.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PREP_TRIAL_DAYS` | `7` | Published trial length in days. |
| `PREP_TRIAL_PRICE_CENTS` | `990` | Published trial price in cents. USD 9.90. Not charged while checkout is off. |
| `PREP_MONTHLY_PRICE_CENTS` | `4990` | Published price after the trial, in cents. USD 49.90 / month, renewing unless canceled. Not charged while checkout is off. |
| `PREP_BASE_PRICE_CENTS` | `0` | Old one-time pack price. `0` while paid checkout is off. |
| `PREP_CURRENCY` | `USD` | ISO currency shown next to the amount and sent to PayPal. |
| `PREP_INCLUDED_SKUS` | `50` | Product rows included in the paid pack. |
| `PREP_OVERAGE_BLOCK_SIZE` | `50` | Extra rows per overage block. Unused while the overage price is `0`. |
| `PREP_OVERAGE_BLOCK_PRICE_CENTS` | `0` | No SKU overage charge. Larger catalogs still pay the base price. |
| `PREP_MAX_PRODUCT_PAGES` | `30` | Product detail pages fetched per audit. |
| `PREP_MAX_INFO_PAGES` | `8` | About / policy / contact pages. |
| `PREP_MAX_VARIANTS_PER_PRODUCT` | `40` | Variants kept per product. The rest are reported, not dropped silently. |
| `PREP_MAX_FEED_ROWS` | `1000` | Uploaded sheet rows kept for the audit. The omitted count is shown. |
| `PREP_AUDIT_BUDGET_MS` | `110000` | Stop crawling and return the finished part. |
| `PREP_FETCH_TIMEOUT_MS` | `12000` | Per-request timeout. |
| `PREP_RETENTION_DAYS` | `30` | Then the audit, crawl extract, and packs are deleted. |
| `PREP_ALLOW_LOOPBACK` | on locally | Lets local fixture stores be crawled. Forced off when `PAYPAL_ENV=live` or when a production deploy has a price. |
| `PREP_DATA_DIR` | `./data` | Local filesystem store only. Gitignored. Not used on Vercel. |
| `PAYPAL_CLIENT_ID` | empty | PayPal REST app client id. Public in the browser. The secret never is. |
| `PAYPAL_CLIENT_SECRET` | empty | PayPal REST app secret. Server only. |
| `PAYPAL_WEBHOOK_ID` | empty | Id of the webhook registered in the PayPal app. Required before checkout can start. |
| `PAYPAL_ENV` | `sandbox` | `sandbox` or `live`. Only `live` talks to the live API. |
| `BLOB_READ_WRITE_TOKEN` | empty | Private Vercel Blob read/write token. |
| `BLOB_STORE_ID` | empty | Private Blob store id when the deployment uses Vercel OIDC instead of a token. |
| `DATABASE_URL` | empty | Optional. Audits and pack files are stored in private Blob. Postgres is not required. |
| `PREP_PUBLIC_URL` | empty | Optional origin for PayPal return and cancel URLs. |

Official field names, availability enums, excluded Ads/Checkout columns, claim steps, and the legal sentences live in `lib/official/spec.ts`. Update that module when OpenAI's docs change. The checkout amount is computed in `lib/pricing.ts` and stored on the order. PayPal is created with that same `amountCents` and currency. The webhook accepts the capture only when the amount and currency still match.

## Pricing — 7-day trial, then a monthly fee

The published price is a **7-day trial for USD 9.90**, then **USD 49.90 / month**, renewing automatically unless the customer cancels by email to the support address. A refund of either fee may be requested within 7 days after that charge. **Paid checkout is off, so the site does not charge either amount and does not run a renewal.** The free audit summary on the homepage stays free to run. It is not the paid trial.

- Trial: `POST /api/audits/:id/trial` with the owner cookie set when the audit was created (`HttpOnly`, not an email verification). A blank `contact_email` keeps the address already stored on the audit. The route does not create a PayPal order. While the published trial price is not zero and checkout is off, the route refuses to start and charges nothing. Code: `lib/offer.ts` (server prices), `lib/subscription.ts` (trial state), `lib/audit/checkout.ts` (`startFreeTrial`), `components/trial-panel.tsx`, `components/pricing-cards.tsx`.
- The browser that creates the audit is the only one that can start the trial or download the pack. A shared audit link still shows the free summary. Audits created before this cookie have no owner hash: they cannot start a trial or download, and the server does not mint a replacement credential for whoever opens the link. Start a new audit in this browser. Losing the cookie means the same thing: the summary remains, the pack does not.
- One trial per audit. A second slot is stored for the normalized store URL (`www`, trailing slash, and tracking parameters folded together) and for the email string. Those slots survive the 30-day audit retention. An expired trial cannot be restarted on the same audit, the same normalized store, or the same email string.
- Remaining limits: the email is not verified, so a different email string is a different slot. A different domain is a different store. The first owner who starts a trial for a store consumes that store's slot, including someone who audits a public URL they do not operate. There is no admin reset in this version.
- The published monthly fee renews automatically unless the customer cancels. **This code does not charge it and does not run that renewal.** PayPal Subscriptions is not wired up. `PREP_MONTHLY_PRICE_CENTS` is the published price. It is not sent to PayPal.

## PayPal Checkout

Paid checkout is turned off. The site does not create a PayPal order, does not run the earlier USD 49 one-time charge, and does not charge the USD 9.90 trial fee or the USD 49.90 monthly fee. The webhook route still exists and does not fulfill an order while checkout is off.

The buyer pays on PayPal. This site does not render a card form and does not collect card numbers, bank details, or a PayPal password.

Checkout creates the order on the server with the Orders API, `intent: CAPTURE`. After approval, the server captures the order. That capture response and the return URL do not unlock the pack. The pack is published only from `fulfillVerifiedCapture` in `lib/audit/checkout.ts`, and only after `POST /api/paypal/webhook` verifies the signature and the capture is `COMPLETED` for the same order id, amount, and currency.

If storage is not durable, paid checkout returns an error and does not create a PayPal order. Local development without PayPal credentials can still use the labeled simulated buttons. Those buttons are refused when PayPal credentials are set, when `PAYPAL_ENV=live`, and on a production deployment that has a price. Homepage fixture buttons are hidden in production and whenever `PAYPAL_ENV=live`.

A catalog with more than `PREP_INCLUDED_SKUS` rows (default 50) does not add an SKU charge. The pack includes the first 50. The audit page, checkout page, delivery page, and `00-readme.md` say that the rest are not in the pack. The monthly figure on the pricing page is not that charge.

### Sandbox

1. In the PayPal developer dashboard, create a sandbox REST app and copy the client id and secret into `.env.local`.
2. Leave `PREP_BASE_PRICE_CENTS=0`. Setting PayPal keys, `PAYPAL_ENV=sandbox`, or `PREP_MONTHLY_PRICE_CENTS` does not create an order and does not charge the USD 49.90 monthly price. Paid checkout stays off until subscription billing is implemented. Do not point this sandbox list at a live account.
3. Set `BLOB_READ_WRITE_TOKEN` (or `BLOB_STORE_ID` on Vercel). That private Blob store holds the audit record and the pack files. `DATABASE_URL` is optional and is not required.
4. Run the app on a URL PayPal can reach. For local sandbox, expose it with a tunnel and set `PREP_PUBLIC_URL` to that origin.
5. In the sandbox app, add a webhook. The URL to register is `https://<your-domain>/api/paypal/webhook`. Subscribe to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, and `PAYMENT.CAPTURE.REVERSED`.
6. Copy the webhook id into `PAYPAL_WEBHOOK_ID`.
7. Do not expect a sandbox payment to succeed. The PayPal route returns 403 and no order is created. The published USD 9.90 trial also does not start while checkout is off.
8. Opening the return URL, or calling the capture route, does not unlock the download. The webhook route answers `checkout_disabled` and does not fulfill.

### Live

Do not set `PAYPAL_ENV=live` to start charging. Live keys do not enable checkout. When subscription billing exists, create a live REST app, set `PAYPAL_ENV=live`, replace the client id, secret, and webhook id with the live values, and register the same path on the live app: `https://<your-production-domain>/api/paypal/webhook`. Confirm the private Blob token is set on that deployment. `PREP_ALLOW_LOOPBACK` is forced off in this mode. Redeploy only after those values are in the host's environment, not in git. If the PayPal variables are missing, the free audit still runs and paid checkout stays unavailable.

## What the merchant gets

After payment, the zip is named `chatgpt-business-prep_{store-slug}_{yyyymmdd-hhmm}.zip` in Asia/Shanghai. Inside:

- `00-readme.md`
- `01-claim-checklist.md`
- `02-profile-draft.md`
- `03-product-feed.csv` (UTF-8 with BOM)
- `03-product-feed-issues.csv`
- `04-agent-pack.md` only when the agent box was checked

Empty required cells stay empty. Unknown stock is the official value `unknown`, not a guess that the item is in stock. Conflicting values are written to the issues file and left blank in the feed. Supplementing a missing or conflicting field writes a new version; older zips stay downloadable until retention deletes the audit.

## Local fixtures

On a local or preview sandbox deploy, the home page shows buttons that fill these URLs (same host and port as the app). Production and `PAYPAL_ENV=live` hide those buttons.

- `/fixtures/incomplete` — public shop with no brand, price, or return policy
- `/fixtures/complete` — profile, policies, and two variants
- `/fixtures/login` — a sign-in wall
- `/fixtures/brochure` — not a shop; the profile audit still completes and the feed is marked not applicable
- `/fixtures/shop` — Shopify-style `products.json`
- `/fixtures/options` — a color menu that is not split into variant rows

`public/examples/partial-catalog.csv` is a small sheet with official headers.

## v1 limits

- JavaScript storefronts are not rendered. The crawler reads HTML, JSON-LD, and public `products.json`.
- Product titles and descriptions are kept in the language found on the page. The tool does not translate them.
- Profile notes in the draft are English. Pasteable values and the checklist follow the output language selected on the form (default English). The site itself is English.
- Image URLs found on the page are recorded. v1 does not HEAD-check every image.
- No Shopify OAuth, no SFTP, no Business Hub login, no email delivery, no multi-store queue.
- `availability: unknown` counts as a filled official value. The issues file still asks the merchant to replace it.
- Rows beyond the feed cap are counted and omitted, with the count shown on the audit and in the readme.

## How to verify the acceptance criteria

1. Paste `/fixtures/complete` (or any public store) with no file. The free audit lists each profile field as Ready / Missing / Needs input / Conflict.
2. Upload a CSV that shares `item_id` with a crawled product but disagrees on `price`. The issues file records `conflict` and the feed cell is empty. Covered by `tests/prep.test.ts`.
3. Before payment, `GET /api/audits/:id/download` returns 403. The free JSON has no full profile draft and no full product description.
4. After a verified PayPal capture webhook, the zip contains the five required files. With the agent box on, it also contains `04-agent-pack.md`; otherwise that name is absent. The return URL alone does not unlock it.
5. Feed headers are the official English names. `price` looks like `18.00 USD`. A non-empty `availability` is one of the five official values.
6. Run `/fixtures/incomplete`. Brand and price cells are empty. The return policy is empty or Needs input / Missing, not an invented policy.
7. Run `/fixtures/login`. The report says Not fetched and does not say the policy does not exist.
8. The home page, audit page, delivery page, and `00-readme.md` all include "does not claim" and "does not promise a recommendation".
9. An agent draft starts with the US eligibility warning and says the agent cannot place orders, bookings, or order lookups.
10. On the delivery page, submit a missing field. A new version appears and the previous zip still downloads.
11. The app forms have no password, OTP, or identity-document fields. The login fixture is a fake storefront used only to test the crawler.
12. If required feed cells are still empty, the delivery page states the row count and that those rows may be rejected.
13. Suggested profile values cite a source URL or `merchant supplement`. Re-run two public stores when you want a live check; blocked or login-only pages stay Not fetched.
14. Required-field checks follow the products spec linked from `lib/official/spec.ts`, including money format and the availability enum.
15. Titles over 150 characters and descriptions over 5,000 stay intact and get an `invalid` issue. The issues file uses `truncated` only when text is actually cut (the hard cap is 20,000 characters).
16. Shopify-style variants in `/fixtures/shop` become separate rows with `group_id`, `listing_has_variations`, and `variant_dict`. `/fixtures/options` stays one row and the issues file says the variants were not split.
17. The crawl budget stops a slow audit with a partial result and a retry. It does not spin past the budget.
18. `PREP_RETENTION_DAYS` is shown on the delivery page. Expired audit folders are removed on the next read.
19. Logs go through `logEvent`, which drops password, OTP, card, and document keys. There is no card field to store.

Out of scope, on purpose: a CSV being accepted by Business Hub, a blue check, domain TXT, or a Shopify connection.
