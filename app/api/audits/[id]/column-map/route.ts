import { finishFromCrawl } from "@/lib/audit/run"
import { mappingFromHeaders } from "@/lib/feed/columns"
import { ERROR_MESSAGES } from "@/lib/official/spec"
import { toPublicAudit } from "@/lib/public-view"
import { readAudit, updateAudit } from "@/lib/store/audits"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const audit = await readAudit(id)
  if (!audit?.upload) return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  if (audit.status !== "needs_column_map") {
    return Response.json({ error: { code: "state", message: "This audit does not need a column map." } }, { status: 409 })
  }
  if (audit.upload.mapUsed) {
    return Response.json({ error: { code: "map_used", message: "A column map can be submitted once. Edit the sheet and run a new audit." } }, { status: 409 })
  }
  const body = (await request.json()) as { mapping?: Record<string, string> }
  const mapping = mappingFromHeaders(audit.upload.headers, body.mapping ?? {})
  await updateAudit(id, (current) => ({
    ...current,
    upload: current.upload ? { ...current.upload, mapping, mapUsed: true } : current.upload,
  }))
  await finishFromCrawl(id)
  const next = await readAudit(id)
  return Response.json(next ? toPublicAudit(next) : { id })
}
