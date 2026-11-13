import type { AuditRecord } from "@/lib/audit/types"
import { assertAuditId } from "@/lib/store/audits-id"
import { assertTrialSlotId, auditJsonPath, capturePointerPath, trialSlotPath, type MetadataStore } from "@/lib/store/repository"

const CAPTURE_ID = /^[A-Za-z0-9]+$/

export type JsonBlob = {
  read(pathname: string): Promise<{ text: string; etag: string } | null>
  write(pathname: string, text: string, contentType: string, options?: { ifMatch?: string; exclusiveCreate?: boolean }): Promise<void>
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
      if (options?.exclusiveCreate && current) {
        const error = new Error("blob already exists")
        error.name = "BlobAlreadyExistsError"
        throw error
      }
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

function alreadyExists(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = "name" in error ? String(error.name) : ""
  const message = "message" in error ? String(error.message) : ""
  return name === "BlobAlreadyExistsError" || /already exists/i.test(message)
}

async function claimBlobSlot(blobs: JsonBlob, slotId: string, auditId: string): Promise<"owned" | "conflict"> {
  const pathname = trialSlotPath(assertTrialSlotId(slotId))
  const readOwner = async (): Promise<string | null> => {
    const hit = await blobs.read(pathname)
    if (!hit) return null
    const parsed = JSON.parse(hit.text) as { auditId?: string }
    return typeof parsed.auditId === "string" ? parsed.auditId : null
  }
  const current = await readOwner()
  if (current) return current === auditId ? "owned" : "conflict"
  try {
    await blobs.write(pathname, JSON.stringify({ auditId }), "application/json", { exclusiveCreate: true })
    return "owned"
  } catch (error) {
    if (!alreadyExists(error)) throw error
    const winner = await readOwner()
    if (!winner) return claimBlobSlot(blobs, slotId, auditId)
    return winner === auditId ? "owned" : "conflict"
  }
}

async function releaseBlobSlot(blobs: JsonBlob, slotId: string, auditId: string): Promise<void> {
  const pathname = trialSlotPath(assertTrialSlotId(slotId))
  const hit = await blobs.read(pathname)
  if (!hit) return
  const parsed = JSON.parse(hit.text) as { auditId?: string }
  if (parsed.auditId !== auditId) return
  await blobs.removePrefix(pathname)
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
    claimSlot(slotId, auditId) {
      return claimBlobSlot(blobs, slotId, auditId)
    },
    releaseSlot(slotId, auditId) {
      return releaseBlobSlot(blobs, slotId, auditId)
    },
  }
}
