import type { AuditRecord, FeedIssue, ProfileField } from "@/lib/audit/types"
import { toCsv } from "@/lib/csv"
import { columnsFor, incompleteRowCount } from "@/lib/feed/finalize"
import { formatCents } from "@/lib/pricing"
import {
  AGENT_WARNING_ACTIONS,
  AGENT_WARNING_ELIGIBILITY,
  CLAIM_STEPS_EN,
  CLAIM_STEPS_ZH,
  DISCLAIMER_BLOCKS,
  DISCLAIMER_SHORT,
  MERCHANT_SOURCE,
  OFFICIAL_LINKS,
  PACK_FILES,
  REQUIRED_FEED_FIELDS,
  UPLOAD_SOURCE,
} from "@/lib/official/spec"
import { shanghaiLabel } from "@/lib/time"

export function renderPack(audit: AuditRecord, version: number, generatedAt: Date): Record<string, string> {
  const when = shanghaiLabel(generatedAt)
  const files: Record<string, string> = {
    [PACK_FILES.readme]: renderReadme(audit, version, when),
    [PACK_FILES.checklist]: renderChecklist(audit, version, when),
    [PACK_FILES.profile]: renderProfile(audit, version, when),
    [PACK_FILES.feed]: renderFeed(audit),
    [PACK_FILES.issues]: renderIssues(audit.feedIssues),
  }
  if (audit.includeAgentPack) files[PACK_FILES.agent] = renderAgent(audit, version, when)
  return files
}

export function packFileList(includeAgent: boolean): string[] {
  const files: string[] = [
    PACK_FILES.readme,
    PACK_FILES.checklist,
    PACK_FILES.profile,
    PACK_FILES.feed,
    PACK_FILES.issues,
  ]
  if (includeAgent) files.push(PACK_FILES.agent)
  return files
}

