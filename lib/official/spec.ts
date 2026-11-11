/**
 * Official field names, enums, links, and disclaimers.
 * Update this module when OpenAI's docs change. Do not copy these strings
 * into pages or pack templates.
 *
 * Read on 2026-11-11:
 * - https://openai.com/index/introducing-businesses-chatgpt (2026-11-10)
 * - https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt
 * - https://developers.openai.com/commerce/specs/file-upload/products
 *
 * v1 emits a Business Hub upload CSV (UTF-8), not SFTP / parquet delivery.
 * Ads and checkout columns are intentionally absent.
 */

export const OFFICIAL_LINKS = {
  introducing: "https://openai.com/index/introducing-businesses-chatgpt",
  help: "https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt",
  products: "https://developers.openai.com/commerce/specs/file-upload/products",
} as const

export const PROFILE_FIELDS = [
  { key: "website", fieldName: "website", required: true },
  { key: "business_description", fieldName: "business description", required: true },
  { key: "product_or_service_category", fieldName: "product or service category", required: true },
  { key: "logo", fieldName: "logo", required: true },
  { key: "delivery_policy", fieldName: "delivery policy", required: true },
  { key: "return_policy", fieldName: "return policy", required: true },
  { key: "cover_photo", fieldName: "cover photo", required: false },
] as const

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]["key"]

export const REQUIRED_FEED_FIELDS = [
  "item_id",
  "title",
  "description",
  "url",
  "brand",
  "seller_name",
  "image_url",
  "availability",
  "price",
] as const

export const VARIANT_FEED_FIELDS = [
  "group_id",
  "listing_has_variations",
  "variant_dict",
] as const

export const OPTIONAL_FEED_FIELDS = [
  "sale_price",
  "additional_image_urls",
  "condition",
  "product_category",
  "color",
  "size",
  "gtin",
  "mpn",
  "seller_url",
  "accepts_returns",
  "return_deadline_in_days",
  "return_policy",
  "shipping_price",
] as const

export const FEED_FIELDS = [
  ...REQUIRED_FEED_FIELDS,
  ...VARIANT_FEED_FIELDS,
  ...OPTIONAL_FEED_FIELDS,
] as const

export type FeedField = (typeof FEED_FIELDS)[number]

/** Present in the products spec, but not written by v1. */
export const EXCLUDED_FEED_FIELDS = [
  "is_eligible_search",
  "is_ads_eligible",
  "is_eligible_checkout",
  "seller_privacy_policy",
  "seller_tos",
  "enable_search",
  "enable_checkout",
  "is_eligible_ads",
  "target_countries",
  "store_country",
  "marketplace_seller",
] as const

export const AVAILABILITY_VALUES = [
  "in_stock",
  "out_of_stock",
  "pre_order",
  "backorder",
  "unknown",
] as const

export type AvailabilityValue = (typeof AVAILABILITY_VALUES)[number]

export const CONDITION_VALUES = ["new", "refurbished", "used"] as const

export const ISSUE_TYPES = [
  "missing",
  "invalid",
  "conflict",
  "needs_merchant_input",
  "truncated",
] as const

export type IssueType = (typeof ISSUE_TYPES)[number]

export const TITLE_MAX = 150
export const DESCRIPTION_MAX = 5000
export const DESCRIPTION_HARD_CAP = 20000

export const DISCLAIMER_SHORT =
  "This tool does not claim the business, does not promise a recommendation, and does not collect identity documents. It does not sign in to ChatGPT or Business Hub, does not collect passwords or verification codes, and does not guarantee approval."

export const DISCLAIMER_BLOCKS = [
  "This tool only prepares and checks. It does not claim, verify, or complete Persona identity verification for the merchant.",
  "It does not claim the business, does not promise a recommendation, and does not guarantee that a claim or review will be approved.",
  "A completed claim is not a blue check. The blue check appears only after Persona verification is approved.",
  "Claiming does not guarantee more visibility and does not control ChatGPT's independent recommendations.",
  "Connecting a product feed does not publish an agent and does not guarantee that products are recommended.",
  "Profile updates need OpenAI review and do not appear in every answer immediately. ChatGPT may still use other sources.",
  "Business Agent is currently available only to eligible ecommerce and online service businesses in the United States, and a website is required.",
  "Local shops and restaurants can currently claim only an existing United States listing.",
  "An agent cannot place orders, make bookings, or look up a customer's order. It can only explain products and policies and link to the website.",
  "The official standard file upload is currently aimed at the United States market by default.",
] as const

