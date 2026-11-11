import type { Eligibility } from "@/lib/audit/types"

export function buildEligibility(input: {
  countryHints: string[]
  schemaTypes: string[]
}): Eligibility {
  const hints = input.countryHints.join("、")
  const hintText = hints
    ? `公开页面上的地区线索：${hints}。这些线索不能单独决定资格。`
    : "公开页面上没有足够的地区线索。"
  const agent = `无法判断。Business Agent 目前仅对美国符合条件的电商和线上服务商家开放，且需要网站。${hintText}本工具不会断言本店一定能发布或不能发布 Agent。`
  const localTypes = input.schemaTypes.filter((type) => /restaurant|localbusiness|foodestablishment/i.test(type))
  const local = localTypes.length
    ? `公开页面有 ${localTypes.join("、")} 标记。本地店和餐馆目前只能认领已有的美国 listing。本工具不代为认领。`
    : "本地店和餐馆目前只能认领已有的美国 listing。这次抓到的公开页面不足以确认这是不是本地店或餐馆。"
  const market = "官方标准格式上传目前默认面向美国市场。本工具生成的 CSV 不写多市场列，也不把币种或网址当成市场选择。"
  return { agent, local, market }
}
