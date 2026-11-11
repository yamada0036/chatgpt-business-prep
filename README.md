# Prep

A preparation site for merchants who want to claim a business in ChatGPT. It checks public pages and an optional product spreadsheet against the official profile fields and the OpenAI discovery product feed, shows a free audit, and — after a simulated payment — downloads a prep pack the merchant submits themselves.

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

Prices, SKU allowance, crawl caps, and retention are environment variables. Copy `.env.example` to `.env.local`. Nothing in the UI treats a made-up number as a decided live price.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PREP_BASE_PRICE_CENTS` | `0` (unset) | Base pack price in cents. Unset or `0` is an unpriced test configuration. |
| `PREP_CURRENCY` | `USD` | ISO currency shown next to the amount. |
| `PREP_INCLUDED_SKUS` | `50` | Product rows included before overage. |
| `PREP_OVERAGE_BLOCK_SIZE` | `50` | Extra rows per overage block. `0` or less disables overage. |
| `PREP_OVERAGE_BLOCK_PRICE_CENTS` | `0` | Price of one overage block. |
| `PREP_MAX_PRODUCT_PAGES` | `30` | Product detail pages fetched per audit. |
| `PREP_MAX_INFO_PAGES` | `8` | About / policy / contact pages. |
| `PREP_MAX_VARIANTS_PER_PRODUCT` | `40` | Variants kept per product. The rest are reported, not dropped silently. |
| `PREP_MAX_FEED_ROWS` | `1000` | Uploaded sheet rows kept. The omitted count is shown. |
| `PREP_AUDIT_BUDGET_MS` | `110000` | Stop crawling and return the finished part. |
| `PREP_FETCH_TIMEOUT_MS` | `12000` | Per-request timeout. |
| `PREP_RETENTION_DAYS` | `30` | Then the audit, crawl extract, and packs are deleted. |
| `PREP_ALLOW_LOOPBACK` | on | Lets the local fixture stores be crawled. Set `false` if this process is exposed. |
| `PREP_DATA_DIR` | `./data` | Audits and generated files. Gitignored. |

Official field names, availability enums, excluded Ads/Checkout columns, claim steps, and the legal sentences live in `lib/official/spec.ts`. Update that module when OpenAI's docs change. The checkout amount is computed in `lib/pricing.ts` and stored on the order at the moment of simulated payment, so the figure on the page and the recorded charge use the same function.

## Simulated checkout

v1 does not talk to a payment provider and never renders a card form. The checkout buttons are labeled as tests. "Confirm simulated payment (test)" marks the order paid and unlocks the pack for the amount currently configured. "Simulate a failed payment (test)" sets the order to failed and does not create files.

A later provider should create a hosted checkout for that same `amountCents` and currency, then mark the order paid from a verified webhook. The seam is `lib/audit/checkout.ts`. Do not collect card numbers, CVC, or one-time codes in this app. v1 also does not send the contact email; it is stored only so the gate can be tested.

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

On the home page, use the buttons that fill these URLs (same host and port as the app):

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
4. After simulated payment, the zip contains the five required files. With the agent box on, it also contains `04-agent-pack.md`; otherwise that name is absent.
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
