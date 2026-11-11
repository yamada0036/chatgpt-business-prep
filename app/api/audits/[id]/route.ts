import { isAuditRunning } from "@/lib/audit/run"
import { toPublicAudit } from "@/lib/public-view"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { readAudit, updateAudit } from "@/lib/store/audits"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let audit = await readAudit(id)
  if (!audit) return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  if (audit.status === "running" && !isAuditRunning(audit.id) && Date.now() - Date.parse(audit.createdAt) > 20_000) {
    audit = await updateAudit(audit.id, (current) => ({
      ...current,
      status: "error",
      error: { code: "interrupted", message: "体检中断了。可以重试，已抓到的页面会重新抓。" },
    }))
  }
  return Response.json(toPublicAudit(audit))
}
