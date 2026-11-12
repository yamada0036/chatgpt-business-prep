import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AuditRecord } from "@/lib/audit/types"
import { getConfig } from "@/lib/config"
import { assertAuditId } from "@/lib/store/audits-id"
import { allowedVersionFile, type AuditRepository } from "@/lib/store/repository"

const locks = new Map<string, Promise<unknown>>()
const CAPTURE_ID = /^[A-Za-z0-9]+$/

function dirFor(id: string): string {
  return path.join(getConfig().dataDir, "audits", assertAuditId(id))
}

function captureIndexPath(): string {
  return path.join(getConfig().dataDir, "paypal-captures.json")
}

async function readCaptureIndex(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(captureIndexPath(), "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function createFilesystemRepository(): AuditRepository {
  return {
    kind: "filesystem",
    async readAudit(id) {
      try {
        assertAuditId(id)
      } catch {
        return null
      }
      await purgeExpired()
      try {
        const raw = await readFile(path.join(dirFor(id), "audit.json"), "utf8")
        const audit = JSON.parse(raw) as AuditRecord
        if (Date.parse(audit.expiresAt) <= Date.now()) {
          await rm(dirFor(id), { recursive: true, force: true })
          return null
        }
        return audit
      } catch {
        return null
      }
    },
    async writeAudit(audit) {
      const dir = dirFor(audit.id)
      await mkdir(dir, { recursive: true })
      const file = path.join(dir, "audit.json")
      const tmp = path.join(dir, "audit.json.tmp")
      await writeFile(tmp, JSON.stringify(audit), "utf8")
      await rename(tmp, file)
    },
    async updateAudit(id, mutate) {
      const previous = locks.get(id) ?? Promise.resolve()
      const run = previous.catch(() => undefined).then(async () => {
        const current = await this.readAudit(id)
        if (!current) throw new Error("missing")
        const next = await mutate(current)
        await this.writeAudit(next)
        return next
      })
      locks.set(id, run)
      return run
    },
    async writeVersionFiles(id, version, files, zip) {
      if (!Number.isInteger(version) || version < 1) throw new Error("bad version")
      const dir = path.join(dirFor(id), `v${version}`)
      await mkdir(dir, { recursive: true })
      await Promise.all(
        Object.entries(files).map(async ([name, contents]) => {
          if (!allowedVersionFile(version, name)) throw new Error("bad file")
          await writeFile(path.join(dir, name), contents, "utf8")
        }),
      )
      await writeFile(path.join(dir, "pack.zip"), zip)
    },
    async readVersionFile(id, version, name) {
      if (!allowedVersionFile(version, name)) return null
      try {
        return await readFile(path.join(dirFor(id), `v${version}`, name))
      } catch {
        return null
      }
    },
    async rememberCapture(captureId, auditId) {
      if (!CAPTURE_ID.test(captureId)) return
      assertAuditId(auditId)
      const previous = locks.get("paypal-captures") ?? Promise.resolve()
      const run = previous.catch(() => undefined).then(async () => {
        const index = await readCaptureIndex()
        index[captureId] = auditId
        await mkdir(getConfig().dataDir, { recursive: true })
        const file = captureIndexPath()
        const tmp = `${file}.tmp`
        await writeFile(tmp, JSON.stringify(index), "utf8")
        await rename(tmp, file)
      })
      locks.set("paypal-captures", run)
      await run
    },
    async auditIdForCapture(captureId) {
      if (!CAPTURE_ID.test(captureId)) return null
      const index = await readCaptureIndex()
      return index[captureId] ?? null
    },
  }
}

async function purgeExpired(): Promise<void> {
  const root = path.join(getConfig().dataDir, "audits")
  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    return
  }
  const now = Date.now()
  await Promise.all(
    entries.map(async (entry) => {
      try {
        assertAuditId(entry)
      } catch {
        return
      }
      try {
        const raw = await readFile(path.join(root, entry, "audit.json"), "utf8")
        const audit = JSON.parse(raw) as AuditRecord
        if (Date.parse(audit.expiresAt) <= now) await rm(path.join(root, entry), { recursive: true, force: true })
      } catch {
        /* ignore unreadable folders */
      }
    }),
  )
}