function renderReadme(audit: AuditRecord, version: number, when: string): string {
  const pages = audit.pages
    .map((page) => `- ${page.status === "fetched" ? "fetched" : "not_fetched"} | ${page.role} | ${page.url}${page.reason ? ` | ${page.reason}` : ""}`)
    .join("\n")
  const crawled = audit.profile.filter((field) => field.source.startsWith("http")).map((field) => field.fieldName)
  const merchant = audit.profile.filter((field) => field.source === MERCHANT_SOURCE).map((field) => field.fieldName)
  const empty = audit.profile.filter((field) => !field.suggestedValue).map((field) => field.fieldName)
  return [
    "# ChatGPT business prep pack",
    "",
    `- store_url: ${audit.storeUrl}`,
    `- generated_at: ${when}`,
    `- version: ${version}`,
    `- retention_days: ${audit.retentionDays}`,
    `- expires_at: ${audit.expiresAt}`,
    "",
    "## Pages",
    "",
    pages || "- none",
    "",
    "## Where values came from",
    "",
    `- crawled into a draft: ${crawled.join(", ") || "none"}`,
    `- merchant supplement: ${merchant.join(", ") || "none"}`,
    `- still empty: ${empty.join(", ") || "none"}`,
    `- product rows from an uploaded sheet are labeled ${UPLOAD_SOURCE}`,
    audit.feedReason ? `- feed: ${audit.feedReason}` : "- feed: see 03-product-feed.csv",
    audit.upload && audit.upload.omittedRowCount > 0
      ? `- omitted upload rows: ${audit.upload.omittedRowCount}. They were not dropped silently.`
      : "",
    "",
    "## Official documents",
    "",
    `- ${OFFICIAL_LINKS.introducing}`,
    `- ${OFFICIAL_LINKS.help}`,
    `- ${OFFICIAL_LINKS.products}`,
    "",
    "## Disclaimer",
    "",
    DISCLAIMER_SHORT,
    "",
    ...DISCLAIMER_BLOCKS.map((line) => `- ${line}`),
    "",
    "This file is a preparation draft. It does not submit anything to ChatGPT or Business Hub.",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n")
}

function renderChecklist(audit: AuditRecord, version: number, when: string): string {
  const english = audit.outputLanguage === "en"
  const steps = english ? CLAIM_STEPS_EN : CLAIM_STEPS_ZH
  const rows = audit.profile
    .map((field) => `| ${field.fieldName} | ${statusLabel(field, english)} | ${field.source || ""} |`)
    .join("\n")
  const stepRows = steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
  return [
    english ? "# Claim checklist" : "# 认领清单",
    "",
    `- store_url: ${audit.storeUrl}`,
    `- generated_at: ${when}`,
    `- version: ${version}`,
    "",
    english
      ? "Do these steps yourself in ChatGPT. This tool does not sign in, claim, or verify."
      : "下面的步骤需要你在 ChatGPT 里自己完成。本工具不登录、不认领、不验证。",
    "",
    stepRows,
    "",
    english ? "## This store" : "## 本店对照",
    "",
    "| field_name | status | source |",
    "| --- | --- | --- |",
    rows,
    "",
    english
      ? "Official steps above stay in the official interface. They are not marked ready by this tool."
      : "上面的官方步骤都标为需在官方完成。本工具没有代做。",
    "",
    "## Official facts",
    "",
    ...DISCLAIMER_BLOCKS.map((line) => `- ${line}`),
    "",
    `- ${OFFICIAL_LINKS.help}`,
    `- ${OFFICIAL_LINKS.introducing}`,
    `- ${OFFICIAL_LINKS.products}`,
    "",
    DISCLAIMER_SHORT,
    "",
  ].join("\n")
}

function statusLabel(field: ProfileField, english: boolean): string {
  if (field.display === "ready") return english ? "Ready" : "已具备"
  if (field.display === "conflict") return english ? "Conflict" : "有冲突"
  if (field.display === "not_fetched") return english ? "Not fetched" : "未抓到"
  if (!field.required && !field.suggestedValue) return english ? "Optional" : "可选项，仍缺"
  return english ? "Still missing" : "仍缺"
}

function renderProfile(audit: AuditRecord, version: number, when: string): string {
  const blocks = audit.profile.map((field) => {
    const conflicts =
      field.conflicts.length > 0
        ? ["", "### Conflicting values", "", ...field.conflicts.map((item) => `- source: ${item.source}\n  value: ${item.value}`)].join("\n")
        : ""
    return [
      `## ${field.fieldName}`,
      "",
      `- field_name: ${field.fieldName}`,
      `- source: ${field.source}`,
      "- current_found:",
      fence(field.currentFound),
      "- suggested_value:",
      fence(field.suggestedValue),
      `- status: ${field.status}`,
      field.note ? `- note: ${field.note}` : "",
      conflicts,
    ]
      .filter(Boolean)
      .join("\n")
  })
  const copy = audit.profile
    .filter((field) => field.suggestedValue)
    .map((field) => `## ${field.fieldName}\n\n${field.suggestedValue}`)
    .join("\n\n")
  return [
    "# Profile draft",
    "",
    `- store_url: ${audit.storeUrl}`,
    `- generated_at: ${when}`,
    `- version: ${version}`,
    "",
    DISCLAIMER_SHORT,
    "",
    ...blocks,
    "",
    "# Copy-paste draft",
    "",
    copy || (audit.outputLanguage === "zh" ? "没有可直接粘贴的草稿。" : "No pasteable draft yet."),
    "",
  ].join("\n")
}

function fence(value: string): string {
  if (!value) return "```\n\n```"
  return `\`\`\`\n${value}\n\`\`\``
}

function renderFeed(audit: AuditRecord): string {
  const columns = columnsFor(audit.feedRows)
  const rows = audit.feedRows.map((row) => columns.map((column) => row.cells[column]?.value ?? ""))
  return toCsv(columns.length ? columns : [...REQUIRED_FEED_FIELDS], rows)
}

function renderIssues(issues: FeedIssue[]): string {
  const rows = issues.map((issue) => [
    issue.itemId,
    issue.field,
    issue.issueType,
    issue.currentValue,
    issue.suggestedValue,
    issue.sourceUrl,
    issue.note,
  ])
  return toCsv(
    ["item_id", "field", "issue_type", "current_value", "suggested_value", "source_url", "note"],
    rows,
  )
}

function renderAgent(audit: AuditRecord, version: number, when: string): string {
  const returns = audit.profile.find((field) => field.key === "return_policy")
  const excerpt = returns?.currentFound?.slice(0, 500) ?? ""
  const sale = excerpt
    ? `Use only the return policy that was found. Source: ${returns?.source || "unknown"}. Excerpt: ${excerpt}\n\nThis draft does not add a yes or no for sale items unless that sentence is already in the excerpt.`
    : "No return-policy text was found. Leave the answer blank until you write it from your own policy. This draft does not invent a return rule."
  const english = audit.outputLanguage === "en"
  return [
    "# Business agent draft",
    "",
    `> ${AGENT_WARNING_ELIGIBILITY}`,
    "",
    `> ${AGENT_WARNING_ACTIONS}`,
    "",
    english
      ? "> Eligibility warning. Business agents are currently available only to eligible ecommerce and online service businesses in the United States, and a website is required. This draft does not decide eligibility. If the public pages are not enough, the judgment stays: cannot tell."
      : "> 这是草稿。即使勾选了 Agent，信息不足时也只给草稿并加上警告。",
    "",
    `- store_url: ${audit.storeUrl}`,
    `- generated_at: ${when}`,
    `- version: ${version}`,
    "",
    english ? "## Review before you publish" : "## 发布前请审阅",
    "",
    english
      ? "Review the product points and the return policy below in the official agent settings. This tool does not publish the agent."
      : "请在官方 Agent 设置里审阅下面的商品要点和退货政策。本工具不会替你 Publish。",
    "",
    ...audit.feedRows.slice(0, 8).map((row) => {
      const title = row.cells.title?.value || "(empty title)"
      const url = row.cells.url?.value || ""
      return `- ${title}${url ? ` — ${url}` : ""}`
    }),
    "",
    english ? "Return policy:" : "退货政策：",
    "",
    excerpt || (english ? "None found on the public pages that were fetched." : "抓到的公开页面里没有退货政策原文。"),
    "",
    english ? "## Questions and draft answers" : "## 常见问题与建议回答",
    "",
    "### Can I return an item I bought on sale?",
    "",
    sale,
    "",
    english ? "## Tone and forbidden content" : "## 语气和禁止写入的内容",
    "",
    english
      ? "Sound factual and short. Do not include private data, passwords, payment details, government IDs, or one-time codes. Do not promise ranking, approval, or that ChatGPT will recommend the business."
      : "语气保持事实、简短。不得写入隐私数据、密码、支付细节、证件或验证码。不得承诺排名、审核通过或被推荐。",
    "",
    english ? "## Preview questions" : "## 预览测试问题",
    "",
    "- Can I return an item I bought on sale?",
    "- What is your shipping policy?",
    "- Is this item in stock?",
    "- Where do I complete a purchase?",
    "",
    english
      ? "Paste this draft into the official agent settings yourself. Preview it there, then Publish only when you are ready. An agent cannot place orders, make bookings, or look up a customer's order."
      : "把这份草稿自行粘贴到官方 Agent 设置中，预览确认后再 Publish。Agent 目前不能代为下单、预约或查询顾客订单。",
    "",
    DISCLAIMER_SHORT,
    "",
    `Quoted price for this pack was ${formatCents(audit.order.breakdown.totalCents, audit.order.breakdown.currency)}. Incomplete feed rows: ${incompleteRowCount(audit.feedRows)}.`,
    "",
  ].join("\n")
}
