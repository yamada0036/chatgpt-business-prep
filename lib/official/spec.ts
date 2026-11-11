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
  "不代认领，不保证推荐，不收集证件。不登录 ChatGPT 或 Business Hub，不收集密码或验证码，也不保证审核通过。"

export const DISCLAIMER_BLOCKS = [
  "本工具只做准备和检查，不代替商家认领、验证或做 Persona 身份核验。",
  "不代认领，不保证推荐，不保证认领或审核通过。",
  "认领通过不等于有蓝标；蓝标在 Persona 核验批准后才出现。",
  "认领不会保证更高曝光，也不能直接控制 ChatGPT 的独立推荐。",
  "连接商品 feed 不会发布 Agent，也不保证商品被推荐。",
  "资料更新需 OpenAI 审核，不会立刻出现在所有回答里；ChatGPT 仍可能使用其他来源。",
  "Business Agent 目前仅对美国符合条件的电商和线上服务商家开放，且需要网站。",
  "本地店和餐馆目前只能认领已有的美国 listing。",
  "Agent 目前不能代为下单、预约或查询顾客订单，只能说明产品与政策并链到官网。",
  "官方标准格式上传目前默认面向美国市场。",
] as const

export const AGENT_WARNING_ELIGIBILITY =
  "资格限制：Business Agent 目前仅对美国符合条件的电商和线上服务商家开放，且需要网站。信息不足时，本工具的判断是「无法判断」，不会断言本店一定能发布或不能发布 Agent。"

export const AGENT_WARNING_ACTIONS =
  "目前不能代为下单、预约或查询顾客订单。Agent 只能说明产品与政策并链到官网。"

export const MERCHANT_SOURCE = "商家补充"
export const UPLOAD_SOURCE = "商家上传表格"

export const SCORE_EXPLANATION =
  "这是本工具的准备度，不是官方分数。若本次包含适用的商品 feed，资料分和 feed 分各占 50%；若不包含 feed，或 feed 不适用，只计算资料分。资料分把 website、business description、product or service category、logo、delivery policy、return policy 六项均分：已具备得满分，需补充或缺失得 0，有冲突得 50%。feed 分是必填 9 个字段都有有效值的行数除以总行数。availability 的 unknown 是官方允许值，表示库存未知，不是有货。最终分向下取整，范围 0–100。"

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
  bad_url: "请输入可公开访问的 http 或 https 店铺网址。",
  blocked: "这个网址不能抓取。请换一个公开的店铺网址。",
  unreachable: "打不开这个网址。请确认它能公开访问，或更换网址后重试。",
  login: "这个页面需要登录或被拦截。本次只记为未抓到。",
  timeout: "抓取超时。下面是已经完成的部分，可以重试。",
  unsupported_file: "文件格式不支持。请上传 CSV 或 XLSX。",
  empty_file: "上传的表格里没有数据行。",
  too_large: "文件超过大小上限。",
  unreadable: "读不了这个表格。请确认它是 CSV 或 XLSX。",
  expired: "这份体检已过保留期，抓取结果和准备包已删除。",
  not_found: "没有找到这次体检。",
  unpaid: "支付完成前不能下载完整准备包。",
  email: "付费前需要填写联系邮箱。这个邮箱只用于交付通知，v1 不会发信。",
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
  "未处理变体。没有可靠的规格数据，所以没有拆成多行，也没有假装已经拆分。"
