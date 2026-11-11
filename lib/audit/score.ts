import type { FeedSummary, ProfileField, ScoreResult, UrgentIssue } from "@/lib/audit/types"
import { PROFILE_FIELDS, SCORE_EXPLANATION } from "@/lib/official/spec"

export function profileCounts(fields: ProfileField[]) {
  const counts = { ready: 0, missing: 0, needs_input: 0, conflict: 0 }
  for (const field of fields) {
    if (!field.required) continue
    if (field.display === "ready") counts.ready += 1
    else if (field.display === "missing") counts.missing += 1
    else if (field.display === "conflict") counts.conflict += 1
    else counts.needs_input += 1
  }
  return counts
}

export function scoreAudit(input: {
  profile: ProfileField[]
  includeFeed: boolean
  feedApplicable: boolean
  summary: FeedSummary
}): ScoreResult {
  const scored = PROFILE_FIELDS.filter((field) => field.required).map((field) =>
    input.profile.find((item) => item.key === field.key),
  )
  let points = 0
  for (const field of scored) {
    if (!field) continue
    if (field.display === "ready") points += 1
    else if (field.display === "conflict") points += 0.5
  }
  const profilePercent = (points / scored.length) * 100
  const feedWeighted = input.includeFeed && input.feedApplicable
  const feedPercent =
    !feedWeighted || input.summary.total === 0
      ? feedWeighted
        ? 0
        : null
      : (input.summary.complete / input.summary.total) * 100
  const blended =
    feedWeighted && feedPercent !== null
      ? profilePercent * 0.5 + feedPercent * 0.5
      : profilePercent
  const total = Math.max(0, Math.min(100, Math.floor(blended)))
  return {
    total,
    profilePercent: Math.round(profilePercent * 100) / 100,
    feedPercent: feedPercent === null ? null : Math.round(feedPercent * 100) / 100,
    feedWeighted,
    explanation: SCORE_EXPLANATION,
  }
}

export function urgentIssues(profile: ProfileField[], summary: FeedSummary, feedApplicable: boolean): UrgentIssue[] {
  const ranked: { priority: number; issue: UrgentIssue }[] = []
  for (const field of profile) {
    if (!field.required) continue
    if (field.display === "conflict") {
      ranked.push({
        priority: 1,
        issue: {
          name: field.fieldName,
          state: "Conflict",
          impact: "This field has more than one source and they disagree. The prep pack does not pick one. Confirm it before you submit.",
        },
      })
    } else if (field.display === "not_fetched") {
      ranked.push({
        priority: 2,
        issue: {
          name: field.fieldName,
          state: "Not fetched",
          impact: "The matching public page was not fetched, so this field is not marked ready or missing. Add it yourself before you submit the claim.",
        },
      })
    } else if (field.display === "missing") {
      ranked.push({
        priority: 3,
        issue: {
          name: field.fieldName,
          state: "Missing",
          impact: "This was not seen on the public pages. After a claim is approved you update it in Business Hub. A blank field has no draft to paste.",
        },
      })
    } else if (field.display === "needs_input") {
      ranked.push({
        priority: 4,
        issue: {
          name: field.fieldName,
          state: "Needs input",
          impact: "What was found is not enough for a draft you can submit. Add it before you paste it into the official console.",
        },
      })
    }
  }
  if (feedApplicable && summary.missingRows > 0) {
    ranked.push({
      priority: 3,
      issue: {
        name: "product feed",
        state: `${summary.missingRows} rows are missing required fields`,
        impact: "Under the official spec, a row is rejected when a required field is empty or unreadable. Those cells stay blank. They were not filled with invented values.",
      },
    })
  }
  if (feedApplicable && summary.invalidRows > 0) {
    ranked.push({
      priority: 3,
      issue: {
        name: "product feed format",
        state: `${summary.invalidRows} rows have a format problem`,
        impact: "Prices, links, or availability values that do not match the official format were not written into an uploadable cell.",
      },
    })
  }
  ranked.sort((a, b) => a.priority - b.priority)
  return ranked.slice(0, 3).map((item) => item.issue)
}
