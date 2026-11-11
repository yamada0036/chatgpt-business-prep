import type { AuditRecord } from "@/lib/audit/types"
import { assertAuditId } from "@/lib/store/audits-id"
import {
  allowedVersionFile,
  contentTypeForPackFile,
  versionObjectPath,
  type AuditRepository,
  type MetadataStore,
  type ObjectStore,
} from "@/lib/store/repository"

export function createMemoryMetadata(): MetadataStore {
  const rows = new Map<string, { record: AuditRecord; generation: number }>()
  const captures = new Map<string, string>()
  return {
    async prepare() {},
    async get(id) {
      const row = rows.get(id)
      if (!row) return null
      return { record: structuredClone(row.record), generation: row.generation }
    },
    async upsert(record) {
      const current = rows.get(record.id)
      rows.set(record.id, {
        record: structuredClone(record),
        generation: current ? current.generation + 1 : 0,
      })
    },
    async compareAndSwap(id, record, expectedGeneration) {
      const current = rows.get(id)
      if (!current || current.generation !== expectedGeneration) return false
      rows.set(id, { record: structuredClone(record), generation: expectedGeneration + 1 })
      return true
    },
    async expiredIds(nowIso) {
      const now = Date.parse(nowIso)
      return [...rows.values()]
        .filter((row) => Date.parse(row.record.expiresAt) <= now)
        .map((row) => row.record.id)
    },
    async remove(ids) {
      for (const id of ids) rows.delete(id)
    },
    async rememberCapture(captureId, auditId) {
      captures.set(captureId, auditId)
    },
    async auditIdForCapture(captureId) {
      return captures.get(captureId) ?? null
    },
  }
}

export function createMemoryObjectStore(): ObjectStore {
  const files = new Map<string, Buffer>()
  return {
    async put(pathname, body) {
      files.set(pathname, Buffer.from(body))
    },
    async get(pathname) {
      const hit = files.get(pathname)
      return hit ? Buffer.from(hit) : null
    },
    async deletePrefix(prefix) {
      for (const key of [...files.keys()]) {
        if (key.startsWith(prefix)) files.delete(key)
      }
    },
  }
}

export function createDurableRepository(deps: {
  metadata: MetadataStore
  objects: ObjectStore
}): AuditRepository {
  let lastPurge = 0

  async function drop(id: string): Promise<void> {
    await deps.objects.deletePrefix(`audits/${id}/`)
    await deps.metadata.remove([id])
  }

  async function purgeExpired(): Promise<void> {
    const now = Date.now()
    if (now - lastPurge < 60_000) return
    lastPurge = now
    try {
      const ids = await deps.metadata.expiredIds(new Date(now).toISOString())
      await Promise.all(ids.map((id) => drop(id)))
    } catch {
      lastPurge = 0
    }
  }

  return {
    kind: "durable",
    async readAudit(id) {
      try {
        assertAuditId(id)
      } catch {
        return null
      }
      await deps.metadata.prepare()
      await purgeExpired()
      const row = await deps.metadata.get(id)
      if (!row) return null
      if (Date.parse(row.record.expiresAt) <= Date.now()) {
        await drop(id)
        return null
      }
      return row.record
    },
    async writeAudit(audit) {
      assertAuditId(audit.id)
      await deps.metadata.prepare()
      await deps.metadata.upsert(audit)
    },
    async updateAudit(id, mutate) {
      assertAuditId(id)
      await deps.metadata.prepare()
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const current = await deps.metadata.get(id)
        if (!current || Date.parse(current.record.expiresAt) <= Date.now()) {
          if (current) await drop(id)
          throw new Error("missing")
        }
        const next = await mutate(current.record)
        const saved = await deps.metadata.compareAndSwap(id, next, current.generation)
        if (saved) return next
      }
      throw new Error("The order was saved by another request. Retry.")
    },
    async writeVersionFiles(id, version, files, zip) {
      assertAuditId(id)
      if (!Number.isInteger(version) || version < 1) throw new Error("bad version")
      await deps.metadata.prepare()
      await Promise.all(
        Object.entries(files).map(async ([name, contents]) => {
          if (!allowedVersionFile(version, name)) throw new Error("bad file")
          await deps.objects.put(versionObjectPath(id, version, name), Buffer.from(contents, "utf8"), contentTypeForPackFile(name))
        }),
      )
      await deps.objects.put(versionObjectPath(id, version, "pack.zip"), zip, contentTypeForPackFile("pack.zip"))
    },
    async readVersionFile(id, version, name) {
      try {
        assertAuditId(id)
      } catch {
        return null
      }
      if (!allowedVersionFile(version, name)) return null
      await deps.metadata.prepare()
      return deps.objects.get(versionObjectPath(id, version, name))
    },
    rememberCapture(captureId, auditId) {
      return deps.metadata.rememberCapture(captureId, auditId)
    },
    auditIdForCapture(captureId) {
      return deps.metadata.auditIdForCapture(captureId)
    },
  }
}
