import { orderUnlocksPack } from "@/lib/audit/types"
import { ERROR_MESSAGES, PACK_FILES } from "@/lib/official/spec"
import { readAudit, readVersionFile } from "@/lib/store/audits"

export const dynamic = "force-dynamic"

const TYPES: Record<string, string> = {
  [PACK_FILES.readme]: "text/markdown; charset=utf-8",
  [PACK_FILES.checklist]: "text/markdown; charset=utf-8",
  [PACK_FILES.profile]: "text/markdown; charset=utf-8",
  [PACK_FILES.agent]: "text/markdown; charset=utf-8",
  [PACK_FILES.feed]: "text/csv; charset=utf-8",
  [PACK_FILES.issues]: "text/csv; charset=utf-8",
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const audit = await readAudit(id)
  if (!audit) return Response.json({ error: { code: "not_found", message: ERROR_MESSAGES.not_found } }, { status: 404 })
  if (!orderUnlocksPack(audit.order.status)) {
    return Response.json({ error: { code: "unpaid", message: ERROR_MESSAGES.unpaid } }, { status: 403 })
  }
  const url = new URL(request.url)
  const version = Number(url.searchParams.get("version") ?? audit.versions.at(-1)?.version ?? 0)
  const meta = audit.versions.find((item) => item.version === version)
  if (!meta) return Response.json({ error: { code: "version", message: "That version does not exist." } }, { status: 404 })
  const file = url.searchParams.get("file")
  if (!file) {
    const zip = await readVersionFile(id, version, "pack.zip")
    if (!zip) return Response.json({ error: { code: "missing", message: "The prep pack file is gone." } }, { status: 404 })
    return new Response(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${meta.zipName}"`,
      },
    })
  }
  if (!meta.files.includes(file)) {
    return Response.json({ error: { code: "file", message: "That file is not in this version." } }, { status: 404 })
  }
  const bytes = await readVersionFile(id, version, file)
  if (!bytes) return Response.json({ error: { code: "missing", message: "That file is gone." } }, { status: 404 })
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": TYPES[file] ?? "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
    },
  })
}
