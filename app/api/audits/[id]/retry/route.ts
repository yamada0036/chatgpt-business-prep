import { enqueueAudit } from "@/lib/audit/run"
import { emptyScore, emptySummary, initialSteps } from "@/lib/audit/types"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { readAudit, updateAudit } from "@/lib/store/audits"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const audit = await readAudit(id)
  if (!audit) return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  if (audit.order.status === "paid" || audit.order.status === "delivered") {
    return Response.json({ error: { code: "paid", message: "已经交付的准备包请用补充字段生成新版本，不再整单重抓。" } }, { status: 409 })
  }
  await updateAudit(id, (current) => ({
    ...current,
    status: "running",
    error: undefined,
    steps: initialSteps(),
    pages: [],
    crawl: null,
    crawledProducts: [],
    profile: [],
    feedRows: [],
    feedIssues: [],
    feedSummary: emptySummary(),
    feedApplicable: false,
    feedReason: "",
    urgent: [],
    score: emptyScore(),
    partialReason: undefined,
  }))
  enqueueAudit(id)
  return Response.json({ id })
}
