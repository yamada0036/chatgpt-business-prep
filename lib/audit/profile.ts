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
    return "The source text is not English. This tool does not translate, so suggested_value is left blank."
  }
  if (language === "zh" && kind === "latin") {
    return "The source text is not Chinese. This tool does not translate, so suggested_value is left blank."
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
    note: clipped.clipped ? "The draft keeps the first 1,200 characters. The full text is in current_found." : "",
  }
}

export function buildProfile(facts: CrawlFacts, language: OutputLanguage): ProfileField[] {
  if (!facts.homeFetched) {
    return PROFILE_FIELDS.map((field) =>
      make(field.key, "not_fetched", {
        note: "No public page was fetched. This field cannot be filled from that.",
      }),
    )
  }

  const website =
    facts.websiteConflicts.length > 1
      ? make("website", "conflict", {
          conflicts: facts.websiteConflicts,
          currentFound: facts.websiteConflicts.map((item) => item.value).join("\n"),
          note: "The URL you entered and the primary domain on the page do not match. Both values stay in the conflict list. The draft does not pick one.",
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
        note: "The public pages that were fetched have no business description that can be rewritten.",
      })

  const categories = facts.categories.slice(0, 6)
  const category = categories.length
    ? make("product_or_service_category", "ready", {
        source: facts.categorySource,
        currentFound: categories.join(", "),
        suggestedValue: categories.join(", "),
        note: "Taken from public navigation or product categories. This is not a hardcoded official category.",
      })
    : make("product_or_service_category", "needs_input", {
        note: "The navigation and product categories are not clear enough. No official category was guessed.",
      })

  const logo = facts.logoUrl
    ? make("logo", "ready", {
        source: facts.logoSource,
        currentFound: facts.logoUrl,
        suggestedValue: facts.logoUrl,
      })
    : make("logo", "missing", {
        note: "The public pages have no publicly reachable logo image URL.",
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
        note: "Optional.",
      })
    : make("cover_photo", "missing", {
        note: "Optional. No suitable cover image was found, and that is not a missing required field.",
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
      note: draft.note || (draft.value ? "" : "The draft uses the policy page URL."),
    })
  }
  if (linked && !fetched) {
    return make(key, "not_fetched", {
      source: url,
      note: "A link was found, but the page was not fetched. That is not enough to say whether this policy is written.",
    })
  }
  return make(key, "missing", {
    note: "The fetched public pages and links do not show this policy. That only means it was not seen this time.",
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