export const AGENT_WARNING_ELIGIBILITY =
  "Eligibility limit: Business Agent is currently available only to eligible ecommerce and online service businesses in the United States, and a website is required. When there is not enough information, this tool's judgment is \"cannot tell\". It will not assert that this store can or cannot publish an agent."

export const AGENT_WARNING_ACTIONS =
  "An agent cannot place orders, make bookings, or look up a customer's order. It can only explain products and policies and link to the website."

export const MERCHANT_SOURCE = "merchant supplement"
export const UPLOAD_SOURCE = "uploaded spreadsheet"

export const SCORE_EXPLANATION =
  "This is this tool's readiness score, not an official score. When this run includes an applicable product feed, the profile score and the feed score each count for 50%. When the feed is excluded or not applicable, only the profile score is used. The profile score splits six fields equally: website, business description, product or service category, logo, delivery policy, and return policy. Ready scores full points, needs input or missing scores 0, and a conflict scores 50%. The feed score is the number of rows whose nine required fields all have valid values, divided by the total number of rows. availability: unknown is an official allowed value and means stock is unknown, not in stock. The final score is rounded down, from 0 to 100."

export const CLAIM_STEPS_EN = [
  "Sign in to ChatGPT, open Business Hub from the sidebar, and search for the business by name.",
  "Select the matching listing and confirm the ChatGPT account that will manage it.",
  "Verify with a method the official flow offers for this business: business phone, business email, website domain TXT, or Shopify.",
  "Wait for the claim-review email.",
  "Complete Persona identity verification. A blue check appears only after Persona is approved. Profile edits, feed upload, insights, and agent setup stay unavailable until then.",
  "Update the profile and submit it. Wait for OpenAI to review and publish the change.",
  "If you sell products: connect a Shopify feed, or upload a CSV / provide a hosted feed URL yourself.",
  "If the business is an eligible US ecommerce or online service: review the product and policy information the agent will use, preview it, then Publish in the official interface.",
] as const

export const CLAIM_STEPS_ZH = [
  "登录 ChatGPT，从侧边栏打开 Business Hub，按名称搜索店铺。",
  "选择对应 listing，确认用来管理的 ChatGPT 账号。",
  "按官方这次给出的方式验证：商业电话、企业邮箱、网站域名 TXT，或 Shopify。",
  "等待认领审批邮件。",
  "完成 Persona 身份核验。蓝标要等 Persona 批准后才会出现。在此之前不能改资料、传 feed、看数据或建 Agent。",
  "更新资料并提交，等待 OpenAI 审核发布。",
  "如售卖商品：自己连接 Shopify feed，或上传 CSV / 提供托管 URL。",
  "如符合美国电商或线上服务条件：审阅 Agent 将使用的商品与政策信息，在官方界面预览后再 Publish。",
] as const

export const ERROR_MESSAGES = {
  bad_url: "Enter a public http or https store URL.",
  blocked: "This URL cannot be fetched. Use a different public store URL.",
  unreachable: "This URL could not be opened. Confirm it is public, or try another URL.",
  login: "This page requires sign-in or was blocked. This run records it as not fetched.",
  timeout: "The crawl timed out. What finished is below, and you can retry.",
  unsupported_file: "That file type is not supported. Upload a CSV or XLSX.",
  empty_file: "The uploaded sheet has no data rows.",
  too_large: "The file is over the size limit.",
  unreadable: "This sheet could not be read. Confirm it is a CSV or XLSX.",
  expired: "This audit is past its retention period. The crawl and the prep pack have been deleted.",
  not_found: "This audit was not found.",
  unpaid: "The full prep pack cannot be downloaded before payment.",
  email: "A contact email is required before payment. It is stored for a delivery notice only, and v1 does not send mail.",
} as const

export const PACK_FILES = {
  readme: "00-readme.md",
  checklist: "01-claim-checklist.md",
  profile: "02-profile-draft.md",
  feed: "03-product-feed.csv",
  issues: "03-product-feed-issues.csv",
  agent: "04-agent-pack.md",
} as const

export const VARIANT_UNPARSED_NOTE =
  "Variants were not split. There was no reliable variant data, so this stayed one row and was not marked as split."
