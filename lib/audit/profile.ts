import type { CrawlFacts, ProfileField, ProfileDisplay } from "@/lib/audit/types"
import type { OutputLanguage } from "@/lib/audit/types"
import { PROFILE_FIELDS, type ProfileFieldKey } from "@/lib/official/spec"
import { charLength, clipChars, scriptKind } from "@/lib/text"

function statusFor(display: ProfileDisplay): ProfileField["status"] {
  if (display === "ready") return "ready"
  if (display === "conflict") return "conflict"
  return "needs_merchant_input"
}

function make(
  key: ProfileFieldKey,
  display: ProfileDisplay,
  patch: Partial<ProfileField>,
): ProfileField {
  const meta = PROFILE_FIELDS.find((field) => field.key === key)!
  return {
    key,
    fieldName: meta.fieldName,
    required: meta.required,
    display,
    status: statusFor(display),
    source: "",
    currentFound: "",
    suggestedValue: "",
    conflicts: [],
    note: "",
    ...patch,
  }
}

function languageNote(text: string, language: OutputLanguage): string | null {
  const kind = scriptKind(text)
  if (language === "en" && kind === "cjk") {
    return "原文不是英文。本工具不翻译，以免改写事实。suggested_value 留空。"
  }
  if (language === "zh" && kind === "latin") {
    return "原文不是中文。本工具不翻译，以免改写事实。suggested_value 留空。"
  }
  return null
}

function draftFrom(text: string, language: OutputLanguage): { value: string; note: string } {
  const cleaned = text.trim()
  if (!cleaned) return { value: "", note: "" }
  const blocked = languageNote(cleaned, language)
  if (blocked) return { value: "", note: blocked }
  const clipped = clipChars(cleaned, 1200)
  return {
    value: clipped.text,
    note: clipped.clipped ? "草稿只保留前 1200 个字符，原文见 current_found。" : "",
  }
}

export function buildProfile(facts: CrawlFacts, language: OutputLanguage): ProfileField[] {
  if (!facts.homeFetched) {
    return PROFILE_FIELDS.map((field) =>
      make(field.key, "not_fetched", {
        note: "未抓到公开页面。不能据此填写这项资料。",
      }),
    )
  }

  const website =
    facts.websiteConflicts.length > 1
      ? make("website", "conflict", {
          conflicts: facts.websiteConflicts,
          currentFound: facts.websiteConflicts.map((item) => item.value).join("\n"),
          note: "输入网址和页面上的主域名不一致。两个值都保留在冲突列表里，草稿不选其中一个。",
        })
      : make("website", "ready", {
          source: facts.finalUrl,
          currentFound: facts.finalUrl,
          suggestedValue: facts.finalUrl,
        })

  const descriptionDraft = draftFrom(facts.description, language)
  const description = facts.description
    ? make(
        "business_description",
        descriptionDraft.value ? "ready" : "needs_input",
        {
          source: facts.descriptionSource,
          currentFound: clipChars(facts.description, 2000).text,
          suggestedValue: descriptionDraft.value,
          note: descriptionDraft.note,
        },
      )
    : make("business_description", "missing", {
        note: "已查看抓到的公开页面，没有看到可改写的业务描述。",
      })

  const categories = facts.categories.slice(0, 6)
  const category = categories.length
    ? make("product_or_service_category", "ready", {
        source: facts.categorySource,
        currentFound: categories.join(", "),
        suggestedValue: categories.join(", "),
        note: "归纳自公开导航或商品类目，不是官方类目树里的硬编码映射。",
      })
    : make("product_or_service_category", "needs_input", {
        note: "导航和商品类目不够明确，没有猜测一个官方类目。",
      })

  const logo = facts.logoUrl
    ? make("logo", "ready", {
        source: facts.logoSource,
        currentFound: facts.logoUrl,
        suggestedValue: facts.logoUrl,
      })
    : make("logo", "missing", {
        note: "已查看公开页面，没有看到可公开访问的 logo 图片 URL。",
      })

  const delivery = policyField(
    "delivery_policy",
    facts.deliveryUrl,
    facts.deliveryExcerpt,
    facts.deliveryFetched,
    facts.deliveryLinked,
    language,
  )
  const returns = policyField(
    "return_policy",
    facts.returnUrl,
    facts.returnExcerpt,
    facts.returnFetched,
    facts.returnLinked,
    language,
  )

  const cover = facts.coverUrl
    ? make("cover_photo", "ready", {
        source: facts.coverSource,
        currentFound: facts.coverUrl,
        suggestedValue: facts.coverUrl,
        note: "可选项。",
      })
    : make("cover_photo", "missing", {
        note: "可选项。没有看到合适的封面图，这不算缺项。",
      })

  return [website, description, category, logo, delivery, returns, cover]
}

function policyField(
  key: "delivery_policy" | "return_policy",
  url: string,
  excerpt: string,
  fetched: boolean,
  linked: boolean,
  language: OutputLanguage,
): ProfileField {
  if (fetched && url) {
    const draft = draftFrom(excerpt, language)
    const suggested = draft.value || url
    return make(key, "ready", {
      source: url,
      currentFound: clipChars(excerpt, 2000).text,
      suggestedValue: suggested,
      note: draft.note || (draft.value ? "" : "草稿使用政策页 URL。"),
    })
  }
  if (linked && !fetched) {
    return make(key, "not_fetched", {
      source: url,
      note: "找到了链接，但页面未抓到。不能据此判断这项政策有没有写。",
    })
  }
  return make(key, "missing", {
    note: "已查看抓到的公开页面和链接，没有看到这项政策。这只说明这次没看到。",
  })
}

export function excerpt(value: string, max = 80): string {
  const clipped = clipChars(collapsePreview(value), max)
  return clipped.clipped ? `${clipped.text}…` : clipped.text
}

function collapsePreview(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function foundLength(value: string): number {
  return charLength(value)
}
