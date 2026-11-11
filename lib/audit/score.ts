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
          state: "有冲突",
          impact: "同一资料项有多处原文且不一致。准备包不会挑一个填进去，需要你确认后再提交。",
        },
      })
    } else if (field.display === "not_fetched") {
      ranked.push({
        priority: 2,
        issue: {
          name: field.fieldName,
          state: "未抓到",
          impact: "这次没有抓到对应公开页，不能把该项写成已具备或已缺失。认领资料需要你自己补上后再提交。",
        },
      })
    } else if (field.display === "missing") {
      ranked.push({
        priority: 3,
        issue: {
          name: field.fieldName,
          state: "缺失",
          impact: "公开页面上没有看到这项。认领通过后要在 Business Hub 更新资料，空着就无法贴出草稿。",
        },
      })
    } else if (field.display === "needs_input") {
      ranked.push({
        priority: 4,
        issue: {
          name: field.fieldName,
          state: "需补充",
          impact: "看到的内容不够写成可提交草稿。需要你补充后才能贴到官方后台。",
        },
      })
    }
  }
  if (feedApplicable && summary.missingRows > 0) {
    ranked.push({
      priority: 3,
      issue: {
        name: "product feed",
        state: `${summary.missingRows} 行缺少必填字段`,
        impact: "官方规范里，必填字段为空或无法识别时，该行会被拒绝。这些单元格保持空白，没有用假值填满。",
      },
    })
  }
  if (feedApplicable && summary.invalidRows > 0) {
    ranked.push({
      priority: 3,
      issue: {
        name: "product feed format",
        state: `${summary.invalidRows} 行有格式问题`,
        impact: "价格、链接或库存枚举不符合官方格式的值没有写入可上传单元格。",
      },
    })
  }
  ranked.sort((a, b) => a.priority - b.priority)
  return ranked.slice(0, 3).map((item) => item.issue)
}
