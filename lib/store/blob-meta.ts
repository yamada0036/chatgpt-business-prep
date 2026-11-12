import type { AuditRecord } from "@/lib/audit/types"
import { assertAuditId } from "@/lib/store/audits-id"
import { auditJsonPath, capturePointerPath, type MetadataStore } from "@/lib/store/repository"

const CAPTURE_ID = /^[A-Za-z0-9]+$/

export type JsonBlob = {
  read(pathname: string): Promise<{ text: string; etag: string } | null>
  write(pathname: string, text: string, contentType: string, options?: { ifMatch?: string }): Promise<void>
  removePrefix(prefix: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

export function createMemoryJsonBlob(): JsonBlob {
  const files = new Map<string, { text: string; etag: string }>()
  let seq = 0
  return {
    async read(pathname) {
      const hit = files.get(pathname)
      return hit ? { text: hit.text, etag: hit.etag } : null
    },
    async write(pathname, text, _contentType, options) {
      const current = files.get(pathname)
      if (options?.ifMatch && (!current || current.etag !== options.ifMatch)) {
        const error = new Error("etag mismatch")
        error.name = "BlobPreconditionFailedError"
        throw error
      }
      files.set(pathname, { text, etag: String(++seq) })
    },
    async removePrefix(prefix) {
      for (const key of [...files.keys()]) {
        if (key.startsWith(prefix)) files.delete(key)
      }
    },
    async list(prefix) {
      return [...files.keys()].filter((key) => key.startsWith(prefix))
    },
  }
}

function preconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = "name" in error ? String(error.name) : ""
  const message = "message" in error ? String(error.message) : ""
  return name === "BlobPreconditionFailedError" || /precondition failed|etag mismatch/i.test(message)
}

export function createBlobMetadata(blobs: JsonBlob): MetadataStore {
  return {
    async prepare() {},
    async get(id) {
      assertAuditId(id)
      const hit = await blobs.read(auditJsonPath(id))
      if (!hit) return null
      return { record: JSON.parse(hit.text) as AuditRecord, generation: hit.etag }
    },
    async upsert(record) {
      assertAuditId(record.id)
      await blobs.write(auditJsonPath(record.id), JSON.stringify(record), "application/json")
    },
    async compareAndSwap(id, record, expectedGeneration) {
      assertAuditId(id)
      try {
        await blobs.write(auditJsonPath(id), JSON.stringify(record), "application/json", { ifMatch: expectedGeneration })
        return true
      } catch (error) {
        if (preconditionFailed(error)) return false
        throw error
      }
    },
    async expiredIds(nowIso) {
      const now = Date.parse(nowIso)
      const paths = await blobs.list("audits/")
      const ids: string[] = []
      for (const pathname of paths) {
        const match = /^audits\/([0-9a-f-]{36})\/audit\.json$/i.exec(pathname)
        if (!match) continue
        const hit = await blobs.read(pathname)
        if (!hit) continue
        const record = JSON.parse(hit.text) as AuditRecord
        if (Date.parse(record.expiresAt) <= now) ids.push(match[1])
      }
      return ids
    },
    async remove(ids) {
      await Promise.all(ids.map((id) => blobs.removePrefix(`audits/${id}/`)))
    },
    async rememberCapture(captureId, auditId) {
      if (!CAPTURE_ID.test(captureId)) return
      assertAuditId(auditId)
      await blobs.write(capturePointerPath(captureId), auditId, "text/plain")
    },
    async auditIdForCapture(captureId) {
      if (!CAPTURE_ID.test(captureId)) return null
      const hit = await blobs.read(capturePointerPath(captureId))
      return hit?.text ?? null
    },
  }
}
